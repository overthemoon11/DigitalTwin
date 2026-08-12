/**
 * M&V-window replay: feed each of the 133 rows whose `rt` column is MEASURED
 * (2025-12-01 00:00–02:12) into the physics engine and compare the simulated
 * plant kW / kW/RT / loop ΔT against the measured outcomes.
 *
 *   npx tsx frontend/scripts/validateMvWindow.ts [--inputs-only]
 *
 * By default each row's full measured state is fed (achieved CWS, the RH that
 * reproduces the measured wet-bulb, and which units ran). --inputs-only falls
 * back to the twin's reference weather and its own load-driven staging, which
 * is the harder test of the model rather than of the replay.
 *
 * CONTEXT: this window is 2.2 hours of Dec-1, and Dec-1 is an outlier day — its
 * CHWP and CT meters read ~22% above the month norm. Before the 2026-08-07
 * recalibration the engine was anchored to row 1 and scored 0.28% here while
 * carrying +3.86% across the rest of the month. It is now fitted to the whole
 * month, so this window is deliberately no longer the tightest.
 * frontend/scripts/validateMonth.ts carries the headline number.
 */
import { applyChillerScenarioPayload } from '../src/services/chiller/controlEngine';
import { T1_MV_ROWS, buildRowReplayPayload } from '../src/services/chiller/t1MvRows';

const inputsOnly = process.argv.includes('--inputs-only');

interface Res {
  row: number;
  time: string;
  kwPct: number;
  kwrtSim: number;
  kwrtData: number;
  dtErr: number;
}
const results: Res[] = [];

for (const r of T1_MV_ROWS) {
  const state = applyChillerScenarioPayload(buildRowReplayPayload(r, { inputsOnly }));
  const kw = state.kpis.find((k) => k.id === 'kpi-kw')?.value as number;
  const dt = state.kpis.find((k) => k.id === 'kpi-chw-dt')?.value as number;
  results.push({
    row: r.row,
    time: r.time,
    kwPct: (100 * (kw - r.kw)) / r.kw,
    kwrtSim: kw / state.headers.buildingLoadRt,
    kwrtData: r.kwRt,
    dtErr: dt - r.deltaT,
  });
}

const pcts = results.map((x) => x.kwPct);
const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
const mae = pcts.reduce((a, b) => a + Math.abs(b), 0) / pcts.length;
const within = (t: number) => pcts.filter((p) => Math.abs(p) <= t).length;
const dtMae = results.reduce((a, x) => a + Math.abs(x.dtErr), 0) / results.length;
const dtMax = Math.max(...results.map((x) => Math.abs(x.dtErr)));

console.log(
  `M&V WINDOW REPLAY — ${results.length} rows (Dec-1 00:00–02:12), ` +
    `${inputsOnly ? 'operator inputs only' : 'full measured state fed'}`,
);
console.log(
  `plant kW:  bias ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}%   MAE ${mae.toFixed(2)}%   ` +
    `within 0.5%: ${within(0.5)}/${results.length}   within 1%: ${within(1)}/${results.length}`,
);
console.log(`loop ΔT:   MAE ${dtMae.toFixed(3)} °C   max ${dtMax.toFixed(2)} °C`);
console.log('');
console.log('worst 8 rows by |kW error|:');
for (const w of [...results].sort((a, b) => Math.abs(b.kwPct) - Math.abs(a.kwPct)).slice(0, 8)) {
  console.log(
    `  row ${String(w.row).padStart(3)} (${w.time})  kW ${w.kwPct >= 0 ? '+' : ''}${w.kwPct.toFixed(2)}%` +
      `   kW/RT sim ${w.kwrtSim.toFixed(4)} vs data ${w.kwrtData.toFixed(4)}`,
  );
}
console.log('');
console.log('sample rows:');
for (const s of results.filter((x) => [2, 11, 60, 86, 134].includes(x.row))) {
  console.log(
    `  row ${String(s.row).padStart(3)} (${s.time})  kW ${s.kwPct >= 0 ? '+' : ''}${s.kwPct.toFixed(2)}%` +
      `   kW/RT sim ${s.kwrtSim.toFixed(4)} vs data ${s.kwrtData.toFixed(4)}`,
  );
}
