/**
 * The chilled-water loop as a state, plus the staging rules that act on it.
 *
 * This is what makes the problem an MPC problem. A steady-state optimiser can
 * answer "what is the cheapest way to make 3,000 RT right now"; it cannot
 * answer "should I shed a chiller at 15:00", because the cost of shedding does
 * not appear until the loop has warmed up three steps later. The loop
 * temperature is the memory that carries that cost forward.
 *
 *   delivered  = f(CHWR - CHWS, flow, capacity)     how much the coils can take
 *   CHWR(k+1)  = CHWR(k) + (load - delivered) / C   what is left warms the loop
 *
 * `C` (`loopRtPerKPerStep`) is the loop capacitance. It is NOT identifiable
 * from the T1 workbook: the cooling load there is itself derived from the loop
 * temperatures, so there is no independent load signal to regress the imbalance
 * against. `calibrationStatus()` says exactly that, and it is surfaced in the
 * run report rather than left in a comment.
 */
import type {
  ConstraintConfig,
  ControlState,
} from '../../../../shared/types/mpc';
import type {
  DwellRules,
  FlowModel,
  LoopDynamicsConfig,
  LoopState,
  LoopStepOutcome,
} from '../../../../shared/types/horizon';
import { REF_CHWP_SPEED } from '../../digital-twin/chiller/model/plantPhysics';
import { chwFlowLsFor } from '../simulator/chillerPlantSimulator';
import { stagedCapacityRt } from '../optimizer/candidateGenerator';

export const RT_TO_KW = 3.517;
export const WATER_KJ_PER_L_K = 4.186;

/**
 * T1 loop parameters.
 *
 * MEASURED: `flowPerPumpLs` (month median per running pump), `pumpsPerChiller`
 * (the plant ran them 1:1 for 99.6% of December), `rtPerLsPerK` (the workbook's
 * own cooling-load identity constant).
 *
 * ASSUMED: `loopRtPerKPerStep`, `soakTargetC`, `soakTauHours` — see
 * `calibrationStatus`.
 */
export const T1_LOOP_DYNAMICS: LoopDynamicsConfig = {
  loopRtPerKPerStep: 650,
  stepMinutes: 15,
  flowPerPumpLs: 125.8,
  pumpsPerChiller: 1,
  rtPerLsPerK: 1.18892327296496,
  soakTargetC: 21,
  soakTauHours: 7,
};

export interface LoopCalibrationStatus {
  status: 'site-calibrated' | 'partially-calibrated' | 'default';
  measured: string[];
  assumed: string[];
  note: string;
}

export function calibrationStatus(): LoopCalibrationStatus {
  return {
    status: 'partially-calibrated',
    measured: ['flowPerPumpLs', 'pumpsPerChiller', 'rtPerLsPerK'],
    assumed: ['loopRtPerKPerStep', 'soakTargetC', 'soakTauHours'],
    note:
      'Loop capacitance is not identifiable from the T1 workbook: the cooling load there is derived from the loop temperatures themselves, so there is no independent load signal to regress against. The soak parameters have no supporting data either — the plant never stopped in December.',
  };
}

/** The capacitance expressed as a volume of water, which is easier to sanity-check. */
export function equivalentLoopVolumeM3(cfg: LoopDynamicsConfig): number {
  const kjPerK = cfg.loopRtPerKPerStep * RT_TO_KW * cfg.stepMinutes * 60;
  return Math.round(kjPerK / WATER_KJ_PER_L_K / 1e3);
}

/* ------------------------------------------------------------------ state */

export function initialLoopState(
  chwrC: number,
  running: boolean[],
  opts: { dwellSteps?: number[]; lastDeliveredRt?: number } = {}
): LoopState {
  return {
    chwrC,
    // A machine with no history is treated as long-settled (99 steps), so the
    // first decision is not artificially blocked by a dwell timer that only
    // exists because the run just started.
    dwellSteps: opts.dwellSteps ?? running.map((on) => (on ? 99 : -99)),
    running: [...running],
    lastDeliveredRt: opts.lastDeliveredRt ?? 0,
  };
}

