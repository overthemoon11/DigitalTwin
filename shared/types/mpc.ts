/**
 * Domain types for the chiller-plant MPC optimisation simulator.
 *
 * The pipeline these describe is:
 *
 *   SimulationInput  (disturbances the MPC cannot control)
 *   ConstraintConfig (what the plant is ALLOWED to do)
 *   ControlState     (a candidate the MPC proposes)
 *          ↓
 *   ChillerPlantSimulator  → SimulationResult (+ ConstraintViolation[])
 *          ↓
 *   MpcOptimizer objective → lowest feasible Total Plant kW
 *
 * Nothing here depends on React or on the engine's internal control ids; the
 * mapping to `ctrl-*` lives in services/chiller/mpc/chillerPlantSimulator.ts.
 */

/* ------------------------------------------------------------------ inputs */

/** Operating conditions the plant must serve. The MPC never manipulates these. */
export interface SimulationInput {
  buildingLoadRt: number;
  wetBulbC: number;
}

/**
 * The six manipulated variables. `runningChillers` is the count the BMS would
 * stage; `chillerIds` carries the specific machines so per-unit selection can be
 * optimised later without changing this interface's consumers.
 */
export interface ControlState {
  chwstSetpointC: number;
  dpSetpointPsi: number;
  runningChillers: number;
  /** Duty selection behind the count, e.g. ['CH-2','CH-3','CH-4']. */
  chillerIds: string[];
  chwpSpeedPct: number;
  cwpSpeedPct: number;
  ctFanSpeedPct: number;
}

/* ------------------------------------------------------------- constraints */

/** Per-machine limits. Chillers are modelled individually from the start so a
 *  mixed fleet (or one machine out for service) needs no schema change. */
export interface ChillerUnitConstraint {
  id: string;
  name: string;
  /** Excluded from staging entirely when false (out for maintenance). */
  available: boolean;
  ratedCapacityRt: number;
  minLoadPct: number;
  maxLoadPct: number;
  minChwFlowLs: number;
  maxChwFlowLs: number;
  minCwFlowLs: number;
  maxCwFlowLs: number;
}

export interface ChillerConstraints {
  units: ChillerUnitConstraint[];
  minChwstC: number;
  maxChwstC: number;
}

export interface PumpConstraints {
  minSpeedPct: number;
  maxSpeedPct: number;
  minFlowLs: number;
  maxFlowLs: number;
  ratedPowerKw: number;
  ratedFlowLs: number;
  ratedHeadM: number;
}

export interface ChwpConstraints extends PumpConstraints {
  minDpPsi: number;
  maxDpPsi: number;
}

export interface TowerConstraints {
  minFanSpeedPct: number;
  maxFanSpeedPct: number;
  /** Hard physical floor: CWST >= wet bulb + this. */
  minApproachC: number;
  maxCwstC: number;
  ratedHeatRejectionRt: number;
  ratedWaterFlowLs: number;
}

export interface SystemConstraints {
  minChwDpPsi: number;
  maxChwDpPsi: number;
  maxChwHeaderFlowLs: number;
  maxCwHeaderFlowLs: number;
  minRunningChillers: number;
  maxRunningChillers: number;
  requiredStandbyChillers: number;
  /**
   * Highest chilled-water RETURN temperature the loop may reach.
   *
   * This is the constraint that makes CHWST reset and DP reset two-sided.
   * Without it, raising CHWST or slowing the CHW pumps looks like free chiller
   * savings, because the twin simply floats the return up: the coils are not
   * modelled, so nothing else pushes back. A return limit is also what a real
   * operator actually enforces, since a warm return means starved coils.
   */
  maxChwrC: number;
  /** Plant electrical demand cap, kW. 0 disables it. */
  maxPlantKw: number;
  /** Chiller starts allowed across one horizon run. 0 disables the cap. */
  maxChillerStartsPerRun: number;
  /**
   * Hours of the day the plant may run, as [startHour, endHour). When they are
   * equal the plant runs 24/7 — which is what T1 did for all of December, so
   * this is declared and enforced but never exercised by the shipped dataset.
   */
  operatingHours: { startHour: number; endHour: number };
  /** Move-size limits per optimisation cycle (rate limits on the applied move). */
  maxChwstChangePerCycleC: number;
  maxDpChangePerCyclePsi: number;
  /** Per-cycle rate limits on the continuous speed commands. */
  maxCwpSpeedChangePerCyclePct: number;
  maxCtFanSpeedChangePerCyclePct: number;
  /** Anti-short-cycling timers, enforced by the horizon controller's dwell rules. */
  minChillerRuntimeMin: number;
  minChillerOffTimeMin: number;
}

