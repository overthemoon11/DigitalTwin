/**
 * Plant-data tools.
 *
 * Every one of these is a projection of the Digital Twin's own state through
 * its public barrel. There is no physics here, no second copy of a KPI formula
 * and no plant value that was not produced by `stepPlantSimulation()` or by
 * scoring the live operating point with the MPC's own simulator.
 *
 * That constraint is what makes the assistant safe to point at a plant: if a
 * figure appears in an answer it appears in one of these payloads first, and if
 * a tool cannot get it, the field is `null` — never a plausible-looking
 * default. "I don't have that measurement" is a correct answer; a made-up
 * number is not.
 */
import {
  stepPlantSimulation,
  getPlantControls,
  CHILLER_CAPACITY_RT,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  CT_COUNT,
  CALIBRATION_BOUNDS,
  CHILLER_CONTROL_CONSTRAINTS,
} from '../../digital-twin/chiller/index';
import {
  designConstraints,
  readBaselineControl,
  readSimulationInput,
  simulateCandidate,
  VIOLATION_LABELS,
} from '../../mpc/index';
import { bmsAvailable, bmsDay, bmsDays } from '../../data/bmsLoader';
import type { PlantState } from '../../../../shared/types/plant';
import type { ToolDefinition } from '../types';
import { isNum, psiToKpa, round } from '../util';
import { getTrend, recordPlantSample, type TrendChannel } from '../trends';

/* ─────────────────────────────────────────────────────────────── helpers ── */

/** One tick of the live twin, with a trend sample taken on the way past. */
export function livePlant(): PlantState {
  const state = stepPlantSimulation();
  recordPlantSample(state);
  return state;
}

function kpi(state: PlantState, id: string): number | null {
  const v = state.kpis?.find((k) => k.id === id)?.value;
  return isNum(v) ? v : null;
}

function kpiRaw(state: PlantState, id: string) {
  return state.kpis?.find((k) => k.id === id) ?? null;
}

function meanWetBulb(state: PlantState): number | null {
  const s = state.headers?.wetBulbSensors;
  if (Array.isArray(s) && s.length) return round(s.reduce((a, b) => a + b, 0) / s.length, 2);
  return kpi(state, 'kpi-wetbulb');
}

function equipmentOf(state: PlantState, type: string) {
  return Object.values(state.equipment ?? {}).filter((e: any) => e?.type === type) as any[];
}

function activeAlarms(state: PlantState) {
  return (state.alerts ?? []).filter((a) => !a.resolved);
}

/**
 * Score the live operating point with the MPC's own simulator.
 *
 * This is how a "constraint status" is obtained without writing a second
 * constraint checker: the same `simulateCandidate` the optimiser scores its
 * candidates with is asked about the control state the plant is actually in.
 * The calibration verdict comes back with it for free, which is what lets the
 * assistant warn that a reading is outside the envelope the twin was fitted on.
 */
export function scoreLivePoint(state: PlantState) {
  const input = readSimulationInput(state);
  const control = readBaselineControl(state);
  const constraints = designConstraints();
  const result = simulateCandidate(input, control, constraints, {
    baseline: null,
    dryBulbHintC: state.headers?.ambientTemp ?? 31,
  });
  return { input, control, constraints, result };
}

/* ─────────────────────────────────────────────────────── getPlantState ──── */

/**
 * The single most important tool. One flat, named, unit-suffixed snapshot —
 * the shape the rest of the assistant reasons over.
 */
