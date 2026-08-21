/**
 * The closed loop, and the guard that keeps a comparison honest.
 *
 * THE LOOP
 * --------
 *     for each step:
 *         decision = controller.act(measured loop state, disturbance, forecast)
 *         loop     = plant.step(decision)          <- feedback
 *         result   = plant.power(decision, delivered cooling)
 *
 * The controller never sees its own plan come back as if it were a
 * measurement; it sees the loop state the plant model produced. That is the
 * difference between a receding-horizon controller and an open-loop schedule,
 * and it is why the same controller can be handed a forecast that turns out to
 * be wrong and still recover.
 *
 * THE GUARD
 * ---------
 * `compareRuns` refuses to attribute any saving to a controller unless both
 * arms faced identical conditions — same disturbance series, same constraints,
 * same initial plant state, same step count, same forecast. It throws rather
 * than returning a caveated number, because a comparison run under different
 * conditions is not a weak result, it is not a result.
 *
 * Even when the guard passes, `caveats` carries every reason the number should
 * be read carefully: unequal cooling delivered, perfect foresight, steps
 * outside the twin's calibrated envelope, unmet load, a warmer loop, extra
 * starts. They are returned to the UI and rendered in full. A saving figure
 * without its caveats is a claim, not a measurement.
 */
import type { ConstraintConfig, ControlState } from '../../../../shared/types/mpc';
import type {
  Disturbance,
  DisturbanceForecast,
  FlowModel,
  HorizonComparison,
  HorizonController,
  HorizonRun,
  HorizonStep,
  LoopDynamicsConfig,
  LoopState,
  RunConditions,
  RunTotals,
  ControlProvenanceMap,
} from '../../../../shared/types/horizon';
import { simulateCandidate } from '../simulator/chillerPlantSimulator';
import { disturbanceKey } from './disturbanceForecast';
import {
  T1_LOOP_DYNAMICS,
  applyStaging,
  capacityOf,
  cloneLoopState,
  dwellRulesFrom,
  stagedFlowModel,
  stepLoop,
} from './loopDynamics';

export interface ClosedLoopOptions {
  label: string;
  controller: HorizonController;
  constraints: ConstraintConfig;
  disturbances: Disturbance[];
  forecast: DisturbanceForecast;
  /** What the plant was doing before the run started. */
  baselineControl: ControlState;
  initialLoop: LoopState;
  source: RunConditions['source'];
  day?: string | null;
  timestamps?: Array<string | null>;
  dynamics?: LoopDynamicsConfig;
  flowModel?: FlowModel;
}

/** Run one controller over one disturbance series and record every step. */
export function runClosedLoop(opts: ClosedLoopOptions): HorizonRun {
  const dynamics = opts.dynamics ?? T1_LOOP_DYNAMICS;
  const flowModel = opts.flowModel ?? stagedFlowModel(dynamics);
  const rules = dwellRulesFrom(opts.constraints, dynamics.stepMinutes);
  const stepH = dynamics.stepMinutes / 60;
  const dryBulbHintC = (opts.disturbances[0]?.wetBulbC ?? 25) + 6;

  opts.controller.reset?.();

  let loop = cloneLoopState(opts.initialLoop);
  let previous = { ...opts.baselineControl, chillerIds: [...opts.baselineControl.chillerIds] };
  const trajectory: HorizonStep[] = [];

  for (let step = 0; step < opts.disturbances.length; step++) {
    const disturbance = opts.disturbances[step];
    const before = cloneLoopState(loop);

    const decision = opts.controller.act({
      step,
      loop: before,
      disturbance,
      forecast: opts.forecast,
      constraints: opts.constraints,
      baseline: opts.baselineControl,
      previous,
      dynamics,
      flowModel,
    });

    // The controller ASKS for a lineup; the dwell rules decide what it gets.
    // Re-deriving the count here rather than trusting the request is what makes
    // the minimum-runtime guarantee hold even for a controller that ignores it.
    const running = applyStaging(before, decision.control.runningChillers, opts.constraints, rules);
    const actualCount = running.filter(Boolean).length;
    const capacityRt = capacityOf(running, opts.constraints);
    const control: ControlState = { ...decision.control, runningChillers: actualCount };

    const advanced = stepLoop(dynamics, before, {
      loadRt: disturbance.buildingLoadRt,
      chwsC: control.chwstSetpointC,
      running,
      capacityRt,
      flowLs: flowModel.flowLs(step, actualCount, control.chwpSpeedPct),
    });

    // Power is charged for the cooling ACTUALLY delivered, not for the demand.
    // Charging for the demand would pay a controller for cooling it deferred
    // into the loop, which is precisely the trick the caveats exist to catch.
    //
    // The move limits are measured against the PREVIOUS APPLIED control, which
    // is what "per cycle" means. Measuring them against the run's opening
    // baseline instead would forbid the setpoints from ever drifting more than
    // one step's worth away from where the day started — a leash, not a rate
    // limit, and it would flag a perfectly legal slow reset as a violation.
    const result = simulateCandidate(
      { buildingLoadRt: Math.max(1, advanced.deliveredRt), wetBulbC: disturbance.wetBulbC },
      control,
      opts.constraints,
      { baseline: previous, dryBulbHintC }
    );

    trajectory.push({
      step,
      t: opts.timestamps?.[step] ?? null,
      minutesFromStart: step * dynamics.stepMinutes,
      disturbance,
      control,
      provenance: decision.provenance,
      result,
      loop: advanced.next,
      deliveredRt: round(advanced.deliveredRt, 1),
      unmetRt: round(advanced.unmetRt, 1),
      violations: result.violations,
      starts: running.filter((on, i) => on && !before.running[i]).length,
      stops: running.filter((on, i) => !on && before.running[i]).length,
      diagnostics: decision.diagnostics,
    });

    loop = advanced.next;
    previous = control;
  }

  return {
    label: opts.label,
    controller: opts.controller.name,
    trajectory,
    totals: totalsOf(trajectory, stepH),
    conditions: {
      source: opts.source,
      day: opts.day ?? null,
      steps: opts.disturbances.length,
      stepMinutes: dynamics.stepMinutes,
      disturbanceKey: disturbanceKey(opts.disturbances),
      constraintKey: constraintKey(opts.constraints),
      initialLoop: cloneLoopState(opts.initialLoop),
      forecast: opts.forecast.meta,
    },
  };
}

