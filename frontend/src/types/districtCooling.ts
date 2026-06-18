import type { PlantAlert, PlantKpi } from './plant';

export type PlantScenario = 'chiller' | 'heat_exchange';

export type AppViewTab = 'chiller_plant' | 'district_cooling';

export interface DistrictCoolingControl {
  id: string;
  controlType: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  group?: string;
}

export interface DistrictCoolingHeaders {
  dcsTemp: number;
  dcrTemp: number;
  chws: number;
  chwr: number;
  buildingLoadRt: number;
  contractDemandRt: number;
  coolingDemandRt: number;
  primaryDeltaT: number;
  secondaryDeltaT: number;
  hxApproach: number;
  pumpSpeedPct: number;
  secondaryDpKpa: number;
  pumpPowerKw: number;
  kwPerRt: number;
  roomTempC: number;
  rhPct: number;
  co2Ppm: number;
  dewPointC: number;
  surfaceTempC: number;
  ambientTempC: number;
  ambientRhPct: number;
  occupancy: 'occupied' | 'unoccupied';
  chwsSetpoint: number;
}

export interface DcsBuildingBranch {
  id: string;
  name: string;
  loadRt: number;
  chws: number;
  chwr: number;
  hxApproach: number;
  valvePct: number;
  status: 'running' | 'stopped' | 'alarm' | 'manual';
}

export interface DistrictCoolingEquipment {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'alarm' | 'manual';
  category: string;
}

export interface DistrictCoolingSimulation {
  tick: number;
  simTimeSec: number;
  mode: 'live' | 'fast_forward';
  lastTrigger: string;
}

export interface ScenarioComparisonRow {
  metric: string;
  baseline: string;
  optimized: string;
  delta: string;
  improved: boolean;
}

export interface DistrictCoolingState {
  headers: DistrictCoolingHeaders;
  buildings: DcsBuildingBranch[];
  controls: DistrictCoolingControl[];
  kpis: PlantKpi[];
  alerts: PlantAlert[];
  equipment: Record<string, DistrictCoolingEquipment>;
  simulationTime: string;
  simulation: DistrictCoolingSimulation;
  scenarioComparison: ScenarioComparisonRow[];
  recommendedActions: string[];
}
