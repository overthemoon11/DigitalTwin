/**
 * AHU01 simulation engine — offline physics, 2 s ticks.
 */
import type { PlantAlert, PlantKpi } from '../types/plant';
import type {
  AhuControl,
  AhuDamper,
  AhuEquipment,
  AhuFan,
  AhuFilter,
  AhuCoil,
  AhuHeaders,
  AhuState,
  EquipStatus,
} from '../types/ahu';
import { clamp, round, solveAhu01Airside } from './ahuPhysics.js';
import { buildAhuCascadeTrace } from './ahuCascade.js';
import { getAhuScenarioById } from './ahuScenarios.js';

const SIM_DT_SEC = 2;

let controls: AhuControl[] = defaultControls();
let tick = 0;
let lagRatC = 25.1;
let lagRaRh = 74.4;
let lastTrigger = 'AHU01 initialized';
let lastControlId: string | null = null;

function getControl(id: string): number {
  return controls.find((c) => c.id === id)?.value ?? 0;
}

function defaultControls(): AhuControl[] {
  return [
    { id: 'ahu-mode', controlType: 'mode', label: 'Operating Mode', value: 0, min: 0, max: 3, step: 1, unit: '', group: 'mode' },
    { id: 'ahu-sat-sp', controlType: 'satSetpoint', label: 'SAT Setpoint', value: 13.5, min: 10, max: 18, step: 0.5, unit: '°C', group: 'setpoints' },
    { id: 'ahu-ra-temp-sp', controlType: 'raTempSetpoint', label: 'RA Temp Setpoint', value: 24.0, min: 20, max: 28, step: 0.5, unit: '°C', group: 'setpoints' },
    { id: 'ahu-ra-rh-sp', controlType: 'raRhSetpoint', label: 'RA RH Setpoint', value: 52.0, min: 40, max: 70, step: 1, unit: '%', group: 'setpoints' },
    { id: 'ahu-sa-cfm-sp', controlType: 'saCfmSetpoint', label: 'SA Airflow Setpoint', value: 1800, min: 800, max: 3500, step: 50, unit: 'CFM', group: 'setpoints' },
    { id: 'ahu-ra-cfm-sp', controlType: 'raCfmSetpoint', label: 'RA Airflow Setpoint', value: 1500, min: 600, max: 2500, step: 50, unit: 'CFM', group: 'setpoints' },
    { id: 'ahu-sp-sp', controlType: 'staticPressure', label: 'Static Pressure SP', value: 650, min: 400, max: 900, step: 25, unit: 'Pa', group: 'setpoints' },
    { id: 'ahu-chw-enter', controlType: 'chwEntering', label: 'CHW Entering Temp', value: 7.0, min: 4, max: 12, step: 0.5, unit: '°C', group: 'coils' },
    { id: 'ahu-hw-enter', controlType: 'hwEntering', label: 'HW Entering Temp', value: 45.0, min: 35, max: 70, step: 1, unit: '°C', group: 'coils' },
    { id: 'ahu-sa-fan', controlType: 'saFanCmd', label: 'SA Fan Command', value: 1, min: 0, max: 1, step: 1, unit: '', group: 'fans' },
    { id: 'ahu-ra-fan', controlType: 'raFanCmd', label: 'RA Fan Command', value: 1, min: 0, max: 1, step: 1, unit: '', group: 'fans' },
    { id: 'ahu-filter-load', controlType: 'filterLoading', label: 'Filter Loading', value: 0, min: 0, max: 100, step: 5, unit: '%', group: 'dampers' },
    { id: 'ahu-zone-load', controlType: 'zoneLoad', label: 'Zone Load Index', value: 1.0, min: 0.3, max: 1.5, step: 0.05, unit: '', group: 'load' },
    { id: 'ahu-oat', controlType: 'ambientTemperature', label: 'Outdoor Temperature', value: 35.2, min: 5, max: 42, step: 0.1, unit: '°C', group: 'weather' },
    { id: 'ahu-oarh', controlType: 'humidity', label: 'Outdoor Humidity', value: 48.3, min: 20, max: 95, step: 1, unit: '%RH', group: 'weather' },
  ];
}

function statusFor(running: boolean, alarm = false): AhuFan['status'] {
  if (alarm) return 'alarm';
  return running ? 'running' : 'stopped';
}

