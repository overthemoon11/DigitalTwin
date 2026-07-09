import type {
  PlantAlert,
  PlantControl,
  PlantEquipment,
  PlantHeaders,
  PlantKpi,
  PlantState,
} from '../types/plant';
import { evaluateAlarms, mergeAcknowledged } from './alarmEngine';
import {
  REF_CHILLER_COP,
  REF_CHILLER_KW,
  REF_CHILLER_LOAD,
  REF_CHWP_FLOW,
  REF_CHWP_KW,
  REF_CHWP_SPEED,
  REF_AMBIENT_TEMP,
  REF_CHWR_SP,
  REF_CWR_SP,
  REF_CT_FAN,
  REF_HUMIDITY_RH,
  REF_CWP_KW,
  REF_CWP_FLOW,
  REF_CT_KW,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  CT_COUNT,
  chwsSetpointModifiers,
  condenserCopBonus,
  coolingKwFromFlow,
  humidityLoadFactor,
  kwToRt,
  lag,
  plantCop,
  plantEfficiencyKwPerRt,
  pumpFlowFromSpeed,
  pumpPowerFromSpeed,
  round,
  rtToKw,
  speedToHz,
  clamp,
  weatherCondenserOffset,
  weatherLoadFactor,
  estimateWetBulbC,
} from './plantPhysics';
import { buildCascadeTrace, buildChillerCascadeRows, type CascadeContext } from './plantCascade';
import { CHILLER_CONTROL_CONSTRAINTS } from './chillerConstraints';
import {
  balanceChillerLoad,
  chillerLoadPercent,
  chwpSpeedFromDpSetpoint,
  ctFanAdjust,
  stageChillers,
  stageChwp,
  stageCwp,
  stageCoolingTowers,
} from './stagingController';
import { getChillerScenarioById } from './chillerScenarios.js';

const SIM_DT_SEC = 2;
/** Design ΔT used only for required flow / pump staging (hydronic design).
 *  Calibrated to the T1 trend (loop ΔT ≈ 6.85°C). */
const DESIGN_DELTA_T_FLOW = 6.5;

/**
 * Static (steady-state) model. When true, every state variable jumps straight to
 * its equilibrium each step instead of lagging toward it over time — so a change
 * to any input immediately yields the new steady-state operating point (no
 * transients). Set to false to restore the first-order dynamic response.
 */
const STATIC_MODE = true;

export interface SimInternals {
  tick: number;
  chwsActual: number;
  cwsActual: number;
  cwrActual: number;
  ctFanSpeed: number;
  tankLevel: number;
  bypassPercent: number;
  makeupPumpActive: boolean;
  faults: {
    chillerTripId: string | null;
    pumpTripId: string | null;
    makeupPumpFail: boolean;
    ctFanFaultId: string | null;
  };
  acknowledgedAlerts: Set<string>;
}

function defaultControls(): PlantControl[] {
  return [
    {
      id: 'ctrl-building-load',
      controlType: 'buildingLoad',
      label: 'Building Cooling Load',
      value: 3200,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-building-load'],
      unit: 'RT',
      group: 'load',
    },
    {
      id: 'ctrl-ambient-temp',
      controlType: 'ambientTemperature',
      label: 'Outdoor Temperature',
      value: REF_AMBIENT_TEMP,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-ambient-temp'],
      unit: '°C',
      group: 'weather',
    },
    {
      id: 'ctrl-humidity',
      controlType: 'humiditySetpoint',
      label: 'Outdoor Humidity',
      value: REF_HUMIDITY_RH,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-humidity'],
      unit: '%RH',
      group: 'weather',
    },
    {
      id: 'ctrl-chws-sp',
      controlType: 'chwsSetpoint',
      label: 'Chilled Water Supply Temp',
      value: 7.5,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-chws-sp'],
      unit: '°C',
      group: 'chilled',
    },
    {
      id: 'ctrl-chwr-sp',
      controlType: 'chwrSetpoint',
      label: 'Chilled Water Return Temp',
      value: REF_CHWR_SP,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-chwr-sp'],
      unit: '°C',
      group: 'chilled',
    },
    {
      id: 'ctrl-cws-sp',
      controlType: 'cwsSetpoint',
      label: 'Condenser Water Supply Temp',
      value: 29,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-cws-sp'],
      unit: '°C',
      group: 'condenser',
    },
    {
      id: 'ctrl-cwr-sp',
      controlType: 'cwrSetpoint',
      label: 'Condenser Water Return Temp',
      value: REF_CWR_SP,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-cwr-sp'],
      unit: '°C',
      group: 'condenser',
    },
    {
      id: 'ctrl-cw-dt-sp',
      controlType: 'cwDeltaTSetpoint',
      label: 'CW Differential Temp Setpoint',
      value: 4.5,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-cw-dt-sp'],
      unit: '°C',
      group: 'condenser',
    },
    {
      id: 'ctrl-dp-sp',
      controlType: 'differentialPressureSetpoint',
      label: 'Med Rise DP Setpoint',
      value: 15,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-dp-sp'],
      unit: 'psi',
      group: 'pumps',
    },
    {
      id: 'ctrl-dp-sp-high',
      controlType: 'highRiseDpSetpoint',
      label: 'High Rise DP Setpoint',
      value: 12,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-dp-sp-high'],
      unit: 'psi',
      group: 'pumps',
    },
    {
      id: 'ctrl-ct-fan',
      controlType: 'coolingTowerFanOverride',
      label: 'Cooling Tower Fan Override',
      value: 0,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-ct-fan'],
      unit: '%',
      group: 'overrides',
    },
    {
      id: 'ctrl-pump-spd',
      controlType: 'pumpSpeedOverride',
      label: 'CHWP VSD Command',
      value: 0,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-pump-spd'],
      unit: '%',
      group: 'overrides',
    },
    {
      id: 'ctrl-cwp-spd',
      controlType: 'cwpSpeedOverride',
      label: 'CWP VSD Command',
      value: 0,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-cwp-spd'],
      unit: '%',
      group: 'overrides',
    },
    {
      id: 'ctrl-ch-enable',
      controlType: 'chillerEnable',
      label: 'Chiller Enable',
      value: 1,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-ch-enable'],
      unit: '',
      group: 'plant',
    },
    {
      id: 'ctrl-opt-mode',
      controlType: 'optimizationMode',
      label: 'Optimization Mode',
      value: 1,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-opt-mode'],
      unit: '',
      group: 'plant',
    },
  ];
}

