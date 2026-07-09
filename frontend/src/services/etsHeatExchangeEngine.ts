/**
 * Energy Transfer Station (heat-exchange) simulation engine — Marina Bay Sands
 * station A-B03-01 (serves ASM). Deterministic, physics-based, offline.
 *
 * Causal chain each 2 s tick:
 *   operator inputs → building load (weather/occupancy) → secondary loop
 *   (CHWS/CHWR, ΔT, flow) → FLOW-VSD pump staging & speed (affinity) →
 *   plate-HX duty (effectiveness-NTU, approach) → primary DCS/DCR & flow →
 *   energy meter (ton/kW/kWh) → KPIs + alarms.
 *
 * All thermodynamics live in the shared, tested core: etsPhysics.js.
 * Formula sources: docs/physics-formulas-reference.md §2.7.
 */
import type { PlantAlert, PlantKpi } from '../types/plant';
import type {
  EtsControl,
  EtsEquipment,
  EtsHeaders,
  EtsHeatExchanger,
  EtsMeter,
  EtsPump,
  EtsState,
  EtsValve,
} from '../types/ets';
import { MBS, clamp, round, solveEtsThermoHydraulics } from './etsPhysics.js';
import { getEtsScenarioById } from './etsScenarios.js';
import { buildEtsCascadeTrace, buildEtsCascadeRows } from './etsCascade.js';
import {
  recommendForHxApproach,
  recommendForLowSecondaryDt,
  recommendForOverCapacity,
  recommendForHighPumpKwRt,
  recommendForHighLtBypass,
} from './etsAlertRecommendations.js';

const SIM_DT_SEC = 2;

let controls: EtsControl[] = defaultControls();
let tick = 0;
let lagLoadRt = 466;
let kwhCumulative = MBS.METER_BASELINE_KWH as number;
let lastTrigger = 'ETS A-B03-01 initialized (serves ASM)';
let lastControlId: string | null = null;
// Before-snapshot for the before→after domino cascade (persisted across live ticks).
let lastBeforeCtx: Record<string, number | string | boolean> | null = null;
let lastChanges: Array<{ label: string; oldValue: number; newValue: number; unit?: string }> | null = null;
// Headers (+ stage) snapshots for the before→after performance cards.
let lastMetricsSnapshot: Record<string, number> | null = null;
let lastBeforeMetrics: Record<string, number> | null = null;

function getControl(id: string): number {
  return controls.find((c) => c.id === id)?.value ?? 0;
}

/** Map a solved thermo-hydraulic result + control inputs to the flat cascade context. */
function etsCtxFrom(
  s: ReturnType<typeof solveEtsThermoHydraulics>,
  ex: { baseLoadRt: number; occupied: boolean; ambient: number; chwsSp: number; dpSp: number; chwrtSp: number; hxInService: number; targetLoadRt: number }
): Record<string, number | string | boolean> {
  return {
    baseLoadRt: ex.baseLoadRt,
    ambient: ex.ambient,
    occupied: ex.occupied,
    targetLoadRt: ex.targetLoadRt,
    demandRt: s.demandRt,
    coolingKw: s.coolingKw,
    chwsSp: ex.chwsSp,
    chwsC: s.chwsC,
    chwrC: s.chwrC,
    secDeltaT: s.secDeltaT,
    secFlowM3h: s.secFlowM3h,
    dpSp: ex.dpSp,
    headerDpKpa: s.headerDpKpa,
    pumpsRunning: s.pumpsRunning,
    pumpSpeedPct: s.pumpSpeedPct,
    pumpPowerKwTotal: s.pumpPowerKwTotal,
    pumpKwPerRt: s.pumpKwPerRt,
    hxInService: ex.hxInService,
    loadFrac: s.loadFrac,
    approachC: s.approachC,
    effectiveness: s.effectiveness,
    lmtdC: s.lmtdC,
    dcsSupplyC: s.dcsSupplyC,
    dcrC: s.dcrC,
    priDeltaT: s.priDeltaT,
    priFlowM3h: s.priFlowM3h,
    chwrtSp: ex.chwrtSp,
    ltBypassPct: s.ltBypassPct,
    ltBypassFlowM3h: s.ltBypassFlowM3h,
  };
}

