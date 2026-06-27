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
import { buildAhuCascadeTrace, buildAhuCascadeRows } from './ahuCascade.js';
import { getAhuScenarioById } from './ahuScenarios.js';
import {
  recommendForRaTempHigh,
  recommendForRaRhHigh,
  recommendForSatOffSp,
  recommendForChwSaturated,
  recommendForSaCfmHigh,
  recommendForSaCfmLow,
  recommendForStaticPressureOffSp,
  recommendForSaFanSaturation,
  recommendForFilterLoading,
  recommendForLowPressurization,
} from './ahuAlertRecommendations.js';

const SIM_DT_SEC = 2;

let controls: AhuControl[] = defaultControls();
let tick = 0;
let lagRatC = 25.1;
let lagRaRh = 74.4;
let lastTrigger = 'AHU01 initialized';
let lastControlId: string | null = null;
// Snapshot of the solved state captured just before the most recent operator
// "Apply" + the edits that drove it — persisted so the before→after cascade
// survives the live 2 s ticks until the next apply / reset / scenario.
let lastBeforeCtx: Record<string, number | string> | null = null;
let lastChanges: Array<{ label: string; oldValue: number; newValue: number; unit?: string }> | null = null;

function getControl(id: string): number {
  return controls.find((c) => c.id === id)?.value ?? 0;
}

/** Map a solved airside result + setpoints to the flat cascade context. */
function ahuCtxFrom(
  s: ReturnType<typeof solveAhu01Airside>,
  sp: { satSp: number; raTempSp: number; raRhSp: number; saCfmSp: number; raCfmSp: number }
): Record<string, number | string> {
  return {
    mode: s.mode,
    oatC: s.oatC,
    oaRhPct: s.oaRhPct,
    raTempSpC: sp.raTempSp,
    raRhSpPct: sp.raRhSp,
    ratC: s.ratC,
    raRhPct: s.raRhPct,
    matC: s.matC,
    chwValvePct: s.chwValvePct,
    hwValvePct: s.hwValvePct,
    satC: s.satC,
    satSpC: sp.satSp,
    saFanSpeedPct: s.saFanSpeedPct,
    raFanSpeedPct: s.raFanSpeedPct,
    saCfm: s.saCfm,
    raCfm: s.raCfm,
    saCfmSp: sp.saCfmSp,
    raCfmSp: sp.raCfmSp,
    staticPressurePa: s.staticPressurePa,
    coolingKw: s.coolingKw,
    fanPowerKw: s.fanPowerKw,
    oaFraction: s.oaFraction,
    oaDamperPct: s.oaDamperPct,
    raDamperPct: s.raDamperPct,
    filterDpPa: s.filterDpPa,
  };
}

/** Pure solve of the *current* controls (no tick/lag mutation) → cascade ctx. Used for the "before" snapshot. */
function solveAhuCtx(): Record<string, number | string> {
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
  const s = solveAhu01Airside({
    modeIndex, oatC: oat, oaRhPct: oarh, ratC: lagRatC, raRhPct: lagRaRh,
    satSpC: satSp, saCfmSp, raCfmSp, raTempSpC: raTempSp, raRhSpPct: raRhSp,
    spSpPa: spSp, chwEnterC: chwEnter, hwEnterC: hwEnter,
    filterLoadingPct: filterLoad, zoneLoadIdx: zoneLoad, saFanOn, raFanOn,
  });
  return ahuCtxFrom(s, { satSp, raTempSp, raRhSp, saCfmSp, raCfmSp });
}

