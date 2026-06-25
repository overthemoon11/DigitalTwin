import type { PlantAlert, PlantKpi } from './plant';

export type AhuMode = 'recirculation' | 'minimum_oa' | 'economizer' | 'heating';

export interface AhuControl {
  id: string;
  controlType: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  group: 'mode' | 'setpoints' | 'coils' | 'fans' | 'dampers' | 'load' | 'weather';
}

export type EquipStatus = 'running' | 'stopped' | 'alarm' | 'manual';

export interface AhuFan {
  id: string;
  name: string;
  running: boolean;
  speedPct: number;
  speedCmdPct: number;
  powerKw: number;
  status: EquipStatus;
  trip: boolean;
  autoManual: 'AUTO' | 'MANUAL';
}

export interface AhuDamper {
  id: string;
  name: string;
  positionPct: number;
  status: EquipStatus;
}

export interface AhuCoil {
  id: string;
  name: string;
  valvePct: number;
  enteringC: number;
  leavingC: number;
  dutyKw: number;
  status: EquipStatus;
}

export interface AhuFilter {
  id: string;
  name: string;
  dpPa: number;
  status: 'CLEAN' | 'DIRTY' | 'alarm';
}

export interface AhuHeaders {
  oatC: number;
  oaRhPct: number;
  ratC: number;
  raRhPct: number;
  matC: number;
  satC: number;
  saCfm: number;
  raCfm: number;
  oaCfm: number;
  eaCfm: number;
  staticPressurePa: number;
  oaFraction: number;
  mode: AhuMode;
  coolingKw: number;
  fanPowerKw: number;
  kwPerCfm: number;
  floor: string;
  fireStatus: 'NORMAL' | 'ALARM';
}

export interface AhuSimulation {
  tick: number;
  simTimeSec: number;
  mode: 'live' | 'fast_forward';
  lastTrigger: string;
  scenarioId?: string;
  lastControlId?: string;
  cascadeTrace?: string[];
  saFanCmd: 'ON' | 'OFF' | 'AUTO';
  raFanCmd: 'ON' | 'OFF' | 'AUTO';
}

export interface AhuEquipment {
  id: string;
  name: string;
  type: string;
  category: string;
  status: EquipStatus;
}

export interface AhuState {
  unit: string;
  headers: AhuHeaders;
  saFan: AhuFan;
  raFan: AhuFan;
  chwCoil: AhuCoil;
  hwCoil: AhuCoil;
  dampers: AhuDamper[];
  filters: AhuFilter[];
  controls: AhuControl[];
  kpis: PlantKpi[];
  alerts: PlantAlert[];
  equipment: Record<string, AhuEquipment>;
  simulation: AhuSimulation;
  recommendedActions: string[];
  simulationTime: string;
}