/* ------------------------------------------------------------------ totals */

export function totalsOf(trajectory: HorizonStep[], stepH: number): RunTotals {
  const n = trajectory.length;
  if (n === 0) {
    return {
      steps: 0, hours: 0, chillerKwh: 0, pumpKwh: 0, towerKwh: 0, totalPlantKwh: 0,
      rtHours: 0, plantKwPerRt: 0, peakPlantKw: 0, chillerStarts: 0, chillerHours: 0,
      unmetRtHours: 0, chwrMaxC: 0, chwrMeanC: 0, violationSteps: 0, infeasibleSteps: 0,
    };
  }
  const sum = (pick: (s: HorizonStep) => number) => trajectory.reduce((a, s) => a + pick(s), 0);
  const totalKwh = sum((s) => s.result.totalPlantKw) * stepH;
  const rtHours = sum((s) => s.deliveredRt) * stepH;
  const chwr = trajectory.map((s) => s.loop.chwrC);

  return {
    steps: n,
    hours: round(n * stepH, 3),
    chillerKwh: round(sum((s) => s.result.chillerKw) * stepH, 2),
    pumpKwh: round(sum((s) => s.result.pumpKw) * stepH, 2),
    towerKwh: round(sum((s) => s.result.towerKw) * stepH, 2),
    totalPlantKwh: round(totalKwh, 2),
    rtHours: round(rtHours, 2),
    plantKwPerRt: round(totalKwh / Math.max(rtHours, 1e-9), 4),
    peakPlantKw: round(Math.max(...trajectory.map((s) => s.result.totalPlantKw)), 1),
    chillerStarts: sum((s) => s.starts),
    chillerHours: round(sum((s) => s.control.runningChillers) * stepH, 2),
    unmetRtHours: round(sum((s) => s.unmetRt) * stepH, 3),
    chwrMaxC: round(Math.max(...chwr), 3),
    chwrMeanC: round(chwr.reduce((a, b) => a + b, 0) / n, 3),
    violationSteps: trajectory.filter((s) => s.violations.length > 0).length,
    infeasibleSteps: trajectory.filter((s) => !s.result.feasible).length,
  };
}

/* ------------------------------------------------------------ the guard */

export class ConditionMismatchError extends Error {
  readonly status = 409;
  constructor(readonly differences: string[]) {
    super(
      'Baseline and MPC runs did not face identical conditions, so no saving can be attributed to the controller: ' +
        differences.join('; ')
    );
    this.name = 'ConditionMismatchError';
  }
}

export function conditionDifferences(a: RunConditions, b: RunConditions): string[] {
  const out: string[] = [];
  if (a.source !== b.source) out.push(`source ${a.source} vs ${b.source}`);
  if (a.day !== b.day) out.push(`day ${a.day} vs ${b.day}`);
  if (a.steps !== b.steps) out.push(`steps ${a.steps} vs ${b.steps}`);
  if (a.stepMinutes !== b.stepMinutes) out.push(`step ${a.stepMinutes} vs ${b.stepMinutes} min`);
  if (a.disturbanceKey !== b.disturbanceKey) out.push('disturbance series differs');
  if (a.constraintKey !== b.constraintKey) out.push('constraint config differs');
  if (JSON.stringify(a.initialLoop) !== JSON.stringify(b.initialLoop)) {
    out.push('initial plant state differs');
  }
  return out;
}

/** Cooling delivered may differ by this much before the headline switches. */
const EQUAL_DELIVERY_TOL_PCT = 0.5;