function defaultControls(): AhuControl[] {
  return [
    { id: 'ahu-mode', controlType: 'mode', label: 'Operating Mode', value: 0, min: 0, max: 3, step: 1, unit: '', group: 'mode' },
    { id: 'ahu-sat-sp', controlType: 'satSetpoint', label: 'SAT Setpoint', value: 13.5, min: 10, max: 18, step: 0.5, unit: '°C', group: 'setpoints' },
    { id: 'ahu-ra-temp-sp', controlType: 'raTempSetpoint', label: 'RA Temp Setpoint', value: 25.0, min: 20, max: 28, step: 0.5, unit: '°C', group: 'setpoints' },
    { id: 'ahu-ra-rh-sp', controlType: 'raRhSetpoint', label: 'RA RH Setpoint', value: 75.0, min: 40, max: 80, step: 1, unit: '%', group: 'setpoints' },
    { id: 'ahu-sa-cfm-sp', controlType: 'saCfmSetpoint', label: 'SA Airflow Setpoint', value: 2555, min: 800, max: 3500, step: 50, unit: 'CFM', group: 'setpoints' },
    { id: 'ahu-ra-cfm-sp', controlType: 'raCfmSetpoint', label: 'RA Airflow Setpoint', value: 1235, min: 600, max: 2500, step: 50, unit: 'CFM', group: 'setpoints' },
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

  const targetRat = raTempSp + (zoneLoad - 1) * 3;
  const targetRh = raRhSp + (zoneLoad - 1) * 12;
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
  const satDev = Math.abs(s.satC - satSp);
  const spDev = Math.abs(s.staticPressurePa - spSp);
  const pressCfm = round(s.saCfm - s.raCfm, 0);
  const pressTarget = saCfmSp - raCfmSp;
  const filterDp = s.filterDpPa;
  const saFanSat = saFanOn && s.saFanSpeedPct >= 98 && spDev > spSp * 0.08;

  const alertCtx = {
    chwEnter,
    hwEnter,
    satSp,
    satC: s.satC,
    spSp,
    staticPressurePa: s.staticPressurePa,
    saCfmSp,
    raCfmSp,
    saCfm: s.saCfm,
    raCfm: s.raCfm,
    chwValvePct: s.chwValvePct,
    filterLoad,
    zoneLoad,
    mode: s.mode,
  };

  const alerts: PlantAlert[] = [];

  if (s.ratC > raTempSp + 1.5) {
    const rec = recommendForRaTempHigh(alertCtx);
    alerts.push({
      id: 'ahu-alert-ra-temp',
      severity: 'warning',
      message: `RA temperature high (${s.ratC}°C vs SP ${raTempSp}°C)`,
      assetId: 'ahu01-ra-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.raRhPct > raRhSp + 15) {
    const rec = recommendForRaRhHigh(alertCtx);
    alerts.push({
      id: 'ahu-alert-ra-rh',
      severity: 'warning',
      message: `RA humidity high (${s.raRhPct}% vs SP ${raRhSp}%) — dehumidification demand`,
      assetId: 'ahu01-chw-coil',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (satDev > 1.5 && s.mode !== 'heating') {
    const rec = recommendForSatOffSp(alertCtx);
    alerts.push({
      id: 'ahu-alert-sat',
      severity: 'warning',
      message: `SAT off setpoint (${s.satC}°C vs SP ${satSp}°C)`,
      assetId: 'ahu01-chw-coil',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.chwValvePct >= 95 && s.mode !== 'heating') {
    const rec = recommendForChwSaturated(alertCtx);
    alerts.push({
      id: 'ahu-alert-chw-sat',
      severity: 'warning',
      message: `CHW valve near limit (${s.chwValvePct}% open) — coil at capacity`,
      assetId: 'ahu01-chw-coil',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.saCfm > saCfmSp * 1.2) {
    const rec = recommendForSaCfmHigh(alertCtx);
    alerts.push({
      id: 'ahu-alert-sa-cfm-high',
      severity: 'warning',
      message: `SA airflow high (${s.saCfm} CFM vs SP ${saCfmSp} CFM)`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (filterLoad > 70 || filterDp > 200) {
    const rec = recommendForFilterLoading(alertCtx);
    alerts.push({
      id: 'ahu-alert-filter',
      severity: filterLoad > 80 ? 'critical' : 'warning',
      message: `Filter loading high (${filterLoad}%, ΔP ${filterDp} Pa) — airflow penalty`,
      assetId: 'ahu01-sa-eu13',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  } else if (saFanOn && s.saCfm < saCfmSp * 0.85) {
    const rec = recommendForSaCfmLow(alertCtx);
    alerts.push({
      id: 'ahu-alert-sa-cfm-low',
      severity: 'warning',
      message: `SA airflow low (${s.saCfm} CFM vs SP ${saCfmSp} CFM)`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (spDev > spSp * 0.12) {
    const rec = recommendForStaticPressureOffSp(alertCtx);
    alerts.push({
      id: 'ahu-alert-sp',
      severity: 'warning',
      message: `Static pressure off setpoint (${s.staticPressurePa} Pa vs SP ${spSp} Pa)`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (saFanSat) {
    const rec = recommendForSaFanSaturation(alertCtx);
    alerts.push({
      id: 'ahu-alert-sa-fan-sat',
      severity: 'warning',
      message: `SA fan at max speed (${s.saFanSpeedPct}%) with duct static low — G36 saturation`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (pressCfm < pressTarget * 0.5 && saFanOn && raFanOn) {
    const rec = recommendForLowPressurization(alertCtx);
    alerts.push({
      id: 'ahu-alert-pressurization',
      severity: 'warning',
      message: `Building pressurization low (Δ ${pressCfm} CFM vs target ${pressTarget} CFM)`,
      assetId: 'ahu01-sa-fan',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }

  const kpis: PlantKpi[] = [
    // ACT vs setpoint — Metasys PVT / on-prem operator priority
    { id: 'ahu-kpi-sat', name: 'SAT', value: s.satC, unit: '°C', category: 'comfort', status: satDev > 1.5 ? 'warning' : 'normal', target: satSp, trend: 'stable' },
    { id: 'ahu-kpi-ra-temp', name: 'RA TEMP', value: s.ratC, unit: '°C', category: 'comfort', status: s.ratC > raTempSp + 0.5 ? 'warning' : 'normal', target: raTempSp, trend: 'stable' },
    { id: 'ahu-kpi-ra-rh', name: 'RA RH', value: s.raRhPct, unit: '%', category: 'comfort', status: s.raRhPct > raRhSp + 5 ? 'warning' : 'normal', target: raRhSp, trend: 'stable' },
    { id: 'ahu-kpi-sa-cfm', name: 'SA CFM', value: s.saCfm, unit: 'CFM', category: 'operational', status: Math.abs(s.saCfm - saCfmSp) > saCfmSp * 0.15 ? 'warning' : 'normal', target: saCfmSp, trend: 'stable' },
    { id: 'ahu-kpi-ra-cfm', name: 'RA CFM', value: s.raCfm, unit: 'CFM', category: 'operational', status: Math.abs(s.raCfm - raCfmSp) > raCfmSp * 0.12 ? 'warning' : 'normal', target: raCfmSp, trend: 'stable' },
    { id: 'ahu-kpi-sp', name: 'Static Pressure', value: s.staticPressurePa, unit: 'Pa', category: 'operational', status: spDev > spSp * 0.12 ? 'warning' : 'normal', target: spSp, trend: 'stable' },
    // Airside diagnostics — ASHRAE G36 equipment detail
    { id: 'ahu-kpi-mat', name: 'MAT', value: s.matC, unit: '°C', category: 'operational', status: 'normal', target: 'f(OA, RA)', trend: 'stable' },
    { id: 'ahu-kpi-oat', name: 'OAT', value: s.oatC, unit: '°C', category: 'weather', status: 'normal', target: 'ambient', trend: 'stable' },
    { id: 'ahu-kpi-oarh', name: 'OA RH', value: s.oaRhPct, unit: '%', category: 'weather', status: 'normal', target: 'ambient', trend: 'stable' },
    { id: 'ahu-kpi-oa-frac', name: 'OA Fraction', value: round(s.oaFraction * 100, 0), unit: '%', category: 'operational', status: 'normal', target: 'mode', trend: 'stable' },
    { id: 'ahu-kpi-sa-fan-spd', name: 'SA Fan SPD', value: s.saFanSpeedPct, unit: '%', category: 'operational', status: saFanSat ? 'warning' : 'normal', target: 'VFD', trend: 'stable' },
    { id: 'ahu-kpi-ra-fan-spd', name: 'RA Fan SPD', value: s.raFanSpeedPct, unit: '%', category: 'operational', status: !raFanOn ? 'warning' : 'normal', target: 'VFD', trend: 'stable' },
    { id: 'ahu-kpi-filter-dp', name: 'Filter ΔP', value: filterDp, unit: 'Pa', category: 'operational', status: filterDp > 200 || filterLoad > 70 ? 'warning' : 'normal', target: '< 200', trend: 'stable' },
    // Energy & balance
    { id: 'ahu-kpi-chw', name: 'CHW Valve', value: s.chwValvePct, unit: '%', category: 'operational', status: s.chwValvePct > 95 ? 'warning' : 'normal', target: '< 95', trend: 'stable' },
    { id: 'ahu-kpi-hw', name: 'HW Valve', value: s.hwValvePct, unit: '%', category: 'operational', status: s.hwValvePct > 40 && s.chwValvePct > 50 ? 'warning' : 'normal', target: '< 40', trend: 'stable' },
    { id: 'ahu-kpi-cool', name: 'Cooling Duty', value: s.coolingKw, unit: 'kW', category: 'energy', status: 'normal', target: 18, trend: 'stable' },
    { id: 'ahu-kpi-fan', name: 'Fan Power', value: s.fanPowerKw, unit: 'kW', category: 'energy', status: s.fanPowerKw > 35 ? 'warning' : 'normal', target: 25, trend: 'stable' },
    { id: 'ahu-kpi-kw-cfm', name: 'Fan kW/CFM', value: s.kwPerCfm, unit: 'kW/CFM', category: 'energy', status: s.kwPerCfm > 0.008 ? 'warning' : 'normal', target: 0.007, trend: 'stable' },
    { id: 'ahu-kpi-press', name: 'Pressurization', value: pressCfm, unit: 'CFM', category: 'operational', status: pressCfm < pressTarget * 0.5 ? 'warning' : 'normal', target: pressTarget, trend: 'stable' },
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

  const afterCtx = {
    ...ahuCtxFrom(s, { satSp, raTempSp, raRhSp, saCfmSp, raCfmSp }),
    trigger: lastTrigger,
    alertCount: alerts.length,
  };
  const cascadeTrace = buildAhuCascadeTrace(afterCtx, lastBeforeCtx, lastChanges);
  const cascadeRows = buildAhuCascadeRows(afterCtx, lastBeforeCtx);

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
      cascadeRows,
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
  // Single immediate edit (chatbot path) — no before/after diff.
  lastBeforeCtx = null;
  lastChanges = null;
}

/**
 * Commit a batch of staged operator edits, then fast-forward virtual time.
 * Captures a "before" snapshot first so the cascade renders before → after for
 * every affected output until the next apply / reset / scenario.
 */
export function applyAhuChanges(
  changes: Array<{ controlId: string; label: string; oldValue: number; newValue: number; unit?: string }>,
  seconds = 60,
): AhuState {
  const list = changes ?? [];
  lastBeforeCtx = list.length ? solveAhuCtx() : null;
  lastChanges = list.length ? list.map((c) => ({ label: c.label, oldValue: c.oldValue, newValue: c.newValue, unit: c.unit })) : null;
  for (const ch of list) {
    if (controls.some((c) => c.id === ch.controlId)) {
      controls = controls.map((c) => (c.id === ch.controlId ? { ...c, value: ch.newValue } : c));
    }
  }
  if (list.length) lastControlId = list[list.length - 1].controlId;
  const steps = Math.max(1, Math.floor(seconds / SIM_DT_SEC));
  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();
  const verb = list.length === 1 ? 'change' : 'changes';
  lastTrigger = `Applied ${list.length} ${verb} — SA ${state.headers.saCfm} CFM · RA ${state.headers.ratC}°C/${state.headers.raRhPct}%RH (${steps * SIM_DT_SEC}s virtual)`;
  return { ...state, simulation: { ...state.simulation, lastTrigger, mode: 'fast_forward' } };
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
  lagRatC = raTempSp + (zoneLoad - 1) * 3;
  lagRaRh = raRhSp + (zoneLoad - 1) * 12;
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
    snapZoneLag();
  }
  lastControlId = `scenario:${scenario.id}`;
  lastBeforeCtx = null;
  lastChanges = null;
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

/** Apply scenario from chatbot JSON or ad-hoc payload. */
export function applyAhuScenarioPayload(payload: {
  id?: string;
  label?: string;
  description?: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): AhuState {
  return applyScenarioInternal({
    id: payload.id ?? 'chatbot-custom',
    label: payload.label ?? 'Custom scenario (chatbot)',
    reset: payload.reset,
    controls: payload.controls,
    advanceSec: payload.advanceSec,
  });
}

export function resetAhu(): void {
  controls = defaultControls();
  tick = 0;
  lagRatC = 25.1;
  lagRaRh = 74.4;
  lastControlId = null;
  lastTrigger = 'AHU01 reset to baseline';
  lastBeforeCtx = null;
  lastChanges = null;
}

export function getAhuControls(): AhuControl[] {
  return [...controls];
}
