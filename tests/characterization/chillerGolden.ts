/**
 * Characterization harness for the chiller Digital Twin + MPC.
 *
 * Captures the numeric output of the authoritative model at a fixed set of
 * operating points and compares it against a stored golden file. Its only job
 * is to prove that MOVING the model does not change what it computes — it makes
 * no claim about whether the numbers are correct, only that they are unchanged.
 *
 *   npx tsx tests/characterization/chillerGolden.ts --write    # capture golden
 *   npx tsx tests/characterization/chillerGolden.ts            # verify
 *
 * Only the physics import block below should ever need editing when the model
 * moves; everything else is path-independent on purpose.
 */

/* ── the one place that knows where the model lives ───────────────────────── */
import {
  evaluatePlant,
  predictPlant,
  stepPlantSimulation,
  resetPlantControls,
  updatePlantControl,
  applyChillerScenarioPayload,
  getPlantControls,
} from '../../backend/src/digital-twin/chiller/model/controlEngine';
import {
  stageChillers,
  stageChwp,
  stageCwp,
  stageCoolingTowers,
  chillerLoadPercent,
  chwpSpeedFromDpSetpoint,
} from '../../backend/src/digital-twin/chiller/model/stagingController';
import { ROW86_ROW_NUMBER, ROW86_EXPECTED } from '../../backend/src/digital-twin/chiller/fixtures/t1Row86';
import { T1_MV_ROWS, buildRowReplayPayload } from '../../backend/src/digital-twin/chiller/fixtures/t1MvRows';
import {
  designConstraints,
  simulateCandidate,
  readBaselineControl,
  readSimulationInput,
  defaultMpcOptimizer,
  DEFAULT_MAX_CYCLES,
} from '../../backend/src/mpc';
/* ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, 'chiller-golden.json');

/** Round hard so float noise across Node versions cannot fail the comparison,
 *  while staying far finer than any change a refactor could plausibly cause. */
const r = (v: unknown, d = 6): unknown =>
  typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)) : v;

function pick<T extends object>(o: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = r((o as Record<string, unknown>)[k]);
  return out;
}

/** KPI ids that carry physics. Excludes anything time- or tick-derived. */
const KPI_IDS = [
  'kpi-load', 'kpi-kw', 'kpi-eff', 'kpi-cop', 'kpi-ch-kwrt', 'kpi-ch-kw',
  'kpi-chwp-kw', 'kpi-cwp-kw', 'kpi-ct-kw', 'kpi-chw-dt', 'kpi-chws', 'kpi-chwr',
  'kpi-dp', 'kpi-bypass', 'kpi-cond-dt', 'kpi-cws', 'kpi-cwr', 'kpi-approach',
  'kpi-ct-fan', 'kpi-rch', 'kpi-rchwp', 'kpi-rcwp', 'kpi-rct', 'kpi-wetbulb',
];

function kpiSnapshot(state: { kpis: Array<{ id: string; value: unknown }> }) {
  const out: Record<string, unknown> = {};
  for (const id of KPI_IDS) out[id] = r(state.kpis.find((k) => k.id === id)?.value);
  return out;
}

function equipmentSnapshot(state: { equipment: Record<string, any> }) {
  // Power / loading only. Runtime hours accumulate with ticks and are excluded.
  const out: Record<string, unknown> = {};
  for (const [id, e] of Object.entries(state.equipment)) {
    out[id] = {
      status: e.status,
      powerKw: r(e.powerKw),
      loadPercent: r(e.loadPercent),
      speedPercent: r(e.speedPercent),
      fanSpeedPercent: r(e.fanSpeedPercent),
      flowRate: r(e.flowRate),
    };
  }
  return out;
}

function evalSnapshot(ev: ReturnType<typeof evaluatePlant>) {
  return {
    efficiency: pick(ev.efficiency, ['kwPerRt', 'cop']),
    power: pick(ev.power, ['totalKw', 'chillerKw', 'chwpKw', 'cwpKw', 'ctKw']),
    thermal: pick(ev.thermal, [
      'buildingLoadRt', 'deltaT', 'chws', 'chwr', 'cws', 'cwr',
      'condFlowM3h', 'towerApproach', 'wetBulb',
    ]),
    hydraulic: pick(ev.hydraulic, [
      'chwFlowM3h', 'cwFlowM3h', 'chwpSpeedPct', 'cwpSpeedPct',
      'ctFanSpeedPct', 'measuredDpPsi', 'chillerLoadPct',
    ]),
    staging: pick(ev.staging, ['chillers', 'chwp', 'cwp', 'ct']),
    calibration: ev.calibration.status,
    alarms: ev.alarms,
  };
}

