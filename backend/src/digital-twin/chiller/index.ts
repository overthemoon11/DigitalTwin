/**
 * Public surface of the T1 chiller Digital Twin.
 *
 * Everything outside this folder — the API layer, the WebSocket channel, the
 * MPC — imports from here and never reaches into `model/`, `calibration/` or
 * `fixtures/` directly. That is what makes "one authoritative plant model" an
 * enforceable rule rather than a convention: there is exactly one door.
 *
 * The twin answers one question: given a building condition, weather and a set
 * of control settings, what does the plant do? It knows nothing about
 * optimisation — the MPC depends on the twin, never the reverse.
 */

/* ── evaluation (stateless, deterministic) ────────────────────────────────── */
export {
  evaluatePlant,
  predictPlant,
  getPlantInputSchema,
  type PlantEvaluation,
  type PredictStageMetric,
} from './model/controlEngine';

/* ── live simulation (stateful singleton owned by the backend) ────────────── */
export {
  stepPlantSimulation,
  advancePlantSimulation,
  startPlantSimulator,
  updatePlantControl,
  applyPlantChanges,
  applyChillerScenario,
  applyChillerScenarioPayload,
  resetPlantControls,
  triggerPlantFault,
  acknowledgePlantAlert,
  getPlantControls,
  getPlantDutyOrders,
  togglePlantDutyUnit,
  getSimInternals,
  EQUIPMENT_DEFS,
} from './model/controlEngine';

/* ── configuration the UI needs to render inputs ──────────────────────────── */
export { CHILLER_CONTROL_CONSTRAINTS } from './constraints/chillerConstraints';
export { CALIBRATION_BOUNDS } from './calibration/calibrationEnvelope';
export { CALIBRATION_FIT } from './calibration/t1MonthCalibration';

/* ── plant inventory constants the schematic needs for layout ─────────────── */
export {
  CHILLER_CAPACITY_RT,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  CT_COUNT,
} from './model/plantPhysics';

/* ── dataset fixtures (replay + BMS point list) ───────────────────────────── */
export { T1_MV_ROWS, mvRowById, buildRowReplayPayload, type T1MvRow } from './fixtures/t1MvRows';
export { ROW86_SCENARIO_ID, ROW86_ROW_NUMBER, ROW86_EXPECTED } from './fixtures/t1Row86';
/** Per-unit meter ratios the BMS Points list renders. Calibration-derived, so
 *  they belong with the twin rather than being re-typed in the UI. */
export { HL_CP_RATIO, CHWP_VSD_RATIO, CWP_VSD_RATIO } from './fixtures/t1Snapshot';

/* ── preset scenarios ─────────────────────────────────────────────────────── */
export { CHILLER_SCENARIOS, getChillerScenarioById } from './scenarios/chillerScenarios.js';

/* ── types ────────────────────────────────────────────────────────────────── */
export type { PlantState, PlantControl, PlantKpi, PlantAlert } from '../../../../shared/types/plant';
