/**
 * Public surface of the chiller-plant MPC module.
 *
 * The UI imports from here only — never from the individual files — so the
 * internal split (simulator / validator / generator / optimiser) stays free to
 * change.
 */
import type { ConstraintConfig, ControlState, SimulationInput } from '../../../shared/types/mpc';
import type { PlantState } from '../../../shared/types/plant';
import { applyChillerScenarioPayload } from '../digital-twin/chiller/model/controlEngine';
import { controlOverrides, solveWeather } from './simulator/chillerPlantSimulator';
import { dutyOrderFor } from './optimizer/candidateGenerator';

export { designConstraints, validateConstraintConfig } from './constraints/constraintConfig';
export { validateCandidate, VIOLATION_LABELS } from './constraints/constraintValidator';
export {
  simulateCandidate,
  readBaselineControl,
  readSimulationInput,
  solveWeather,
  controlOverrides,
  approachFromFanSpeed,
} from './simulator/chillerPlantSimulator';
export { continuousAxes, stagingOptions, chillerIdsFor } from './optimizer/candidateGenerator';
export { objective, improves, savings } from './optimizer/objectiveFunction';
export { defaultMpcOptimizer, DEFAULT_MAX_CYCLES } from './optimizer/mpcOptimizer';
export type { MpcOptimizer, MpcContext, MpcHooks } from './optimizer/mpcOptimizer';

/**
 * Commit an optimal control state to the LIVE twin, so the central schematic,
 * equipment cards and KPI tiles all move to the optimised operating point
 * through the normal engine path — no parallel rendering state.
 *
 * This deliberately writes controls and staging in one payload:
 * `updatePlantControl` clears any staging override on every edit, so setting
 * them separately would silently drop the chiller count the MPC chose.
 *
 * The baseline is NOT touched — it lives in the store, captured before this
 * runs, which is what makes the before/after comparison honest.
 */
export function applyOptimalControl(
  input: SimulationInput,
  control: ControlState,
  opts: { dryBulbHintC?: number; constraints?: ConstraintConfig } = {}
): PlantState {
  return commitControlState('mpc-optimum', 'MPC optimum', input, control, opts);
}

/** Restore the twin to a previously captured control state (the baseline). */
export function restoreControlState(
  input: SimulationInput,
  control: ControlState,
  opts: { dryBulbHintC?: number; constraints?: ConstraintConfig } = {}
): PlantState {
  return commitControlState('mpc-baseline', 'Baseline (pre-MPC)', input, control, opts);
}

function commitControlState(
  id: string,
  label: string,
  input: SimulationInput,
  control: ControlState,
  opts: { dryBulbHintC?: number; constraints?: ConstraintConfig }
): PlantState {
  const weather = solveWeather(input, opts.dryBulbHintC ?? 31);
  return applyChillerScenarioPayload({
    id,
    label,
    controls: controlOverrides(input, control, weather),
    precise: true,
    staging: { chiller: Math.round(control.runningChillers) },
    // Same duty order the search simulated under, so the twin starts exactly
    // the machines the sidebar names.
    ...(opts.constraints ? { duty: { chiller: dutyOrderFor(opts.constraints) } } : {}),
  });
}

export type { ConstraintConfig, ControlState, SimulationInput };