export function getPlantState() {
  const state = livePlant();
  const h = state.headers;
  const scored = scoreLivePoint(state);

  const chillers = equipmentOf(state, 'chiller');
  const running = chillers.filter((c) => c.status === 'running');
  const chwFlowLs = (state.risers ?? []).reduce((a, r) => a + (isNum(r.flowLs) ? r.flowLs : 0), 0);
  const dpPsi = kpi(state, 'kpi-dp');

  return {
    timestamp: state.simulationTime,
    /** Which world this came from — a physics twin, not a field device. */
    dataSource: state.simulation?.dataSource ?? 'physics-engine',
    mode: state.simulation?.mode ?? 'virtual-offline',
    scenarioId: state.simulation?.scenarioId ?? null,

    buildingLoadRt: round(h.buildingLoadRt, 0),
    wetBulbC: meanWetBulb(state),
    ambientTempC: round(h.ambientTemp, 1),
    humidityRh: round(h.humidityRh, 0),

    chwstC: round(h.chws, 2),
    chwrtC: round(h.chwr, 2),
    chwDeltaTC: round(h.chwr - h.chws, 2),
    chwFlowLs: round(chwFlowLs, 1),
    dpPsi,
    dpKpa: psiToKpa(dpPsi),

    cwsC: round(h.cws, 2),
    cwrC: round(h.cwr, 2),
    condDeltaTC: kpi(state, 'kpi-cond-dt'),
    towerApproachC: kpi(state, 'kpi-approach'),
    ctFanSpeedPct: kpi(state, 'kpi-ct-fan'),

    activeChillers: running.map((c) => c.name),
    runningChillers: running.length,
    runningChwp: kpi(state, 'kpi-rchwp'),
    runningCwp: kpi(state, 'kpi-rcwp'),
    runningTowers: kpi(state, 'kpi-rct'),
    chillerLoadPct: round(scored.result.chillerLoadPct, 1),

    chillerKw: kpi(state, 'kpi-ch-kw'),
    chwpKw: kpi(state, 'kpi-chwp-kw'),
    cwpKw: kpi(state, 'kpi-cwp-kw'),
    towerKw: kpi(state, 'kpi-ct-kw'),
    totalPlantKw: kpi(state, 'kpi-kw'),
    plantKwPerRt: kpi(state, 'kpi-eff'),
    chillerKwPerRt: kpi(state, 'kpi-ch-kwrt'),
    plantCop: kpi(state, 'kpi-cop'),

    chwpSpeedPct: round(scored.control.chwpSpeedPct, 1),
    cwpSpeedPct: round(scored.control.cwpSpeedPct, 1),

    alarms: activeAlarms(state).map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      assetId: a.assetId,
      acknowledged: a.acknowledged,
      recommendedAction: a.recommendedAction ?? null,
    })),

    constraintStatus: {
      feasible: scored.result.feasible,
      violations: scored.result.violations.map((v) => ({
        code: v.code,
        label: VIOLATION_LABELS[v.code] ?? v.code,
        message: v.message,
        actual: v.actual ?? null,
        limit: v.limit ?? null,
        unit: v.unit ?? null,
      })),
      maxChwrC: scored.constraints.system.maxChwrC,
      chwstRangeC: [scored.constraints.chiller.minChwstC, scored.constraints.chiller.maxChwstC],
      dpRangePsi: [scored.constraints.chwp.minDpPsi, scored.constraints.chwp.maxDpPsi],
    },

    calibration: {
      status: scored.result.calibration.status,
      reasons: scored.result.calibration.reasons,
      envelope: CALIBRATION_BOUNDS,
    },
  };
}

/* ───────────────────────────────────────────────────── getPlantSummary ──── */

/**
 * The old "Show me a summary" handler, refactored into a tool.
 *
 * The command is gone; the capability is not. Anything the router classifies as
 * a status question reaches this — "how is the plant", "is everything okay",
 * "what is happening now" all land in the same place.
 */