function runStep(): AhuState {
  tick += 1;

  const modeIndex = Math.round(getControl('ahu-mode'));
  const satSp = getControl('ahu-sat-sp');
  const raTempSp = getControl('ahu-ra-temp-sp');
  const raRhSp = getControl('ahu-ra-rh-sp');
  const saCfmSp = getControl('ahu-sa-cfm-sp');
  const raCfmSp = getControl('ahu-ra-cfm-sp');
  const spSp = getControl('ahu-sp-sp');
  const chwEnter = getControl('ahu-chw-enter');
  const hwEnter = getControl('ahu-hw-enter');
  const filterLoad = getControl('ahu-filter-load');
  const zoneLoad = getControl('ahu-zone-load');
  const oat = getControl('ahu-oat');
  const oarh = getControl('ahu-oarh');
  const saFanOn = getControl('ahu-sa-fan') >= 1;
  const raFanOn = getControl('ahu-ra-fan') >= 1;

  const targetRat = raTempSp + zoneLoad * 1.2;
  const targetRh = raRhSp + zoneLoad * 18;
  lagRatC += (targetRat - lagRatC) * 0.12;
  lagRaRh += (targetRh - lagRaRh) * 0.1;

  const s = solveAhu01Airside({
    modeIndex,
    oatC: oat,
    oaRhPct: oarh,
    ratC: lagRatC,
    raRhPct: lagRaRh,
    satSpC: satSp,
    saCfmSp,
    raCfmSp,
    raTempSpC: raTempSp,
    raRhSpPct: raRhSp,
    spSpPa: spSp,
    chwEnterC: chwEnter,
    hwEnterC: hwEnter,
    filterLoadingPct: filterLoad,
    zoneLoadIdx: zoneLoad,
    saFanOn,
    raFanOn,
  });

  const headers: AhuHeaders = {
    oatC: s.oatC,
    oaRhPct: s.oaRhPct,
    ratC: s.ratC,
    raRhPct: s.raRhPct,
    matC: s.matC,
    satC: s.satC,
    saCfm: s.saCfm,
    raCfm: s.raCfm,
    oaCfm: s.oaCfm,
    eaCfm: s.eaCfm,
    staticPressurePa: s.staticPressurePa,
    oaFraction: s.oaFraction,
    mode: s.mode as AhuHeaders['mode'],
    coolingKw: s.coolingKw,
    fanPowerKw: s.fanPowerKw,
    kwPerCfm: s.kwPerCfm,
    floor: '1F',
    fireStatus: 'NORMAL',
  };

  const saFan: AhuFan = {
    id: 'ahu01-sa-fan',
    name: 'SA FAN',
    running: saFanOn && s.saFanSpeedPct > 0,
    speedPct: s.saFanSpeedPct,
    speedCmdPct: s.saFanSpeedPct,
    powerKw: s.saFanKw,
    status: statusFor(saFanOn, s.saCfm > saCfmSp * 1.25),
    trip: false,
    autoManual: 'AUTO',
  };

  const raFan: AhuFan = {
    id: 'ahu01-ra-fan',
    name: 'RA FAN',
    running: raFanOn && s.raFanSpeedPct > 0,
    speedPct: s.raFanSpeedPct,
    speedCmdPct: s.raFanSpeedPct,
    powerKw: s.raFanKw,
    status: statusFor(raFanOn),
    trip: false,
    autoManual: 'AUTO',
  };

  const chwCoil: AhuCoil = {
    id: 'ahu01-chw-coil',
    name: 'CHW COIL',
    valvePct: s.chwValvePct,
    enteringC: s.chwEnterC,
    leavingC: s.chwLeaveC,
    dutyKw: s.coolingKw,
    status: 'running',
  };

  const hwCoil: AhuCoil = {
    id: 'ahu01-hw-coil',
    name: 'HW COIL',
    valvePct: s.hwValvePct,
    enteringC: s.hwEnterC,
    leavingC: s.hwLeaveC,
    dutyKw: 0,
    status: s.hwValvePct > 20 ? 'running' : 'stopped',
  };

  const dampers: AhuDamper[] = [
    { id: 'ahu01-fa-damper-01', name: 'FA Damper-01', positionPct: s.oaDamperPct, status: 'running' },
    { id: 'ahu01-fa-damper-02', name: 'FA Damper-02', positionPct: s.oaDamperPct, status: 'running' },
    { id: 'ahu01-ra-damper', name: 'RA Damper', positionPct: s.raDamperPct, status: 'running' },
    { id: 'ahu01-ea-damper-01', name: 'EA Damper-01', positionPct: clamp(s.eaCfm / Math.max(s.saCfm, 1) * 100, 0, 100), status: 'running' },
    { id: 'ahu01-ea-damper-02', name: 'EA Damper-02', positionPct: clamp(s.eaCfm / Math.max(s.saCfm, 1) * 100, 0, 100), status: 'running' },
    { id: 'ahu01-ra-fire', name: 'Fire Damper-01', positionPct: 100, status: headers.fireStatus === 'NORMAL' ? 'running' : 'alarm' },
    { id: 'ahu01-sa-fire', name: 'Fire Damper-02', positionPct: 100, status: headers.fireStatus === 'NORMAL' ? 'running' : 'alarm' },
  ];

  const filters: AhuFilter[] = [
    { id: 'ahu01-sa-eu4', name: 'SA EU-4', dpPa: s.filterDpPa * 0.3, status: filterLoad > 70 ? 'DIRTY' : 'CLEAN' },
    { id: 'ahu01-sa-eu7', name: 'EU-7 Filter-02', dpPa: s.filterDpPa * 0.35, status: filterLoad > 70 ? 'DIRTY' : 'CLEAN' },
    { id: 'ahu01-sa-eu13', name: 'SA EU-13', dpPa: s.filterDpPa * 0.35, status: filterLoad > 80 ? 'alarm' : filterLoad > 60 ? 'DIRTY' : 'CLEAN' },
    { id: 'ahu01-ra-eu7', name: 'EU-7 Filter-01', dpPa: s.filterDpPa * 0.25, status: filterLoad > 70 ? 'DIRTY' : 'CLEAN' },
  ];

  const ts = new Date().toISOString();
  const alerts: PlantAlert[] = [];

  if (s.ratC > raTempSp + 1.5) {
    alerts.push({
      id: 'ahu-alert-ra-temp',
      severity: 'warning',
      message: `RA temperature high (${s.ratC}°C vs SP ${raTempSp}°C)`,
      assetId: 'ahu01-ra-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: CHW Entering Temp → ${Math.max(4, chwEnter - 0.5)}°C (now ${chwEnter}°C); SAT Setpoint → ${Math.max(10, satSp - 0.5)}°C (now ${satSp}°C)`,
      recommendedAdjustments: [
        { controlId: 'ahu-chw-enter', label: 'CHW Entering Temp', currentValue: chwEnter, suggestedValue: Math.max(4, round(chwEnter - 0.5, 1)), unit: '°C' },
        { controlId: 'ahu-sat-sp', label: 'SAT Setpoint', currentValue: satSp, suggestedValue: Math.max(10, round(satSp - 0.5, 1)), unit: '°C' },
      ],
    });
  }
  if (s.raRhPct > raRhSp + 15) {
    alerts.push({
      id: 'ahu-alert-ra-rh',
      severity: 'warning',
      message: `RA humidity high (${s.raRhPct}% vs SP ${raRhSp}%) — dehumidification demand`,
      assetId: 'ahu01-chw-coil',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: SAT Setpoint → ${Math.max(10, satSp - 1)}°C (now ${satSp}°C)`,
      recommendedAdjustments: [
        { controlId: 'ahu-sat-sp', label: 'SAT Setpoint', currentValue: satSp, suggestedValue: Math.max(10, satSp - 1), unit: '°C' },
      ],
    });
  }
  if (s.saCfm > saCfmSp * 1.2) {
    alerts.push({
      id: 'ahu-alert-sa-cfm',
      severity: 'warning',
      message: `SA airflow high (${s.saCfm} CFM vs SP ${saCfmSp} CFM)`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: Static Pressure SP → ${Math.max(400, spSp - 50)} Pa (now ${spSp} Pa)`,
      recommendedAdjustments: [
        { controlId: 'ahu-sp-sp', label: 'Static Pressure SP', currentValue: spSp, suggestedValue: Math.max(400, spSp - 50), unit: 'Pa' },
      ],
    });
  }
  if (filterLoad > 70) {
    alerts.push({
      id: 'ahu-alert-filter',
      severity: 'warning',
      message: `Filter loading high (${filterLoad}%) — airflow penalty`,
      assetId: 'ahu01-sa-eu13',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: 'Replace SA/RA filters — restore design airflow and reduce fan kW',
    });
  }

  const kpis: PlantKpi[] = [
    { id: 'ahu-kpi-ra-temp', name: 'RA TEMP', value: s.ratC, unit: '°C', category: 'comfort', status: s.ratC > raTempSp + 0.5 ? 'warning' : 'normal', target: raTempSp, trend: 'stable' },
    { id: 'ahu-kpi-ra-rh', name: 'RA RH', value: s.raRhPct, unit: '%', category: 'comfort', status: s.raRhPct > raRhSp + 5 ? 'warning' : 'normal', target: raRhSp, trend: 'stable' },
    { id: 'ahu-kpi-sa-cfm', name: 'SA VELOCITY', value: s.saCfm, unit: 'CFM', category: 'operational', status: Math.abs(s.saCfm - saCfmSp) > saCfmSp * 0.15 ? 'warning' : 'normal', target: saCfmSp, trend: 'stable' },
    { id: 'ahu-kpi-ra-cfm', name: 'RA VELOCITY', value: s.raCfm, unit: 'CFM', category: 'operational', status: Math.abs(s.raCfm - raCfmSp) > raCfmSp * 0.12 ? 'warning' : 'normal', target: raCfmSp, trend: 'stable' },
    { id: 'ahu-kpi-sat', name: 'SAT', value: s.satC, unit: '°C', category: 'comfort', status: 'normal', target: satSp, trend: 'stable' },
    { id: 'ahu-kpi-chw', name: 'CHW Valve', value: s.chwValvePct, unit: '%', category: 'operational', status: s.chwValvePct > 95 ? 'warning' : 'normal', target: 70, trend: 'stable' },
    { id: 'ahu-kpi-hw', name: 'HW Valve', value: s.hwValvePct, unit: '%', category: 'operational', status: 'normal', target: 10, trend: 'stable' },
    { id: 'ahu-kpi-fan', name: 'Fan Power', value: s.fanPowerKw, unit: 'kW', category: 'energy', status: 'normal', target: 25, trend: 'stable' },
    { id: 'ahu-kpi-cool', name: 'Cooling Duty', value: s.coolingKw, unit: 'kW', category: 'energy', status: 'normal', target: 80, trend: 'stable' },
    { id: 'ahu-kpi-sp', name: 'Static Pressure', value: s.staticPressurePa, unit: 'Pa', category: 'operational', status: 'normal', target: spSp, trend: 'stable' },
  ];

  const equipment: Record<string, AhuEquipment> = {
    'ahu01-sa-fan': { id: 'ahu01-sa-fan', name: 'SA FAN', type: 'fan', category: 'Fans', status: saFan.status },
    'ahu01-ra-fan': { id: 'ahu01-ra-fan', name: 'RA FAN', type: 'fan', category: 'Fans', status: raFan.status },
    'ahu01-chw-coil': { id: 'ahu01-chw-coil', name: 'CHW COIL', type: 'coil', category: 'Coils', status: chwCoil.status },
    'ahu01-hw-coil': { id: 'ahu01-hw-coil', name: 'HW COIL', type: 'coil', category: 'Coils', status: hwCoil.status },
    'ahu01-mixing': { id: 'ahu01-mixing', name: 'Mixing Box', type: 'section', category: 'Air Handlers', status: 'running' },
    room: { id: 'room', name: 'ROOM (1F)', type: 'zone', category: 'Zones', status: 'running' },
  };
  filters.forEach((f) => {
    equipment[f.id] = { id: f.id, name: f.name, type: 'filter', category: 'Filters', status: f.status === 'alarm' ? 'alarm' : 'running' };
  });
  dampers.forEach((d) => {
    equipment[d.id] = { id: d.id, name: d.name, type: 'damper', category: 'Dampers', status: d.status };
  });
  const sensorStatus: EquipStatus = headers.fireStatus === 'NORMAL' ? 'running' : 'alarm';
  Object.assign(equipment, {
    'ahu01-smoke-sensor': { id: 'ahu01-smoke-sensor', name: 'Smoke Sensor', type: 'sensor', category: 'Sensors', status: sensorStatus },
    'ahu01-ra-cfm': { id: 'ahu01-ra-cfm', name: 'RA CFM', type: 'sensor', category: 'Sensors', status: 'running' },
    'ahu01-sa-cfm': { id: 'ahu01-sa-cfm', name: 'SA CFM', type: 'sensor', category: 'Sensors', status: 'running' },
    'ahu01-ra-trh': { id: 'ahu01-ra-trh', name: 'T & RH', type: 'sensor', category: 'Sensors', status: 'running' },
    'ahu01-ambient-trh': { id: 'ahu01-ambient-trh', name: 'Ambient T & RH', type: 'sensor', category: 'Sensors', status: 'running' },
  });

  const recommendedActions = alerts.map((a) => a.recommendedAction).filter(Boolean) as string[];
  if (!recommendedActions.length) recommendedActions.push('AHU01 operating within setpoint bands');

  const cascadeTrace = buildAhuCascadeTrace({
    trigger: lastTrigger,
    mode: s.mode,
    oatC: s.oatC,
    oaRhPct: s.oaRhPct,
    raTempSpC: raTempSp,
    raRhSpPct: raRhSp,
    ratC: s.ratC,
    raRhPct: s.raRhPct,
    matC: s.matC,
    chwValvePct: s.chwValvePct,
    hwValvePct: s.hwValvePct,
    satC: s.satC,
    satSpC: satSp,
    saFanSpeedPct: s.saFanSpeedPct,
    raFanSpeedPct: s.raFanSpeedPct,
    saCfm: s.saCfm,
    raCfm: s.raCfm,
    saCfmSp,
    raCfmSp,
    staticPressurePa: s.staticPressurePa,
    coolingKw: s.coolingKw,
    fanPowerKw: s.fanPowerKw,
    oaFraction: s.oaFraction,
    oaDamperPct: s.oaDamperPct,
    raDamperPct: s.raDamperPct,
    filterDpPa: s.filterDpPa,
    alertCount: alerts.length,
  });

  return {
    unit: 'AHU01',
    headers,
    saFan,
    raFan,
    chwCoil,
    hwCoil,
    dampers,
    filters,
    controls: [...controls],
    kpis,
    alerts,
    equipment,
    simulation: {
      tick,
      simTimeSec: tick * SIM_DT_SEC,
      mode: 'live',
      lastTrigger,
      lastControlId: lastControlId ?? undefined,
      cascadeTrace,
      saFanCmd: saFanOn ? 'ON' : 'OFF',
      raFanCmd: raFanOn ? 'ON' : 'OFF',
    },
    recommendedActions,
    simulationTime: ts,
  };
}