/** Pure solve of the *current* controls (no lag/tick/meter mutation) → cascade ctx. */
function solveEtsCtx(): Record<string, number | string | boolean> {
  const baseLoadRt = getControl('ets-load');
  const occupied = getControl('ets-occupied') >= 1;
  const chwsSp = getControl('ets-chws-sp');
  const dpSp = getControl('ets-dp-sp');
  const chwrtSp = getControl('ets-chwrt-sp');
  const dcsTemp = getControl('ets-dcs-temp');
  const hxInService = Math.round(getControl('ets-hx-service'));
  const pumpMin = getControl('ets-pump-min');
  const pumpMax = getControl('ets-pump-max');
  const ambient = getControl('ets-ambient');
  const weatherFactor = 1 + (ambient - 32) * 0.012;
  const occFactor = occupied ? 1 : 0.55;
  const targetLoadRt = clamp(baseLoadRt * weatherFactor * occFactor, 80, 1150);
  const s = solveEtsThermoHydraulics({
    demandRt: lagLoadRt,
    dcsSupplyC: dcsTemp,
    chwsSpC: chwsSp,
    dpSpKpa: dpSp,
    chwrtSpC: chwrtSp,
    hxInService,
    pumpMinPct: pumpMin,
    pumpMaxPct: pumpMax,
  });
  return etsCtxFrom(s, { baseLoadRt, occupied, ambient, chwsSp, dpSp, chwrtSp, hxInService, targetLoadRt });
}

function defaultControls(): EtsControl[] {
  return [
    { id: 'ets-load', controlType: 'buildingLoad', label: 'Building Cooling Load', value: 466, min: 100, max: 1100, step: 5, unit: 'RT', group: 'load' },
    { id: 'ets-occupied', controlType: 'occupancy', label: 'Time Program', value: 1, min: 0, max: 1, step: 1, unit: '', group: 'load' },
    { id: 'ets-chws-sp', controlType: 'chwsSetpoint', label: 'CHWS Setpoint', value: 7.5, min: 6, max: 10, step: 0.1, unit: '°C', group: 'setpoints' },
    { id: 'ets-dp-sp', controlType: 'dpSetpoint', label: 'Header DP Setpoint', value: 100, min: 60, max: 160, step: 5, unit: 'kPa', group: 'setpoints' },
    { id: 'ets-chwrt-sp', controlType: 'chwrtSetpoint', label: 'LT Bypass CHWRT SP', value: 15.0, min: 12, max: 17, step: 0.5, unit: '°C', group: 'valves' },
    { id: 'ets-dcs-temp', controlType: 'dcsSupply', label: 'DCS Supply Temp', value: 6.0, min: 4.5, max: 8, step: 0.1, unit: '°C', group: 'primary' },
    { id: 'ets-hx-service', controlType: 'hxInService', label: 'Heat Exchangers In Service', value: 2, min: 1, max: 2, step: 1, unit: '', group: 'primary' },
    { id: 'ets-pump-min', controlType: 'pumpSpeedMin', label: 'Pump Speed Min', value: 25, min: 20, max: 50, step: 5, unit: '%', group: 'pumps' },
    { id: 'ets-pump-max', controlType: 'pumpSpeedMax', label: 'Pump Speed Max', value: 100, min: 70, max: 100, step: 5, unit: '%', group: 'pumps' },
    { id: 'ets-ambient', controlType: 'ambientTemperature', label: 'Outdoor Temperature', value: 35.4, min: 24, max: 40, step: 0.1, unit: '°C', group: 'weather' },
    { id: 'ets-humidity', controlType: 'humidity', label: 'Outdoor Humidity', value: 58.6, min: 40, max: 95, step: 1, unit: '%RH', group: 'weather' },
  ];
}

function statusFor(running: boolean, alarm = false): EtsPump['status'] {
  if (alarm) return 'alarm';
  return running ? 'running' : 'stopped';
}