export function getPlantSummary() {
  const s = getPlantState();
  const state = stepPlantSimulation();
  return {
    timestamp: s.timestamp,
    headline: {
      buildingLoadRt: s.buildingLoadRt,
      totalPlantKw: s.totalPlantKw,
      plantKwPerRt: s.plantKwPerRt,
      plantCop: s.plantCop,
      activeAlarms: s.alarms.length,
    },
    chilledWater: {
      chwstC: s.chwstC,
      chwrtC: s.chwrtC,
      deltaTC: s.chwDeltaTC,
      flowLs: s.chwFlowLs,
      dpPsi: s.dpPsi,
      dpKpa: s.dpKpa,
    },
    condenser: {
      cwsC: s.cwsC,
      cwrC: s.cwrC,
      deltaTC: s.condDeltaTC,
      towerApproachC: s.towerApproachC,
      ctFanSpeedPct: s.ctFanSpeedPct,
    },
    weather: { ambientTempC: s.ambientTempC, humidityRh: s.humidityRh, wetBulbC: s.wetBulbC },
    staging: {
      chillers: s.runningChillers,
      chillerNames: s.activeChillers,
      chwp: s.runningChwp,
      cwp: s.runningCwp,
      towers: s.runningTowers,
      chillerLoadPct: s.chillerLoadPct,
    },
    power: {
      chillerKw: s.chillerKw,
      chwpKw: s.chwpKw,
      cwpKw: s.cwpKw,
      towerKw: s.towerKw,
      totalPlantKw: s.totalPlantKw,
    },
    alarms: s.alarms,
    lastChange: state.simulation?.lastTrigger ?? null,
    scenarioId: s.scenarioId,
    calibration: s.calibration,
  };
}

/* ────────────────────────────────────────────────── getPlantEfficiency ──── */

/**
 * Efficiency with its denominators shown.
 *
 * A bare kW/RT is not an answer to "is my plant efficient" — the useful part is
 * the split between the four consumers and how each compares to its own target,
 * because that is what names the next thing to look at.
 */
export function getPlantEfficiency() {
  const state = livePlant();
  const s = getPlantState();
  const total = s.totalPlantKw ?? 0;
  const share = (kw: number | null) =>
    isNum(kw) && total > 0 ? round((kw / total) * 100, 1) : null;

  const effKpi = kpiRaw(state, 'kpi-eff');
  const copKpi = kpiRaw(state, 'kpi-cop');
  const chEffKpi = kpiRaw(state, 'kpi-ch-kwrt');

  return {
    timestamp: s.timestamp,
    plantKwPerRt: s.plantKwPerRt,
    plantKwPerRtTarget: effKpi?.target ?? null,
    plantKwPerRtStatus: effKpi?.status ?? null,
    plantCop: s.plantCop,
    plantCopTarget: copKpi?.target ?? null,
    chillerKwPerRt: s.chillerKwPerRt,
    chillerKwPerRtTarget: chEffKpi?.target ?? null,
    buildingLoadRt: s.buildingLoadRt,
    breakdown: [
      { component: 'Chillers', kw: s.chillerKw, sharePct: share(s.chillerKw), kwPerRt: s.chillerKwPerRt },
      { component: 'CHW pumps', kw: s.chwpKw, sharePct: share(s.chwpKw), kwPerRt: isNum(s.chwpKw) && s.buildingLoadRt ? round(s.chwpKw / s.buildingLoadRt, 3) : null },
      { component: 'CW pumps', kw: s.cwpKw, sharePct: share(s.cwpKw), kwPerRt: isNum(s.cwpKw) && s.buildingLoadRt ? round(s.cwpKw / s.buildingLoadRt, 3) : null },
      { component: 'Cooling towers', kw: s.towerKw, sharePct: share(s.towerKw), kwPerRt: isNum(s.towerKw) && s.buildingLoadRt ? round(s.towerKw / s.buildingLoadRt, 3) : null },
    ],
    conditions: {
      wetBulbC: s.wetBulbC,
      ambientTempC: s.ambientTempC,
      chwstC: s.chwstC,
      chwrtC: s.chwrtC,
      chwDeltaTC: s.chwDeltaTC,
      towerApproachC: s.towerApproachC,
      chillerLoadPct: s.chillerLoadPct,
    },
    calibration: s.calibration,
  };
}

/* ─────────────────────────────────────────────────── equipment status ──── */

function pumpRow(p: any) {
  return {
    id: p.id,
    name: p.name,
    loop: p.loop,
    status: p.status,
    powerKw: round(p.powerKw, 2),
    speedPct: round(p.speedPercent, 1),
    frequencyHz: round(p.frequencyHz, 1),
    flowLs: round(p.flowRate, 1),
    runtimeHours: round(p.runtimeHours, 0),
  };
}