export function cloneLoopState(s: LoopState): LoopState {
  return {
    chwrC: s.chwrC,
    dwellSteps: [...s.dwellSteps],
    running: [...s.running],
    lastDeliveredRt: s.lastDeliveredRt,
  };
}

/* ------------------------------------------------------------- flow models */

/** Flow implied by staging and pump speed alone, with no measurement behind it. */
export function flowForStaging(
  cfg: LoopDynamicsConfig,
  runningChillers: number,
  chwpSpeedPct: number
): number {
  const pumps = Math.max(0, runningChillers) * cfg.pumpsPerChiller;
  return pumps * cfg.flowPerPumpLs * (chwpSpeedPct / REF_CHWP_SPEED);
}

/**
 * Flow from the four riser meters, rescaled for what the controller commanded.
 *
 * Two rescalings, both necessary and both stated in the provenance string:
 *
 *   - by STAGING, because the measurement was taken with whatever the plant
 *     had running, and the controller may have chosen a different count;
 *   - by PUMP SPEED, because otherwise a controller could slow the pumps, bank
 *     the cubic power saving, and still deliver the measured flow. That is the
 *     single most important thing a flow model here has to get right.
 */
export function measuredFlowModel(
  flowByStep: Array<number | null>,
  observedCountByStep: number[],
  cfg: LoopDynamicsConfig
): FlowModel {
  return {
    name: 'measured-riser-flow',
    provenance:
      'MEASURED: sum of the four riser flow meters, scaled by the ratio of commanded to observed running chillers (pumps track chillers 1:1 at this site) and by the ratio of commanded to reference pump speed (affinity law — this site trends no pump speed)',
    flowLs(step, runningChillers, chwpSpeedPct) {
      const measured = flowByStep[Math.min(step, flowByStep.length - 1)];
      const observed = observedCountByStep[Math.min(step, observedCountByStep.length - 1)] || 0;
      const speedRatio = chwpSpeedPct / REF_CHWP_SPEED;
      if (measured == null || !Number.isFinite(measured) || observed <= 0) {
        return flowForStaging(cfg, runningChillers, chwpSpeedPct);
      }
      return ((measured * Math.max(0, runningChillers)) / observed) * speedRatio;
    },
  };
}

/**
 * Flow from the twin's own pump law — the same closed form the plant model
 * uses, so the loop and the plant cannot disagree about how much water moves.
 */
export function stagedFlowModel(cfg: LoopDynamicsConfig): FlowModel {
  return {
    name: 'staged-flow',
    provenance: `ASSUMED: ${cfg.flowPerPumpLs} L/s per running pump at ${REF_CHWP_SPEED}% (the measured month median per pump), one pump per chiller, affinity-scaled by commanded speed`,
    flowLs: (_step, runningChillers, chwpSpeedPct) => chwFlowLsFor(runningChillers, chwpSpeedPct),
  };
}

/* -------------------------------------------------------- the loop equation */

/**
 * Cooling the coils can absorb this step.
 *
 * Solves the implicit pair
 *     q = a * (CHWR_end - CHWS)          heat transfer at the plant
 *     CHWR_end = CHWR + (load - q) / C   loop mixing over the step
 * in closed form, with `a = rtPerLsPerK * flow`. Using CHWR_end rather than
 * CHWR is what stops a coarse 15-minute step from over-delivering: the loop
 * cools DURING the step, so the driving temperature difference shrinks as it
 * goes.
 */
