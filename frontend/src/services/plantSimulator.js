/**
 * Client-side chiller plant telemetry simulator (2s interval).
 * Feeds plant state into useTwinStore without replacing backend twin API.
 */

const EQUIPMENT_DEFS = [
  { id: 'ct-41-1', name: 'CT-41-1', category: 'cooling_tower', type: 'cooling_tower' },
  { id: 'ct-41-2', name: 'CT-41-2', category: 'cooling_tower', type: 'cooling_tower' },
  { id: 'ct-41-3', name: 'CT-41-3', category: 'cooling_tower', type: 'cooling_tower' },
  { id: 'cwmutnk-41-1', name: 'CWMUTnk-41-1', category: 'makeup', type: 'makeup_tank' },
  { id: 'cwmup-1', name: 'CWMUP-1', category: 'makeup', type: 'makeup_pump' },
  { id: 'cwmup-2', name: 'CWMUP-2', category: 'makeup', type: 'makeup_pump' },
  { id: 'ch-29-1', name: 'CH-29-1', category: 'chiller', type: 'chiller' },
  { id: 'ch-29-2', name: 'CH-29-2', category: 'chiller', type: 'chiller' },
  { id: 'ch-29-3', name: 'CH-29-3', category: 'chiller', type: 'chiller' },
  { id: 'cwp-29-1', name: 'CWP-29-1', category: 'cwp', type: 'pump', loop: 'condenser' },
  { id: 'cwp-29-2', name: 'CWP-29-2', category: 'cwp', type: 'pump', loop: 'condenser' },
  { id: 'cwp-29-3', name: 'CWP-29-3', category: 'cwp', type: 'pump', loop: 'condenser' },
  { id: 'cwp-29-4', name: 'CWP-29-4', category: 'cwp', type: 'pump', loop: 'condenser' },
  { id: 'chwp-29-1', name: 'CHWP-29-1', category: 'chwp', type: 'pump', loop: 'chilled' },
  { id: 'chwp-29-2', name: 'CHWP-29-2', category: 'chwp', type: 'pump', loop: 'chilled' },
  { id: 'chwp-29-3', name: 'CHWP-29-3', category: 'chwp', type: 'pump', loop: 'chilled' },
  { id: 'chwp-29-4', name: 'CHWP-29-4', category: 'chwp', type: 'pump', loop: 'chilled' },
  { id: 'exptnk-01', name: 'ExpTnk-01', category: 'expansion', type: 'expansion_tank' },
  { id: 'exptnk-02', name: 'ExpTnk-02', category: 'expansion', type: 'expansion_tank' },
  { id: 'bv-1', name: 'Bypass Valve 1', category: 'valve', type: 'valve' },
  { id: 'bv-2', name: 'Bypass Valve 2', category: 'valve', type: 'valve' },
];

function rnd(base, spread, min, max) {
  let v = base + (Math.random() - 0.5) * spread;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return Math.round(v * 100) / 100;
}

function defaultControls() {
  return [
    { id: 'ctrl-chws-sp', controlType: 'chwsSetpoint', label: 'CHWS Temperature Setpoint', value: 7, min: 5, max: 10, step: 0.5, unit: '°C' },
    { id: 'ctrl-cws-sp', controlType: 'cwsSetpoint', label: 'Condenser Water Setpoint', value: 29, min: 25, max: 35, step: 0.5, unit: '°C' },
    { id: 'ctrl-dp-sp', controlType: 'differentialPressureSetpoint', label: 'Differential Pressure Setpoint', value: 18, min: 10, max: 30, step: 1, unit: 'psi' },
    { id: 'ctrl-ct-fan', controlType: 'coolingTowerFanOverride', label: 'Cooling Tower Fan Override', value: 0, min: 0, max: 100, step: 5, unit: '%' },
    { id: 'ctrl-pump-spd', controlType: 'pumpSpeedOverride', label: 'Pump Speed Override', value: 0, min: 0, max: 100, step: 5, unit: '%' },
    { id: 'ctrl-ch-enable', controlType: 'chillerEnable', label: 'Chiller Enable', value: 1, min: 0, max: 1, step: 1, unit: '' },
    { id: 'ctrl-opt-mode', controlType: 'optimizationMode', label: 'Optimization Mode', value: 1, min: 0, max: 1, step: 1, unit: '' },
  ];
}

let controlState = defaultControls();
let ch3Fault = false;

export function updatePlantControl(controlId, value) {
  controlState = controlState.map((c) => (c.id === controlId ? { ...c, value } : c));
}

