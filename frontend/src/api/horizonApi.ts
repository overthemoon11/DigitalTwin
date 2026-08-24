/**
 * Receding-horizon MPC endpoints.
 *
 * Distinct from `mpcApi.ts`, which solves ONE steady-state operating point.
 * These run a closed loop over time — forecast, horizon solve, twin step — and
 * return a baseline arm and an MPC arm that faced identical conditions.
 *
 * The response types below are transcribed from what the server actually sends.
 * Two shapes matter more than the rest and are worth reading before the UI:
 *
 *   `optimisedControls` — per control, how the value was arrived at. The UI
 *   must render this next to every number, because only some of the six were
 *   genuinely searched and a row that inherited the plant's current setpoint
 *   must not read like a computed optimum.
 *
 *   `caveats` — plain-language reasons the saving should be read with care.
 *   Render all of them, never truncated and never behind a disclosure.
 */
import { get, post } from './client';
import type { ModelStatus, PlantRecord } from '@shared/types/bms';
import type {
  ControlProvenance,
  HorizonSavings,
  RunTotals,
} from '@shared/types/horizon';

export type { ControlProvenance };

export type HorizonMode = 'bms' | 'manual' | 'synthetic';
export type ForecastKind = 'perfect' | 'degraded' | 'persistence';

export interface HorizonConfigResponse {
  horizon: Record<string, number>;
  dynamics: Record<string, number>;
  dynamicsCalibration: { status: string; measured: string[]; assumed: string[]; note: string };
  modes: HorizonMode[];
  forecasts: ForecastKind[];
  maxSteps: number;
  bms: { available: boolean; days: string[]; stepMinutes: number };
}

export interface HorizonControl {
  runningChillers: number;
  chillerIds: string[];
  chwstSetpointC: number;
  dpSetpointPsi: number;
  chwpSpeedPct: number;
  cwpSpeedPct: number;
  ctFanSpeedPct: number;
}

export interface HorizonStepResult {
  chillerKw: number;
  chwpKw: number;
  cwpKw: number;
  pumpKw: number;
  towerKw: number;
  totalPlantKw: number;
  plantKwPerRt: number;
  chwsC: number;
  chwrC: number;
  cwsC: number;
  cwrC: number;
  chwFlowLs: number;
  chwDeltaT: number;
  measuredDpPsi: number;
  towerApproachC: number;
  chillerLoadPct: number;
  condenserLiftShiftK: number;
  coolingDeliveredRt: number;
  feasible: boolean;
  calibration: { status: 'calibrated' | 'extrapolated'; reasons: string[] };
}

export interface SolverDiagnostics {
  step: number;
  solverStatus: 'OPTIMAL' | 'FEASIBLE' | 'FALLBACK';
  solveMs: number;
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
  costBreakdownKw: Record<string, number>;
  activeConstraints: string[];
  violations: Array<{ code: string; message: string }>;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export interface HorizonStep {
  step: number;
  t: string | null;
  minutesFromStart: number;
  disturbance: { buildingLoadRt: number; wetBulbC: number };
  control: HorizonControl;
  provenance: Record<string, ControlProvenance>;
  result: HorizonStepResult;
  loop: { chwrC: number; running: boolean[]; dwellSteps: number[]; lastDeliveredRt: number };
  deliveredRt: number;
  unmetRt: number;
  starts: number;
  stops: number;
  violations: Array<{ code: string; message: string }>;
  diagnostics: SolverDiagnostics | null;
}

export interface HorizonArm {
  label: string;
  controller: string;
  trajectory: HorizonStep[];
  totals: RunTotals;
}

export interface HorizonRun {
  status: 'COMPLETED';
  scenario: {
    mode: HorizonMode;
    day: string | null;
    steps: number;
    stepMinutes: number;
    forecast: string;
    baselineKind: string;
    /** Field-by-field: MEASURED / DERIVED / INFERRED / ASSUMED / NOT TRENDED. */
    provenance: Record<string, string>;
    qualityFlags: string[];
    flowModel: { name: string; provenance: string };
    loopDynamics: {
      config: Record<string, number>;
      equivalentVolumeM3: number;
      calibration: { status: string; measured: string[]; assumed: string[]; note: string };
    };
    horizon: Record<string, number>;
  };
  conditions: { source: string; day: string | null; steps: number; stepMinutes: number };
  savings: HorizonSavings;
  optimisedControls: Record<string, ControlProvenance>;
  caveats: string[];
  baseline: HorizonArm;
  mpc: HorizonArm;
  /** The control the MPC applied at step 0 — the AFTER column. */
  appliedControl: HorizonControl | null;
  /** What the plant was doing at step 0 — the BEFORE column. */
  baselineControl: HorizonControl | null;
  solver: {
    name: string;
    steps: number;
    fallbacks: number;
    totalSolveMs: number;
    meanSolveMs: number;
    statuses: Record<string, number>;
    firstStepCostKw: Record<string, number>;
    activeConstraints: string[];
  };
  modelStatus: { models: ModelStatus[]; missingSignals: Record<string, string> };
}

export interface BmsDay {
  day: string;
  records: number;
  flaggedRecords: number;
  qualityFlags: string[];
  loadRtMin: number | null;
  loadRtMax: number | null;
}

export interface ChannelValidation {
  id: string;
  label: string;
  unit: string;
  reference: string;
  metrics: { n: number; mae: number; rmse: number; bias: number; mapePct: number | null; r2: number };
}

export interface TwinValidation {
  dataset: string;
  stepMinutes: number;
  recordsScored: number;
  recordsAvailable: number;
  days: string[];
  basis: string;
  channels: ChannelValidation[];
  unscorable: Array<{ id: string; label: string; reason: string }>;
  heldOut: Record<string, unknown>;
}

export interface HorizonRequest {
  mode: HorizonMode;
  day?: string;
  steps?: number;
  forecast?: ForecastKind;
  seed?: number;
  simulationInput?: { buildingLoadRt: number; wetBulbC: number };
  constraints?: unknown;
  horizon?: Record<string, number>;
}

export const fetchHorizonConfig = () => get<HorizonConfigResponse>('/mpc/horizon/config');

export const runHorizonCompare = (body: HorizonRequest) =>
  post<HorizonRun>('/mpc/horizon/compare', body);

/** Which parts of the plant model this site's data could actually calibrate. */
export const fetchModelStatus = () =>
  get<{ models: ModelStatus[]; missingSignals: Record<string, string> }>('/mpc/model-status');

/** How close the twin is to the measured plant, channel by channel. */
export const fetchTwinValidation = () => get<TwinValidation>('/mpc/twin-validation');

/** Provenance, timebase, gaps and the cooling-load re-derivation. */
export const fetchDatasetSummary = () => get<Record<string, unknown>>('/bms/dataset-summary');

/** Recorded days with per-day load range and quality flags. */
export const fetchBmsDays = () => get<{ stepMinutes: number; days: BmsDay[] }>('/bms/days');

/**
 * Every measured bucket of one recorded day.
 *
 * The Simulation workspace previews the conditions a run will replay. Those
 * have to be the plant's OWN measurements — a preview drawn from anything else
 * would be a picture of a day that never happened.
 */
export const fetchBmsDayRecords = (day: string) =>
  get<{ day: string; stepMinutes: number; records: PlantRecord[] }>(`/bms/day/${day}`);
