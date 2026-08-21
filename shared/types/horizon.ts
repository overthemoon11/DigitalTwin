/**
 * Contracts for the RECEDING-HORIZON side of the MPC.
 *
 * `shared/types/mpc.ts` describes one steady-state operating point: given a
 * load and a wet bulb, what is the cheapest legal control vector. That is a
 * static question and it has a static answer.
 *
 * This file describes the time-domain problem instead — the plant has thermal
 * memory (a loop full of water), the machines have dwell timers, and the load
 * moves. A decision that is optimal for this minute can be wrong for the hour,
 * so the controller plans over a horizon, applies only the first move, and
 * re-plans on the next measurement. Everything here exists to make that loop
 * explicit and inspectable:
 *
 *   Disturbance (measured)  ->  DisturbanceForecast (predicted)
 *                                      |
 *                            HorizonController.act()
 *                                      |
 *                      ControlState + ControlProvenance + SolverDiagnostics
 *                                      |
 *                   LoopState (thermal memory)  <->  SimulationResult (power)
 *                                      |
 *                                 HorizonStep
 *
 * Nothing in here imports a solver, a data source or React. Swapping the beam
 * search for CasADi, or the recorded-history forecast for a weather API, is a
 * change behind one of these interfaces and nothing else moves.
 */
import type {
  ConstraintConfig,
  ConstraintViolation,
  ControlState,
  SimulationInput,
  SimulationResult,
} from './mpc';

/* ------------------------------------------------------------ provenance */

/**
 * How one control's value in a run was arrived at. This is the anti-fabrication
 * mechanism: a number the optimiser never searched must never be presented as
 * an optimum, and a control the site cannot model must say so.
 *
 *   optimized         the solver searched this variable and chose this value
 *   derived           computed from an optimised variable through a documented
 *                     model (e.g. CHWP speed from the optimised DP setpoint).
 *                     Genuinely responsive, but not independently searched
 *   baseline-derived  carried over from what the plant is already doing
 *   fixed             pinned by configuration; the solver could not move it
 *   not-available     the model cannot represent this variable's effect, so no
 *                     value is proposed
 */
export type ControlProvenance =
  | 'optimized'
  | 'derived'
  | 'baseline-derived'
  | 'fixed'
  | 'not-available';

/** Provenance for every field of a `ControlState`. */
export type ControlProvenanceMap = Record<
  keyof Omit<ControlState, 'chillerIds'>,
  ControlProvenance
>;

/* --------------------------------------------------------- disturbances */

/** What the plant must serve at one instant. The MPC never manipulates these. */
export type Disturbance = SimulationInput;

/** Where a forecast came from and how far it should be trusted. */
export interface ForecastMeta {
  kind: 'perfect-foresight' | 'degraded-foresight' | 'persistence' | 'external';
  provenance: 'measured' | 'derived' | 'external';
  /** Plain-language reason this forecast should be read with care. */
  caveat: string;
}

/**
 * A replaceable source of future disturbances.
 *
 * The controller only ever calls `at(nowIndex, lead)`. That is deliberately the
 * smallest possible surface: a weather API adapter, a DDMS feed, a manual
 * profile or a learned model all satisfy it without the controller changing.
 */
export interface DisturbanceForecast {
  readonly name: string;
  /** How many steps ahead the controller may ask for. */
  readonly steps: number;
  readonly stepMinutes: number;
  readonly meta: ForecastMeta;
  /** Predicted disturbance `lead` steps after `nowIndex` (lead >= 1). */
  at(nowIndex: number, lead: number): Disturbance;
}

/** A recorded or generated disturbance series, indexed by step. */
export interface DisturbanceProfile {
  day: string;
  stepMinutes: number;
  t: string[];
  loadRt: number[];
  wetBulbC: number[];
  /** Buckets whose load or wet bulb had to be carried forward. */
  gapSteps: number;
  qualityFlags: string[];
}

/* ------------------------------------------------------- loop dynamics */

/**
 * The plant's thermal memory.
 *
 * `chwrC` is the state variable that makes this an MPC problem rather than a
 * sequence of independent static optimisations: shedding a chiller does not
 * cost anything this minute, it costs a warmer loop three steps from now.
 *
 * `dwellSteps` counts consecutive steps in the current on/off state, POSITIVE
 * while running and NEGATIVE while stopped, so one number carries both the
 * minimum-runtime and the minimum-off timer.
 */
export interface LoopState {
  chwrC: number;
  dwellSteps: number[];
  running: boolean[];
  lastDeliveredRt: number;
}

/** Loop and hydraulic parameters. Some measured, some assumed — see `calibrationStatus`. */
export interface LoopDynamicsConfig {
  /** Loop capacitance expressed as the RT-step that moves CHWR by 1 K. */
  loopRtPerKPerStep: number;
  stepMinutes: number;
  /** Measured month-median chilled-water flow per running pump, L/s. */
  flowPerPumpLs: number;
  pumpsPerChiller: number;
  /** RT per (L/s x K) — the cooling-load identity constant. */
  rtPerLsPerK: number;
  /** Where the loop drifts with every chiller off, degC. */
  soakTargetC: number;
  soakTauHours: number;
}

/**
 * Chilled-water flow available at a step.
 *
 * Flow is what converts a loop temperature difference into delivered cooling,
 * so this has to answer for the COMMANDED pump speed, not just for the number
 * of machines: without the speed argument a controller could slow the pumps,
 * book the cubic power saving, and still deliver full cooling.
 */