export function resetPlantControls() {
  controlState = defaultControls();
  ch3Fault = false;
}

export function triggerPlantFault(faultType) {
  if (faultType === 'chiller_fault') ch3Fault = true;
  if (faultType === 'pump_trip') controlState.find((c) => c.id === 'ctrl-pump-spd').value = 0;
}

function buildEquipment() {
  const equipment = {};
  const chws = controlState.find((c) => c.id === 'ctrl-chws-sp')?.value ?? 7;
  const optOn = controlState.find((c) => c.id === 'ctrl-opt-mode')?.value === 1;

  EQUIPMENT_DEFS.forEach((def, idx) => {
    const runDefault = idx % 4 !== 3;
    let status = runDefault ? 'running' : 'stopped';
    if (def.id === 'ch-29-3' && ch3Fault) status = 'alarm';
    if (def.id === 'chwp-29-4') status = 'stopped';

    const base = {
      id: def.id,
      name: def.name,
      category: def.category,
      status,
      powerKw: 0,
      flowRate: 0,
      runtimeHours: 8000 + idx * 120,
    };

    if (def.type === 'chiller') {
      const run = status === 'running';
      equipment[def.id] = {
        ...base,
        type: 'chiller',
        loadPercent: run ? rnd(68, 12, 20, 100) : 0,
        cop: run ? rnd(5.4, 0.3, 3.5, 6.5) : 0,
        supplyTemp: chws,
        returnTemp: rnd(chws + 5.5, 0.8, chws + 3, chws + 8),
        powerKw: run ? rnd(550, 40, 200, 650) : 0,
        flowRate: run ? rnd(600, 50, 200, 750) : 0,
        temperature: chws,
      };
    } else if (def.type === 'cooling_tower') {
      const run = status === 'running';
      const fan = run ? rnd(98, 8, 30, 100) : 0;
      equipment[def.id] = {
        ...base,
        type: 'cooling_tower',
        fanSpeedPercent: fan,
        frequencyHz: rnd(fan * 0.5, 3, 0, 55),
        leavingTemp: rnd(29, 1.5, 25, 35),
        powerKw: run ? rnd(12, 2, 2, 20) : 0,
        flowRate: run ? rnd(500, 40, 100, 700) : 0,
      };
    } else if (def.type === 'pump') {
      const run = status === 'running';
      const spd = run ? rnd(71, 10, 25, 100) : 0;
      equipment[def.id] = {
        ...base,
        type: 'pump',
        loop: def.loop,
        speedPercent: spd,
        frequencyHz: rnd(35, 4, 0, 50),
        powerKw: run ? rnd(45, 8, 5, 60) : 0,
        flowRate: run ? rnd(420, 40, 50, 600) : 0,
      };
    } else if (def.type === 'valve') {
      equipment[def.id] = {
        ...base,
        type: 'valve',
        positionPercent: rnd(35 + idx, 8, 0, 100),
        status: 'running',
      };
    } else if (def.type === 'expansion_tank') {
      equipment[def.id] = {
        ...base,
        type: 'expansion_tank',
        levelPercent: rnd(62, 4, 40, 90),
        status: 'running',
      };
    } else if (def.type === 'makeup_tank') {
      const lvl = rnd(72, 5, 15, 95);
      equipment[def.id] = {
        ...base,
        type: 'makeup_tank',
        levelPercent: lvl,
        highLevel: lvl > 90,
        lowLevel: lvl < 20,
        volumeGal: rnd(1250, 30, 1000, 1500),
        status: 'running',
      };
    } else if (def.type === 'makeup_pump') {
      const run = def.id === 'cwmup-1';
      equipment[def.id] = {
        ...base,
        type: 'makeup_pump',
        speedPercent: run ? rnd(55, 10, 20, 100) : 0,
        runStatus: run,
        powerKw: run ? rnd(3.5, 0.8, 1, 6) : 0,
        flowRate: run ? rnd(18, 4, 0, 35) : 0,
        status: run ? 'running' : 'stopped',
      };
    }
  });

  return equipment;
}

