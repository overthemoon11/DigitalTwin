/**
 * Full M&V-window replay: feed every dataset row's measured operator inputs
 * (load, CHWS SP, CW ΔT SP, riser shares, duty) into the physics engine and
 * compare the simulated plant kW / kW/RT / ΔT against the measured outcomes.
 *
 *   npx tsx frontend/scripts/validateMvWindow.ts
 */
import { applyChillerScenarioPayload } from '../src/services/chiller/controlEngine';
import { T1_MV_ROWS, buildRowReplayPayload } from '../src/services/chiller/t1MvRows';

type Res = { row: number; time: string; kwPct: number; kwrtSim: number; kwrtData: number; dtOk: boolean };
const results: Res[] = [];

for (const r of T1_MV_ROWS) {
  const state = applyChillerScenarioPayload(buildRowReplayPayload(r));
  const kw = state.kpis.find((k: any) => k.id === 'kpi-kw')?.value as number;
  const dt = state.kpis.find((k: any) => k.id === 'kpi-chw-dt')?.value as number;
  const kwrtSim = kw / state.headers.buildingLoadRt;
  results.push({
    row: r.row,
    time: r.time,
    kwPct: (100 * (kw - r.kw)) / r.kw,
    kwrtSim,
    kwrtData: r.kwRt,
    dtOk: Math.abs(dt - r.deltaT) <= 0.011,
  });
}

const pcts = results.map((x) => x.kwPct);
const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
const mae = pcts.reduce((a, b) => a + Math.abs(b), 0) / pcts.length;
const sorted = [...results].sort((a, b) => Math.abs(b.kwPct) - Math.abs(a.kwPct));
const within = (t: number) => pcts.filter((p) => Math.abs(p) <= t).length;

console.log(`M&V WINDOW REPLAY — ${results.length} rows, inputs only, physics computes the rest`);
console.log(`plant kW:  bias ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}%   MAE ${mae.toFixed(2)}%   within 0.5%: ${within(0.5)}/${results.length}   within 1%: ${within(1)}/${results.length}`);
console.log(`loop ΔT exact (±0.01): ${results.filter((x) => x.dtOk).length}/${results.length}`);
console.log('');
console.log('worst 8 rows by |kW error|:');
for (const w of sorted.slice(0, 8)) {
  console.log(
    `  row ${String(w.row).padStart(3)} (${w.time})  kW ${w.kwPct >= 0 ? '+' : ''}${w.kwPct.toFixed(2)}%   kW/RT sim ${w.kwrtSim.toFixed(4)} vs data ${w.kwrtData.toFixed(4)}`,
  );
}
console.log('');
console.log('sample rows:');
for (const s of results.filter((x) => [2, 11, 60, 86, 134].includes(x.row))) {
  console.log(
    `  row ${String(s.row).padStart(3)} (${s.time})  kW ${s.kwPct >= 0 ? '+' : ''}${s.kwPct.toFixed(2)}%   kW/RT sim ${s.kwrtSim.toFixed(4)} vs data ${s.kwrtData.toFixed(4)}`,
  );
}