export function deliverableRt(
  cfg: LoopDynamicsConfig,
  chwrC: number,
  chwsC: number,
  capacityRt: number,
  flowLs: number,
  loadRt = 0
): number {
  if (capacityRt <= 0 || flowLs <= 0) return 0;
  const a = cfg.rtPerLsPerK * flowLs;
  const c = Math.max(cfg.loopRtPerKPerStep, 1e-9);
  const q = (a * (chwrC - chwsC) + (a * loadRt) / c) / (1 + a / c);
  return Math.min(capacityRt, Math.max(0, q));
}

export interface LoopStepArgs {
  loadRt: number;
  chwsC: number;
  running: boolean[];
  capacityRt: number;
  flowLs: number;
}

/** Advance the loop one step under a commanded lineup. */
export function stepLoop(
  cfg: LoopDynamicsConfig,
  state: LoopState,
  args: LoopStepArgs
): LoopStepOutcome {
  const runningCount = args.running.filter(Boolean).length;
  const flowLs = args.flowLs;
  const delivered = deliverableRt(cfg, state.chwrC, args.chwsC, args.capacityRt, flowLs, args.loadRt);

  let chwrC: number;
  if (runningCount === 0) {
    // Nothing running: the loop drifts toward ambient with a first-order lag.
    const tauSteps = (cfg.soakTauHours * 60) / cfg.stepMinutes;
    chwrC = state.chwrC + (cfg.soakTargetC - state.chwrC) * (1 - Math.exp(-1 / Math.max(tauSteps, 1e-6)));
  } else {
    chwrC = state.chwrC + (args.loadRt - delivered) / cfg.loopRtPerKPerStep;
  }
  // The return cannot fall below the supply — that would be cooling appearing
  // from nowhere.
  chwrC = Math.max(chwrC, args.chwsC);

  return {
    next: {
      chwrC,
      dwellSteps: advanceDwell(state, args.running),
      running: [...args.running],
      lastDeliveredRt: delivered,
    },
    deliveredRt: delivered,
    unmetRt: Math.max(0, args.loadRt - delivered),
    capacityShortfallRt: Math.max(0, args.loadRt - args.capacityRt),
    saturated: delivered >= args.capacityRt - 1e-6 && args.loadRt > delivered + 1e-6,
    flowLs,
  };
}

/* ------------------------------------------------------- dwell and staging */

/** Positive counts consecutive running steps, negative consecutive stopped. */
export function advanceDwell(state: LoopState, next: boolean[]): number[] {
  const CAP = 9999;
  return next.map((on, i) => {
    const was = state.running[i];
    const d = state.dwellSteps[i] ?? (was ? 1 : -1);
    if (on !== was) return on ? 1 : -1;
    return on ? Math.min(d + 1, CAP) : Math.max(d - 1, -CAP);
  });
}

/** Minimum runtime / off-time, converted from minutes to whole steps. */
export function dwellRulesFrom(cfg: ConstraintConfig, stepMinutes: number): DwellRules {
  const steps = (minutes: number) => Math.max(0, Math.ceil(minutes / stepMinutes));
  return {
    minOnSteps: steps(cfg.system.minChillerRuntimeMin),
    minOffSteps: steps(cfg.system.minChillerOffTimeMin),
    // One machine per step. Real sequencers do not start two chillers at once,
    // and it keeps the branching factor of the horizon search bounded.
    maxSwitchesPerStep: 1,
  };
}

/** Whether unit `i` has served its dwell timer and may change state. */
export function switchable(state: LoopState, i: number, rules: DwellRules): boolean {
  const d = state.dwellSteps[i] ?? 0;
  return state.running[i] ? d >= rules.minOnSteps : -d >= rules.minOffSteps;
}

/**
 * Chiller counts reachable from this state in one step.
 *
 * Bounded by the configured staging limits, by how many machines are
 * dwell-eligible in each direction, and by `maxSwitchesPerStep`. The current
 * count is always included — "stay put" must remain available or a state with
 * every machine dwell-locked would have no legal move at all.
 *
 * Sorted nearest-first so the beam search spends its width on realistic moves.
 */
