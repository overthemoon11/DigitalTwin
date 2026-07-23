import type {
  PlantAlert,
  PlantControl,
  PlantEquipment,
  PlantHeaders,
  PlantKpi,
  PlantRiser,
  PlantState,
} from '../../types/plant';
import { evaluateAlarms, mergeAcknowledged } from './alarmEngine';
import {
  CHILLER_CAPACITY_RT,
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
  REF_CHWS_SP,
  REF_CWS_SP,
  MIN_CONDENSER_APPROACH_C,
  chwsSetpointModifiers,
  condenserLiftFactor,
  humidityLoadFactor,
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
import { assessCalibrationEnvelope } from './calibrationEnvelope';
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
import {
  DUTY_DEFAULTS,
  type DutyCategory,
  CH_KW_INTERCEPT,
  CH_KW_SLOPE_PER_PCT,
  CH_TRIM,
  CHWP_TRIM,
  CWP_TRIM,
  CT_TRIM,
  CH_CP1_SHARE,
  CH_STANDBY_KW,
  CT_CELL_KW_FRAC,
  CH_SENSOR_OFFSET,
  CH_STAGNANT,
  CT_CELL_OFFSET,
  CT_STAGNANT,
  RISERS,
  RISER_LOAD_SHARE_DEFAULT,
  WST_OFFSET,
  ROW1_LOAD_RT,
  ROW1_CHWS_SP,
  ROW1_CW_DT_SP,
  CH_EVAP_FLOW_TRIM,
  CH_COND_FLOW_TRIM,
  CHWP_STANDBY_KW,
  CWP_STANDBY_KW,
} from './t1Snapshot';

const SIM_DT_SEC = 2;
/** Design ΔT used ONLY to size required flow for CHWP staging. Matches the
 *  measured T1 loop ΔT (6.85 °C); the displayed loop ΔT is computed from the
 *  energy balance over the actual pumped flow, not from this constant. */
const DESIGN_DELTA_T_FLOW = 6.85;

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
      value: ROW1_LOAD_RT,
      ...CHILLER_CONTROL_CONSTRAINTS['ctrl-building-load'],
      unit: 'RT',
      group: 'load',
    },
    ...RISERS.map((r, i) => ({
      id: r.controlId,
      controlType: 'riserLoadShare',
      label: `Riser ${r.name} Load Share`,
      value: RISER_LOAD_SHARE_DEFAULT[i],
      ...CHILLER_CONTROL_CONSTRAINTS[r.controlId as keyof typeof CHILLER_CONTROL_CONSTRAINTS],
      unit: '%',
      group: 'load',
    })),
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
      value: ROW1_CHWS_SP,
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
      value: ROW1_CW_DT_SP,
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
// Active dataset-replay / preset scenario — persists across ticks so the UI can
// keep showing the sim-vs-dataset comparison; cleared on any manual edit.
let lastScenarioId: string | null = null;
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

// Unit duty orders — staging count N runs the FIRST N units of each order
// (real T1 duty-cycles units; defaults are the row-1 running sets).
let dutyOrders: Record<DutyCategory, number[]> = {
  chiller: [...DUTY_DEFAULTS.chiller],
  chwp: [...DUTY_DEFAULTS.chwp],
  cwp: [...DUTY_DEFAULTS.cwp],
  ct: [...DUTY_DEFAULTS.ct],
};

export function getPlantDutyOrders(): Record<DutyCategory, number[]> {
  return {
    chiller: [...dutyOrders.chiller],
    chwp: [...dutyOrders.chwp],
    cwp: [...dutyOrders.cwp],
    ct: [...dutyOrders.ct],
  };
}

/**
 * Toggle a unit between duty and standby: a standby unit is promoted to the
 * front of its duty order (so it joins the running set); a running unit is
 * demoted to the back (a standby peer takes its place). The RUNNING COUNT
 * stays load-driven — this selects WHICH units serve it, like the real
 * plant's rotation.
 */