export interface ConstraintConfig {
  chiller: ChillerConstraints;
  chwp: ChwpConstraints;
  cwp: PumpConstraints;
  tower: TowerConstraints;
  system: SystemConstraints;
}

/** A form-level problem with the constraint configuration itself (min > max,
 *  non-finite entry, …) — distinct from a candidate violating a valid limit. */
export interface ConstraintConfigError {
  section: keyof ConstraintConfig;
  field: string;
  message: string;
}

/* ----------------------------------------------------------------- results */

export interface ConstraintViolation {
  code: string;
  equipment?: string;
  message: string;
  actual?: number;
  limit?: number;
  unit?: string;
}

export interface SimulationResult {
  chillerKw: number;
  chwpKw: number;
  cwpKw: number;
  /** chwpKw + cwpKw — the sidebar's "Pump kW" row. */
  pumpKw: number;
  towerKw: number;
  totalPlantKw: number;
  plantKwPerRt: number;
  cop: number;

  coolingRequiredRt: number;
  coolingDeliveredRt: number;

  chwFlowLs: number;
  cwFlowLs: number;
  chwDeltaT: number;
  cwDeltaT: number;

  chwsC: number;
  chwrC: number;
  cwsC: number;
  cwrC: number;

  chillerLoadPct: number;
  towerApproachC: number;
  wetBulbC: number;
  measuredDpPsi: number;

  /**
   * Equivalent condenser-lift penalty charged for running the CW pumps away
   * from their reference speed, K. Zero at the reference — see
   * `condenserHydraulics.ts`. Reported rather than buried so the CWP trade-off
   * is auditable: this is the term that stops slow pumps looking free.
   */
  condenserLiftShiftK: number;
  /** Chiller kW BEFORE the condenser-flow and part-load corrections. */
  chillerKwUncorrected: number;
  /**
   * Gordon-Ng part-load shape correction applied to chiller power, 1.0 inside
   * the observed per-machine load band. This is what stops the engine's affine
   * curve from making extra chillers free — see `chillerPartLoad.ts`.
   */
  partLoadShapeFactor: number;

  staging: { chillers: number; chwp: number; cwp: number; ct: number };

  feasible: boolean;
  violations: ConstraintViolation[];
  /** Whether these inputs sit inside the region covered by the T1 dataset. */
  calibration: { status: 'calibrated' | 'extrapolated'; reasons: string[] };
}

/* ------------------------------------------------------------------- MPC */

export interface MpcIteration {
  cycle: number;
  candidate: ControlState;
  result: SimulationResult;
  feasible: boolean;
  /** True when this candidate became the incumbent best. */
  accepted: boolean;
}

export interface MpcResult {
  input: SimulationInput;

  baselineControl: ControlState;
  baselineResult: SimulationResult;

  optimalControl: ControlState | null;
  optimalResult: SimulationResult | null;

  iterations: MpcIteration[];

  evaluatedCandidates: number;
  feasibleCandidates: number;
  rejectedCandidates: number;
  /** Rejection counts keyed by violation code, for the status panel. */
  rejectionsByCode: Record<string, number>;

  savingKw: number;
  savingPct: number;
  /** False when no candidate satisfied every constraint. */
  solved: boolean;
}

export type MpcStatus =
  | 'IDLE'
  | 'VALIDATING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'INFEASIBLE'
  | 'ERROR';

/** Live progress pushed out of the optimiser while it searches. */
export interface MpcProgress {
  cycle: number;
  totalCycles: number;
  candidate: ControlState;
  result: SimulationResult;
  bestTotalKw: number | null;
  bestKwPerRt: number | null;
}
