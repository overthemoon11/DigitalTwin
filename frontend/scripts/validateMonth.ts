/**
 * Month-wide replay: feed every usable minute of the Dec-2025 trend into the
 * REAL physics engine and score the simulated plant kW against the measured
 * meters. Nothing is re-implemented here — the same applyChillerScenarioPayload
 * the app calls does the work, so this measures what actually ships.
 *
 *   npx tsx frontend/scripts/validateMonth.ts [--folds] [--limit N]
 *
 * Inputs per row (from the generated fixture): measured load, CHWS header temp,
 * achieved CWS, implied CW ΔT setpoint, riser load shares, and the units that
 * were actually running. Everything else — chiller kW, pump kW, tower kW, loop
 * ΔT, COP — is computed by the physics.
 *
 * Regenerate the fixture with:
 *   python frontend/scripts/calibrateFromDataset.py
 */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyChillerScenarioPayload } from '../src/services/chiller/controlEngine';
import { buildRowReplayPayload, type T1MvRow } from '../src/services/chiller/t1MvRows';
import { CALIBRATION_FIT } from '../src/services/chiller/t1MonthCalibration';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 't1-month-validation.json.gz');

interface Fixture {
  fields: string[];
  rowCount: number;
  rows: number[][];
}

const args = process.argv.slice(2);
const wantFolds = args.includes('--folds');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

let fixture: Fixture;
try {
  fixture = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString());
} catch {
  console.error(
    `Missing or unreadable ${FIXTURE}\n` +
      'Generate it with:  python frontend/scripts/calibrateFromDataset.py',
  );
  process.exit(1);
}

/**
 * Whether the observed running COUNTS are fed to the engine. Staging is a BMS
 * decision, so when replaying history it is an input like any other setpoint —
 * this isolates the POWER model from the staging heuristics. Pass --stage-model
 * to let the twin choose its own counts and score the heuristics as well.
 */
const feedStaging = !args.includes('--stage-model');

interface Scored {
  day: number;
  kwPct: number;
  dtErr: number;
  runningCh: number;
  parts: Record<string, { sim: number; meas: number }>;
}

const scored: Scored[] = [];
const rows = fixture.rows.slice(0, Number.isFinite(limit) ? limit : undefined);

for (const r of rows) {
  const [rt, chwsSp, cwsSp, cwDtSp, s1, s2, s3, s4, chMask, chwpMask, cwpMask, ctMask,
    kw, deltaT, day, chKw, chwpKw, cwpKw, ctKw, humidityRh] = r;

  // A full T1MvRow, so buildRowReplayPayload derives duty and staging from the
  // row's own measured masks exactly as the app does.
  const meta: T1MvRow = {
    row: 0,
    time: '',
    loadRt: rt,
    chwsSp,
    cwsActual: cwsSp,
    humidityRh,
    cwDtSp,
    shares: [s1, s2, s3, s4],
    chMask,
    chwpMask,
    cwpMask,
    ctMask,
    kw,
    kwRt: kw / rt,
    deltaT,
  };
  const payload = buildRowReplayPayload(meta);
  // --stage-model: drop the measured counts so the twin's own load-driven
  // staging rules decide, scoring the heuristics along with the power model.
  if (!feedStaging) delete (payload as { staging?: unknown }).staging;
  const state = applyChillerScenarioPayload(payload);

  const kv = (id: string) => state.kpis.find((k) => k.id === id)?.value as number;
  const simKw = kv('kpi-kw');
  scored.push({
    day,
    kwPct: (100 * (simKw - kw)) / kw,
    dtErr: kv('kpi-chw-dt') - deltaT,
    runningCh: kv('kpi-rch'),
    parts: {
      chiller: { sim: kv('kpi-ch-kw'), meas: chKw },
      chwp: { sim: kv('kpi-chwp-kw'), meas: chwpKw },
      cwp: { sim: kv('kpi-cwp-kw'), meas: cwpKw },
      ct: { sim: kv('kpi-ct-kw'), meas: ctKw },
    },
  });
}