export function togglePlantDutyUnit(category: DutyCategory, unit: number): void {
  const order = dutyOrders[category];
  const pos = order.indexOf(unit);
  if (pos === -1) return;
  order.splice(pos, 1);
  const label = `${category.toUpperCase()}-${unit}`;
  if (pos < lastDutyRunningCount[category]) {
    order.push(unit);
    lastCascadeTrigger = `Operator set ${label} to standby (duty rotation)`;
  } else {
    order.unshift(unit);
    lastCascadeTrigger = `Operator put ${label} on duty (duty rotation)`;
  }
  lastControlId = `duty:${category}-${unit}`;
  lastScenarioId = null;
  lastBeforeCtx = null;
  lastBeforeKpis = null;
  lastChanges = null;
}

/** Running counts from the latest tick — used by the duty toggle to know
 *  whether a clicked unit is currently in the running set. */
const lastDutyRunningCount: Record<DutyCategory, number> = { chiller: 3, chwp: 3, cwp: 3, ct: 4 };

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
    card('kpi-kw', 'Total Plant kW', round(totalKw, 2), 'kW', 'energy', '—', 'normal'),
    card('kpi-eff', 'Plant kW/RT', kwPerRt, 'kW/RT', 'energy', '≤ 0.65', kwRtStatus),
    card('kpi-cop', 'Plant COP', cop, '', 'energy', '≥ 5.5', copStatus),
    card('kpi-ch-kwrt', 'Chiller kW/RT', chillerKwPerRt, 'kW/RT', 'energy', '≤ 0.55', chillerKwPerRt > 0.7 ? 'warning' : 'normal'),
    card('kpi-ch-kw', 'Chiller kW', round(totalChKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-chwp-kw', 'CHWP kW', round(chwpKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-cwp-kw', 'CWP kW', round(cwpKw, 1), 'kW', 'energy', '—', 'normal'),
    card('kpi-ct-kw', 'CT Fan kW', round(ctKw, 1), 'kW', 'energy', '—', 'normal'),
    // Chilled water loop
    card('kpi-chw-dt', 'CHW ΔT', round(chwDeltaT, 2), '°C', 'operational', '5–7', chwDtStatus),
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

  const chwsSp = getControl('ctrl-chws-sp') || REF_CHWS_SP;
  const chwrSp = getControl('ctrl-chwr-sp') || REF_CHWR_SP;
  const cwsSp = getControl('ctrl-cws-sp') || REF_CWS_SP;
  const cwrSp = getControl('ctrl-cwr-sp') || REF_CWR_SP;
  const dpSp = getControl('ctrl-dp-sp') || 15;
  const dpSpHigh = getControl('ctrl-dp-sp-high') || dpSp;
  const cwDtSp = getControl('ctrl-cw-dt-sp') || ROW1_CW_DT_SP;
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

  // Fault redistribution — a tripped unit inside the staged set drops out of the
  // energy math and the survivors pick up its share (loadPct clamps at 100).
  // Which specific units serve the staged count comes from the duty orders
  // (row-1 defaults: CH-2/3/4 duty, CH-1/5 standby).
  const chillerRunUnits = dutyOrders.chiller.slice(0, runningChCount);
  const chillerRunSet = new Set(chillerRunUnits);
  const trippedChIdx = internals.faults.chillerTripId
    ? Number(internals.faults.chillerTripId.split('-')[1])
    : 0;
  const chTrippedActive = trippedChIdx >= 1 && chillerRunSet.has(trippedChIdx);
  const effCh = Math.max(runningChCount - (chTrippedActive ? 1 : 0), 0);
  const chTrimSum = chillerRunUnits
    .filter((u) => u !== trippedChIdx)
    .reduce((s, u) => s + (CH_TRIM[u - 1] ?? 1), 0);
  const rtPerChiller = balanceChillerLoad(buildingDemandRt, effCh);
  const loadPct = clamp(chillerLoadPercent(rtPerChiller), 0, 100);

  // Stopped (non-tripped) chillers still draw a small parasitic standby load
  // (controls / oil heaters) — visible in the dataset's DPM meters (~0.6 kW/comp).
  const chStandbyKw = CH_STANDBY_KW.reduce((s, u, idx) => {
    const unit = idx + 1;
    const stopped = !chillerRunSet.has(unit) && trippedChIdx !== unit;
    return s + (stopped ? u.cp1 + u.cp2 : 0);
  }, 0);

  // Tower water cannot get below wet-bulb + approach; the condenser loop runs at
  // the achievable CWS, which sets the compressor lift.
  const wetBulbC = estimateWetBulbC(ambientTemp, humidityRh);
  const cwsAchievable = Math.max(cwsSp, wetBulbC + MIN_CONDENSER_APPROACH_C);

  // Chiller power: affine part-load curve (fixed losses + per-RT term, anchored
  // through dataset rows 1 and 86 — see t1Snapshot) × evaporator-reset lift ×
  // condenser lift. COP is the Q/P identity on delivered cooling — never a
  // separate estimate.
  const { kwFactor } = chwsSetpointModifiers(chwsSp);
  const liftCws = STATIC_MODE ? cwsAchievable : internals.cwsActual;
  const chKw =
    (CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT * loadPct) * kwFactor * condenserLiftFactor(liftCws);
  const deliveredRtPerChiller = Math.min(rtPerChiller, CHILLER_CAPACITY_RT);

  // CHWS lags toward setpoint (instant in static mode); rises if plant cannot meet load
  const chwsTarget = chwsSp + (loadPct > 90 ? 0.3 : 0);
  internals.chwsActual = STATIC_MODE ? chwsTarget : lag(internals.chwsActual, chwsTarget, 25);

  // Required flow from building load (design ΔT — used for CHWP staging only)
  const totalChwFlow = rtToKw(buildingDemandRt) / (DESIGN_DELTA_T_FLOW * 1.163);

  // CHWP staging & speed (affinity laws)
  const chwpSpeed = pumpOverride > 0 ? pumpOverride : chwpSpeedFromDpSetpoint(Math.max(dpSp, dpSpHigh));
  const runningChwp = stageChwp(totalChwFlow);
  const chwpRunUnits = dutyOrders.chwp.slice(0, runningChwp);
  const chwpRunSet = new Set(chwpRunUnits);
  const trippedChwpIdx = internals.faults.pumpTripId
    ? Number(internals.faults.pumpTripId.split('-')[1])
    : 0;
  const chwpTrippedActive = trippedChwpIdx >= 1 && chwpRunSet.has(trippedChwpIdx);
  const effChwp = Math.max(runningChwp - (chwpTrippedActive ? 1 : 0), 0);
  const chwpTrimSum = chwpRunUnits
    .filter((u) => u !== trippedChwpIdx)
    .reduce((s, u) => s + (CHWP_TRIM[u - 1] ?? 1), 0);
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

  // Loop ΔT from the energy balance over the actual pumped flow (Q = ṁ·cp·ΔT).
  // More pump speed ⇒ more flow ⇒ lower ΔT; an open bypass steals coil flow.
  const actualChwFlow = chwpFlowEach * effChwp;
  const deltaT =
    actualChwFlow > 0
      ? clamp(
          (rtToKw(buildingDemandRt) / (actualChwFlow * 1.163)) * (1 - internals.bypassPercent / 200),
          2.5,
          9
        )
      : clamp(chwrSp - internals.chwsActual, 2.5, 9);

  const chwr = internals.chwsActual + deltaT;

  // Condenser loop must reject evaporator heat + compressor work. The CWP VSD
  // modulates to hold the CW ΔT setpoint (real plants control condenser flow
  // this way), so pump power responds to load and to the ΔT setpoint.
  const totalChKw = chKw * chTrimSum;
  const condenserHeatKw = rtToKw(buildingDemandRt) + totalChKw;
  const runningCwp = stageCwp(runningChCount);
  const cwpRunUnits = dutyOrders.cwp.slice(0, runningCwp);
  const cwpRunSet = new Set(cwpRunUnits);
  const cwpTrimSum = cwpRunUnits.reduce((s, u) => s + (CWP_TRIM[u - 1] ?? 1), 0);
  const targetCwFlow = condenserHeatKw / (Math.max(cwDtSp, 1) * 1.163);
  const cwpSpeed =
    cwpOverride > 0
      ? cwpOverride
      : runningCwp > 0
        ? clamp((targetCwFlow / runningCwp / REF_CWP_FLOW) * 70, 30, 100)
        : 0;
  const cwpFlowEach = pumpFlowFromSpeed(REF_CWP_FLOW, 70, cwpSpeed);
  const cwpKwEach = pumpPowerFromSpeed(REF_CWP_KW, 70, cwpSpeed);

  // Cooling tower control. In static mode the fan sits at the speed that holds
  // CWS at setpoint given the weather offset; chasing a setpoint below the
  // reference costs fan speed (and cubed fan power) before the wet-bulb floor.
  const condenserOffset = weatherCondenserOffset(ambientTemp, humidityRh);
  if (ctFanOverride > 0) {
    internals.ctFanSpeed = ctFanOverride;
  } else if (STATIC_MODE) {
    internals.ctFanSpeed = clamp(
      REF_CT_FAN + condenserOffset / 0.04 + 10 * (REF_CWS_SP - cwsSp),
      30,
      100
    );
  } else {
    internals.ctFanSpeed = ctFanAdjust(internals.ctFanSpeed, internals.cwsActual, cwsSp);
  }
  const cwsTarget = Math.max(
    cwsSp - (internals.ctFanSpeed - REF_CT_FAN) * 0.04 + condenserOffset,
    wetBulbC + MIN_CONDENSER_APPROACH_C
  );
  internals.cwsActual = STATIC_MODE ? cwsAchievable : lag(internals.cwsActual, cwsTarget, 30);
  // Condenser rise from the heat balance over the actual CW flow — if the pumps
  // hit their speed clamp the achieved ΔT exceeds the setpoint, as in reality.
  const actualCwFlow = cwpFlowEach * runningCwp;
  const condDeltaT = actualCwFlow > 0 ? condenserHeatKw / (actualCwFlow * 1.163) : cwDtSp;
  const cwrTarget = internals.cwsActual + condDeltaT;
  internals.cwrActual = STATIC_MODE ? cwrTarget : lag(internals.cwrActual, cwrTarget, 40);

  const runningCt = stageCoolingTowers(runningChCount);
  const ctRunUnits = dutyOrders.ct.slice(0, runningCt);
  const ctRunSet = new Set(ctRunUnits);
  const ctTrimSum = ctRunUnits.reduce((s, u) => s + (CT_TRIM[u - 1] ?? 1), 0);
  const ctKwEach = pumpPowerFromSpeed(REF_CT_KW, 70, internals.ctFanSpeed);

  // Remember the live running counts so duty toggles know running vs standby.
  lastDutyRunningCount.chiller = runningChCount;
  lastDutyRunningCount.chwp = runningChwp;
  lastDutyRunningCount.cwp = runningCwp;
  lastDutyRunningCount.ct = runningCt;

  // The four CHW risers: fixed hydronic flow split (row-1 fractions), operator-
  // settable load split (normalized), riser ΔT from each riser's own balance.
  const riserShareRaw = RISERS.map((r) => Math.max(getControl(r.controlId), 0));
  const riserShareSum = riserShareRaw.reduce((a, b) => a + b, 0) || 1;
  const risers: PlantRiser[] = RISERS.map((r, i) => {
    const share = riserShareRaw[i] / riserShareSum;
    const flowM3h = r.flowFrac * actualChwFlow;
    const qKw = share * rtToKw(buildingDemandRt);
    const riserDt = flowM3h > 0 ? qKw / (flowM3h * 1.163) : 0;
    const chwSt = internals.chwsActual + r.stOff;
    const chwRt = chwSt + riserDt + r.rtOff;
    return {
      id: r.id,
      name: r.name,
      controlId: r.controlId,
      loadSharePct: round(share * 100, 1),
      flowM3h: round(flowM3h, 1),
      flowLs: round(flowM3h / 3.6, 2),
      chwSt: round(chwSt, 2),
      chwRt: round(chwRt, 2),
      rt: round(share * buildingDemandRt, 0),
    };
  });

  // Five wet-bulb sensors = Stull estimate + per-sensor bias (row-1 spread).
  const wetBulbSensors = WST_OFFSET.map((o) => round(wetBulbC + o, 2));

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
    const unit = idx + 1;
    const running = chillerRunSet.has(unit);
    const tripped = internals.faults.chillerTripId === id;
    let status: PlantEquipment['status'] = running ? 'running' : 'stopped';
    if (tripped) status = 'alarm';

    const live = running && !tripped;
    const trim = CH_TRIM[idx] ?? 1;
    const standby = !running && !tripped ? CH_STANDBY_KW[idx] : null;
    // Keep full precision until the final per-field rounding, so CP splits and
    // meter ratios reproduce the dataset values exactly.
    const unitKwRaw = live ? chKw * trim : standby ? standby.cp1 + standby.cp2 : 0;
    const unitKw = round(unitKwRaw, 2);
    const cp1Share = CH_CP1_SHARE[idx] ?? 0.5;
    const stag = CH_STAGNANT[idx];
    const off = CH_SENSOR_OFFSET;

    equipment[id] = {
      id,
      name: `CH-${unit}`,
      category: 'chiller',
      type: 'chiller',
      status,
      loadPercent: live ? round(loadPct, 1) : 0,
      cop: live ? round(rtToKw(deliveredRtPerChiller) / Math.max(chKw * trim, 1), 2) : 0,
      supplyTemp: live ? round(internals.chwsActual + off.chwSt[idx], 2) : stag.chwSt,
      returnTemp: live ? round(chwr + off.chwRt[idx], 2) : stag.chwRt,
      cwSupplyTemp: live ? round(internals.cwsActual + off.cwSt[idx], 2) : stag.cwSt,
      cwReturnTemp: live ? round(internals.cwrActual + off.cwRt[idx], 2) : stag.cwRt,
      powerKw: unitKw,
      cp1Kw: live ? round(unitKwRaw * cp1Share, 2) : standby ? standby.cp1 : 0,
      cp2Kw: live ? round(unitKwRaw * (1 - cp1Share), 2) : standby ? standby.cp2 : 0,
      flowRate: live ? round((actualChwFlow / Math.max(effCh, 1)) * (CH_EVAP_FLOW_TRIM[idx] ?? 1), 2) : 0,
      condFlowRate: live ? round((actualCwFlow / Math.max(effCh, 1)) * (CH_COND_FLOW_TRIM[idx] ?? 1), 2) : 0,
      temperature: live ? round(internals.chwsActual + off.chwSt[idx], 2) : stag.chwSt,
      runtimeHours: 12000 + idx * 500 + internals.tick * (2 / 3600),
    };
  });

  for (let i = 1; i <= CHWP_COUNT; i++) {
    const id = `chwp-${i}`;
    const running = chwpRunSet.has(i);
    const tripped = internals.faults.pumpTripId === id;
    const live = running && !tripped;
    const trim = CHWP_TRIM[i - 1] ?? 1;
    equipment[id] = {
      id,
      name: `CHWP-${i}`,
      category: 'chwp',
      type: 'pump',
      loop: 'chilled',
      status: tripped ? 'alarm' : running ? 'running' : 'stopped',
      speedPercent: live ? round(chwpSpeed, 1) : 0,
      frequencyHz: live ? speedToHz(chwpSpeed) : 0,
      powerKw: live ? round(chwpKwEach * trim, 2) : !tripped ? (CHWP_STANDBY_KW[i - 1] ?? 0) : 0,
      flowRate: live ? round(chwpFlowEach, 0) : 0,
      runtimeHours: 6000 + i * 200,
    };
  }

  for (let i = 1; i <= CWP_COUNT; i++) {
    const id = `cwp-${i}`;
    const running = cwpRunSet.has(i);
    const trim = CWP_TRIM[i - 1] ?? 1;
    equipment[id] = {
      id,
      name: `CWP-${i}`,
      category: 'cwp',
      type: 'pump',
      loop: 'condenser',
      status: running ? 'running' : 'stopped',
      speedPercent: running ? round(cwpSpeed, 1) : 0,
      frequencyHz: running ? speedToHz(cwpSpeed) : 0,
      powerKw: running ? round(cwpKwEach * trim, 2) : (CWP_STANDBY_KW[i - 1] ?? 0),
      flowRate: running ? round(cwpFlowEach, 0) : 0,
      runtimeHours: 5500 + i * 180,
    };
  }

  for (let i = 1; i <= CT_COUNT; i++) {
    const id = `ct-${i}`;
    const running = ctRunSet.has(i);
    const fanFault = internals.faults.ctFanFaultId === id;
    const live = running && !fanFault;
    const trim = CT_TRIM[i - 1] ?? 1;
    const unitKw = live ? ctKwEach * trim : 0;
    const [aFrac, bFrac] = CT_CELL_KW_FRAC[i - 1] ?? [0.48, 0.48];
    const cwstOff = CT_CELL_OFFSET.cwst[i - 1] ?? [0, 0];
    const cwrtOff = CT_CELL_OFFSET.cwrt[i - 1] ?? [0, 0];
    equipment[id] = {
      id,
      name: `CT-${String(i).padStart(2, '0')}`,
      category: 'cooling_tower',
      type: 'cooling_tower',
      status: fanFault ? 'alarm' : running ? 'running' : 'stopped',
      fanSpeedPercent: live ? round(internals.ctFanSpeed, 1) : 0,
      frequencyHz: live ? speedToHz(internals.ctFanSpeed) : 0,
      leavingTemp: round(internals.cwsActual, 2),
      powerKw: round(unitKw, 2),
      flowRate: running ? round(actualCwFlow / Math.max(runningCt, 1), 0) : 0,
      cells: {
        a: {
          kw: round(unitKw * aFrac, 2),
          cwst: live ? round(internals.cwsActual + cwstOff[0], 2) : CT_STAGNANT.cwst[0],
          cwrt: live ? round(internals.cwrActual + cwrtOff[0], 2) : CT_STAGNANT.cwrt[0],
        },
        b: {
          kw: round(unitKw * bFrac, 2),
          cwst: live ? round(internals.cwsActual + cwstOff[1], 2) : CT_STAGNANT.cwst[1],
          cwrt: live ? round(internals.cwrActual + cwrtOff[1], 2) : CT_STAGNANT.cwrt[1],
        },
      },
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

  // Totals use trim-weighted effective (fault-adjusted) sums so the plant KPI
  // always equals the sum of the equipment cards. Meter classes include the
  // standby draws / meter noise of stopped units (as the dataset's sums do).
  const chwpStandbyKw = CHWP_STANDBY_KW.reduce(
    (s, v, idx) => s + (!chwpRunSet.has(idx + 1) && trippedChwpIdx !== idx + 1 ? v : 0),
    0
  );
  const cwpStandbyKw = CWP_STANDBY_KW.reduce(
    (s, v, idx) => s + (!cwpRunSet.has(idx + 1) ? v : 0),
    0
  );
  const totalChKwMeter = totalChKw + chStandbyKw;
  const totalChwpKw = chwpKwEach * chwpTrimSum + chwpStandbyKw;
  const totalCwpKw = cwpKwEach * cwpTrimSum + cwpStandbyKw;
  const totalCtKw = ctKwEach * ctTrimSum;
  const totalKw = totalChKwMeter + totalChwpKw + totalCwpKw + totalCtKw;

  // Steady state: cooling delivered = building load, so plant COP and kW/RT are
  // consistent by construction (COP = 3.517 / kWRT).
  const coolingKw = rtToKw(buildingDemandRt);
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
    wetBulbSensors,
    condFlowM3h: round(actualCwFlow, 2),
  };

  const pumpCommandedOn: Record<string, boolean> = {};
  for (let i = 1; i <= CHWP_COUNT; i++) {
    pumpCommandedOn[`chwp-${i}`] = chwpRunSet.has(i);
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
    totalChKw: totalChKwMeter,
  });
  lastKpiSnapshot = kpiList;

  const calibration = assessCalibrationEnvelope(getControl, runningChCount);

  return {
    equipment,
    headers,
    kpis: kpiList,
    risers,
    dutyOrders: getPlantDutyOrders(),
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
      scenarioId: lastScenarioId ?? undefined,
      calibration,
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
  if (changed) lastScenarioId = null;
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
    .filter((ch): ch is NonNullable<typeof ch> => ch !== null);
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
  if (list.length) {
    lastControlId = list[list.length - 1].controlId;
    lastScenarioId = null;
  }
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
  precise?: boolean;
  duty?: Record<string, number[]>;
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
        // Dataset-replay scenarios (precise) keep measured values exact —
        // clamp to the operating range but skip the UI step-grid snapping.
        const fallback = typeof ctrl.value === 'number' ? ctrl.value : ctrl.min;
        const applied = scenario.precise
          ? round(clamp(Number.isFinite(value) ? value : fallback, ctrl.min, ctrl.max), 4)
          : constrainControlValue(ctrl, value);
        controls = controls.map((c) => (c.id === id ? { ...c, value: applied } : c));
      }
    }
    if (scenario.duty) {
      for (const cat of Object.keys(dutyOrders) as DutyCategory[]) {
        if (scenario.duty[cat]) dutyOrders[cat] = [...scenario.duty[cat]];
      }
    }
    snapPlantDynamics();
  }

  lastControlId = `scenario:${scenario.id}`;
  lastScenarioId = scenario.id;
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
    precise: scenario.precise,
    duty: scenario.duty,
    advanceSec: scenario.advanceSec,
  });
}

export function applyChillerScenarioPayload(payload: {
  id?: string;
  label?: string;
  reset?: boolean;
  controls?: Record<string, number>;
  precise?: boolean;
  duty?: Record<string, number[]>;
  advanceSec?: number;
}): PlantState {
  return applyChillerScenarioInternal({
    id: payload.id ?? 'chatbot-custom',
    label: payload.label ?? 'Custom scenario',
    reset: payload.reset,
    controls: payload.controls,
    precise: payload.precise,
    duty: payload.duty,
    advanceSec: payload.advanceSec,
  });
}

export function resetPlantControls(): void {
  controls = defaultControls();
  dutyOrders = {
    chiller: [...DUTY_DEFAULTS.chiller],
    chwp: [...DUTY_DEFAULTS.chwp],
    cwp: [...DUTY_DEFAULTS.cwp],
    ct: [...DUTY_DEFAULTS.ct],
  };
  lastCascadeTrigger = 'Plant reset to baseline setpoints';
  lastControlId = null;
  lastScenarioId = null;
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
