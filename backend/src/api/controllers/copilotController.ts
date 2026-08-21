/**
 * Chiller copilot controller.
 *
 * Intent parsing, control application and local query analysis used to run in
 * the browser next to the plant model. Now that the model is server-side, this
 * has to be as well — the parser resolves a phrase like "set building load to
 * 3200" against the live control set and then mutates the twin, which is plant
 * business logic, not presentation.
 *
 * The frontend keeps only the chat transcript and the rendering.
 */
// Plain-JS copilot module: `allowJs` lets tsc infer its shape, so no
// suppression is needed here.
import {
  parseChillerCopilotIntents,
  formatChillerControlConfirmation,
  formatChillerScenarioConfirmation,
  formatChillerCustomScenarioConfirmation,
  buildChillerControlsSummary,
  buildChillerContextForCopilot,
  analyzeChillerQuery,
} from '../../services/copilot/chillerCopilotActions.js';
import {
  stepPlantSimulation,
  getPlantControls,
  updatePlantControl,
  applyChillerScenario,
  applyChillerScenarioPayload,
} from '../../digital-twin/chiller/index';
import { ApiError } from './simulationController';

/**
 * POST /api/copilot/chiller
 *
 * Applies any control/scenario intent found in the message, then returns a
 * locally-derived answer plus the resulting plant state. Returns
 * `handled: false` when nothing matched, so the caller can fall through to the
 * LLM endpoint instead.
 */
export function chillerChat(body: any) {
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    throw new ApiError(400, '`message` is required');
  }

  const controls = getPlantControls();
  const parsed = parseChillerCopilotIntents(message, controls);

  let header = '';
  let controlsApplied = false;
  let appliedControls: unknown[] = [];
  let plantState = null;

  if (parsed.scenarioId) {
    plantState = applyChillerScenario(parsed.scenarioId);
    header = formatChillerScenarioConfirmation(parsed.scenarioId);
    controlsApplied = true;
  } else if (parsed.scenarioPayload) {
    plantState = applyChillerScenarioPayload(parsed.scenarioPayload);
    header = formatChillerCustomScenarioConfirmation(parsed.scenarioPayload);
    controlsApplied = true;
  } else if (parsed.applied?.length) {
    for (const action of parsed.applied) updatePlantControl(action.controlId, action.newValue);
    plantState = stepPlantSimulation();
    header = formatChillerControlConfirmation(parsed.applied);
    controlsApplied = true;
    appliedControls = parsed.applied.map((a: any) => ({
      controlId: a.controlId, label: a.label,
      oldValue: a.oldValue, newValue: a.newValue, unit: a.unit,
    }));
  }

  const state = plantState ?? stepPlantSimulation();
  const analysis = analyzeChillerQuery(message, state);

  return {
    handled: controlsApplied || Boolean(analysis),
    header,
    analysis: analysis || '',
    errors: parsed.errors ?? [],
    controlsApplied,
    appliedControls,
    plantState,
    // Context for the LLM endpoint when the caller needs to fall through.
    plantContext: buildChillerContextForCopilot(state),
    plantControls: buildChillerControlsSummary(state.controls ?? controls),
  };
}