const pcts = scored.map((s) => s.kwPct);
const abs = pcts.map(Math.abs).sort((a, b) => a - b);
const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
const mae = abs.reduce((a, b) => a + b, 0) / abs.length;
const pct = (p: number) => abs[Math.min(abs.length - 1, Math.floor((p / 100) * abs.length))];
const within = (t: number) => abs.filter((x) => x <= t).length;

console.log(`MONTH REPLAY — ${scored.length.toLocaleString()} rows through the real physics engine`);
console.log('inputs: measured load, CHWS, achieved CWS, CW ΔT setpoint, riser shares, running units');
console.log('');
console.log(
  `plant kW   bias ${mean >= 0 ? '+' : ''}${mean.toFixed(3)}%   MAE ${mae.toFixed(3)}%   ` +
    `p50 ${pct(50).toFixed(2)}%   p95 ${pct(95).toFixed(2)}%   max ${abs[abs.length - 1].toFixed(1)}%`,
);
console.log(
  `           within 1%: ${((100 * within(1)) / abs.length).toFixed(1)}%   ` +
    `within 2%: ${((100 * within(2)) / abs.length).toFixed(1)}%   ` +
    `within 5%: ${((100 * within(5)) / abs.length).toFixed(1)}%`,
);

const dt = scored.map((s) => Math.abs(s.dtErr)).sort((a, b) => a - b);
console.log(
  `loop ΔT    MAE ${(dt.reduce((a, b) => a + b, 0) / dt.length).toFixed(3)} °C   ` +
    `p95 ${dt[Math.floor(0.95 * dt.length)].toFixed(2)} °C`,
);
const staged = scored.filter((s) => s.runningCh === 3).length;
console.log(`staging    3 chillers on ${((100 * staged) / scored.length).toFixed(1)}% of rows (measured: 100%)`);

console.log('');
console.log('by block:');
const plantMean = scored.reduce((a, s) => a + s.parts.chiller.meas + s.parts.chwp.meas + s.parts.cwp.meas + s.parts.ct.meas, 0) / scored.length;
for (const key of ['chiller', 'chwp', 'cwp', 'ct'] as const) {
  const errs = scored.map((s) => (100 * (s.parts[key].sim - s.parts[key].meas)) / Math.max(s.parts[key].meas, 1e-6));
  const b = errs.reduce((a, x) => a + x, 0) / errs.length;
  const m = errs.reduce((a, x) => a + Math.abs(x), 0) / errs.length;
  const share = (100 * scored.reduce((a, s) => a + s.parts[key].meas, 0)) / scored.length / plantMean;
  console.log(
    `  ${key.padEnd(8)} bias ${b >= 0 ? '+' : ''}${b.toFixed(2)}%   MAE ${m.toFixed(2)}%   ` +
      `(${share.toFixed(1)}% of plant kW)`,
  );
}

if (wantFolds) {
  console.log('');
  console.log('per 5-day block:');
  for (let lo = 1; lo <= 26; lo += 5) {
    const hi = lo + 4;
    const blk = scored.filter((s) => s.day >= lo && s.day <= hi);
    if (!blk.length) continue;
    const m = blk.reduce((a, s) => a + Math.abs(s.kwPct), 0) / blk.length;
    const b = blk.reduce((a, s) => a + s.kwPct, 0) / blk.length;
    console.log(
      `  Dec ${String(lo).padStart(2)}-${String(hi).padStart(2)}  ${String(blk.length).padStart(6)} rows   ` +
        `bias ${b >= 0 ? '+' : ''}${b.toFixed(2)}%   MAE ${m.toFixed(2)}%`,
    );
  }
}

console.log('');
console.log(
  `calibration fit recorded at generation: blocked-CV MAE ${CALIBRATION_FIT.blockedCvMaePct.toFixed(2)}%, ` +
    `in-sample ${CALIBRATION_FIT.inSampleMaePct.toFixed(2)}%`,
);

// Non-zero exit if the engine has drifted away from its recorded calibration.
const TOLERANCE_PCT = 1.5;
if (mae > TOLERANCE_PCT) {
  console.error(`\nFAIL: month-wide MAE ${mae.toFixed(3)}% exceeds the ${TOLERANCE_PCT}% gate.`);
  process.exit(1);
}