function constrainControlValue(control: PlantControl, rawValue: number): number {
  const fallback = typeof control.value === 'number' ? control.value : control.min;
  const numeric = Number.isFinite(rawValue) ? rawValue : fallback;
  const bounded = clamp(numeric, control.min, control.max);
  const step = control.step && control.step > 0 ? control.step : 1;
  const snapped = Math.round((bounded - control.min) / step) * step + control.min;
  return round(clamp(snapped, control.min, control.max), 3);
}

let controls: PlantControl[] = defaultControls();
let lastCascadeTrigger = 'Virtual plant at steady state (physics initialised)';
let lastControlId: string | null = null;
// Domino-effect before→after support: the most recent tick's context (used as the
// "before" snapshot the moment an Apply commits) plus the operator edits applied.
let lastCascadeCtx: CascadeContext | null = null;
let lastBeforeCtx: CascadeContext | null = null;
let lastChanges:
  | Array<{ label: string; oldValue: number | string; newValue: number | string; unit?: string }>
  | null = null;
// KPI snapshot support for the "before → after" performance cards. lastKpiSnapshot
// is the most recent tick's KPIs; lastBeforeKpis is the pre-Apply snapshot that
// persists (like the domino cascade) until the next single edit / scenario / reset.
let lastKpiSnapshot: PlantKpi[] | null = null;
let lastBeforeKpis: PlantKpi[] | null = null;

let internals: SimInternals = {
  tick: 0,
  chwsActual: 7.5,
  cwsActual: 29,
  cwrActual: 33,
  ctFanSpeed: REF_CT_FAN,
  tankLevel: 68,
  bypassPercent: 0,
  makeupPumpActive: false,
  faults: {
    chillerTripId: null,
    pumpTripId: null,
    makeupPumpFail: false,
    ctFanFaultId: null,
  },
  acknowledgedAlerts: new Set(),
};

function getControl(id: string): number {
  const c = controls.find((x) => x.id === id);
  return typeof c?.value === 'number' ? c.value : 0;
}

type PlantKpiStatus = 'normal' | 'warning' | 'critical';

interface PlantKpiInputs {
  headers: PlantHeaders;
  totalKw: number;
  cop: number;
  chwDeltaT: number;
  condenserDeltaT: number;
  measuredDp: number;
  dpSetpoint: number;
  chwsSetpoint: number;
  bypassPercent: number;
  runningCh: number;
  runningChwp: number;
  runningCwp: number;
  runningCt: number;
  ctFanPct: number;
  waterUse: number;
  totalChKw: number;
  chwpKw: number;
  cwpKw: number;
  ctKw: number;
}

