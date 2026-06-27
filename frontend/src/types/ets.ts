import type { PlantAlert, PlantKpi } from './plant';

/** Energy Transfer Station (heat-exchange substation) types — MBS A-B03-01. */

export interface EtsControl {
  id: string;
  controlType: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  group: 'load' | 'setpoints' | 'pumps' | 'valves' | 'primary' | 'weather';
}

export type EquipStatus = 'running' | 'stopped' | 'alarm' | 'manual';

export interface EtsHeatExchanger {
  id: string;
  name: string;
  ratedTons: number;
  inService: boolean;
  dutyKw: number;
  approachC: number;
  effectiveness: number;
  ntu: number;
  lmtdC: number;
  valvePct: number;
  status: EquipStatus;
}

export interface EtsPump {
  id: string;
  name: string;
  running: boolean;
  speedPct: number;
  speedCmdPct: number;
  flowM3h: number;
  powerKw: number;
  status: EquipStatus;
}

export interface EtsValve {
  id: string;
  name: string;
  positionPct: number;
  cmdPct: number;
  status: EquipStatus;
}

export interface EtsHeaders {
  /** Primary (district) side */
  dcsSupplyC: number;
  dcrReturnC: number;
  primaryDeltaT: number;
  primaryFlowM3h: number;
  /** Secondary (building / ASM) side */
  chwsC: number;
  chwrC: number;
  secondaryDeltaT: number;
  secondaryFlowM3h: number;
  supplyPressureBar: number;
  returnPressureBar: number;
  headerDpKpa: number;
  ltBypassFlowM3h: number;
  /** Heat-exchange performance */
  approachC: number;
  effectiveness: number;
  /** Load */
  buildingLoadRt: number;
  coolingDemandRt: number;
  coolingKw: number;
  capacityTons: number;
  loadPct: number;
  /** Efficiency */
  pumpPowerKw: number;
  pumpKwPerRt: number;
  /** Weather */
  ambientTempC: number;
  ambientRhPct: number;
}

export interface EtsMeter {
  kw: number;
  ton: number;
  kwhCumulative: number;
}

export interface EtsSimulation {
  tick: number;
  simTimeSec: number;
  mode: 'live' | 'fast_forward';
  stage: number;
  controlMode: string;
  timeProgram: 'Occupied' | 'Unoccupied';
  lastTrigger: string;
  scenarioId?: string;
  lastControlId?: string;
  cascadeTrace?: string[];
  cascadeRows?: Array<{ label: string; before: number | string | null; after: number | string; unit: string; changed: boolean }>;
  lastOutput?: {
    buildingLoadRt?: number;
    primaryDeltaT?: number;
    secondaryDeltaT?: number;
    approachC?: number;
    effectiveness?: number;
    pumpKwPerRt?: number;
    deltaT?: number;
  };
}

export interface EtsEquipment {
  id: string;
  name: string;
  type: string;
  category: string;
  status: EquipStatus;
}

export interface EtsState {
  station: string;
  serves: string;
  headers: EtsHeaders;
  heatExchangers: EtsHeatExchanger[];
  pumps: EtsPump[];
  valves: EtsValve[];
  meter: EtsMeter;
  controls: EtsControl[];
  kpis: PlantKpi[];
  alerts: PlantAlert[];
  equipment: Record<string, EtsEquipment>;
  simulation: EtsSimulation;
  recommendedActions: string[];
  simulationTime: string;
}