function buildKpis(equipment, headers) {
  const chillers = Object.values(equipment).filter((e) => e.type === 'chiller');
  const runningCh = chillers.filter((e) => e.status === 'running').length;
  const pumps = Object.values(equipment).filter((e) => e.type === 'pump' || e.type === 'makeup_pump');
  const runningPumps = pumps.filter((e) => e.status === 'running').length;
  const totalKw = Object.values(equipment).reduce((s, e) => s + (e.powerKw || 0), 0);
  const totalRt = headers.buildingLoadRt;
  const avgCop =
    runningCh > 0
      ? chillers.filter((e) => e.status === 'running').reduce((s, e) => s + e.cop, 0) / runningCh
      : 0;

  const card = (id, name, value, unit, category, target, trend = 'stable') => ({
    id,
    name,
    value,
    unit,
    category,
    status: 'normal',
    target,
    trend,
  });

  return [
    card('kpi-load', 'Total Plant Load', totalRt, 'RT', 'operational', 250),
    card('kpi-kw', 'Total Plant kW', Math.round(totalKw), 'kW', 'energy', 400),
    card('kpi-cop', 'Plant COP', avgCop.toFixed(2), '', 'energy', 5.5),
    card('kpi-eff', 'Plant Efficiency', (totalKw / Math.max(totalRt, 1)).toFixed(3), 'kW/RT', 'energy', 1.5),
    card('kpi-rch', 'Running Chillers', runningCh, '', 'operational', 3),
    card('kpi-rpump', 'Running Pumps', runningPumps, '', 'operational', 8),
    card('kpi-chws', 'Average CHWS', headers.chws, '°C', 'comfort', 7),
    card('kpi-chwr', 'Average CHWR', headers.chwr, '°C', 'comfort', 12),
    card('kpi-cws', 'Average CWS', headers.cws, '°C', 'comfort', 29),
    card('kpi-cwr', 'Average CWR', headers.cwr, '°C', 'comfort', 32),
    card('kpi-water', 'Water Consumption', rnd(12, 3, 5, 25), 'm³/h', 'cost', 15),
    card('kpi-ct-util', 'Cooling Tower Utilization', rnd(78, 8, 50, 100), '%', 'operational', 85),
  ];
}

function buildAlerts(equipment) {
  const alerts = [];
  const chws = controlState.find((c) => c.id === 'ctrl-chws-sp')?.value ?? 7;
  if (chws > 9) {
    alerts.push({
      id: 'alm-chws-high',
      severity: 'warning',
      message: 'High CHWS Temperature',
      assetId: 'ch-29-1',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
      recommendedAction: 'Check chiller load and CHWP speed',
    });
  }
  if (ch3Fault) {
    alerts.push({
      id: 'alm-ch-fault',
      severity: 'critical',
      message: 'Chiller Fault — CH-29-3',
      assetId: 'ch-29-3',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
      recommendedAction: 'Inspect compressor and refrigerant circuit',
    });
  }
  const tank = equipment['cwmutnk-41-1'];
  if (tank?.lowLevel) {
    alerts.push({
      id: 'alm-makeup-low',
      severity: 'critical',
      message: 'Low Tank Level — CWMUTnk-41-1',
      assetId: 'cwmutnk-41-1',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
    });
  }
  if (equipment['ct-41-3']?.status === 'alarm') {
    alerts.push({
      id: 'alm-ct-fan',
      severity: 'warning',
      message: 'Cooling Tower Fan Failure — CT-41-3',
      assetId: 'ct-41-3',
      resolved: false,
      acknowledged: false,
      timestamp: new Date().toISOString(),
    });
  }
  alerts.push({
    id: 'alm-low-dt',
    severity: 'info',
    message: 'Low Delta T — investigate bypass',
    assetId: 'bv-1',
    resolved: false,
    acknowledged: true,
    timestamp: new Date().toISOString(),
  });
  return alerts;
}

export function stepPlantSimulation() {
  const equipment = buildEquipment();
  const chws = controlState.find((c) => c.id === 'ctrl-chws-sp')?.value ?? 7;
  const headers = {
    chws,
    chwr: rnd(chws + 5.2, 0.5, chws + 3, chws + 8),
    cws: controlState.find((c) => c.id === 'ctrl-cws-sp')?.value ?? 29,
    cwr: rnd(32, 1, 28, 36),
    buildingLoadRt: rnd(248, 25, 150, 320),
  };

  return {
    equipment,
    headers,
    kpis: buildKpis(equipment, headers),
    controls: controlState.map((c) => ({ ...c })),
    alerts: buildAlerts(equipment),
    simulationTime: new Date().toISOString(),
  };
}

export function startPlantSimulator(onTick) {
  onTick(stepPlantSimulation());
  const id = setInterval(() => onTick(stepPlantSimulation()), 2000);
  return () => clearInterval(id);
}

export { EQUIPMENT_DEFS };