export function getChillerStatus(args: { chillerId?: string } = {}) {
  const state = livePlant();
  const wanted = args.chillerId?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = equipmentOf(state, 'chiller')
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      loadPct: round(c.loadPercent, 1),
      powerKw: round(c.powerKw, 1),
      cop: round(c.cop, 2),
      kwPerRt: isNum(c.cop) && c.cop > 0 ? round(3.51685 / c.cop, 3) : null,
      supplyTempC: round(c.supplyTemp, 2),
      returnTempC: round(c.returnTemp, 2),
      cwSupplyTempC: round(c.cwSupplyTemp, 2),
      cwReturnTempC: round(c.cwReturnTemp, 2),
      chwFlowLs: round(c.flowRate, 1),
      condFlowLs: round(c.condFlowRate, 1),
      cp1Kw: round(c.cp1Kw, 1),
      cp2Kw: round(c.cp2Kw, 1),
      runtimeHours: round(c.runtimeHours, 0),
    }))
    .filter((c) => !wanted || c.id.replace(/[^a-z0-9]/g, '') === wanted || c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted);

  const running = rows.filter((c) => c.status === 'running');
  // "Which chiller is inefficient" is answerable only among running machines —
  // a stopped chiller has a COP of 0 and would always win a naive sort.
  const worst = running.length
    ? [...running].sort((a, b) => (b.kwPerRt ?? 0) - (a.kwPerRt ?? 0))[0]
    : null;
  const lightest = running.length
    ? [...running].sort((a, b) => (a.loadPct ?? 0) - (b.loadPct ?? 0))[0]
    : null;

  return {
    timestamp: state.simulationTime,
    ratedCapacityRtEach: CHILLER_CAPACITY_RT,
    installed: CHILLER_COUNT,
    running: running.length,
    dutyOrder: state.dutyOrders?.chiller ?? null,
    chillers: rows,
    leastEfficientRunning: worst ? { name: worst.name, kwPerRt: worst.kwPerRt, loadPct: worst.loadPct } : null,
    lightestLoadedRunning: lightest ? { name: lightest.name, loadPct: lightest.loadPct, powerKw: lightest.powerKw } : null,
  };
}

export function getPumpStatus(args: { loop?: string } = {}) {
  const state = livePlant();
  const all = equipmentOf(state, 'pump').map(pumpRow);
  const loop = args.loop;
  const chwp = all.filter((p) => p.loop === 'chilled');
  const cwp = all.filter((p) => p.loop === 'condenser');
  const makeup = all.filter((p) => p.loop === 'makeup');
  const scored = scoreLivePoint(state);

  return {
    timestamp: state.simulationTime,
    installed: { chwp: CHWP_COUNT, cwp: CWP_COUNT },
    commandedSpeedPct: {
      chwp: round(scored.control.chwpSpeedPct, 1),
      cwp: round(scored.control.cwpSpeedPct, 1),
    },
    dpSetpointPsi: round(scored.control.dpSetpointPsi, 1),
    dpSetpointKpa: psiToKpa(scored.control.dpSetpointPsi),
    totals: {
      chwpKw: kpi(state, 'kpi-chwp-kw'),
      cwpKw: kpi(state, 'kpi-cwp-kw'),
      chwFlowLs: round(scored.result.chwFlowLs, 1),
      cwFlowLs: round(scored.result.cwFlowLs, 1),
    },
    chwp: !loop || loop === 'chilled' ? chwp : [],
    cwp: !loop || loop === 'condenser' ? cwp : [],
    makeup: !loop || loop === 'makeup' ? makeup : [],
  };
}

export function getCoolingTowerStatus() {
  const state = livePlant();
  const towers = equipmentOf(state, 'cooling_tower').map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    fanSpeedPct: round(t.fanSpeedPercent, 1),
    frequencyHz: round(t.frequencyHz, 1),
    powerKw: round(t.powerKw, 2),
    leavingTempC: round(t.leavingTemp, 2),
    flowLs: round(t.flowRate, 1),
    cells: t.cells ?? null,
    runtimeHours: round(t.runtimeHours, 0),
  }));
  return {
    timestamp: state.simulationTime,
    installed: CT_COUNT,
    running: towers.filter((t) => t.status === 'running').length,
    towers,
    approachC: kpi(state, 'kpi-approach'),
    wetBulbC: meanWetBulb(state),
    cwsC: round(state.headers.cws, 2),
    cwrC: round(state.headers.cwr, 2),
    totalTowerKw: kpi(state, 'kpi-ct-kw'),
  };
}

