import type {
  DistrictCoolingControl,
  DistrictCoolingHeaders,
  DistrictCoolingState,
  DistrictCoolingEquipment,
  ScenarioComparisonRow,
} from '../types/districtCooling';
import type { PlantAlert, PlantKpi } from '../types/plant';

const SIM_DT_SEC = 2;

let controls: DistrictCoolingControl[] = defaultControls();
let tick = 0;
let lastTrigger = 'District cooling plant initialized';
let lagChws = 7.0;
let lagDp = 210;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function getControl(id: string): number {
  return controls.find((c) => c.id === id)?.value ?? 0;
}

function defaultControls(): DistrictCoolingControl[] {
  return [
    { id: 'ctrl-dc-chws-sp', controlType: 'chwsSetpoint', label: 'CHWS Setpoint', value: 7.0, min: 5, max: 10, step: 0.5, unit: '°C', group: 'setpoints' },
    { id: 'ctrl-dc-dp-sp', controlType: 'dpSetpoint', label: 'Secondary DP Setpoint', value: 200, min: 150, max: 280, step: 5, unit: 'kPa', group: 'setpoints' },
    { id: 'ctrl-dc-pump-min', controlType: 'pumpSpeedMin', label: 'Pump Speed Min', value: 30, min: 20, max: 60, step: 5, unit: '%', group: 'pumps' },
    { id: 'ctrl-dc-pump-max', controlType: 'pumpSpeedMax', label: 'Pump Speed Max', value: 100, min: 70, max: 100, step: 5, unit: '%', group: 'pumps' },
    { id: 'ctrl-dc-bypass', controlType: 'bypassLimit', label: 'Bypass Valve Limit', value: 5, min: 0, max: 20, step: 1, unit: '%', group: 'valves' },
    { id: 'ctrl-dc-contract', controlType: 'contractDemand', label: 'Contract Demand Limit', value: 900, min: 500, max: 1200, step: 50, unit: 'RT', group: 'contract' },
    { id: 'ctrl-dc-load', controlType: 'buildingLoad', label: 'Building Cooling Load', value: 845, min: 300, max: 1100, step: 25, unit: 'RT', group: 'load' },
    { id: 'ctrl-dc-occupied', controlType: 'occupancy', label: 'Occupied Mode', value: 1, min: 0, max: 1, step: 1, unit: '', group: 'comfort' },
    { id: 'ctrl-dc-rh-limit', controlType: 'rhLimit', label: 'RH Limit', value: 60, min: 45, max: 70, step: 5, unit: '%', group: 'comfort' },
    { id: 'ctrl-dc-ambient', controlType: 'ambientTemperature', label: 'Outdoor Temperature', value: 32.1, min: 24, max: 40, step: 0.5, unit: '°C', group: 'weather' },
    { id: 'ctrl-dc-humidity', controlType: 'humidity', label: 'Outdoor Humidity', value: 70, min: 40, max: 95, step: 5, unit: '%RH', group: 'weather' },
    { id: 'ctrl-dc-primary-valve', controlType: 'primaryValve', label: 'Primary Control Valve', value: 72, min: 0, max: 100, step: 5, unit: '%', group: 'valves' },
  ];
}

function defaultEquipment(): Record<string, DistrictCoolingEquipment> {
  return {
    'dcs-plant': { id: 'dcs-plant', name: 'District Chiller Plant', type: 'plant', status: 'running', category: 'Central Plant' },
    'hx-orq': { id: 'hx-orq', name: 'HX — ORQ', type: 'heat_exchanger', status: 'running', category: 'Energy Transfer Station' },
    'hx-mbfc': { id: 'hx-mbfc', name: 'HX — MBFC', type: 'heat_exchanger', status: 'running', category: 'Energy Transfer Station' },
    'hx-mbs': { id: 'hx-mbs', name: 'HX — MBS', type: 'heat_exchanger', status: 'running', category: 'Energy Transfer Station' },
    'dcv-orq': { id: 'dcv-orq', name: 'Primary Valve ORQ', type: 'valve', status: 'running', category: 'District Interface' },
    'dcv-mbfc': { id: 'dcv-mbfc', name: 'Primary Valve MBFC', type: 'valve', status: 'running', category: 'District Interface' },
    'dcv-mbs': { id: 'dcv-mbs', name: 'Primary Valve MBS', type: 'valve', status: 'running', category: 'District Interface' },
    'ahu-orq': { id: 'ahu-orq', name: 'AHU Bank ORQ', type: 'ahu', status: 'running', category: 'Building Loads' },
    'ahu-mbfc': { id: 'ahu-mbfc', name: 'AHU Bank MBFC', type: 'ahu', status: 'running', category: 'Building Loads' },
    'ahu-mbs': { id: 'ahu-mbs', name: 'AHU Bank MBS', type: 'ahu', status: 'running', category: 'Building Loads' },
    'chwp-dc-1': { id: 'chwp-dc-1', name: 'Header CHWP', type: 'pump', status: 'running', category: 'Secondary Pumps' },
  };
}

