/**
 * Simulation controller — the Digital Twin's application layer.
 *
 * Route handlers stay thin: they parse, delegate here, and serialise. All the
 * domain calls live in this file, and every one of them goes through the twin's
 * public barrel (`digital-twin/chiller`) rather than reaching into the model.
 *
 * There is no physics in this file. If a formula ever appears below, the
 * "one authoritative plant model" rule has been broken.
 */
import {
  evaluatePlant,
  predictPlant,
  stepPlantSimulation,
  advancePlantSimulation,
  updatePlantControl,
  applyPlantChanges,
  applyChillerScenario,
  applyChillerScenarioPayload,
  resetPlantControls,
  triggerPlantFault,
  acknowledgePlantAlert,
  togglePlantDutyUnit,
  getPlantControls,
  getPlantInputSchema,
  CHILLER_CONTROL_CONSTRAINTS,
  CALIBRATION_BOUNDS,
  CALIBRATION_FIT,
  CHILLER_CAPACITY_RT,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  CT_COUNT,
  T1_MV_ROWS,
  mvRowById,
  buildRowReplayPayload,
  CHILLER_SCENARIOS,
  ROW86_SCENARIO_ID,
  ROW86_EXPECTED,
  HL_CP_RATIO,
  CHWP_VSD_RATIO,
  CWP_VSD_RATIO,
  type PlantState,
} from '../../digital-twin/chiller/index';
// @ts-expect-error — plain-JS copilot module
import { buildChillerChatSuggestions } from '../../services/copilot/chillerCopilotActions.js';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Every control value must be a finite number keyed by a `ctrl-…` id. */
function coerceControls(raw: unknown): Record<string, number> {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(400, '`controls` must be an object of { "ctrl-…": number }');
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ApiError(400, `control "${k}" must be a finite number`);
    }
    out[k] = v;
  }
  return out;
}

function coerceStaging(raw: unknown): Record<string, number> | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(400, '`staging` must be an object of { chiller|chwp|cwp|ct: number }');
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!['chiller', 'chwp', 'cwp', 'ct'].includes(k)) {
      throw new ApiError(400, `unknown staging category "${k}"`);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ApiError(400, `staging.${k} must be a finite number`);
    }
    out[k] = v;
  }
  return out;
}

/* ─────────────────────────────────────────────────── stateless evaluation ── */

/** POST /api/simulation/evaluate — score one operating point. Pure. */
export function evaluate(body: any) {
  const controls = coerceControls(body?.controls);
  const staging = coerceStaging(body?.staging);
  return evaluatePlant(controls, {
    ...(staging ? { staging: staging as never } : {}),
    ...(body?.duty ? { duty: body.duty } : {}),
  });
}

/** POST /api/simulation/evaluate/batch — score many points in one round trip.
 *  Exists so an optimiser or notebook does not pay HTTP latency per candidate. */
const MAX_BATCH = 2000;
export function evaluateBatch(body: any) {
  const cases = body?.cases;
  if (!Array.isArray(cases)) throw new ApiError(400, 'body must be { "cases": [ … ] }');
  if (cases.length > MAX_BATCH) {
    throw new ApiError(400, `batch limited to ${MAX_BATCH} cases (got ${cases.length})`);
  }
  return { count: cases.length, results: cases.map((c) => evaluate(c)) };
}

/** POST /api/simulation/predict — horizon rollout from the live state. */
export function predict(body: any) {
  const controls = coerceControls(body?.controls);
  const steps = Number(body?.steps ?? 10);
  if (!Number.isFinite(steps) || steps < 1 || steps > 600) {
    throw new ApiError(400, '`steps` must be between 1 and 600');
  }
  return { steps: Math.floor(steps), stages: predictPlant(controls, Math.floor(steps)) };
}

/* ──────────────────────────────────────────────────────── live plant state ── */

/** GET /api/simulation/state — the current tick of the live twin. */
export function getState(): PlantState {
  return stepPlantSimulation();
}

/** POST /api/simulation/control — set one control and return the new state. */
export function setControl(body: any): PlantState {
  const id = body?.controlId;
  const value = body?.value;
  if (typeof id !== 'string' || !id) throw new ApiError(400, '`controlId` is required');
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(400, '`value` must be a finite number');
  }
  updatePlantControl(id, value);
  return stepPlantSimulation();
}

/** POST /api/simulation/apply — commit a batch of edits, then fast-forward. */
export function applyChanges(body: any): PlantState {
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  const seconds = Number(body?.seconds ?? 60);
  return applyPlantChanges(changes, Math.max(1, Math.floor(seconds / 2)));
}