async function build() {
  const out: Record<string, unknown> = {};

  /* ---- 1. evaluatePlant across the operating envelope ------------------- */
  const points: Array<[string, Record<string, number>]> = [
    ['default', {}],
    ['load-2400', { 'ctrl-building-load': 2400 }],
    ['load-3094', { 'ctrl-building-load': 3094 }],
    ['load-4200', { 'ctrl-building-load': 4200 }],
    ['chws-6.0', { 'ctrl-chws-sp': 6.0 }],
    ['chws-9.0', { 'ctrl-chws-sp': 9.0 }],
    ['cws-26', { 'ctrl-cws-sp': 26 }],
    ['cws-32', { 'ctrl-cws-sp': 32 }],
    ['dp-10', { 'ctrl-dp-sp': 10 }],
    ['dp-25', { 'ctrl-dp-sp': 25 }],
    ['chwp-45', { 'ctrl-pump-spd': 45 }],
    ['cwp-55', { 'ctrl-cwp-spd': 55 }],
    ['ctfan-60', { 'ctrl-ct-fan': 60 }],
    ['hot-humid', { 'ctrl-ambient-temp': 36, 'ctrl-humidity': 80 }],
    ['cool-dry', { 'ctrl-ambient-temp': 24, 'ctrl-humidity': 45 }],
    ['combo', {
      'ctrl-building-load': 3600, 'ctrl-chws-sp': 8.2, 'ctrl-cws-sp': 30,
      'ctrl-dp-sp': 18, 'ctrl-pump-spd': 62, 'ctrl-cwp-spd': 58, 'ctrl-ct-fan': 76,
    }],
  ];
  const evals: Record<string, unknown> = {};
  for (const [name, ov] of points) evals[name] = evalSnapshot(evaluatePlant(ov));
  out.evaluatePlant = evals;

  /* ---- 2. evaluatePlant with commanded staging -------------------------- */
  const staged: Record<string, unknown> = {};
  for (const n of [2, 3, 4, 5]) {
    staged[`chillers-${n}`] = evalSnapshot(
      evaluatePlant({ 'ctrl-building-load': 3094 }, { staging: { chiller: n } })
    );
  }
  out.evaluatePlantStaged = staged;

  /* ---- 3. runControlStep: boot state ------------------------------------ */
  resetPlantControls();
  const boot = stepPlantSimulation();
  out.bootKpis = kpiSnapshot(boot);
  out.bootEquipment = equipmentSnapshot(boot);
  out.bootHeaders = pick(boot.headers, [
    'chws', 'chwr', 'cws', 'cwr', 'buildingLoadRt', 'ambientTemp', 'humidityRh', 'condFlowM3h',
  ]);
  out.bootRisers = (boot.risers ?? []).map((x) => pick(x, [
    'loadSharePct', 'flowM3h', 'flowLs', 'chwSt', 'chwRt', 'rt',
  ]));
  out.bootControls = Object.fromEntries(
    getPlantControls().map((c) => [c.id, r(c.value)])
  );

  /* ---- 4. runControlStep after an operator edit ------------------------- */
  resetPlantControls();
  updatePlantControl('ctrl-chws-sp', 8.4);
  updatePlantControl('ctrl-building-load', 3500);
  out.afterEditKpis = kpiSnapshot(stepPlantSimulation());

  /* ---- 5. predictPlant horizon ------------------------------------------ */
  resetPlantControls();
  out.predict = predictPlant({ 'ctrl-chws-sp': 8.0 }, 5).map((s) => ({
    kwPerRt: r(s.kwPerRt), totalKw: r(s.totalKw),
    buildingLoadRt: r(s.buildingLoadRt), hasCritical: s.hasCritical,
  }));

  /* ---- 6. staging pure functions ---------------------------------------- */
  out.staging = {
    stageChillers: [900, 1500, 2400, 3094, 3600, 4800, 6000].map((v) => stageChillers(v, true)),
    stageChillersDisabled: stageChillers(3094, false),
    stageChwp: [200, 500, 900, 1360, 2000, 3000].map((v) => stageChwp(v)),
    stageCwp: [0, 1, 2, 3, 4, 5, 6, 7].map((v) => stageCwp(v)),
    stageCoolingTowers: [0, 1, 2, 3, 4, 5].map((v) => stageCoolingTowers(v)),
    chillerLoadPercent: [0, 300, 625, 1000, 1250, 1500].map((v) => r(chillerLoadPercent(v))),
    chwpSpeedFromDpSetpoint: [8, 10, 15, 20, 25, 30].map((v) => r(chwpSpeedFromDpSetpoint(v))),
  };

  /* ---- 7. dataset replay: row 86 and a sample of the M&V window --------- */
  const row86 = T1_MV_ROWS.find((x) => x.row === ROW86_ROW_NUMBER);
  if (row86) {
    resetPlantControls();
    const r86 = applyChillerScenarioPayload(buildRowReplayPayload(row86) as never);
    out.row86Kpis = kpiSnapshot(r86);
    out.row86Expected = Object.fromEntries(
      Object.entries(ROW86_EXPECTED).map(([k, v]) => [k, r(v)])
    );
  }

  const sampled = [0, 20, 40, 60, 80, 100, 120, 132].filter((i) => i < T1_MV_ROWS.length);
  out.mvRowReplay = sampled.map((i) => {
    const row = T1_MV_ROWS[i];
    resetPlantControls();
    const st = applyChillerScenarioPayload(buildRowReplayPayload(row) as never);
    const kw = st.kpis.find((k) => k.id === 'kpi-kw')?.value as number;
    const eff = st.kpis.find((k) => k.id === 'kpi-eff')?.value as number;
    return { row: row.row, datasetKw: r(row.kw), simKw: r(kw), simKwRt: r(eff) };
  });

  /* ---- 8. MPC: full deterministic optimisation -------------------------- */
  resetPlantControls();
  const plant = stepPlantSimulation();
  const input = readSimulationInput(plant);
  const baseControl = readBaselineControl(plant);
  const cfg = designConstraints();
  const baseResult = simulateCandidate(input, baseControl, cfg, { baseline: null });

  out.mpcInput = { input, baselineControl: baseControl };
  out.mpcBaselineResult = {
    chillerKw: r(baseResult.chillerKw), chwpKw: r(baseResult.chwpKw),
    cwpKw: r(baseResult.cwpKw), pumpKw: r(baseResult.pumpKw),
    towerKw: r(baseResult.towerKw), totalPlantKw: r(baseResult.totalPlantKw),
    plantKwPerRt: r(baseResult.plantKwPerRt), feasible: baseResult.feasible,
  };

  const mpc = await defaultMpcOptimizer.optimize({
    input, constraints: cfg, baselineControl: baseControl, baselineResult: baseResult,
    maxCycles: DEFAULT_MAX_CYCLES, dryBulbHintC: plant.headers.ambientTemp,
  });
  out.mpcResult = {
    solved: mpc.solved,
    evaluated: mpc.evaluatedCandidates,
    feasible: mpc.feasibleCandidates,
    rejected: mpc.rejectedCandidates,
    rejectionsByCode: mpc.rejectionsByCode,
    savingKw: r(mpc.savingKw),
    savingPct: r(mpc.savingPct),
    optimalControl: mpc.optimalControl && {
      chwstSetpointC: r(mpc.optimalControl.chwstSetpointC),
      dpSetpointPsi: r(mpc.optimalControl.dpSetpointPsi),
      runningChillers: mpc.optimalControl.runningChillers,
      chillerIds: mpc.optimalControl.chillerIds,
      chwpSpeedPct: r(mpc.optimalControl.chwpSpeedPct),
      cwpSpeedPct: r(mpc.optimalControl.cwpSpeedPct),
      ctFanSpeedPct: r(mpc.optimalControl.ctFanSpeedPct),
    },
    optimalResult: mpc.optimalResult && {
      chillerKw: r(mpc.optimalResult.chillerKw), pumpKw: r(mpc.optimalResult.pumpKw),
      towerKw: r(mpc.optimalResult.towerKw), totalPlantKw: r(mpc.optimalResult.totalPlantKw),
      plantKwPerRt: r(mpc.optimalResult.plantKwPerRt),
    },
    // The whole per-cycle trace, so a change in SEARCH ORDER is caught too, not
    // just a change in the winner.
    iterationDigest: mpc.iterations.map((it) =>
      `${it.cycle}:${r(it.result.totalPlantKw, 2)}:${it.feasible ? 1 : 0}:${it.accepted ? 1 : 0}`
    ),
  };

  /* ---- 9. constraint validation on a deliberately bad config ------------ */
  const tight = designConstraints();
  tight.tower.minApproachC = 9;
  const tightRes = simulateCandidate(input, baseControl, tight, { baseline: null });
  out.constraintCheck = {
    feasible: tightRes.feasible,
    codes: tightRes.violations.map((v) => v.code).sort(),
  };

  return out;
}

/* ---------------------------------------------------------------- compare */

function diff(a: unknown, b: unknown, path = ''): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return [`${path || '(root)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  const out: string[] = [];
  for (const k of keys) {
    out.push(...diff((a as never)[k], (b as never)[k], path ? `${path}.${k}` : k));
  }
  return out;
}

const actual = await build();

if (process.argv.includes('--write') || !existsSync(GOLDEN)) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify(actual, null, 2));
  console.log(`golden written: ${GOLDEN}`);
  console.log(`  ${Object.keys(actual).length} groups captured`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const deltas = diff(expected, actual);

if (deltas.length === 0) {
  console.log('PASS  chiller characterization — output identical to golden');
  console.log(`      ${Object.keys(actual).length} groups verified`);
  process.exit(0);
}

console.error(`FAIL  chiller characterization — ${deltas.length} value(s) changed:`);
for (const d of deltas.slice(0, 40)) console.error('  ' + d);
if (deltas.length > 40) console.error(`  … and ${deltas.length - 40} more`);
process.exit(1);