export function stepAhu(): AhuState {
  return runStep();
}

export function startAhuSimulator(onTick: (state: AhuState) => void): () => void {
  onTick(runStep());
  const id = setInterval(() => onTick(runStep()), 2000);
  return () => clearInterval(id);
}

export function updateAhuControl(controlId: string, value: number): void {
  const ctrl = controls.find((c) => c.id === controlId);
  const prev = ctrl?.value;
  controls = controls.map((c) => (c.id === controlId ? { ...c, value } : c));
  lastControlId = controlId;
  lastTrigger = `Operator set ${ctrl?.label || controlId}: ${prev} → ${value}${ctrl?.unit ? ` ${ctrl.unit}` : ''}`;
}

export function advanceAhu(steps = 15): AhuState {
  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();
  lastTrigger = `Simulation output — SA ${state.headers.saCfm} CFM · RA ${state.headers.ratC}°C/${state.headers.raRhPct}%RH (${steps * SIM_DT_SEC}s virtual)`;
  return { ...state, simulation: { ...state.simulation, lastTrigger, mode: 'fast_forward' } };
}

function snapZoneLag(): void {
  const raTempSp = getControl('ahu-ra-temp-sp');
  const raRhSp = getControl('ahu-ra-rh-sp');
  const zoneLoad = getControl('ahu-zone-load');
  lagRatC = raTempSp + zoneLoad * 1.2;
  lagRaRh = raRhSp + zoneLoad * 18;
}