/** POST /api/simulation/advance — run virtual time forward. */
export function advance(body: any): PlantState {
  const seconds = Number(body?.seconds ?? 60);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new ApiError(400, '`seconds` must be > 0');
  return advancePlantSimulation(Math.max(1, Math.floor(seconds / 2)));
}

/** POST /api/simulation/scenario — apply a preset id or an ad-hoc payload. */
export function applyScenario(body: any): PlantState {
  if (typeof body?.scenarioId === 'string') return applyChillerScenario(body.scenarioId);
  if (body?.payload && typeof body.payload === 'object') {
    return applyChillerScenarioPayload(body.payload);
  }
  throw new ApiError(400, 'provide either `scenarioId` or `payload`');
}

/** POST /api/simulation/reset */
export function reset(): PlantState {
  resetPlantControls();
  return stepPlantSimulation();
}

/** POST /api/simulation/fault */
export function fault(body: any): PlantState {
  if (typeof body?.faultType !== 'string') throw new ApiError(400, '`faultType` is required');
  triggerPlantFault(body.faultType);
  return stepPlantSimulation();
}

/** POST /api/simulation/alert/acknowledge */
export function acknowledgeAlert(body: any): PlantState {
  if (typeof body?.alertId !== 'string') throw new ApiError(400, '`alertId` is required');
  acknowledgePlantAlert(body.alertId);
  return stepPlantSimulation();
}

/** POST /api/simulation/duty — toggle a unit between duty and standby. */
export function toggleDuty(body: any): PlantState {
  const { category, unit } = body ?? {};
  if (!['chiller', 'chwp', 'cwp', 'ct'].includes(category)) {
    throw new ApiError(400, '`category` must be chiller | chwp | cwp | ct');
  }
  if (typeof unit !== 'number' || !Number.isFinite(unit)) {
    throw new ApiError(400, '`unit` must be a number');
  }
  togglePlantDutyUnit(category, unit);
  return stepPlantSimulation();
}

/* ────────────────────────────────────────────────────────── configuration ── */

/**
 * GET /api/simulation/config — everything the UI needs to render its inputs
 * without importing model code: control bounds, plant inventory, the calibrated
 * envelope and the preset scenario list.
 */
export function getConfig() {
  return {
    controlConstraints: CHILLER_CONTROL_CONSTRAINTS,
    inputSchema: getPlantInputSchema(),
    inventory: {
      chillerCapacityRt: CHILLER_CAPACITY_RT,
      chillerCount: CHILLER_COUNT,
      chwpCount: CHWP_COUNT,
      cwpCount: CWP_COUNT,
      ctCount: CT_COUNT,
    },
    calibratedEnvelope: CALIBRATION_BOUNDS,
    calibrationFit: CALIBRATION_FIT,
    scenarios: CHILLER_SCENARIOS,
    controls: getPlantControls(),
    // Display-only calibration artefacts the BMS Points panel renders.
    meterRatios: { hlCp: HL_CP_RATIO, chwpVsd: CHWP_VSD_RATIO, cwpVsd: CWP_VSD_RATIO },
    validation: { row86ScenarioId: ROW86_SCENARIO_ID, row86Expected: ROW86_EXPECTED },
    chatSuggestions: buildChillerChatSuggestions(stepPlantSimulation()),
  };
}

/**
 * GET /api/simulation/dataset/rows — the M&V row index for the BMS Points
 * replay picker. Deliberately returns only what the picker renders; the full
 * 133-row payload with every measured channel stays server-side.
 */
export function getDatasetRows() {
  return {
    count: T1_MV_ROWS.length,
    rows: T1_MV_ROWS.map((r) => ({
      row: r.row,
      scenarioId: `row-${r.row}`,
      time: r.time,
      loadRt: r.loadRt,
      kw: r.kw,
      kwRt: r.kwRt,
      deltaT: r.deltaT,
    })),
  };
}

/** POST /api/simulation/dataset/replay — replay one measured row on the twin. */
export function replayDatasetRow(body: any): PlantState {
  const row = typeof body?.scenarioId === 'string'
    ? mvRowById(body.scenarioId)
    : T1_MV_ROWS.find((r) => r.row === Number(body?.row));
  if (!row) throw new ApiError(404, 'dataset row not found');
  return applyChillerScenarioPayload(
    buildRowReplayPayload(row, body?.overrides ?? {}) as never
  );
}