/** Everything at once, for "how is the equipment doing". */
export function getEquipmentStatus(args: { equipmentId?: string } = {}) {
  const state = livePlant();
  if (args.equipmentId) {
    const key = args.equipmentId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.values(state.equipment ?? {}).find((e: any) => {
      const id = String(e.id).toLowerCase().replace(/[^a-z0-9]/g, '');
      const name = String(e.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      return id === key || name === key;
    });
    if (!found) {
      return { timestamp: state.simulationTime, found: false, equipmentId: args.equipmentId, equipment: null };
    }
    return { timestamp: state.simulationTime, found: true, equipmentId: args.equipmentId, equipment: found };
  }
  return {
    timestamp: state.simulationTime,
    chillers: getChillerStatus(),
    pumps: getPumpStatus(),
    towers: getCoolingTowerStatus(),
  };
}

/* ────────────────────────────────────────────────────── getActiveAlarms ── */

export function getActiveAlarms() {
  const state = livePlant();
  const alarms = activeAlarms(state);
  return {
    timestamp: state.simulationTime,
    count: alarms.length,
    alarms: alarms.map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      assetId: a.assetId,
      acknowledged: a.acknowledged,
      timestamp: a.timestamp,
      recommendedAction: a.recommendedAction ?? null,
      recommendedAdjustments: a.recommendedAdjustments ?? [],
    })),
    /** Constraint violations are not alarms, but an operator asking "is
     *  anything wrong" means both. */
    constraintViolations: getPlantState().constraintStatus.violations,
  };
}

/* ─────────────────────────────────────────────────────── getPlantTrends ── */

const TREND_CHANNELS: TrendChannel[] = [
  'buildingLoadRt', 'chwstC', 'chwrtC', 'chwDeltaT', 'cwsC', 'cwrC', 'wetBulbC',
  'ambientTempC', 'totalPlantKw', 'chillerKw', 'chwpKw', 'cwpKw', 'towerKw',
  'plantKwPerRt', 'cop', 'dpPsi', 'ctFanPct', 'runningChillers',
];

/**
 * Recent movement, from the live twin's own rolling buffer or from measured
 * BMS history — and always labelled which.
 */
export function getPlantTrends(
  args: { channels?: string[]; minutes?: number; source?: string; day?: string } = {}
) {
  const source = args.source === 'bms' ? 'bms' : 'twin';

  if (source === 'bms') {
    if (!bmsAvailable()) {
      return {
        source: 'bms',
        available: false,
        reason: 'The measured BMS artifact is not present on this machine.',
        days: [],
        series: [],
      };
    }
    const days = bmsDays();
    const day = args.day && days.includes(args.day) ? args.day : days[days.length - 1];
    const records = bmsDay(day);
    const pick = (fn: (r: any) => number | null) =>
      records.map((r) => fn(r)).filter((v): v is number => isNum(v));
    const stat = (values: number[]) =>
      values.length
        ? { samples: values.length, min: round(Math.min(...values), 2), max: round(Math.max(...values), 2), mean: round(values.reduce((a, b) => a + b, 0) / values.length, 2) }
        : { samples: 0, min: null, max: null, mean: null };
    return {
      source: 'bms',
      available: true,
      day,
      days,
      stepMinutes: records[0]?.minutes ?? 15,
      series: [
        { channel: 'loadRt', ...stat(pick((r) => r.loadRt)) },
        { channel: 'chwsC', ...stat(pick((r) => r.chwsC)) },
        { channel: 'chwrC', ...stat(pick((r) => r.chwrC)) },
        { channel: 'wetBulbC', ...stat(pick((r) => r.wetBulbC)) },
        { channel: 'totalPlantKw', ...stat(pick((r) => r.totalPlantKw)) },
        { channel: 'plantKwPerRt', ...stat(pick((r) => r.plantKwPerRt)) },
      ],
    };
  }

  // Sample now so a first call is never completely empty.
  livePlant();
  const requested = (args.channels ?? []).filter((c): c is TrendChannel =>
    (TREND_CHANNELS as string[]).includes(c)
  );
  const channels = requested.length ? requested : TREND_CHANNELS;
  const window = getTrend(channels, args.minutes ?? 15);
  return {
    source: 'twin',
    available: window.samples > 0,
    note:
      window.coverage === 'none'
        ? 'No trend history has accumulated yet in this session — the twin buffer starts empty.'
        : window.coverage === 'thin'
          ? `Only ${window.samples} samples of history so far; read the direction with care.`
          : null,
    ...window,
  };
}