export interface FlowModel {
  readonly name: string;
  /** MEASURED / ASSUMED, and what from. Rendered in the run report. */
  readonly provenance: string;
  flowLs(step: number, runningChillers: number, chwpSpeedPct: number): number;
}

/** Anti-short-cycling limits, expressed in whole horizon steps. */
export interface DwellRules {
  minOnSteps: number;
  minOffSteps: number;
  maxSwitchesPerStep: number;
}

/** What one loop step did. */
export interface LoopStepOutcome {
  next: LoopState;
  deliveredRt: number;
  /** Load the loop could not absorb this step (warms CHWR). */
  unmetRt: number;
  /** The part of `unmetRt` that no amount of loop temperature could fix. */
  capacityShortfallRt: number;
  saturated: boolean;
  flowLs: number;
}

/* ------------------------------------------------------------ controller */

/** Everything the controller may look at when deciding one step. */
export interface HorizonContext {
  step: number;
  loop: LoopState;
  disturbance: Disturbance;
  forecast: DisturbanceForecast;
  constraints: ConstraintConfig;
  /** What the plant was doing before the run — the reference for the report. */
  baseline: ControlState;
  /** The control actually applied at the previous step (baseline at step 0). */
  previous: ControlState;
  dynamics: LoopDynamicsConfig;
  flowModel: FlowModel;
}

/** Why the controller did what it did, and whether it could be trusted. */
export interface SolverDiagnostics {
  step: number;
  solverStatus: 'OPTIMAL' | 'FEASIBLE' | 'FALLBACK';
  solveMs: number;
  /** Horizon cost expressed as a mean plant kW, so it is readable. */
  objectiveKw: number;
  nodesExpanded: number;
  nodesKept: number;
  forecastLoadRt: number[];
  forecastWetBulbC: number[];
  predictedChwrC: number[];
  predictedPlantKw: number[];
  plannedStaging: number[];
  plannedChwstC: number[];
  plannedDpPsi: number[];
  /** Objective terms for the applied step, in kW-equivalent. */
  costBreakdownKw: Record<string, number>;
  activeConstraints: string[];
  violations: ConstraintViolation[];
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export interface HorizonDecision {
  control: ControlState;
  provenance: ControlProvenanceMap;
  diagnostics: SolverDiagnostics;
}

/**
 * A controller the closed loop can drive. The baseline and the MPC implement
 * the SAME interface, which is what makes the comparison fair — the loop cannot
 * tell them apart and gives them identical treatment.
 */
export interface HorizonController {
  readonly name: string;
  reset?(): void;
  act(ctx: HorizonContext): HorizonDecision;
}

/* --------------------------------------------------------------- results */

export interface HorizonStep {
  step: number;
  t: string | null;
  minutesFromStart: number;
  disturbance: Disturbance;
  control: ControlState;
  provenance: ControlProvenanceMap;
  result: SimulationResult;
  loop: LoopState;
  deliveredRt: number;
  unmetRt: number;
  violations: ConstraintViolation[];
  starts: number;
  stops: number;
  diagnostics: SolverDiagnostics | null;
}

export interface RunTotals {
  steps: number;
  hours: number;
  chillerKwh: number;
  pumpKwh: number;
  towerKwh: number;
  totalPlantKwh: number;
  /** Delivered cooling, RT-hours. The denominator of the kW/RT figure. */
  rtHours: number;
  plantKwPerRt: number;
  peakPlantKw: number;
  chillerStarts: number;
  chillerHours: number;
  unmetRtHours: number;
  chwrMaxC: number;
  chwrMeanC: number;
  violationSteps: number;
  infeasibleSteps: number;
}

/**
 * The conditions a run faced. Two runs may only be compared when every field
 * here matches — that is enforced, not documented.
 */
export interface RunConditions {
  source: 'bms' | 'manual' | 'synthetic';
  day: string | null;
  steps: number;
  stepMinutes: number;
  /** Hash of the disturbance series. */
  disturbanceKey: string;
  /** Hash of the constraint config. */
  constraintKey: string;
  initialLoop: LoopState;
  forecast: ForecastMeta;
}

export interface HorizonRun {
  label: string;
  controller: string;
  trajectory: HorizonStep[];
  totals: RunTotals;
  conditions: RunConditions;
}

export interface HorizonSavings {
  chillerKwh: number;
  totalPlantKwh: number;
  totalPlantPct: number;
  kwPerRtBaseline: number;
  kwPerRtMpc: number;
  kwPerRtPct: number;
  deliveredRtHoursBaseline: number;
  deliveredRtHoursMpc: number;
  deliveredRtHoursDeltaPct: number;
  /** 'equal-delivery' when both arms served the same cooling to tolerance. */
  basis: 'equal-delivery' | 'unequal-delivery';
  /** Which percentage the UI should quote as the headline. */
  headline: 'totalPlantPct' | 'kwPerRtPct';
}

export interface HorizonComparison {
  conditions: RunConditions;
  baseline: HorizonRun;
  mpc: HorizonRun;
  savings: HorizonSavings;
  /** Union across the run: how each control was arrived at overall. */
  optimisedControls: ControlProvenanceMap;
  /** Plain-language reasons this result should be read with care. Never hide. */
  caveats: string[];
}
