export type EquipmentStatus = 'running' | 'stopped' | 'alarm' | 'manual';

export interface PlantEquipmentBase {
  id: string;
  name: string;
  category: string;
  status: EquipmentStatus;
  powerKw: number;
  flowRate: number;
  temperature?: number;
  runtimeHours: number;
}

export interface ChillerEquipment extends PlantEquipmentBase {
  type: 'chiller';
  loadPercent: number;
  cop: number;
  supplyTemp: number;
  returnTemp: number;
}

export interface PumpEquipment extends PlantEquipmentBase {
  type: 'pump';
  speedPercent: number;
  frequencyHz: number;
  loop: 'condenser' | 'chilled' | 'makeup';
}

export interface CoolingTowerEquipment extends PlantEquipmentBase {
  type: 'cooling_tower';
  fanSpeedPercent: number;
  frequencyHz: number;
  leavingTemp: number;
}

export interface ValveEquipment extends PlantEquipmentBase {
  type: 'valve';
  positionPercent: number;
}

export interface ExpansionTankEquipment extends PlantEquipmentBase {
  type: 'expansion_tank';
  levelPercent: number;
}

export interface MakeupTankEquipment extends PlantEquipmentBase {
  type: 'makeup_tank';
  levelPercent: number;
  highLevel: boolean;
  lowLevel: boolean;
  volumeGal: number;
}

export interface MakeupPumpEquipment extends PlantEquipmentBase {
  type: 'makeup_pump';
  speedPercent: number;
  runStatus: boolean;
}

export type PlantEquipment =
  | ChillerEquipment
  | PumpEquipment
  | CoolingTowerEquipment
  | ValveEquipment
  | ExpansionTankEquipment
  | MakeupTankEquipment
  | MakeupPumpEquipment;

export interface PlantHeaders {
  chws: number;
  chwr: number;
  cws: number;
  cwr: number;
  buildingLoadRt: number;
  /** Outdoor dry-bulb (operator weather control) */
  ambientTemp: number;
  /** Outdoor relative humidity (operator humidity control) */
  humidityRh: number;
}

export interface PlantControl {
  id: string;
  controlType: string;
  label: string;
  value: number | boolean | null;
  min: number;
  max: number;
  step: number;
  unit: string;
  assetId?: string;
  /** Sidebar group key (chiller plant panel) */
  group?: string;
}

export interface PlantAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  assetId: string;
  resolved: boolean;
  acknowledged: boolean;
  timestamp: string;
  recommendedAction?: string;
  /** Specific control slider targets for the operator */
  recommendedAdjustments?: {
    controlId: string;
    label: string;
    currentValue: number | string;
    suggestedValue: number | string;
    unit?: string;
  }[];
}

export interface PlantKpi {
  id: string;
  name: string;
  value: number | string;
  unit: string;
  category: string;
  status: string;
  target: number | string;
  trend: string;
}

/** Offline virtual simulator metadata — all telemetry is computed. */
export interface PlantSimulationMeta {
  mode: 'virtual-offline';
  /** No live BACnet/OPC streams; physics-only */
  dataSource: 'physics-engine';
  tick: number;
  dtSeconds: number;
  simTimeSec: number;
  /** Last operator input that drove the cascade */
  lastTrigger: string;
  lastControlId?: string;
  /** Ordered domino-effect steps from last calculation */
  cascadeTrace: string[];
  /** Structured before→after rows for the domino-effect table */
  cascadeRows?: Array<{ label: string; before: number | string | null; after: number | string; unit: string; changed: boolean }>;
  /** Latest calculated load and delta-T after each physics step */
  lastOutput?: {
    buildingLoadRt: number;
    deltaT: number;
  };
  /** Active preset scenario (operator what-if) */
  scenarioId?: string;
}

export interface PlantState {
  equipment: Record<string, PlantEquipment>;
  headers: PlantHeaders;
  kpis: PlantKpi[];
  controls: PlantControl[];
  alerts: PlantAlert[];
  simulationTime: string;
  simulation: PlantSimulationMeta;
}

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  running: '#4caf50',
  stopped: '#6b7280',
  alarm: '#ef4444',
  manual: '#eab308',
};

export const PIPE_COLORS = {
  cws: '#22c55e',
  cwr: '#14532d',
  chws: '#3b82f6',
  chwr: '#1e3a8a',
  makeup: '#0ea5e9',
} as const;
