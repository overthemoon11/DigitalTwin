/**
 * Digital Twin endpoints.
 *
 * Every one of these used to be a direct function call into the plant model
 * running in this browser tab. They are now HTTP calls to the backend that owns
 * the model — the frontend no longer contains any plant physics.
 */
import { get, post } from './client';
import type { PlantState } from '@shared/types/plant';

/** Result of scoring one operating point — mirrors the twin's PlantEvaluation. */
export interface PlantEvaluation {
  inputs: Record<string, number>;
  efficiency: { kwPerRt: number; cop: number };
  power: { totalKw: number; chillerKw: number; chwpKw: number; cwpKw: number; ctKw: number };
  thermal: {
    buildingLoadRt: number; deltaT: number; chws: number; chwr: number;
    cws: number; cwr: number; condFlowM3h: number; towerApproach: number; wetBulb: number;
  };
  hydraulic: {
    chwFlowM3h: number; cwFlowM3h: number; chwpSpeedPct: number; cwpSpeedPct: number;
    ctFanSpeedPct: number; measuredDpPsi: number; chillerLoadPct: number;
  };
  staging: { chillers: number; chwp: number; cwp: number; ct: number };
  calibration: { status: 'calibrated' | 'extrapolated'; reasons: string[] };
  alarms: number;
}

export interface PlantConfig {
  controlConstraints: Record<string, { min: number; max: number; step: number }>;
  inputSchema: Array<{
    id: string; label: string; unit: string;
    default: number; min: number; max: number; step: number;
  }>;
  inventory: {
    chillerCapacityRt: number; chillerCount: number;
    chwpCount: number; cwpCount: number; ctCount: number;
  };
  calibratedEnvelope: unknown;
  calibrationFit: unknown;
  scenarios: Array<{ id: string; label: string; description?: string }>;
  controls: PlantState['controls'];
}

export interface DatasetRowSummary {
  row: number; time: string; loadRt: number; kw: number; kwRt: number; deltaT: number;
}

/* ── read ──────────────────────────────────────────────────────────────────── */

export const fetchHealth = () => get<{ status: string; model: string }>('/health');

/** Static configuration the UI needs to render inputs (bounds, inventory,
 *  scenario list). Fetched once at startup rather than imported from the model. */
export const fetchConfig = () => get<PlantConfig>('/simulation/config');

/** One tick of the live twin. Normally the WebSocket supplies this; use it for
 *  the initial paint or to recover after a socket drop. */
export const fetchState = () => get<PlantState>('/simulation/state');

export const fetchDatasetRows = () =>
  get<{ count: number; rows: DatasetRowSummary[] }>('/simulation/dataset/rows');

/* ── evaluate (pure, does not move the live plant) ────────────────────────── */

export const evaluatePlant = (
  controls: Record<string, number>,
  opts: { staging?: Record<string, number>; duty?: Record<string, number[]> } = {}
) => post<PlantEvaluation>('/simulation/evaluate', { controls, ...opts });

export const evaluateBatch = (cases: Array<{ controls: Record<string, number> }>) =>
  post<{ count: number; results: PlantEvaluation[] }>('/simulation/evaluate/batch', { cases });

/* ── mutate the live plant ─────────────────────────────────────────────────── */

export const setControl = (controlId: string, value: number) =>
  post<PlantState>('/simulation/control', { controlId, value });

export const applyChanges = (changes: unknown[], seconds = 60) =>
  post<PlantState>('/simulation/apply', { changes, seconds });

export const advance = (seconds = 60) => post<PlantState>('/simulation/advance', { seconds });

export const applyScenarioId = (scenarioId: string) =>
  post<PlantState>('/simulation/scenario', { scenarioId });

export const applyScenarioPayload = (payload: unknown) =>
  post<PlantState>('/simulation/scenario', { payload });

export const resetPlant = () => post<PlantState>('/simulation/reset');

export const triggerFault = (faultType: string) =>
  post<PlantState>('/simulation/fault', { faultType });

export const acknowledgeAlert = (alertId: string) =>
  post<PlantState>('/simulation/alert/acknowledge', { alertId });

export const toggleDuty = (category: string, unit: number) =>
  post<PlantState>('/simulation/duty', { category, unit });

export const replayDatasetRow = (row: number, overrides: unknown = {}) =>
  post<PlantState>('/simulation/dataset/replay', { row, overrides });
