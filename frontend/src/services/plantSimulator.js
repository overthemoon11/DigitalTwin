/**
 * Plant simulation facade — delegates to physics-based control engine.
 */
export {
  stepPlantSimulation,
  advancePlantSimulation,
  startPlantSimulator,
  updatePlantControl,
  resetPlantControls,
  triggerPlantFault,
  acknowledgePlantAlert,
  getPlantControls,
  getSimInternals,
  EQUIPMENT_DEFS,
} from './controlEngine';