function buildBuildingBranches(
  coolingDemandRt: number,
  lagChws: number,
  chwr: number,
  hxApproach: number,
  primaryValve: number
) {
  const splits = [
    { id: 'orq', name: 'ORQ', share: 0.32 },
    { id: 'mbfc', name: 'MBFC', share: 0.35 },
    { id: 'mbs', name: 'MBS', share: 0.33 },
  ];
  return splits.map((b, i) => {
    const loadRt = round(coolingDemandRt * b.share, 0);
    const approach = round(hxApproach + (i - 1) * 0.15, 1);
    return {
      id: b.id,
      name: b.name,
      loadRt,
      chws: round(lagChws + (i - 1) * 0.1, 1),
      chwr: round(chwr + (i - 1) * 0.15, 1),
      hxApproach: approach,
      valvePct: round(primaryValve + (i - 1) * 4, 0),
      status: loadRt > 0 ? 'running' as const : 'stopped' as const,
    };
  });
}

function dewPointC(tempC: number, rhPct: number): number {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(rhPct / 100);
  return (b * alpha) / (a - alpha);
}

function runStep(): DistrictCoolingState {
  tick += 1;

  const chwsSp = getControl('ctrl-dc-chws-sp');
  const dpSp = getControl('ctrl-dc-dp-sp');
  const pumpMin = getControl('ctrl-dc-pump-min');
  const pumpMax = getControl('ctrl-dc-pump-max');
  const bypassLimit = getControl('ctrl-dc-bypass');
  const contractRt = getControl('ctrl-dc-contract');
  const baseLoadRt = getControl('ctrl-dc-load');
  const occupied = getControl('ctrl-dc-occupied') >= 1;
  const rhLimit = getControl('ctrl-dc-rh-limit');
  const ambient = getControl('ctrl-dc-ambient');
  const humidity = getControl('ctrl-dc-humidity');
  const primaryValve = getControl('ctrl-dc-primary-valve');

  const weatherFactor = 1 + (ambient - 30) * 0.02;
  const occFactor = occupied ? 1 : 0.55;
  const coolingDemandRt = clamp(baseLoadRt * weatherFactor * occFactor, 200, contractRt * 1.05);
  const dcsTemp = 5.5;
  const primaryDeltaT = clamp(6.5 + (coolingDemandRt / contractRt) * 1.5, 5.5, 8.5);
  const dcrTemp = dcsTemp + primaryDeltaT;

  lagChws = lagChws + (chwsSp - lagChws) * 0.15;
  const secondaryDeltaT = clamp(4.2 + (coolingDemandRt / 900) * 1.2 - bypassLimit * 0.05, 3.5, 6.5);
  const chwr = lagChws + secondaryDeltaT;
  const hxApproach = clamp(lagChws - dcsTemp, 1.2, 3.5);

  const dpTarget = dpSp + (coolingDemandRt / contractRt) * 15;
  lagDp = lagDp + (dpTarget - lagDp) * 0.2;
  const pumpSpeed = clamp(pumpMin + ((lagDp - 150) / 130) * (pumpMax - pumpMin), pumpMin, pumpMax);
  const pumpPowerKw = round(180 + (pumpSpeed / 100) * 220 + (coolingDemandRt / 900) * 80, 0);
  const kwPerRt = coolingDemandRt > 0 ? round(pumpPowerKw / coolingDemandRt, 2) : 0;

  const roomTempC = round(23.2 + (coolingDemandRt / contractRt) * 1.4 + (occupied ? 0.4 : -0.8), 1);
  const roomRh = clamp(round(humidity * 0.68 + (100 - pumpSpeed) * 0.05, 0), 35, rhLimit + 5);
  const co2Ppm = occupied ? round(720 + (coolingDemandRt / 10), 0) : 520;
  const dewPt = round(dewPointC(roomTempC, roomRh), 1);
  const surfaceTempC = round(lagChws + 13.1, 1);
  const condensationRisk = surfaceTempC - dewPt < 2;

  const headers: DistrictCoolingHeaders = {
    dcsTemp,
    dcrTemp: round(dcrTemp, 1),
    chws: round(lagChws, 1),
    chwr: round(chwr, 1),
    buildingLoadRt: round(baseLoadRt, 0),
    contractDemandRt: contractRt,
    coolingDemandRt: round(coolingDemandRt, 0),
    primaryDeltaT: round(primaryDeltaT, 1),
    secondaryDeltaT: round(secondaryDeltaT, 1),
    hxApproach: round(hxApproach, 1),
    pumpSpeedPct: round(pumpSpeed, 0),
    secondaryDpKpa: round(lagDp, 0),
    pumpPowerKw,
    kwPerRt,
    roomTempC,
    rhPct: roomRh,
    co2Ppm,
    dewPointC: dewPt,
    surfaceTempC,
    ambientTempC: ambient,
    ambientRhPct: humidity,
    occupancy: occupied ? 'occupied' : 'unoccupied',
    chwsSetpoint: chwsSp,
  };

  const buildings = buildBuildingBranches(coolingDemandRt, lagChws, chwr, hxApproach, primaryValve);

  const alerts: PlantAlert[] = [];
  if (coolingDemandRt > contractRt * 0.95) {
    alerts.push({
      id: 'dc-alert-contract',
      severity: 'warning',
      message: `Cooling demand ${round(coolingDemandRt, 0)} RT approaching contract limit ${contractRt} RT`,
      assetId: 'dcv-orq',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
      recommendedAction: 'Reduce load scenario or raise CHWS setpoint within comfort limits',
    });
  }
  if (condensationRisk) {
    alerts.push({
      id: 'dc-alert-condensation',
      severity: 'critical',
      message: 'Condensation risk — surface temperature near dew point',
      assetId: 'ahu-mbfc',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
      recommendedAction: 'Increase CHWS or reduce RH limit margin',
    });
  }
  if (hxApproach > 2.8) {
    alerts.push({
      id: 'dc-alert-hx',
      severity: 'warning',
      message: `HX approach temperature elevated (${hxApproach}°C)`,
      assetId: 'hx-mbs',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
      recommendedAction: 'Check primary valve position and district supply temperature',
    });
  }

  const kpis: PlantKpi[] = [
    { id: 'dc-kpi-demand', name: 'Cooling Demand', value: headers.coolingDemandRt, unit: 'RT', category: 'operational', status: coolingDemandRt > contractRt * 0.9 ? 'warning' : 'normal', target: contractRt, trend: 'stable' },
    { id: 'dc-kpi-contract', name: 'Contract Utilization', value: round((coolingDemandRt / contractRt) * 100, 0), unit: '%', category: 'operational', status: 'normal', target: 90, trend: 'stable' },
    { id: 'dc-kpi-pump', name: 'Pump Power', value: pumpPowerKw, unit: 'kW', category: 'energy', status: 'normal', target: 350, trend: 'stable' },
    { id: 'dc-kpi-kwrt', name: 'System Efficiency', value: kwPerRt, unit: 'kW/RT', category: 'energy', status: kwPerRt > 0.35 ? 'warning' : 'normal', target: 0.32, trend: 'stable' },
    { id: 'dc-kpi-hx', name: 'HX Approach', value: hxApproach, unit: '°C', category: 'operational', status: hxApproach > 2.5 ? 'warning' : 'normal', target: 2.1, trend: 'stable' },
    { id: 'dc-kpi-chws', name: 'CHWS / CHWR', value: `${headers.chws}/${headers.chwr}`, unit: '°C', category: 'comfort', status: 'normal', target: '7/12', trend: 'stable' },
    { id: 'dc-kpi-dp', name: 'Secondary DP', value: headers.secondaryDpKpa, unit: 'kPa', category: 'operational', status: 'normal', target: dpSp, trend: 'stable' },
    { id: 'dc-kpi-co2', name: 'Zone CO₂', value: co2Ppm, unit: 'ppm', category: 'iaq', status: co2Ppm > 1000 ? 'warning' : 'normal', target: 1000, trend: 'stable' },
    { id: 'dc-kpi-room', name: 'Room Temperature', value: roomTempC, unit: '°C', category: 'comfort', status: roomTempC > 25 ? 'warning' : 'normal', target: 24, trend: 'stable' },
    { id: 'dc-kpi-rh', name: 'Room RH', value: roomRh, unit: '%', category: 'comfort', status: roomRh > rhLimit ? 'warning' : 'normal', target: rhLimit, trend: 'stable' },
  ];

  const optimizedKwRt = round(kwPerRt * 0.92, 2);
  const scenarioComparison: ScenarioComparisonRow[] = [
    { metric: 'Cooling Demand', baseline: `${headers.coolingDemandRt} RT`, optimized: `${round(coolingDemandRt * 0.97, 0)} RT`, delta: '-3%', improved: true },
    { metric: 'System kW/RT', baseline: `${kwPerRt}`, optimized: `${optimizedKwRt}`, delta: '-8%', improved: true },
    { metric: 'Pump Power', baseline: `${pumpPowerKw} kW`, optimized: `${round(pumpPowerKw * 0.9, 0)} kW`, delta: '-10%', improved: true },
    { metric: 'IAQ (CO₂)', baseline: `${co2Ppm} ppm`, optimized: `${round(co2Ppm * 0.95, 0)} ppm`, delta: '-5%', improved: true },
    { metric: 'Condensation Risk', baseline: condensationRisk ? 'Medium' : 'Low', optimized: 'Low', delta: 'Improved', improved: true },
  ];

  const recommendedActions: string[] = [];
  if (chwsSp < 7.5 && kwPerRt > 0.32) {
    recommendedActions.push(`Increase CHWS setpoint to ${round(chwsSp + 0.5, 1)}°C to reduce pump and primary demand`);
  }
  if (bypassLimit > 2) {
    recommendedActions.push('Close bypass valve limit to restore secondary delta-T');
  }
  if (coolingDemandRt > contractRt * 0.9) {
    recommendedActions.push('Enable demand limiting or switch to unoccupied load scenario');
  }
  if (!recommendedActions.length) {
    recommendedActions.push('Plant operating within contractual and comfort constraints');
  }

  const equipment = defaultEquipment();
  buildings.forEach((b) => {
    const hxId = `hx-${b.id}`;
    const ahuId = `ahu-${b.id}`;
    const dcvId = `dcv-${b.id}`;
    if (equipment[hxId]) equipment[hxId].status = b.hxApproach > 2.8 ? 'alarm' : 'running';
    if (equipment[ahuId]) equipment[ahuId].status = b.loadRt > 0 ? 'running' : 'stopped';
    if (equipment[dcvId]) equipment[dcvId].status = b.valvePct > 5 ? 'running' : 'stopped';
  });

  return {
    headers,
    buildings,
    controls: [...controls],
    kpis,
    alerts,
    equipment,
    simulationTime: new Date().toISOString(),
    simulation: {
      tick,
      simTimeSec: tick * SIM_DT_SEC,
      mode: 'live',
      lastTrigger,
    },
    scenarioComparison,
    recommendedActions,
  };
}

export function stepDistrictCooling(): DistrictCoolingState {
  return runStep();
}

export function startDistrictCoolingSimulator(onTick: (state: DistrictCoolingState) => void): () => void {
  onTick(runStep());
  const id = setInterval(() => onTick(runStep()), 2000);
  return () => clearInterval(id);
}

export function updateDistrictControl(controlId: string, value: number): void {
  const ctrl = controls.find((c) => c.id === controlId);
  const prev = ctrl?.value;
  controls = controls.map((c) => (c.id === controlId ? { ...c, value } : c));
  lastTrigger = `Operator set ${ctrl?.label || controlId}: ${prev} → ${value}${ctrl?.unit ? ` ${ctrl.unit}` : ''}`;
}

export function advanceDistrictCooling(steps = 15): DistrictCoolingState {
  lastTrigger = `Simulation run — ${steps} steps (${steps * SIM_DT_SEC}s virtual time)`;
  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();
  return state;
}

export function resetDistrictCooling(): void {
  controls = defaultControls();
  tick = 0;
  lagChws = 7.0;
  lagDp = 210;
  lastTrigger = 'District cooling plant reset to baseline';
}

export function getDistrictControls(): DistrictCoolingControl[] {
  return [...controls];
}