/* ──────────────────────────────────────────────── getCurrentConstraints ── */

/**
 * What the plant is allowed to do, and which limits are biting right now.
 *
 * Both halves matter: the configured envelope is what the optimiser searches
 * inside, and the binding set is why it stopped where it did.
 */
export function getCurrentConstraints() {
  const state = livePlant();
  const scored = scoreLivePoint(state);
  const c = scored.constraints;
  return {
    timestamp: state.simulationTime,
    chilledWater: {
      chwstMinC: c.chiller.minChwstC,
      chwstMaxC: c.chiller.maxChwstC,
      maxChwrC: c.system.maxChwrC,
      dpMinPsi: c.chwp.minDpPsi,
      dpMaxPsi: c.chwp.maxDpPsi,
      dpMinKpa: psiToKpa(c.chwp.minDpPsi),
      dpMaxKpa: psiToKpa(c.chwp.maxDpPsi),
      maxHeaderFlowLs: c.system.maxChwHeaderFlowLs,
      chwpSpeedPct: [c.chwp.minSpeedPct, c.chwp.maxSpeedPct],
    },
    condenser: {
      cwpSpeedPct: [c.cwp.minSpeedPct, c.cwp.maxSpeedPct],
      maxHeaderFlowLs: c.system.maxCwHeaderFlowLs,
      towerFanPct: [c.tower.minFanSpeedPct, c.tower.maxFanSpeedPct],
      minApproachC: c.tower.minApproachC,
      maxCwstC: c.tower.maxCwstC,
    },
    staging: {
      minRunningChillers: c.system.minRunningChillers,
      maxRunningChillers: c.system.maxRunningChillers,
      requiredStandbyChillers: c.system.requiredStandbyChillers,
      minRuntimeMin: c.system.minChillerRuntimeMin,
      minOffTimeMin: c.system.minChillerOffTimeMin,
      unitsAvailable: c.chiller.units.filter((u) => u.available).map((u) => u.name),
      unitLoadPct: [c.chiller.units[0]?.minLoadPct ?? null, c.chiller.units[0]?.maxLoadPct ?? null],
    },
    moveLimitsPerCycle: {
      chwstC: c.system.maxChwstChangePerCycleC,
      dpPsi: c.system.maxDpChangePerCyclePsi,
      cwpSpeedPct: c.system.maxCwpSpeedChangePerCyclePct,
      ctFanSpeedPct: c.system.maxCtFanSpeedChangePerCyclePct,
    },
    plantDemandCapKw: c.system.maxPlantKw || null,
    /** Operator-facing slider bounds, which are a different thing from the
     *  optimiser's constraint set and are often what a question means. */
    operatorControlBounds: CHILLER_CONTROL_CONSTRAINTS,
    calibratedEnvelope: CALIBRATION_BOUNDS,
    bindingNow: scored.result.violations.map((v) => ({
      code: v.code,
      label: VIOLATION_LABELS[v.code] ?? v.code,
      message: v.message,
    })),
    feasibleNow: scored.result.feasible,
  };
}

/* ──────────────────────────────────────────────────── control inventory ── */