function buildKpis(input: PlantKpiInputs): PlantKpi[] {
  const {
    headers,
    totalKw,
    cop,
    chwDeltaT,
    condenserDeltaT,
    measuredDp,
    dpSetpoint,
    chwsSetpoint,
    bypassPercent,
    runningCh,
    runningChwp,
    runningCwp,
    runningCt,
    ctFanPct,
    waterUse,
    chwpKw,
    cwpKw,
    ctKw,
    totalChKw,
  } = input;

  const kwPerRt = plantEfficiencyKwPerRt(totalKw, headers.buildingLoadRt);
  const wetBulb = estimateWetBulbC(headers.ambientTemp, headers.humidityRh);
  const towerApproach = round(headers.cws - wetBulb, 1);
  const chillerKwPerRt =
    headers.buildingLoadRt > 0 ? round(totalChKw / headers.buildingLoadRt, 3) : 0;

  const card = (
    id: string,
    name: string,
    value: number | string,
    unit: string,
    category: string,
    target: number | string,
    status: PlantKpiStatus
  ): PlantKpi => ({
    id,
    name,
    value,
    unit,
    category,
    status,
    target,
    trend: 'stable',
  });

  const kwRtStatus: PlantKpiStatus =
    kwPerRt > 1.0 ? 'critical' : kwPerRt > 0.85 ? 'warning' : 'normal';
  const copStatus: PlantKpiStatus =
    cop < 3.5 ? 'critical' : cop < 4.5 ? 'warning' : 'normal';
  const chwDtStatus: PlantKpiStatus =
    chwDeltaT < 3.5 ? 'critical' : chwDeltaT < 4.5 ? 'warning' : 'normal';
  const chwsStatus: PlantKpiStatus =
    Math.abs(headers.chws - chwsSetpoint) > 2 ? 'warning' : 'normal';
  const dpStatus: PlantKpiStatus =
    Math.abs(measuredDp - dpSetpoint) > 5 ? 'warning' : 'normal';
  const bypassStatus: PlantKpiStatus =
    bypassPercent > 35 ? 'critical' : bypassPercent > 15 ? 'warning' : 'normal';
  const approachStatus: PlantKpiStatus =
    towerApproach > 6 ? 'critical' : towerApproach > 5 ? 'warning' : 'normal';
  const condDtStatus: PlantKpiStatus =
    condenserDeltaT < 2 ? 'warning' : 'normal';

  return [
    // Energy / performance
    card('kpi-load', 'Plant Load', round(headers.buildingLoadRt, 0), 'RT', 'operational', 3200, 'normal'),
    card('kpi-kw', 'Total Plant kW', round(totalKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-eff', 'Plant kW/RT', kwPerRt, 'kW/RT', 'energy', '≤ 0.65', kwRtStatus),
    card('kpi-cop', 'Plant COP', cop, '', 'energy', '≥ 5.5', copStatus),
    card('kpi-ch-kwrt', 'Chiller kW/RT', chillerKwPerRt, 'kW/RT', 'energy', '≤ 0.55', chillerKwPerRt > 0.7 ? 'warning' : 'normal'),
    card('kpi-ch-kw', 'Chiller kW', round(totalChKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-chwp-kw', 'CHWP kW', round(chwpKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-cwp-kw', 'CWP kW', round(cwpKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-ct-kw', 'CT Fan kW', round(ctKw, 1), 'kW', 'energy', '—', 'normal'),
    // Chilled water loop
    card('kpi-chw-dt', 'CHW ΔT', round(chwDeltaT, 1), '°C', 'operational', '5–7', chwDtStatus),
    card('kpi-chws', 'CHWS', headers.chws, '°C', 'operational', chwsSetpoint, chwsStatus),
    card('kpi-chwr', 'CHWR', headers.chwr, '°C', 'operational', '—', 'normal'),
    card('kpi-dp', 'Header DP', round(measuredDp, 1), 'psi', 'operational', dpSetpoint, dpStatus),
    card('kpi-bypass', 'Bypass Valve', round(bypassPercent, 0), '%', 'operational', '≤ 10', bypassStatus),
    // Condenser loop
    card('kpi-cond-dt', 'Condenser ΔT', round(condenserDeltaT, 1), '°C', 'operational', '3–5', condDtStatus),
    card('kpi-cws', 'CWS', headers.cws, '°C', 'operational', 29, 'normal'),
    card('kpi-cwr', 'CWR', headers.cwr, '°C', 'operational', 32, 'normal'),
    card('kpi-approach', 'Tower Approach', towerApproach, '°C', 'operational', '3–5', approachStatus),
    card('kpi-ct-fan', 'CT Fan Speed', round(ctFanPct, 0), '%', 'operational', 'auto', 'normal'),
    // Equipment staging
    card('kpi-rch', 'Chillers Online', runningCh, '', 'operational', '—', 'normal'),
    card('kpi-rchwp', 'CHWP Online', runningChwp, '', 'operational', '—', 'normal'),
    card('kpi-rcwp', 'CWP Online', runningCwp, '', 'operational', '—', 'normal'),
    card('kpi-rct', 'Towers Online', runningCt, '', 'operational', '—', 'normal'),
    // Aux / environment
    card('kpi-water', 'Make-up Water', round(waterUse, 1), 'm³/h', 'cost', '≤ 5', waterUse > 10 ? 'warning' : 'normal'),
    card('kpi-ambient', 'Outdoor Temp', headers.ambientTemp, '°C', 'environment', REF_AMBIENT_TEMP, 'normal'),
    card('kpi-humidity', 'Outdoor RH', headers.humidityRh, '%RH', 'environment', REF_HUMIDITY_RH, 'normal'),
    card('kpi-wetbulb', 'Est. Wet Bulb', wetBulb, '°C', 'environment', '—', 'normal'),
  ];
}

function runControlStep(): PlantState {
  internals.tick += 1;

  const chwsSp = getControl('ctrl-chws-sp') || 7;
  const chwrSp = getControl('ctrl-chwr-sp') || REF_CHWR_SP;
  const cwsSp = getControl('ctrl-cws-sp') || 29;
  const cwrSp = getControl('ctrl-cwr-sp') || REF_CWR_SP;
  const dpSp = getControl('ctrl-dp-sp') || 15;
  const dpSpHigh = getControl('ctrl-dp-sp-high') || dpSp;
  const cwDtSp = getControl('ctrl-cw-dt-sp') || 4.5;
  const ctFanOverride = getControl('ctrl-ct-fan');
  const pumpOverride = getControl('ctrl-pump-spd');
  const cwpOverride = getControl('ctrl-cwp-spd');
  const chillerEnabled = getControl('ctrl-ch-enable') === 1;

  const ambientTemp = getControl('ctrl-ambient-temp') || REF_AMBIENT_TEMP;
  const humidityRh = getControl('ctrl-humidity') || REF_HUMIDITY_RH;
  const baseLoadRt = getControl('ctrl-building-load') || 900;
  const buildingDemandRt = clamp(
    baseLoadRt * weatherLoadFactor(ambientTemp) * humidityLoadFactor(humidityRh),
    800,
    6000
  );
  const runningChCount = stageChillers(buildingDemandRt, chillerEnabled);
  const rtPerChiller = balanceChillerLoad(buildingDemandRt, runningChCount);
  const loadPctBase = chillerLoadPercent(rtPerChiller);

  const { loadFactor, kwFactor, copFactor } = chwsSetpointModifiers(chwsSp);
  const loadPct = clamp(loadPctBase * loadFactor, 0, 100);
  let cop = REF_CHILLER_COP * copFactor * condenserCopBonus(cwsSp, internals.cwsActual);
  let chKw = REF_CHILLER_KW * (loadPct / REF_CHILLER_LOAD) * kwFactor;

  // CHWS lags toward setpoint (instant in static mode); rises if plant cannot meet load
  const chwsTarget = chwsSp + (loadPct > 90 ? 0.3 : 0);
  internals.chwsActual = STATIC_MODE ? chwsTarget : lag(internals.chwsActual, chwsTarget, 25);

  // Required flow from building load (design ΔT for staging)
  const totalChwFlow = rtToKw(buildingDemandRt) / (DESIGN_DELTA_T_FLOW * 1.163);

  // Actual delta-T from energy balance (may differ when bypass open)
  let deltaTPhysics =
    totalChwFlow > 0 ? rtToKw(buildingDemandRt) / (totalChwFlow * 1.163) : 5.5;

  // Bypass reduces effective delta-T
  if (internals.bypassPercent > 0) {
    deltaTPhysics = deltaTPhysics * (1 - internals.bypassPercent / 200);
  }

  const deltaTFromSp = clamp(chwrSp - internals.chwsActual, 2.5, 8);
  const deltaT = deltaTPhysics * 0.35 + deltaTFromSp * 0.65;

  const chwr = internals.chwsActual + deltaT;

  // CHWP staging & speed (affinity laws)
  let chwpSpeed = pumpOverride > 0 ? pumpOverride : chwpSpeedFromDpSetpoint(Math.max(dpSp, dpSpHigh));
  const runningChwp = stageChwp(totalChwFlow);
  const chwpFlowEach =
    runningChwp > 0
      ? pumpFlowFromSpeed(REF_CHWP_FLOW, REF_CHWP_SPEED, chwpSpeed)
      : 0;
  const chwpKwEach = pumpPowerFromSpeed(REF_CHWP_KW, REF_CHWP_SPEED, chwpSpeed);

  // Measured DP proxy from speed
  const measuredDp = 15 + (chwpSpeed - 70) * 0.35;

  // Bypass opens if DP too high (equilibrium is fully open / closed in static mode)
  if (STATIC_MODE) {
    internals.bypassPercent = measuredDp > dpSp + 3 ? 50 : 0;
  } else if (measuredDp > dpSp + 3) {
    internals.bypassPercent = clamp(internals.bypassPercent + 2, 0, 50);
  } else if (internals.bypassPercent > 0) {
    internals.bypassPercent = clamp(internals.bypassPercent - 1, 0, 50);
  }

  // CWP follows chillers
  const runningCwp = stageCwp(runningChCount);
  const cwpSpeed = cwpOverride > 0 ? cwpOverride : clamp(55 + loadPct * 0.35, 30, 100);
  const cwpFlowEach = pumpFlowFromSpeed(REF_CWP_FLOW, 70, cwpSpeed);
  const cwpKwEach = pumpPowerFromSpeed(REF_CWP_KW, 70, cwpSpeed);

  // Cooling tower control. In static mode the fan sits at the speed that holds
  // CWS at setpoint given the weather offset (its dynamic fixed point).
  const condenserOffset = weatherCondenserOffset(ambientTemp, humidityRh);
  if (ctFanOverride > 0) {
    internals.ctFanSpeed = ctFanOverride;
  } else if (STATIC_MODE) {
    internals.ctFanSpeed = clamp(REF_CT_FAN + condenserOffset / 0.04, 30, 100);
  } else {
    internals.ctFanSpeed = ctFanAdjust(internals.ctFanSpeed, internals.cwsActual, cwsSp);
  }
  const cwsTarget = cwsSp - (internals.ctFanSpeed - REF_CT_FAN) * 0.04 + condenserOffset;
  internals.cwsActual = STATIC_MODE ? cwsTarget : lag(internals.cwsActual, cwsTarget, 30);
  const cwrTarget = Math.max(cwrSp, internals.cwsActual + cwDtSp);
  internals.cwrActual = STATIC_MODE ? cwrTarget : lag(internals.cwrActual, cwrTarget, 40);

  const runningCt = stageCoolingTowers(runningChCount);
  const ctKwEach = pumpPowerFromSpeed(REF_CT_KW, 70, internals.ctFanSpeed);

  // Makeup water — a slow fill/drain limit-cycle; frozen in static mode (it has
  // no steady state and does not affect the plant's thermal/energy outputs).
  if (!STATIC_MODE) {
    internals.tankLevel -= 0.06;
    if (internals.tankLevel < 30 && !internals.faults.makeupPumpFail) {
      internals.makeupPumpActive = true;
    }
    if (internals.tankLevel > 90) {
      internals.makeupPumpActive = false;
    }
    if (internals.makeupPumpActive) {
      internals.tankLevel += 1.2;
    }
    internals.tankLevel = clamp(internals.tankLevel, 5, 98);
  }

  const equipment: Record<string, PlantEquipment> = {};
  const chillerIds = Array.from({ length: CHILLER_COUNT }, (_, i) => `ch-${i + 1}`);

  chillerIds.forEach((id, idx) => {
    const running = idx < runningChCount;
    const tripped = internals.faults.chillerTripId === id;
    let status: PlantEquipment['status'] = running ? 'running' : 'stopped';
    if (tripped) status = 'alarm';

    equipment[id] = {
      id,
      name: `CH-${idx + 1}`,
      category: 'chiller',
      type: 'chiller',
      status,
      loadPercent: running && !tripped ? round(loadPct, 1) : 0,
      cop: running && !tripped ? round(cop, 2) : 0,
      supplyTemp: round(internals.chwsActual, 2),
      returnTemp: round(chwr, 2),
      powerKw: running && !tripped ? round(chKw, 1) : 0,
      flowRate: running && !tripped ? round(totalChwFlow / runningChCount, 0) : 0,
      temperature: round(internals.chwsActual, 2),
      runtimeHours: 12000 + idx * 500 + internals.tick * (2 / 3600),
    };
  });

  for (let i = 1; i <= CHWP_COUNT; i++) {
    const id = `chwp-${i}`;
    const running = i <= runningChwp;
    const tripped = internals.faults.pumpTripId === id;
    equipment[id] = {
      id,
      name: `CHWP-${i}`,
      category: 'chwp',
      type: 'pump',
      loop: 'chilled',
      status: tripped ? 'alarm' : running ? 'running' : 'stopped',
      speedPercent: running && !tripped ? round(chwpSpeed, 1) : 0,
      frequencyHz: running && !tripped ? speedToHz(chwpSpeed) : 0,
      powerKw: running && !tripped ? round(chwpKwEach, 1) : 0,
      flowRate: running && !tripped ? round(chwpFlowEach, 0) : 0,
      runtimeHours: 6000 + i * 200,
    };
  }

  for (let i = 1; i <= CWP_COUNT; i++) {
    const id = `cwp-${i}`;
    const running = i <= runningCwp;
    equipment[id] = {
      id,
      name: `CWP-${i}`,
      category: 'cwp',
      type: 'pump',
      loop: 'condenser',
      status: running ? 'running' : 'stopped',
      speedPercent: running ? round(cwpSpeed, 1) : 0,
      frequencyHz: running ? speedToHz(cwpSpeed) : 0,
      powerKw: running ? round(cwpKwEach, 1) : 0,
      flowRate: running ? round(cwpFlowEach, 0) : 0,
      runtimeHours: 5500 + i * 180,
    };
  }

  for (let i = 1; i <= CT_COUNT; i++) {
    const id = `ct-${i}`;
    const running = i <= runningCt;
    const fanFault = internals.faults.ctFanFaultId === id;
    equipment[id] = {
      id,
      name: `CT-${String(i).padStart(2, '0')}`,
      category: 'cooling_tower',
      type: 'cooling_tower',
      status: fanFault ? 'alarm' : running ? 'running' : 'stopped',
      fanSpeedPercent: running && !fanFault ? round(internals.ctFanSpeed, 1) : 0,
      frequencyHz: running && !fanFault ? speedToHz(internals.ctFanSpeed) : 0,
      leavingTemp: round(internals.cwsActual, 2),
      powerKw: running && !fanFault ? round(ctKwEach, 1) : 0,
      flowRate: running ? round(cwpFlowEach * runningCwp, 0) : 0,
      runtimeHours: 8000 + i * 300,
    };
  }

  equipment['cwmutnk-41-1'] = {
    id: 'cwmutnk-41-1',
    name: 'CWMUTnk-41-1',
    category: 'makeup',
    type: 'makeup_tank',
    status: 'running',
    levelPercent: round(internals.tankLevel, 1),
    highLevel: internals.tankLevel > 90,
    lowLevel: internals.tankLevel < 20,
    volumeGal: 1250,
    powerKw: 0,
    flowRate: 0,
    runtimeHours: 0,
  };

  ['cwmup-1', 'cwmup-2'].forEach((id, idx) => {
    const lead = idx === 0;
    const run = internals.makeupPumpActive && lead && !internals.faults.makeupPumpFail;
    equipment[id] = {
      id,
      name: `CWMUP-${idx + 1}`,
      category: 'makeup',
      type: 'makeup_pump',
      status: run ? 'running' : 'stopped',
      speedPercent: run ? 55 : 0,
      runStatus: run,
      powerKw: run ? 3.2 : 0,
      flowRate: run ? 16 : 0,
      runtimeHours: 3200 + idx * 400,
    };
  });

  equipment['exptnk-01'] = {
    id: 'exptnk-01',
    name: 'ET-01',
    category: 'expansion',
    type: 'expansion_tank',
    status: 'running',
    levelPercent: 62,
    powerKw: 0,
    flowRate: 0,
    runtimeHours: 0,
  };
  equipment['exptnk-02'] = {
    id: 'exptnk-02',
    name: 'ET-02',
    category: 'expansion',
    type: 'expansion_tank',
    status: 'running',
    levelPercent: 67,
    powerKw: 0,
    flowRate: 0,
    runtimeHours: 0,
  };

  equipment['bv-1'] = {
    id: 'bv-1',
    name: 'Bypass Valve 1',
    category: 'valve',
    type: 'valve',
    status: internals.bypassPercent > 0 ? 'manual' : 'running',
    positionPercent: round(internals.bypassPercent, 1),
    powerKw: 0.1,
    flowRate: 0,
    runtimeHours: 0,
  };
  equipment['bv-2'] = {
    id: 'bv-2',
    name: 'Bypass Valve 2',
    category: 'valve',
    type: 'valve',
    status: 'running',
    positionPercent: round(internals.bypassPercent * 0.5, 1),
    powerKw: 0.1,
    flowRate: 0,
    runtimeHours: 0,
  };

  const totalChKw = chKw * runningChCount;
  const totalChwpKw = chwpKwEach * runningChwp;
  const totalCwpKw = cwpKwEach * runningCwp;
  const totalCtKw = ctKwEach * runningCt;
  const totalKw = totalChKw + totalChwpKw + totalCwpKw + totalCtKw;

  const coolingKw = coolingKwFromFlow(totalChwFlow, deltaT);
  const plantCopVal = plantCop(coolingKw, totalKw);
  const waterUse = internals.makeupPumpActive ? 14 : 2;

  const headers: PlantHeaders = {
    chws: round(internals.chwsActual, 2),
    chwr: round(chwr, 2),
    cws: round(internals.cwsActual, 2),
    cwr: round(internals.cwrActual, 2),
    buildingLoadRt: buildingDemandRt,
    ambientTemp: round(ambientTemp, 1),
    humidityRh: round(humidityRh, 0),
  };

  const pumpCommandedOn: Record<string, boolean> = {};
  for (let i = 1; i <= CHWP_COUNT; i++) {
    pumpCommandedOn[`chwp-${i}`] = i <= runningChwp;
  }

  const rawAlerts = evaluateAlarms({
    headers,
    equipment,
    chwsSetpoint: chwsSp,
    chwrSetpoint: chwrSp,
    cwsSetpoint: cwsSp,
    cwrSetpoint: cwrSp,
    deltaT,
    dpSetpoint: dpSp,
    measuredDp,
    bypassPercent: internals.bypassPercent,
    baseLoadRt,
    chillerEnabled,
    ctFanSpeed: internals.ctFanSpeed,
    pumpOverride,
    faults: internals.faults,
    pumpCommandedOn,
  });

  const alerts = mergeAcknowledged(rawAlerts, internals.acknowledgedAlerts);

  const cascadeCtx: CascadeContext = {
    trigger: lastCascadeTrigger,
    chwsSp,
    chwrSp,
    cwsSp,
    cwrSp,
    dpSp,
    baseLoadRt,
    ambientTemp,
    humidityRh,
    buildingDemandRt,
    runningChillers: runningChCount,
    runningChwp,
    runningCwp,
    loadPct,
    chKw,
    cop: plantCopVal,
    chwsActual: internals.chwsActual,
    chwr,
    cwrActual: internals.cwrActual,
    deltaT,
    totalPlantKw: totalKw,
    plantCop: plantCopVal,
  };
  lastCascadeCtx = cascadeCtx;
  const cascadeTrace = buildCascadeTrace(cascadeCtx, lastBeforeCtx, lastChanges);
  const cascadeRows = buildChillerCascadeRows(cascadeCtx, lastBeforeCtx);

  const buildingLoadRt = headers.buildingLoadRt;
  const loopDeltaT = headers.chwr - headers.chws;

  const kpiList = buildKpis({
    headers,
    totalKw,
    cop: plantCopVal,
    chwDeltaT: deltaT,
    condenserDeltaT: headers.cwr - headers.cws,
    measuredDp,
    dpSetpoint: dpSp,
    chwsSetpoint: chwsSp,
    bypassPercent: internals.bypassPercent,
    runningCh: runningChCount,
    runningChwp,
    runningCwp,
    runningCt,
    ctFanPct: internals.ctFanSpeed,
    waterUse,
    chwpKw: totalChwpKw,
    cwpKw: totalCwpKw,
    ctKw: totalCtKw,
    totalChKw,
  });
  lastKpiSnapshot = kpiList;

  return {
    equipment,
    headers,
    kpis: kpiList,
    controls: controls.map((c) => ({ ...c })),
    alerts,
    simulationTime: new Date().toISOString(),
    simulation: {
      mode: 'virtual-offline',
      dataSource: 'physics-engine',
      tick: internals.tick,
      dtSeconds: SIM_DT_SEC,
      simTimeSec: internals.tick * SIM_DT_SEC,
      lastTrigger: lastCascadeTrigger,
      lastControlId: lastControlId ?? undefined,
      cascadeTrace,
      cascadeRows,
      beforeKpis: lastBeforeKpis ?? undefined,
      lastOutput: {
        buildingLoadRt,
        deltaT: round(loopDeltaT, 1),
      },
    },
  };
}

export function stepPlantSimulation(): PlantState {
  return runControlStep();
}

export function startPlantSimulator(onTick: (state: PlantState) => void): () => void {
  onTick(stepPlantSimulation());
  const id = setInterval(() => onTick(stepPlantSimulation()), 2000);
  return () => clearInterval(id);
}

export function updatePlantControl(controlId: string, value: number): void {
  const ctrl = controls.find((c) => c.id === controlId);
  if (!ctrl) return;
  const prev = ctrl?.value;
  const next = constrainControlValue(ctrl, value);
  const changed = prev !== next;
  controls = controls.map((c) => (c.id === controlId ? { ...c, value: next } : c));
  const label = ctrl?.label || controlId;
  lastControlId = controlId;
  lastCascadeTrigger = `Operator set ${label}: ${prev} → ${value}${ctrl?.unit ? ` ${ctrl.unit}` : ''}`;
  const constrainedNote = next !== value ? ` (constrained from ${value})` : '';
  lastCascadeTrigger = `Operator set ${label}: ${prev} -> ${next}${ctrl?.unit ? ` ${ctrl.unit}` : ''}${constrainedNote}`;
  // Snapshot the pre-edit state so the domino table + performance cards show
  // before → after for a single immediate edit (SCADA panel / chatbot path).
  if (ctrl && changed) {
    lastBeforeCtx = lastCascadeCtx;
    lastBeforeKpis = lastKpiSnapshot;
    lastChanges = [{ label, oldValue: prev as number, newValue: next, unit: ctrl.unit }];
  } else {
    lastBeforeCtx = null;
    lastBeforeKpis = null;
    lastChanges = null;
  }
}

/**
 * Commit a batch of staged operator edits, then fast-forward virtual time with a
 * before→after domino cascade. The current tick's context becomes the "before".
 */
export function applyPlantChanges(
  changes: Array<{ controlId: string; label: string; oldValue: number; newValue: number; unit?: string }>,
  seconds = 60,
): PlantState {
  const list = (changes ?? [])
    .map((ch) => {
      const ctrl = controls.find((c) => c.id === ch.controlId);
      if (!ctrl) return null;
      return {
        ...ch,
        label: ch.label || ctrl.label,
        oldValue: typeof ctrl.value === 'number' ? ctrl.value : ch.oldValue,
        newValue: constrainControlValue(ctrl, ch.newValue),
        unit: ch.unit ?? ctrl.unit,
      };
    })
    .filter((ch): ch is { controlId: string; label: string; oldValue: number; newValue: number; unit?: string } => !!ch);
  lastBeforeCtx = list.length ? lastCascadeCtx : null;
  lastBeforeKpis = list.length ? lastKpiSnapshot : null;
  lastChanges = list.length
    ? list.map((c) => ({ label: c.label, oldValue: c.oldValue, newValue: c.newValue, unit: c.unit }))
    : null;
  for (const ch of list) {
    if (controls.some((c) => c.id === ch.controlId)) {
      controls = controls.map((c) => (c.id === ch.controlId ? { ...c, value: ch.newValue } : c));
    }
  }
  if (list.length) lastControlId = list[list.length - 1].controlId;
  const n = Math.max(1, Math.floor(seconds / SIM_DT_SEC));
  let state = runControlStep();
  for (let i = 1; i < n; i++) state = runControlStep();
  const load = state.headers.buildingLoadRt;
  const dt = round(state.headers.chwr - state.headers.chws, 1);
  const verb = list.length === 1 ? 'change' : 'changes';
  lastCascadeTrigger = `Applied ${list.length} ${verb} — ${load} RT load · ΔT ${dt}°C (${n * SIM_DT_SEC}s virtual)`;
  return { ...state, simulation: { ...state.simulation, lastTrigger: lastCascadeTrigger } };
}

/** Advance virtual time (dynamic lag response) without live sensors. */
export function advancePlantSimulation(steps = 1): PlantState {
  const n = Math.max(1, Math.floor(steps));
  let state = runControlStep();
  for (let i = 1; i < n; i++) {
    state = runControlStep();
  }
  const load = state.headers.buildingLoadRt;
  const dt = round(state.headers.chwr - state.headers.chws, 1);
  lastCascadeTrigger = `Simulation output — ${load} RT load · ΔT ${dt}°C (${n * SIM_DT_SEC}s virtual)`;
  return {
    ...state,
    simulation: { ...state.simulation, lastTrigger: lastCascadeTrigger },
  };
}

/** Snap lagging plant state toward current setpoints after a scenario jump. */
function snapPlantDynamics(): void {
  internals.chwsActual = getControl('ctrl-chws-sp') || 7;
  internals.cwsActual = getControl('ctrl-cws-sp') || 29;
  internals.cwrActual = getControl('ctrl-cwr-sp') || REF_CWR_SP;
  internals.ctFanSpeed = getControl('ctrl-ct-fan') > 0 ? getControl('ctrl-ct-fan') : REF_CT_FAN;
  internals.bypassPercent = 0;
}

function applyChillerScenarioInternal(scenario: {
  id: string;
  label: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): PlantState {
  if (scenario.reset) {
    resetPlantControls();
  } else if (scenario.controls) {
    internals.faults = {
      chillerTripId: null,
      pumpTripId: null,
      makeupPumpFail: false,
      ctFanFaultId: null,
    };
    for (const [id, value] of Object.entries(scenario.controls)) {
      const ctrl = controls.find((c) => c.id === id);
      if (ctrl) {
        controls = controls.map((c) => (c.id === id ? { ...c, value: constrainControlValue(ctrl, value) } : c));
      }
    }
    snapPlantDynamics();
  }

  lastControlId = `scenario:${scenario.id}`;
  lastBeforeCtx = null;
  lastBeforeKpis = null;
  lastChanges = null;

  const advanceSec = scenario.advanceSec ?? 0;
  const steps = advanceSec > 0 ? Math.max(1, Math.floor(advanceSec / SIM_DT_SEC)) : 1;

  let state = runControlStep();
  for (let i = 1; i < steps; i++) state = runControlStep();

  const load = state.headers.buildingLoadRt;
  const dt = round(state.headers.chwr - state.headers.chws, 1);
  const cop = state.kpis.find((k) => k.id === 'kpi-cop')?.value ?? '—';
  lastCascadeTrigger = `Scenario «${scenario.label}» — ${load} RT · ΔT ${dt}°C · COP ${cop}`;
  return {
    ...state,
    simulation: {
      ...state.simulation,
      lastTrigger: lastCascadeTrigger,
      scenarioId: scenario.id,
    },
  };
}

export function applyChillerScenario(scenarioId: string): PlantState {
  const scenario = getChillerScenarioById(scenarioId);
  if (!scenario) return stepPlantSimulation();
  return applyChillerScenarioInternal({
    id: scenario.id,
    label: scenario.label,
    reset: scenario.reset,
    controls: scenario.controls,
    advanceSec: scenario.advanceSec,
  });
}

export function applyChillerScenarioPayload(payload: {
  id?: string;
  label?: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): PlantState {
  return applyChillerScenarioInternal({
    id: payload.id ?? 'chatbot-custom',
    label: payload.label ?? 'Custom scenario',
    reset: payload.reset,
    controls: payload.controls,
    advanceSec: payload.advanceSec,
  });
}

export function resetPlantControls(): void {
  controls = defaultControls();
  lastCascadeTrigger = 'Plant reset to baseline setpoints';
  lastControlId = null;
  lastBeforeCtx = null;
  lastBeforeKpis = null;
  lastChanges = null;
  internals = {
    tick: 0,
    chwsActual: 7.5,
    cwsActual: 29,
    cwrActual: 33,
    ctFanSpeed: REF_CT_FAN,
    tankLevel: 68,
    bypassPercent: 0,
    makeupPumpActive: false,
    faults: {
      chillerTripId: null,
      pumpTripId: null,
      makeupPumpFail: false,
      ctFanFaultId: null,
    },
    acknowledgedAlerts: internals.acknowledgedAlerts,
  };
}

export function triggerPlantFault(faultType: string): void {
  if (faultType === 'chiller_fault') internals.faults.chillerTripId = 'ch-3';
  if (faultType === 'pump_trip') internals.faults.pumpTripId = 'chwp-2';
  if (faultType === 'makeup_fail') internals.faults.makeupPumpFail = true;
  if (faultType === 'ct_fan') internals.faults.ctFanFaultId = 'ct-3';
}

export function acknowledgePlantAlert(alertId: string): void {
  internals.acknowledgedAlerts.add(alertId);
}

export function getSimInternals(): SimInternals {
  return internals;
}

export function getPlantControls(): PlantControl[] {
  return controls.map((c) => ({ ...c }));
}

export interface PredictStageMetric {
  /** Plant efficiency this tick (kW per RT) — the MPC objective, not COP. */
  kwPerRt: number;
  totalKw: number;
  buildingLoadRt: number;
  hasCritical: boolean;
}

function cloneInternals(s: SimInternals): SimInternals {
  return {
    ...s,
    faults: { ...s.faults },
    acknowledgedAlerts: new Set(s.acknowledgedAlerts),
  };
}

function readStageMetric(state: PlantState): PredictStageMetric {
  const kwCard = state.kpis.find((k) => k.id === 'kpi-kw');
  const effCard = state.kpis.find((k) => k.id === 'kpi-eff');
  return {
    totalKw: typeof kwCard?.value === 'number' ? kwCard.value : 0,
    kwPerRt: typeof effCard?.value === 'number' ? effCard.value : 0,
    buildingLoadRt: state.headers.buildingLoadRt,
    hasCritical: state.alerts.some((a) => a.severity === 'critical'),
  };
}

/**
 * Predict the plant response to a candidate set of control overrides over
 * `steps` 2-second ticks WITHOUT disturbing live simulator state — the MPC
 * controller's prediction model. All mutable module state (controls, lag
 * internals, cascade bookkeeping) is snapshotted and restored, so this is a
 * pure read from the caller's perspective.
 *
 * By default the current lagged actuals (CHWS/CWS/fan/bypass) are preserved so
 * the rollout captures the true transient response to the move; pass
 * `snapDynamics: true` to evaluate the new steady state directly instead.
 */
export function predictPlant(
  overrides: Record<string, number>,
  steps: number,
  opts: { snapDynamics?: boolean } = {}
): PredictStageMetric[] {
  const savedControls = controls;
  const savedInternals = internals;
  const savedTrigger = lastCascadeTrigger;
  const savedCtrlId = lastControlId;
  const savedCtx = lastCascadeCtx;
  const savedBefore = lastBeforeCtx;
  const savedChanges = lastChanges;
  const savedKpiSnap = lastKpiSnapshot;
  const savedBeforeKpis = lastBeforeKpis;
  try {
    controls = savedControls.map((c) =>
      overrides[c.id] != null ? { ...c, value: constrainControlValue(c, overrides[c.id]) } : { ...c }
    );
    internals = cloneInternals(savedInternals);
    if (opts.snapDynamics) {
      internals.chwsActual = getControl('ctrl-chws-sp') || 7;
      internals.cwsActual = getControl('ctrl-cws-sp') || 29;
      internals.cwrActual = getControl('ctrl-cwr-sp') || REF_CWR_SP;
      internals.ctFanSpeed = getControl('ctrl-ct-fan') > 0 ? getControl('ctrl-ct-fan') : REF_CT_FAN;
      internals.bypassPercent = 0;
    }
    const out: PredictStageMetric[] = [];
    const n = Math.max(1, Math.floor(steps));
    for (let i = 0; i < n; i++) {
      out.push(readStageMetric(runControlStep()));
    }
    return out;
  } finally {
    controls = savedControls;
    internals = savedInternals;
    lastCascadeTrigger = savedTrigger;
    lastControlId = savedCtrlId;
    lastCascadeCtx = savedCtx;
    lastBeforeCtx = savedBefore;
    lastChanges = savedChanges;
    lastKpiSnapshot = savedKpiSnap;
    lastBeforeKpis = savedBeforeKpis;
  }
}

export const EQUIPMENT_DEFS = [
  'ct-1', 'ch-1', 'cwp-1', 'chwp-1', 'cwmutnk-41-1',
];