function applyScenarioInternal(scenario: {
  id: string;
  label: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): AhuState {
  if (scenario.reset) resetAhu();
  else if (scenario.controls) {
    for (const [id, value] of Object.entries(scenario.controls)) {
      if (controls.some((c) => c.id === id)) {
        controls = controls.map((c) => (c.id === id ? { ...c, value } : c));
      }
    }
  }
  lastControlId = `scenario:${scenario.id}`;
  snapZoneLag();
  const advanceSec = scenario.advanceSec ?? 0;
  const steps = advanceSec > 0 ? Math.max(1, Math.floor(advanceSec / SIM_DT_SEC)) : 1;
  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();
  lastTrigger = `Scenario «${scenario.label}» — SA ${state.headers.saCfm} CFM · CHW ${state.chwCoil.valvePct}%`;
  return {
    ...state,
    simulation: { ...state.simulation, mode: advanceSec > 0 ? 'fast_forward' : 'live', lastTrigger, scenarioId: scenario.id },
  };
}

export function applyAhuScenario(scenarioId: string): AhuState {
  const scenario = getAhuScenarioById(scenarioId);
  if (!scenario) return stepAhu();
  return applyScenarioInternal({
    id: scenario.id,
    label: scenario.label,
    reset: scenario.reset,
    controls: scenario.controls,
    advanceSec: scenario.advanceSec,
  });
}

export function resetAhu(): void {
  controls = defaultControls();
  tick = 0;
  lagRatC = 25.1;
  lagRaRh = 74.4;
  lastControlId = null;
  lastTrigger = 'AHU01 reset to baseline';
}

export function getAhuControls(): AhuControl[] {
  return [...controls];
}