export function reachableStaging(
  state: LoopState,
  cfg: ConstraintConfig,
  rules: DwellRules
): number[] {
  const units = cfg.chiller.units;
  const current = state.running.filter(Boolean).length;
  const eligibleOn = state.running.map((on, i) => on && switchable(state, i, rules)).filter(Boolean).length;
  const eligibleOff = state.running
    .map((on, i) => !on && switchable(state, i, rules) && units[i]?.available !== false)
    .filter(Boolean).length;

  const lo = Math.max(1, cfg.system.minRunningChillers);
  const available = units.filter((u) => u.available).length;
  const hi = Math.min(
    cfg.system.maxRunningChillers,
    available - cfg.system.requiredStandbyChillers,
    available
  );

  const out = new Set<number>();
  for (let delta = -rules.maxSwitchesPerStep; delta <= rules.maxSwitchesPerStep; delta++) {
    const n = current + delta;
    if (n < lo || n > hi) continue;
    if (delta < 0 && eligibleOn < -delta) continue;
    if (delta > 0 && eligibleOff < delta) continue;
    out.add(n);
  }
  if (current >= lo && current <= hi) out.add(current);
  return [...out].sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
}

/**
 * Which specific machines a target count puts online.
 *
 * Stops the LONGEST-running machine first and starts the LONGEST-stopped one,
 * which is duty rotation — the same policy T1 runs. Dwell-ineligible units are
 * skipped, so a target the timers cannot reach yields the closest lineup that
 * they can rather than an illegal one.
 */
export function applyStaging(
  state: LoopState,
  target: number,
  cfg: ConstraintConfig,
  rules: DwellRules
): boolean[] {
  const next = [...state.running];
  const units = cfg.chiller.units;
  let current = next.filter(Boolean).length;

  while (current > target) {
    const candidates = next
      .map((on, i) => ({ i, d: state.dwellSteps[i] ?? 0, on }))
      .filter((c) => c.on && switchable(state, c.i, rules))
      .sort((a, b) => b.d - a.d);
    if (!candidates.length) break;
    next[candidates[0].i] = false;
    current -= 1;
  }
  while (current < target) {
    const candidates = next
      .map((on, i) => ({ i, d: state.dwellSteps[i] ?? 0, on }))
      .filter((c) => !c.on && units[c.i]?.available !== false && switchable(state, c.i, rules))
      .sort((a, b) => a.d - b.d);
    if (!candidates.length) break;
    next[candidates[0].i] = true;
    current += 1;
  }
  return next;
}

/** Cooling the currently running machines can deliver at their max load. */
export function capacityOf(running: boolean[], cfg: ConstraintConfig): number {
  return running.reduce((sum, on, i) => {
    if (!on) return sum;
    const u = cfg.chiller.units[i];
    if (!u || !u.available) return sum;
    return sum + u.ratedCapacityRt * (u.maxLoadPct / 100);
  }, 0);
}

export function capacityForCount(cfg: ConstraintConfig, count: number): number {
  return stagedCapacityRt(cfg, count);
}

/** How many machines changed state between two lineups. */
export function countSwitches(before: boolean[], after: boolean[]): number {
  let n = 0;
  for (let i = 0; i < after.length; i++) if (!!before[i] !== !!after[i]) n += 1;
  return n;
}

/**
 * Whether the plant is allowed to run at this wall-clock time.
 * An equal start/end pair means 24/7, which is what T1 ran.
 */
export function withinOperatingHours(
  cfg: ConstraintConfig,
  timestamp: string | null
): boolean {
  const { startHour, endHour } = cfg.system.operatingHours;
  if (startHour === endHour) return true;
  if (!timestamp) return true;
  const hour = Number(timestamp.slice(11, 13));
  if (!Number.isFinite(hour)) return true;
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/** The control the plant holds when it is outside its operating schedule. */
export function shutdownControl(base: ControlState): ControlState {
  return { ...base, runningChillers: 0, chillerIds: [] };
}