function runStep(): EtsState {
  tick += 1;

  const baseLoadRt = getControl('ets-load');
  const occupied = getControl('ets-occupied') >= 1;
  const chwsSp = getControl('ets-chws-sp');
  const dpSp = getControl('ets-dp-sp');
  const chwrtSp = getControl('ets-chwrt-sp');
  const dcsTemp = getControl('ets-dcs-temp');
  const hxInService = Math.round(getControl('ets-hx-service'));
  const pumpMin = getControl('ets-pump-min');
  const pumpMax = getControl('ets-pump-max');
  const ambient = getControl('ets-ambient');
  const humidity = getControl('ets-humidity');

  // Weather & occupancy shape the effective building demand.
  const weatherFactor = 1 + (ambient - 32) * 0.012;
  const occFactor = occupied ? 1 : 0.55;
  const targetLoadRt = clamp(baseLoadRt * weatherFactor * occFactor, 80, 1150);

  // First-order lag for smooth, stable transients.
  lagLoadRt = lagLoadRt + (targetLoadRt - lagLoadRt) * 0.18;

  // Solve steady-state thermo-hydraulics from the tested physics core.
  const s = solveEtsThermoHydraulics({
    demandRt: lagLoadRt,
    dcsSupplyC: dcsTemp,
    chwsSpC: chwsSp,
    dpSpKpa: dpSp,
    chwrtSpC: chwrtSp,
    hxInService,
    pumpMinPct: pumpMin,
    pumpMaxPct: pumpMax,
  });

  // Accumulate cumulative thermal energy on the meter (kWh).
  kwhCumulative += (s.coolingKw * SIM_DT_SEC) / 3600;

  // Pressures: header DP (kPa) → bar across building loop, anchored to schematic.
  const supplyPressureBar = round(5.3 + (s.headerDpKpa - 100) / 100, 1);
  const returnPressureBar = round(supplyPressureBar - s.headerDpKpa / 100, 1);

  const headers: EtsHeaders = {
    dcsSupplyC: s.dcsSupplyC,
    dcrReturnC: s.dcrC,
    primaryDeltaT: s.priDeltaT,
    primaryFlowM3h: s.priFlowM3h,
    chwsC: s.chwsC,
    chwrC: s.chwrC,
    secondaryDeltaT: s.secDeltaT,
    secondaryFlowM3h: s.secFlowM3h,
    supplyPressureBar,
    returnPressureBar,
    headerDpKpa: s.headerDpKpa,
    ltBypassFlowM3h: s.ltBypassFlowM3h,
    approachC: s.approachC,
    effectiveness: s.effectiveness,
    buildingLoadRt: round(baseLoadRt, 0),
    coolingDemandRt: s.demandRt,
    coolingKw: s.coolingKw,
    capacityTons: s.capacityTons,
    loadPct: round(s.loadFrac * 100, 0),
    pumpPowerKw: s.pumpPowerKwTotal,
    pumpKwPerRt: s.pumpKwPerRt,
    ambientTempC: ambient,
    ambientRhPct: humidity,
  };

  // --- Heat exchangers (duty split in proportion to each unit's rating) -
  const ratings: number[] = MBS.HX_RATED_TONS;
  const inSvcRatingSum = ratings.slice(0, hxInService).reduce((a, b) => a + b, 0) || 1;
  const heatExchangers: EtsHeatExchanger[] = [1, 2].map((n) => {
    const inSvc = n <= hxInService;
    const ratedTons = ratings[n - 1] ?? 0;
    const dutyKw = inSvc ? (s.coolingKw * ratedTons) / inSvcRatingSum : 0;
    const alarm = inSvc && s.approachC > 3.2; // degraded transfer
    return {
      id: `hx-a-b03-0${n}`,
      name: `HX-A-B03-0${n}`,
      ratedTons,
      inService: inSvc,
      dutyKw: round(dutyKw, 0),
      approachC: inSvc ? s.approachC : 0,
      effectiveness: inSvc ? s.effectiveness : 0,
      ntu: inSvc ? s.ntu : 0,
      lmtdC: inSvc ? s.lmtdC : 0,
      valvePct: inSvc ? clamp(round(40 + s.loadFrac * 55, 0), 0, 100) : 0,
      status: statusFor(inSvc, alarm),
    };
  });

  // --- Secondary pumps (stage the running units) -----------------------
  // Lead/lag order P01 → P03 → P02, so 2-pump operation runs 01 + 03 with
  // 02 as the rotating standby (matches the MBS A-B03-01 schematic).
  const STAGE_ORDER = [1, 3, 2];
  const runningSet = new Set(STAGE_ORDER.slice(0, s.pumpsRunning));
  const flowPerPump = s.pumpsRunning > 0 ? s.secFlowM3h / s.pumpsRunning : 0;
  const pumps: EtsPump[] = [1, 2, 3].map((n) => {
    const running = runningSet.has(n);
    return {
      id: `chwp-a-b03-0${n}`,
      name: `CHWP-A-B03-0${n}`,
      running,
      speedPct: running ? s.pumpSpeedPct : 0,
      speedCmdPct: running ? s.pumpSpeedPct : 0,
      flowM3h: running ? round(flowPerPump, 1) : 0,
      powerKw: running ? s.pumpPowerEachKw : 0,
      status: statusFor(running),
    };
  });

  // --- Valves -----------------------------------------------------------
  const valves: EtsValve[] = [
    { id: 'lt-bypass', name: 'LT Bypass Valve', positionPct: s.ltBypassPct, cmdPct: round(s.ltBypassPct + 10, 1), status: 'running' },
    { id: 'minflow-bypass', name: 'Min Flow Bypass Valve', positionPct: s.loadFrac < 0.18 ? round((0.18 - s.loadFrac) * 200, 1) : 0, cmdPct: 0, status: 'running' },
    { id: 'hx-01-valve', name: 'HX-A-B03-01 Valve', positionPct: heatExchangers[0].valvePct, cmdPct: 100, status: heatExchangers[0].status === 'alarm' ? 'alarm' : 'running' },
    { id: 'hx-02-valve', name: 'HX-A-B03-02 Valve', positionPct: heatExchangers[1].valvePct, cmdPct: heatExchangers[1].inService ? 100 : 0, status: heatExchangers[1].inService ? 'running' : 'stopped' },
  ];

  const meter: EtsMeter = {
    kw: s.coolingKw,
    ton: s.demandRt,
    kwhCumulative: round(kwhCumulative, 0),
  };

  // --- KPIs (on-prem ETS — Jangsten et al. 2022 DC substation PI set) ----
  const returnApproachC = round(s.chwrC - s.dcrC, 2); // Dt2
  const hxCopDc = s.chwrC > 0 ? round(s.dcrC / s.chwrC, 2) : 0; // HXCOPDC
  const flowRatio = s.secFlowM3h > 0 ? round(s.priFlowM3h / s.secFlowM3h, 2) : 0;
  const totalInstalledRt = MBS.HX_RATED_TONS.reduce((a, b) => a + b, 0);
  const capacityUtilPct = round(s.loadFrac * 100, 0);

  const kpis: PlantKpi[] = [
    { id: 'ets-kpi-load', name: 'Cooling load', value: s.demandRt, unit: 'RT', category: 'operational', status: 'normal', target: baseLoadRt, trend: 'stable' },
    { id: 'ets-kpi-capacity', name: 'Capacity', value: capacityUtilPct, unit: '%', category: 'operational', status: s.loadFrac > 1 ? 'warning' : 'normal', target: round((MBS.REF_LOAD_RT / totalInstalledRt) * 100, 0), trend: 'stable' },
    { id: 'ets-kpi-kw', name: 'Thermal duty', value: s.coolingKw, unit: 'kW', category: 'energy', status: 'normal', target: 1638, trend: 'stable' },
    { id: 'ets-kpi-approach', name: 'Dt1 approach', value: s.approachC, unit: '°C', category: 'operational', status: s.approachC > 2.5 ? 'warning' : 'normal', target: 1.5, trend: 'stable' },
    { id: 'ets-kpi-return-approach', name: 'Dt2 approach', value: returnApproachC, unit: '°C', category: 'operational', status: returnApproachC > 2 ? 'warning' : 'normal', target: MBS.DESIGN_HOT_PINCH_C, trend: 'stable' },
    { id: 'ets-kpi-eff', name: 'Effectiveness ε', value: round(s.effectiveness * 100, 1), unit: '%', category: 'operational', status: s.effectiveness < 0.85 ? 'warning' : 'normal', target: 95, trend: 'stable' },
    { id: 'ets-kpi-hxcop', name: 'HXCOPDC', value: hxCopDc, unit: '', category: 'operational', status: hxCopDc > 0 && hxCopDc < 0.78 ? 'warning' : 'normal', target: 0.83, trend: 'stable' },
    { id: 'ets-kpi-chws', name: 'CHWS / CHWR', value: `${s.chwsC}/${s.chwrC}`, unit: '°C', category: 'comfort', status: 'normal', target: '7.5/15.1', trend: 'stable' },
    { id: 'ets-kpi-dcs', name: 'DCS / DCR', value: `${s.dcsSupplyC}/${s.dcrC}`, unit: '°C', category: 'comfort', status: 'normal', target: '6.0/14.8', trend: 'stable' },
    { id: 'ets-kpi-pri-dt', name: 'Primary ΔT', value: s.priDeltaT, unit: '°C', category: 'operational', status: s.priDeltaT < 7 ? 'warning' : 'normal', target: 9, trend: 'stable' },
    { id: 'ets-kpi-sec-dt', name: 'Secondary ΔT', value: s.secDeltaT, unit: '°C', category: 'operational', status: s.secDeltaT < 5 ? 'warning' : 'normal', target: 7.6, trend: 'stable' },
    { id: 'ets-kpi-pri-flow', name: 'Primary flow', value: s.priFlowM3h, unit: 'm³/h', category: 'operational', status: 'normal', target: 157.5, trend: 'stable' },
    { id: 'ets-kpi-sec-flow', name: 'Secondary flow', value: s.secFlowM3h, unit: 'm³/h', category: 'operational', status: 'normal', target: 185, trend: 'stable' },
    { id: 'ets-kpi-flow-ratio', name: 'Flow ratio', value: flowRatio, unit: '', category: 'operational', status: flowRatio > 1.1 || (flowRatio > 0 && flowRatio < 0.9) ? 'warning' : 'normal', target: 1.0, trend: 'stable' },
    { id: 'ets-kpi-lt-bypass', name: 'LT bypass', value: s.ltBypassPct, unit: '%', category: 'operational', status: s.ltBypassPct > 60 ? 'warning' : 'normal', target: 40, trend: 'stable' },
    { id: 'ets-kpi-lt-flow', name: 'LT bypass flow', value: s.ltBypassFlowM3h, unit: 'm³/h', category: 'operational', status: 'normal', target: 27, trend: 'stable' },
    { id: 'ets-kpi-dp', name: 'Header DP', value: s.headerDpKpa, unit: 'kPa', category: 'operational', status: 'normal', target: dpSp, trend: 'stable' },
    { id: 'ets-kpi-pumpkw', name: 'Pump power', value: s.pumpPowerKwTotal, unit: 'kW', category: 'energy', status: 'normal', target: 32, trend: 'stable' },
    { id: 'ets-kpi-pumpeff', name: 'Pump kW/RT', value: s.pumpKwPerRt, unit: 'kW/RT', category: 'energy', status: s.pumpKwPerRt > 0.12 ? 'warning' : 'normal', target: 0.07, trend: 'stable' },
    { id: 'ets-kpi-stage', name: 'Pumps online', value: `${s.pumpsRunning}/${MBS.PUMP_COUNT}`, unit: '', category: 'operational', status: 'normal', target: '2/3', trend: 'stable' },
  ];

  // --- Alerts -----------------------------------------------------------
  const alerts: PlantAlert[] = [];
  const ts = new Date().toISOString();
  const alertCtx = {
    baseLoadRt,
    occupied,
    chwsSp,
    dpSp,
    chwrtSp,
    dcsTemp,
    hxInService,
    pumpMax,
    capacityTons: s.capacityTons,
    chwrC: s.chwrC,
    secDeltaT: s.secDeltaT,
    ltBypassPct: s.ltBypassPct,
  };

  if (s.approachC > 3.2) {
    const rec = recommendForHxApproach(alertCtx);
    alerts.push({
      id: 'ets-alert-approach', severity: 'warning',
      message: `HX approach elevated (${s.approachC}°C) — transfer degraded (limit 3.2°C)`,
      assetId: 'hx-a-b03-01', resolved: false, acknowledged: false, timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.secDeltaT < 5) {
    const rec = recommendForLowSecondaryDt(alertCtx);
    alerts.push({
      id: 'ets-alert-lowdt', severity: 'warning',
      message: `Low secondary ΔT (${s.secDeltaT}°C) — possible low-ΔT syndrome (target ≥ 5°C)`,
      assetId: 'chwp-a-b03-01', resolved: false, acknowledged: false, timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.loadFrac > 1.0) {
    const rec = recommendForOverCapacity(alertCtx);
    alerts.push({
      id: 'ets-alert-capacity', severity: 'critical',
      message: `Load ${s.demandRt} RT exceeds installed HX capacity ${s.capacityTons} RT`,
      assetId: 'hx-a-b03-02', resolved: false, acknowledged: false, timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.pumpKwPerRt > 0.12) {
    const rec = recommendForHighPumpKwRt({ ...alertCtx, pumpMax });
    alerts.push({
      id: 'ets-alert-pump-eff', severity: 'warning',
      message: `Secondary pumping high (${s.pumpKwPerRt.toFixed(3)} kW/RT) — target ≤ 0.07 kW/RT`,
      assetId: 'chwp-a-b03-02', resolved: false, acknowledged: false, timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }
  if (s.ltBypassPct > 60) {
    const rec = recommendForHighLtBypass(alertCtx);
    alerts.push({
      id: 'ets-alert-lt-bypass', severity: 'warning',
      message: `LT bypass valve high (${s.ltBypassPct.toFixed(0)}%) — return mixing excessive`,
      assetId: 'lt-bypass', resolved: false, acknowledged: false, timestamp: ts,
      recommendedAction: rec.text,
      recommendedAdjustments: rec.adjustments,
    });
  }

  // --- Equipment status map --------------------------------------------
  const equipment: Record<string, EtsEquipment> = {};
  heatExchangers.forEach((hx) => {
    equipment[hx.id] = { id: hx.id, name: hx.name, type: 'heat_exchanger', category: 'Heat Exchangers', status: hx.status };
  });
  pumps.forEach((p) => {
    equipment[p.id] = { id: p.id, name: p.name, type: 'pump', category: 'Secondary CHW Pumps', status: p.status };
  });
  valves.forEach((v) => {
    equipment[v.id] = { id: v.id, name: v.name, type: 'valve', category: 'Valves', status: v.status };
  });
  equipment.asm = { id: 'asm', name: 'ASM Building Load', type: 'building', category: 'Building', status: 'running' };
  equipment['fetnk-a-04-01'] = { id: 'fetnk-a-04-01', name: 'FETnk-A-04-01', type: 'expansion_tank', category: 'Hydronic', status: 'running' };
  equipment['lt-bypass-flow'] = { id: 'lt-bypass-flow', name: 'LT Bypass Flow', type: 'flow_meter', category: 'Instrumentation', status: 'running' };
  equipment['flow-chwr'] = { id: 'flow-chwr', name: 'CHWR Flow', type: 'flow_meter', category: 'Instrumentation', status: 'running' };
  equipment['side-stream-vessel'] = { id: 'side-stream-vessel', name: 'Side-Stream Vessel', type: 'vessel', category: 'Side-Stream / CycSP', status: 'running' };
  [1, 2].forEach((n) => {
    const id = `cycsp-a-b03-0${n}`;
    equipment[id] = {
      id,
      name: `CycSP-A-B03-0${n}`,
      type: 'pump',
      category: 'Side-Stream / CycSP',
      status: n === 2 ? 'running' : 'stopped',
    };
  });
  equipment['meter-cws-a-b03-01'] = { id: 'meter-cws-a-b03-01', name: 'CWS-A-B03-01 Energy Meter', type: 'meter', category: 'Metering', status: 'running' };

  // --- Recommended actions (summary — mirrors active alert logic) -------
  const recommendedActions: string[] = [];
  for (const alert of alerts) {
    if (alert.recommendedAction) recommendedActions.push(alert.recommendedAction);
  }
  if (s.approachC > 2.5 && s.approachC <= 3.2) {
    const rec = recommendForHxApproach(alertCtx);
    recommendedActions.push(rec.text);
  }
  if (s.pumpKwPerRt > 0.1 && s.pumpKwPerRt <= 0.12) {
    const rec = recommendForHighPumpKwRt({ ...alertCtx, pumpMax });
    recommendedActions.push(rec.text);
  }
  if (chwsSp < 7) {
    recommendedActions.push(`Adjust: CHWS Setpoint → 7.5°C (now ${chwsSp}°C) — eases primary demand`);
  }
  if (!recommendedActions.length) {
    recommendedActions.push('ETS operating within design — approach, ΔT and pumping nominal');
  }

  const afterCtx = {
    ...etsCtxFrom(s, { baseLoadRt, occupied, ambient, chwsSp, dpSp, chwrtSp, hxInService, targetLoadRt }),
    trigger: lastTrigger,
    alertCount: alerts.length,
  };
  const cascadeTrace = buildEtsCascadeTrace(afterCtx, lastBeforeCtx, lastChanges);
  const cascadeRows = buildEtsCascadeRows(afterCtx, lastBeforeCtx);
  lastMetricsSnapshot = { ...headers, stage: s.pumpsRunning };

  return {
    station: 'A-B03-01',
    serves: 'ASM',
    headers,
    heatExchangers,
    pumps,
    valves,
    meter,
    controls: [...controls],
    kpis,
    alerts,
    equipment,
    simulation: {
      tick,
      simTimeSec: tick * SIM_DT_SEC,
      mode: 'live',
      stage: s.pumpsRunning,
      controlMode: 'FLOW-VSD',
      timeProgram: occupied ? 'Occupied' : 'Unoccupied',
      lastTrigger,
      lastControlId: lastControlId ?? undefined,
      cascadeTrace,
      cascadeRows,
      beforeHeaders: lastBeforeMetrics ?? undefined,
      lastOutput: {
        buildingLoadRt: s.demandRt,
        primaryDeltaT: s.priDeltaT,
        secondaryDeltaT: s.secDeltaT,
        approachC: s.approachC,
        effectiveness: s.effectiveness,
        pumpKwPerRt: s.pumpKwPerRt,
      },
    },
    recommendedActions,
    simulationTime: ts,
  };
}

export function stepEts(): EtsState {
  return runStep();
}

export function startEtsSimulator(onTick: (state: EtsState) => void): () => void {
  onTick(runStep());
  const id = setInterval(() => onTick(runStep()), 2000);
  return () => clearInterval(id);
}

export function updateEtsControl(controlId: string, value: number): void {
  const ctrl = controls.find((c) => c.id === controlId);
  const prev = ctrl?.value;
  controls = controls.map((c) => (c.id === controlId ? { ...c, value } : c));
  lastControlId = controlId;
  lastTrigger = `Operator set ${ctrl?.label || controlId}: ${prev} → ${value}${ctrl?.unit ? ` ${ctrl.unit}` : ''}`;
  lastBeforeCtx = null;
  lastBeforeMetrics = null;
  lastChanges = null;
}

/**
 * Commit a batch of staged operator edits, then fast-forward virtual time with a
 * before→after cascade. Mirrors applyAhuChanges / applyPlantChanges.
 */
export function applyEtsChanges(
  changes: Array<{ controlId: string; label: string; oldValue: number; newValue: number; unit?: string }>,
  seconds = 30,
): EtsState {
  const list = changes ?? [];
  lastBeforeCtx = list.length ? solveEtsCtx() : null;
  lastBeforeMetrics = list.length ? lastMetricsSnapshot : null;
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
  lastTrigger = `Applied ${list.length} ${verb} — ${state.headers.coolingDemandRt} RT · approach ${state.headers.approachC}°C · ${state.simulation.stage} pump(s) (${steps * SIM_DT_SEC}s virtual)`;
  return { ...state, simulation: { ...state.simulation, lastTrigger, mode: 'fast_forward' } };
}

export function advanceEts(steps = 15): EtsState {
  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();
  lastTrigger = `Simulation output — ${state.headers.coolingDemandRt} RT · approach ${state.headers.approachC}°C · ${state.simulation.stage} pump(s) (${steps * SIM_DT_SEC}s virtual)`;
  return { ...state, simulation: { ...state.simulation, lastTrigger, mode: 'fast_forward' } };
}

function snapLoadLag(): void {
  const baseLoadRt = getControl('ets-load');
  const occupied = getControl('ets-occupied') >= 1;
  const ambient = getControl('ets-ambient');
  const weatherFactor = 1 + (ambient - 32) * 0.012;
  const occFactor = occupied ? 1 : 0.55;
  lagLoadRt = clamp(baseLoadRt * weatherFactor * occFactor, 80, 1150);
}

/** Apply a preset scenario: set controls, snap load lag, then fast-forward virtual time. */
function applyEtsScenarioInternal(scenario: {
  id: string;
  label: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): EtsState {
  if (scenario.reset) {
    resetEts();
  } else if (scenario.controls) {
    for (const [id, value] of Object.entries(scenario.controls)) {
      if (controls.some((c) => c.id === id)) {
        controls = controls.map((c) => (c.id === id ? { ...c, value } : c));
      }
    }
  }

  lastControlId = `scenario:${scenario.id}`;
  lastBeforeCtx = null;
  lastBeforeMetrics = null;
  lastChanges = null;
  snapLoadLag();

  const advanceSec = scenario.advanceSec ?? 0;
  const steps = advanceSec > 0 ? Math.max(1, Math.floor(advanceSec / SIM_DT_SEC)) : 1;

  let state = runStep();
  for (let i = 1; i < steps; i++) state = runStep();

  lastTrigger = `Scenario «${scenario.label}» — ${state.headers.coolingDemandRt} RT · approach ${state.headers.approachC}°C · ${state.simulation.stage} pump(s)`;
  return {
    ...state,
    simulation: {
      ...state.simulation,
      mode: advanceSec > 0 ? 'fast_forward' : 'live',
      lastTrigger,
      scenarioId: scenario.id,
    },
  };
}

export function applyEtsScenario(scenarioId: string): EtsState {
  const scenario = getEtsScenarioById(scenarioId);
  if (!scenario) return stepEts();
  return applyEtsScenarioInternal({
    id: scenario.id,
    label: scenario.label,
    reset: scenario.reset,
    controls: scenario.controls,
    advanceSec: scenario.advanceSec,
  });
}

/** Apply scenario from chatbot JSON or ad-hoc payload. */
export function applyEtsScenarioPayload(payload: {
  id?: string;
  label?: string;
  reset?: boolean;
  controls?: Record<string, number>;
  advanceSec?: number;
}): EtsState {
  return applyEtsScenarioInternal({
    id: payload.id ?? 'chatbot-custom',
    label: payload.label ?? 'Custom scenario (chatbot)',
    reset: payload.reset,
    controls: payload.controls,
    advanceSec: payload.advanceSec,
  });
}

export function resetEts(): void {
  controls = defaultControls();
  tick = 0;
  lagLoadRt = 466;
  kwhCumulative = MBS.METER_BASELINE_KWH as number;
  lastControlId = null;
  lastTrigger = 'ETS A-B03-01 reset to baseline';
  lastBeforeCtx = null;
  lastBeforeMetrics = null;
  lastChanges = null;
}

export function getEtsControls(): EtsControl[] {
  return [...controls];
}
