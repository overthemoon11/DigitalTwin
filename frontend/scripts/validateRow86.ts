/**
 * Offline validation of the chiller-plant physics against dataset row 86.
 *
 *   npx tsx frontend/scripts/validateRow86.ts
 *
 * Applies the row-86 scenario (measured operator inputs only: load, CHWS SP,
 * CW ΔT SP, riser shares, duty units) and compares every simulated BMS point —
 * at its display precision — against the measured dataset readings.
 */
import { applyChillerScenario, stepPlantSimulation } from '../src/services/chiller/controlEngine';
import { HL_CP_RATIO, CHWP_VSD_RATIO, CWP_VSD_RATIO } from '../src/services/chiller/t1Snapshot';
import { ROW86_EXPECTED, ROW86_SCENARIO_ID } from '../src/services/chiller/t1Row86';

/* Guard: the default boot vs dataset row 1. Since the least-squares part-load
 * calibration (2026-07-17), kW points sit within the window's ±1% scatter
 * (row 1 is a +0.56% outlier of the fit); temps/flows/ΔT must stay EXACT. */
const boot = stepPlantSimulation();
const bootKval = (id: string) => {
  const k = boot.kpis.find((x: any) => x.id === id);
  return typeof k?.value === 'number' ? k.value : NaN;
};
const exact: Array<[string, string, string]> = [
  ['deltaT', bootKval('kpi-chw-dt').toFixed(2), '6.55'],
  ['Header-hcwrt', boot.headers.chwr.toFixed(2), '14.07'],
  ['CH-2-ChwSt', ((boot.equipment as any)['ch-2'].supplyTemp as number).toFixed(2), '7.48'],
  ['DPM-CHWP-2-kW', ((boot.equipment as any)['chwp-2'].powerKw as number).toFixed(2), '23.35'],
];
const withinPct: Array<[string, number, number, number]> = [
  ['total kW', bootKval('kpi-kw'), 1917.69, 1],
  ['kW/RT', bootKval('kpi-kw') / boot.headers.buildingLoadRt, 0.60859, 1],
  ['DPM-CH-2-CP-1-kW', (boot.equipment as any)['ch-2'].cp1Kw, 271.23, 1],
];
console.log('ROW-1 BOOT GUARD (temps/flows exact; kW within window scatter):');
let bootFail = 0;
for (const [name, got, want] of exact) {
  const pass = got === want;
  if (!pass) bootFail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name.padEnd(20)} sim ${got.padStart(9)}   dataset ${want.padStart(9)}   (exact)`);
}
for (const [name, got, want, tolPct] of withinPct) {
  const pct = (100 * (got - want)) / want;
  const pass = Math.abs(pct) <= tolPct;
  if (!pass) bootFail++;
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'}  ${name.padEnd(20)} sim ${got.toFixed(4).padStart(9)}   dataset ${want.toFixed(4).padStart(9)}   (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% vs ±${tolPct}%)`,
  );
}
if (bootFail) console.log(`  *** ${bootFail} row-1 boot regressions ***`);
console.log('');

const state = applyChillerScenario(ROW86_SCENARIO_ID);

const eq: Record<string, any> = state.equipment ?? {};
const headers: any = state.headers ?? {};
const kpis: any[] = state.kpis ?? [];
const risers: any[] = state.risers ?? [];

