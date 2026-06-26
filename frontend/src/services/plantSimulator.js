/**
 * Plant simulation facade — delegates to physics-based control engine.
 */
export {
  stepPlantSimulation,
  advancePlantSimulation,
  applyChillerScenario,
  applyChillerScenarioPayload,
  startPlantSimulator,
  updatePlantControl,
  resetPlantControls,
  triggerPlantFault,
  acknowledgePlantAlert,
  getPlantControls,
  getSimInternals,
  EQUIPMENT_DEFS,
} from './controlEngine';