export function compareRuns(baseline: HorizonRun, mpc: HorizonRun): HorizonComparison {
  const diffs = conditionDifferences(baseline.conditions, mpc.conditions);
  if (diffs.length) throw new ConditionMismatchError(diffs);

  const b = baseline.totals;
  const m = mpc.totals;
  const pct = (from: number, to: number) => (from > 0 ? round(((from - to) / from) * 100, 2) : 0);
  const deliveryDeltaPct = b.rtHours > 0 ? ((m.rtHours - b.rtHours) / b.rtHours) * 100 : 0;
  const equalDelivery = Math.abs(deliveryDeltaPct) <= EQUAL_DELIVERY_TOL_PCT;

  const caveats: string[] = [];
  if (!equalDelivery) {
    caveats.push(
      `The two controllers did not deliver the same cooling: ${m.rtHours.toFixed(0)} vs ${b.rtHours.toFixed(0)} RT·h (${deliveryDeltaPct > 0 ? '+' : ''}${deliveryDeltaPct.toFixed(2)}%). Quote the kW/RT figure, not the kWh figure — a kWh difference here is partly a difference in load served.`
    );
  }
  if (mpc.conditions.forecast.kind === 'perfect-foresight') caveats.push(mpc.conditions.forecast.caveat);

  const extrapolated = mpc.trajectory.filter((s) => s.result.calibration.status === 'extrapolated');
  if (extrapolated.length) {
    const reasons = [...new Set(extrapolated.flatMap((s) => s.result.calibration.reasons))];
    caveats.push(
      `${extrapolated.length} of ${mpc.trajectory.length} MPC steps sit outside the twin's calibration envelope: ${reasons.join('; ')}.`
    );
  }
  if (m.unmetRtHours > b.unmetRtHours + 1e-6) {
    caveats.push(
      `The MPC left ${m.unmetRtHours.toFixed(2)} RT·h of cooling unmet against the baseline's ${b.unmetRtHours.toFixed(2)} RT·h — part of the saving is unserved load.`
    );
  }
  if (m.chwrMaxC > b.chwrMaxC + 0.05) {
    caveats.push(
      `Peak CHWR rose from ${b.chwrMaxC.toFixed(2)} to ${m.chwrMaxC.toFixed(2)} °C: the saving partly comes from running the loop warmer.`
    );
  }
  if (m.chillerStarts > b.chillerStarts) {
    caveats.push(`${m.chillerStarts - b.chillerStarts} additional chiller start(s) versus the baseline.`);
  }
  if (m.infeasibleSteps > 0) {
    caveats.push(
      `${m.infeasibleSteps} of ${mpc.trajectory.length} MPC steps violated at least one constraint; the controller could not find a fully feasible operating point there.`
    );
  }

  return {
    conditions: mpc.conditions,
    baseline,
    mpc,
    savings: {
      chillerKwh: round(b.chillerKwh - m.chillerKwh, 2),
      totalPlantKwh: round(b.totalPlantKwh - m.totalPlantKwh, 2),
      totalPlantPct: pct(b.totalPlantKwh, m.totalPlantKwh),
      kwPerRtBaseline: b.plantKwPerRt,
      kwPerRtMpc: m.plantKwPerRt,
      kwPerRtPct: pct(b.plantKwPerRt, m.plantKwPerRt),
      deliveredRtHoursBaseline: b.rtHours,
      deliveredRtHoursMpc: m.rtHours,
      deliveredRtHoursDeltaPct: round(deliveryDeltaPct, 3),
      basis: equalDelivery ? 'equal-delivery' : 'unequal-delivery',
      headline: equalDelivery ? 'totalPlantPct' : 'kwPerRtPct',
    },
    optimisedControls: optimisedUnion(mpc),
    caveats,
  };
}

/**
 * How each control was arrived at ACROSS the whole run.
 *
 * Deliberately pessimistic: a control counts as `optimized` only if it was
 * optimised at EVERY step. One fallback step is enough to demote it, because a
 * run that fell back somewhere did not optimise that control throughout, and
 * the badge must not say it did.
 */
function optimisedUnion(run: HorizonRun): ControlProvenanceMap {
  const keys: Array<keyof ControlProvenanceMap> = [
    'chwstSetpointC', 'dpSetpointPsi', 'runningChillers', 'chwpSpeedPct', 'cwpSpeedPct', 'ctFanSpeedPct',
  ];
  const out = {} as ControlProvenanceMap;
  for (const k of keys) {
    const all = run.trajectory.map((s) => s.provenance[k]);
    if (!all.length) out[k] = 'not-available';
    else if (all.every((p) => p === 'optimized')) out[k] = 'optimized';
    else if (all.every((p) => p === 'optimized' || p === 'derived')) out[k] = 'derived';
    else if (all.includes('not-available')) out[k] = 'not-available';
    else if (all.every((p) => p === 'fixed')) out[k] = 'fixed';
    else out[k] = 'baseline-derived';
  }
  return out;
}

/** FNV-1a over the serialised config — cheap, and only ever compared for equality. */
export function constraintKey(cfg: ConstraintConfig): string {
  const json = JSON.stringify(cfg);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

const round = (v: number, dp: number): number => Math.round(v * 10 ** dp) / 10 ** dp;