const kval = (id: string) => {
  const k = kpis.find((x) => x.id === id);
  return typeof k?.value === 'number' ? k.value : NaN;
};
const ch = (i: number) => eq[`ch-${i}`] ?? {};
const chwp = (i: number) => eq[`chwp-${i}`] ?? {};
const cwp = (i: number) => eq[`cwp-${i}`] ?? {};
const ct = (i: number) => eq[`ct-${i}`] ?? {};
const fmt = (v: unknown, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—';

/* Simulated display value for every dataset point name (mirrors ChillerPointsList). */
const sim: Record<string, string> = {
  'kw': fmt(kval('kpi-kw'), 2),
  'kw/rt': fmt(headers.buildingLoadRt > 0 ? kval('kpi-kw') / headers.buildingLoadRt : NaN, 4),
  'rt': fmt(headers.buildingLoadRt, 2),
  'deltaT': fmt(kval('kpi-chw-dt'), 2),
  'Header-hcwf': fmt((headers.condFlowM3h ?? 0) / 3.6, 2),
  'Header-hcwst': fmt(headers.chws),
  'Header-hcwrt': fmt(headers.chwr),
};
for (let i = 1; i <= 5; i++) {
  const cp1Name = i === 4 ? 'DPM_CH-4-CP-1-kW' : `DPM-CH-${i}-CP-1-kW`;
  sim[cp1Name] = fmt(ch(i).cp1Kw);
  sim[`DPM-CH-${i}-CP-2-kW`] = fmt(ch(i).cp2Kw);
  const live = ch(i).status === 'running';
  const r = HL_CP_RATIO[i - 1] ?? [1, 1];
  sim[`HL_CH_${i}_CP1_Power`] = live ? fmt(ch(i).cp1Kw * r[0], 0) : '0';
  sim[`HL_CH_${i}_CP2_Power`] = live ? fmt(ch(i).cp2Kw * r[1], 0) : '0';
  sim[`CH-${i}-ChwSt`] = fmt(ch(i).supplyTemp);
  sim[`CH-${i}-ChwRt`] = fmt(ch(i).returnTemp);
  sim[`CH-${i}-CwSt`] = fmt(ch(i).cwSupplyTemp);
  sim[`CH-${i}-CwRt`] = fmt(ch(i).cwReturnTemp);
  sim[`CH-${i}-ChwFls`] = fmt((ch(i).flowRate ?? 0) / 3.6, 2);
  sim[`CH-${i}-CwFls`] = fmt((ch(i).condFlowRate ?? 0) / 3.6, 2);
  sim[i === 4 ? 'DPM_CT_04_kW' : `CT_0${i}_DPM_kW`] = fmt(ct(i).powerKw);
  sim[i === 4 ? 'CT_4_VSD_135_kW' : `CT_${i}_VSD_A_kW`] = fmt(ct(i).cells?.a?.kw);
  sim[i === 4 ? 'CT_4_VSD_246_kW' : `CT_${i}_VSD_B_kW`] = fmt(ct(i).cells?.b?.kw);
  sim[`CT_${i}A_CWST`] = fmt(ct(i).cells?.a?.cwst);
  sim[`CT_${i}B_CWST`] = fmt(ct(i).cells?.b?.cwst);
  sim[`CT_${i}A_CWRT`] = fmt(ct(i).cells?.a?.cwrt);
  sim[`CT_${i}B_CWRT`] = fmt(ct(i).cells?.b?.cwrt);
  sim[`WST_${i}_WetBulbTemp`] = fmt(headers.wetBulbSensors?.[i - 1], 2);
}
for (let i = 1; i <= 6; i++) {
  sim[`DPM-CHWP-${i}-kW`] = fmt(chwp(i).powerKw);
  sim[`CHWP_${i}_VSDkW`] =
    chwp(i).status === 'running' ? fmt(chwp(i).powerKw * (CHWP_VSD_RATIO[i - 1] ?? 1), 1) : '0.0';
  sim[`DPM-CWP-${i}-kW`] = fmt(cwp(i).powerKw);
  sim[`CWP_${i}_VSDkW`] =
    cwp(i).status === 'running' ? fmt(cwp(i).powerKw * (CWP_VSD_RATIO[i - 1] ?? 1), 1) : '0.0';
}
for (const r of risers) {
  sim[`CHW-Riser-${r.name}-ChwFls`] = fmt(r.flowLs, 2);
  sim[`CHW-Riser-${r.name}-ChwSt`] = fmt(r.chwSt);
  sim[`CHW-Riser-${r.name}-ChwRt`] = fmt(r.chwRt);
}

/* ------------------------------- Comparison ------------------------------- */

let ok = 0, warn = 0, bad = 0, missing = 0;
const rows: string[] = [];
let worst: { name: string; pct: number } | null = null;

for (const [name, expected] of Object.entries(ROW86_EXPECTED)) {
  const s = sim[name];
  if (s === undefined || s === '—') {
    missing++;
    rows.push(`MISSING  ${name}`);
    continue;
  }
  const decimals = (s.split('.')[1] || '').length;
  const simNum = parseFloat(s);
  const delta = simNum - expected;
  const pct = expected !== 0 ? (100 * delta) / Math.abs(expected) : (simNum === 0 ? 0 : NaN);
  const okTol = Math.max(0.05, Math.abs(expected) * 0.005);
  const warnTol = Math.max(0.2, Math.abs(expected) * 0.02);
  const cls = Math.abs(delta) <= okTol ? 'ok  ' : Math.abs(delta) <= warnTol ? 'WARN' : 'BAD ';
  if (cls === 'ok  ') ok++; else if (cls === 'WARN') warn++; else bad++;
  if (Number.isFinite(pct) && expected !== 0 && Math.abs(expected) > 1 && (!worst || Math.abs(pct) > Math.abs(worst.pct))) {
    worst = { name, pct };
  }
  rows.push(
    `${cls}  ${name.padEnd(30)} sim ${s.padStart(10)}   dataset ${expected.toFixed(decimals).padStart(10)}   Δ ${(delta >= 0 ? '+' : '') + delta.toFixed(Math.max(decimals, 2)).padStart(8)}${Number.isFinite(pct) ? `  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''}`,
  );
}

console.log(`ROW-86 VALIDATION — sim vs T1_MVrawDataR2_2025_12 row 86 (2025-12-01 01:24)`);
console.log(`inputs: load 3212.15 RT · CHWS 7.5 °C · CW ΔT SP 4.4272 °C · measured riser shares · row-86 duty units`);
console.log('');
for (const r of rows) console.log(r);
console.log('');
console.log(`points: ${Object.keys(ROW86_EXPECTED).length}   within 0.5%: ${ok}   within 2%: ${warn}   beyond 2%: ${bad}   missing: ${missing}`);
if (worst) console.log(`largest relative miss (|value| > 1): ${worst.name} at ${worst.pct.toFixed(2)}%`);
