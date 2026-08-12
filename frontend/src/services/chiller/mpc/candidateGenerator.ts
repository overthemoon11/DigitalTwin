/**
 * Candidate generation for the MPC search.
 *
 * The search space is the six manipulated variables. Their bounds come from the
 * constraint config — NOT from hard-coded ranges — so widening a limit in the
 * right sidebar genuinely widens what the optimiser explores. Move limits
 * (`maxChwstChangePerCycleC`, `maxDpChangePerCyclePsi`) additionally clip the
 * setpoint axes around the baseline, so a single cycle can only propose a move
 * the plant is allowed to make in one step.
 *
 * Note this generator produces candidates only; it never decides feasibility.
 * That is the simulator + validator's job, because most constraints are on the
 * OUTCOME (machine loading, flows, approach), not on the command.
 */
import type {
  ChillerUnitConstraint,
  ConstraintConfig,
  ControlState,
  SimulationInput,
} from '../../../types/mpc';
import { clamp, round } from '../plantPhysics';
import { getPlantDutyOrders } from '../controlEngine';

export interface Axis {
  key: keyof Pick<
    ControlState,
    'chwstSetpointC' | 'dpSetpointPsi' | 'chwpSpeedPct' | 'cwpSpeedPct' | 'ctFanSpeedPct'
  >;
  label: string;
  min: number;
  max: number;
  decimals: number;
}

/** The five continuous axes, bounded by the constraint config + move limits. */
export function continuousAxes(cfg: ConstraintConfig, baseline: ControlState): Axis[] {
  const dpMin = Math.max(cfg.chwp.minDpPsi, cfg.system.minChwDpPsi);
  const dpMax = Math.min(cfg.chwp.maxDpPsi, cfg.system.maxChwDpPsi);

  return [
    {
      key: 'chwstSetpointC',
      label: 'CHWST-SP',
      min: Math.max(cfg.chiller.minChwstC, baseline.chwstSetpointC - cfg.system.maxChwstChangePerCycleC),
      max: Math.min(cfg.chiller.maxChwstC, baseline.chwstSetpointC + cfg.system.maxChwstChangePerCycleC),
      decimals: 2,
    },
    {
      key: 'dpSetpointPsi',
      label: 'DP-SP',
      min: Math.max(dpMin, baseline.dpSetpointPsi - cfg.system.maxDpChangePerCyclePsi),
      max: Math.min(dpMax, baseline.dpSetpointPsi + cfg.system.maxDpChangePerCyclePsi),
      decimals: 1,
    },
    { key: 'chwpSpeedPct', label: 'CHWP Speed', min: cfg.chwp.minSpeedPct, max: cfg.chwp.maxSpeedPct, decimals: 1 },
    { key: 'cwpSpeedPct', label: 'CWP Speed', min: cfg.cwp.minSpeedPct, max: cfg.cwp.maxSpeedPct, decimals: 1 },
    { key: 'ctFanSpeedPct', label: 'CT Fan Speed', min: cfg.tower.minFanSpeedPct, max: cfg.tower.maxFanSpeedPct, decimals: 1 },
  ];
}

/** Evenly spaced grid across an axis, inclusive of both ends. */
export function axisGrid(axis: Axis, points: number): number[] {
  if (axis.max <= axis.min) return [round(axis.min, axis.decimals)];
  const n = Math.max(2, Math.floor(points));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(round(axis.min + ((axis.max - axis.min) * i) / (n - 1), axis.decimals));
  }
  return Array.from(new Set(out));
}

/** A tighter grid around `centre`, for the refinement pass. */
export function localGrid(axis: Axis, centre: number, span: number, points: number): number[] {
  const lo = clamp(centre - span, axis.min, axis.max);
  const hi = clamp(centre + span, axis.min, axis.max);
  return axisGrid({ ...axis, min: lo, max: hi }, points);
}

/**
 * Which chiller counts are worth trying, nearest-to-current first so the search
 * spends its budget on realistic moves before exotic ones. Counts that cannot
 * physically carry the load are dropped here rather than wasting a simulation.
 */
export function stagingOptions(
  input: SimulationInput,
  cfg: ConstraintConfig,
  baseline: ControlState
): number[] {
  const available = cfg.chiller.units.filter((u) => u.available);
  const maxByStandby = available.length - cfg.system.requiredStandbyChillers;
  const hi = Math.min(cfg.system.maxRunningChillers, maxByStandby, available.length);
  const lo = Math.max(1, cfg.system.minRunningChillers);

  const allowed: number[] = [];
  const canCarry: number[] = [];
  for (let n = lo; n <= hi; n++) {
    allowed.push(n);
    if (stagedCapacityRt(cfg, n) + 1e-6 >= input.buildingLoadRt) canCarry.push(n);
  }

  // If NOTHING can carry the load, still simulate the allowed counts. They will
  // all fail the capacity check — which is the point: an empty search would
  // report "no feasible solution" with no reason attached, and the operator
  // needs the limiting constraint, not silence.
  const options = canCarry.length ? canCarry.slice(0, 3) : allowed.slice(0, 3);

  return options.sort(
    (a, b) => Math.abs(a - baseline.runningChillers) - Math.abs(b - baseline.runningChillers)
  );
}

/**
 * The chiller duty order the twin should use, given availability.
 *
 * The engine stages "the first N units of the duty order", so marking a machine
 * unavailable has to move it to the BACK of that order — a count alone cannot
 * express "not this one". Available units keep the plant's own rotation order
 * (T1 duty-cycles its machines), unavailable ones are parked behind them where
 * no staging count can reach.
 *
 * Returning this from the generator and feeding it to `evaluatePlant({ duty })`
 * is what keeps the sidebar's named staging identical to the machines lit on
 * the schematic.
 */
export function dutyOrderFor(cfg: ConstraintConfig): number[] {
  const plantOrder = getPlantDutyOrders().chiller;
  const availability = new Map(
    cfg.chiller.units.map((u, i) => [i + 1, u.available])
  );
  const available = plantOrder.filter((unit) => availability.get(unit) !== false);
  const parked = plantOrder.filter((unit) => availability.get(unit) === false);
  return [...available, ...parked];
}

/** The machines a staged count actually puts online — duty order, availability
 *  respected. Single source of truth for capacity and per-machine checks. */
export function stagedUnits(cfg: ConstraintConfig, count: number): ChillerUnitConstraint[] {
  return dutyOrderFor(cfg)
    .slice(0, Math.max(0, Math.round(count)))
    .map((unit) => cfg.chiller.units[unit - 1])
    .filter((u): u is ChillerUnitConstraint => !!u && u.available);
}

/**
 * Names of the machines a staged count puts online. Selection follows the duty
 * order (so it matches the schematic); the LIST is sorted for display, because
 * the sidebar answers "which machines run", not "in what order they were
 * picked" — an unsorted CH-3, CH-5, CH-4, CH-1 just reads like a bug.
 */
export function chillerIdsFor(cfg: ConstraintConfig, count: number): string[] {
  return stagedUnits(cfg, count)
    .map((u) => u.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Total cooling the staged machines can deliver at their max load. */
export function stagedCapacityRt(cfg: ConstraintConfig, count: number): number {
  return stagedUnits(cfg, count).reduce(
    (s, u) => s + u.ratedCapacityRt * (u.maxLoadPct / 100),
    0
  );
}