/** The operator-adjustable controls and their live values. Used by the
 *  control-change proposal path so a "set X" never guesses an id. */
export function getPlantControlsTool() {
  const controls = getPlantControls();
  return {
    controls: controls
      .filter((c) => typeof c.value === 'number')
      .map((c) => ({
        id: c.id,
        controlType: c.controlType,
        label: c.label,
        value: round(c.value, 2),
        min: c.min,
        max: c.max,
        step: c.step,
        unit: c.unit,
      })),
  };
}

/* ─────────────────────────────────────────────────────────── definitions ── */

export const PLANT_TOOLS: ToolDefinition[] = [
  {
    name: 'getPlantState',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description:
      'Current operating point of the chiller plant: load, wet bulb, CHWST/CHWRT, flow, DP, staging, per-component kW, kW/RT, alarms, binding constraints, calibration status.',
    args: {},
    costMs: 10,
    run: () => getPlantState(),
  },
  {
    name: 'getPlantSummary',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Operator status overview: headline KPIs, chilled water, condenser, weather, staging, power split, alarms.',
    args: {},
    costMs: 10,
    run: () => getPlantSummary(),
  },
  {
    name: 'getPlantEfficiency',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Plant kW/RT and COP against target, with the kW split across chillers, CHW pumps, CW pumps and towers.',
    args: {},
    costMs: 10,
    run: () => getPlantEfficiency(),
  },
  {
    name: 'getEquipmentStatus',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Status of all equipment, or of one machine when `equipmentId` is given (e.g. ch-3, chwp-2, ct-1).',
    args: {
      equipmentId: { type: 'string', description: 'Equipment id or name, e.g. "CH-3"', maxLength: 40 },
    },
    costMs: 15,
    run: (a) => getEquipmentStatus(a as any),
  },
  {
    name: 'getChillerStatus',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Per-chiller load, power, COP, kW/RT and temperatures, plus which running machine is least efficient and which is lightest loaded.',
    args: {
      chillerId: { type: 'string', description: 'Optional single chiller, e.g. "CH-3"', maxLength: 20 },
    },
    costMs: 10,
    run: (a) => getChillerStatus(a as any),
  },
  {
    name: 'getPumpStatus',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'CHW and CW pump status, commanded speeds, DP setpoint and flows.',
    args: {
      loop: { type: 'string', enum: ['chilled', 'condenser', 'makeup'], description: 'Restrict to one loop' },
    },
    costMs: 10,
    run: (a) => getPumpStatus(a as any),
  },
  {
    name: 'getCoolingTowerStatus',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Cooling tower fan speeds, power, leaving water temperature, approach and wet bulb.',
    args: {},
    costMs: 10,
    run: () => getCoolingTowerStatus(),
  },
  {
    name: 'getActiveAlarms',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Unresolved plant alarms with severity and recommended action, plus any binding constraint violations.',
    args: {},
    costMs: 10,
    run: () => getActiveAlarms(),
  },
  {
    name: 'getPlantTrends',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description:
      'Recent movement of plant channels. source="twin" reads this session\'s rolling buffer; source="bms" reads measured T1 history for one day.',
    args: {
      channels: { type: 'string[]', description: 'Channel names, e.g. chwrtC, totalPlantKw' },
      minutes: { type: 'number', min: 1, max: 120, default: 15, description: 'Window for the twin buffer' },
      source: { type: 'string', enum: ['twin', 'bms'], default: 'twin', description: 'Twin session buffer or measured BMS history' },
      day: { type: 'string', maxLength: 10, description: 'BMS day, YYYY-MM-DD' },
    },
    costMs: 30,
    run: (a) => getPlantTrends(a as any),
  },
  {
    name: 'getCurrentConstraints',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'The configured operating envelope (CHWST, DP, flows, staging, move limits) and which limits are binding right now.',
    args: {},
    costMs: 10,
    run: () => getCurrentConstraints(),
  },
  {
    name: 'getPlantControls',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Operator-adjustable control points with their live values and allowed ranges.',
    args: {},
    costMs: 5,
    run: () => getPlantControlsTool(),
  },
];
