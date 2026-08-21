/**
 * Turning measured records into things a model can be fitted on or a
 * controller can be driven by.
 *
 * Two rules run through everything here.
 *
 * TIME IS NOT SHUFFLEABLE. These are 15-minute samples of a slowly varying
 * process: neighbouring buckets are almost the same bucket. A random train/test
 * split would put a minute's own neighbours in its test set and report a fit
 * quality that does not exist. Every split in this file is chronological, and
 * `chronologicalSplit` cuts on a whole-day boundary by default so a day's
 * morning cannot score its own afternoon.
 *
 * HOLES STAY HOLES. Nothing here imputes a measurement. `disturbanceProfile`
 * does carry the last value forward — a closed-loop replay needs a number at
 * every step or it cannot run at all — but it counts every one of them in
 * `gapSteps` and passes the quality flags through, so a run can say how much of
 * itself was real.
 */
import type { PlantRecord } from '../../../shared/types/bms';
import { isFittable, stagingOf } from '../../../shared/types/bms';
import type { DisturbanceProfile } from '../../../shared/types/horizon';

export const MINUTES_PER_HOUR = 60;

/* ------------------------------------------------------------------ splits */

export interface ChronologicalSplit {
  train: PlantRecord[];
  test: PlantRecord[];
  /** Timestamp of the first test record, or null when there is none. */
  boundary: string | null;
  trainDays: string[];
  testDays: string[];
}

/**
 * Hold out the LAST `testFraction` of the record set.
 *
 * `byDay` (the default) rounds the cut to a whole-day boundary. Without it a
 * fit trained to 14:00 is tested on 14:15 of the same day under the same
 * weather, which is barely a test at all.
 */
export function chronologicalSplit(
  records: PlantRecord[],
  testFraction = 0.25,
  opts: { byDay?: boolean } = {}
): ChronologicalSplit {
  const byDay = opts.byDay ?? true;
  if (records.length === 0) {
    return { train: [], test: [], boundary: null, trainDays: [], testDays: [] };
  }
  const sorted = [...records].sort((a, b) => a.t.localeCompare(b.t));
  const frac = Math.min(Math.max(testFraction, 0), 0.9);

  if (!byDay) {
    const cut = Math.max(1, Math.floor(sorted.length * (1 - frac)));
    const train = sorted.slice(0, cut);
    const test = sorted.slice(cut);
    return { train, test, boundary: test[0]?.t ?? null, trainDays: daysOf(train), testDays: daysOf(test) };
  }

  const days = daysOf(sorted);
  const nTest = Math.min(days.length - 1, Math.max(1, Math.round(days.length * frac)));
  const testDays = new Set(days.slice(days.length - nTest));
  const train = sorted.filter((r) => !testDays.has(day(r)));
  const test = sorted.filter((r) => testDays.has(day(r)));
  return { train, test, boundary: test[0]?.t ?? null, trainDays: daysOf(train), testDays: daysOf(test) };
}

/**
 * Expanding-window folds: train on everything before the block, validate on
 * the block. The time-series analogue of k-fold — the training set only ever
 * grows backwards from the validation block, never straddles it.
 */
export function expandingWindowFolds(
  records: PlantRecord[],
  blocks = 4
): Array<{ train: PlantRecord[]; validate: PlantRecord[] }> {
  const sorted = [...records].sort((a, b) => a.t.localeCompare(b.t));
  const n = sorted.length;
  const nb = Math.max(2, Math.floor(blocks));
  const edges = Array.from({ length: nb + 1 }, (_, i) => Math.floor((n * i) / nb));
  const out: Array<{ train: PlantRecord[]; validate: PlantRecord[] }> = [];
  for (let i = 1; i < nb; i++) {
    const train = sorted.slice(0, edges[i]);
    const validate = sorted.slice(edges[i], edges[i + 1]);
    if (train.length >= 20 && validate.length >= 5) out.push({ train, validate });
  }
  return out;
}

export const day = (r: PlantRecord): string => r.t.slice(0, 10);

export function daysOf(records: PlantRecord[]): string[] {
  return [...new Set(records.map(day))].sort();
}

export function groupByDay(records: PlantRecord[]): Map<string, PlantRecord[]> {
  const out = new Map<string, PlantRecord[]>();
  for (const r of [...records].sort((a, b) => a.t.localeCompare(b.t))) {
    const k = day(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/* ------------------------------------------------------------ disturbances */

/**
 * The two disturbance series a closed-loop replay needs, aligned on step index.
 *
 * Missing values are carried forward (then backward, for a leading hole) so the
 * loop always has a number, and every substitution is counted in `gapSteps`.
 * That count is reported in the run, because a day that was half carried
 * forward is not the day it claims to be.
 */
export function disturbanceProfile(records: PlantRecord[], stepMinutes = 15): DisturbanceProfile {
  const sorted = [...records].sort((a, b) => a.t.localeCompare(b.t));
  const t: string[] = [];
  const loadRt: number[] = [];
  const wetBulbC: number[] = [];
  const flags = new Set<string>();
  let gapSteps = 0;

  for (const r of sorted) {
    t.push(r.t);
    r.qualityFlags.forEach((f) => flags.add(f));
    const load = r.loadRt != null && r.loadRt > 0 ? r.loadRt : null;
    const wb = r.wetBulbC;
    if (load == null || wb == null) gapSteps += 1;
    loadRt.push(load ?? NaN);
    wetBulbC.push(wb ?? NaN);
  }

  return {
    day: sorted.length ? day(sorted[0]) : '',
    stepMinutes,
    t,
    loadRt: carryForward(loadRt),
    wetBulbC: carryForward(wetBulbC),
    gapSteps,
    qualityFlags: [...flags].sort(),
  };
}

/** Forward fill, then backward fill for any leading hole. */
function carryForward(values: number[]): number[] {
  const out = [...values];
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) last = out[i];
    else if (Number.isFinite(last)) out[i] = last;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    if (Number.isFinite(out[i])) last = out[i];
    else if (Number.isFinite(last)) out[i] = last;
  }
  return out;
}

/* --------------------------------------------------------------- reporting */

export interface Bounds {
  min: number;
  p05: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export function bounds(values: Array<number | null | undefined>): Bounds | null {
  const v = values
    .filter((x): x is number => x != null && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return {
    min: round(v[0]),
    p05: round(q(0.05)),
    p50: round(q(0.5)),
    p95: round(q(0.95)),
    max: round(v[v.length - 1]),
    mean: round(v.reduce((s, x) => s + x, 0) / v.length),
  };
}

export interface RecordStats {
  n: number;
  nFittable: number;
  nFlagged: number;
  days: number;
  loadRt: Bounds | null;
  wetBulbC: Bounds | null;
  chwsC: Bounds | null;
  chwrC: Bounds | null;
  totalPlantKw: Bounds | null;
  plantKwPerRt: Bounds | null;
  meanStaging: { chillers: number; chwp: number; cwp: number; ct: number } | null;
}

/** Descriptive statistics over a record set, for the dataset panel. */
export function recordStats(records: PlantRecord[]): RecordStats {
  const fit = records.filter(isFittable);
  const staged = fit.map(stagingOf);
  const mean = (pick: (s: ReturnType<typeof stagingOf>) => number) =>
    staged.length ? round(staged.reduce((s, x) => s + pick(x), 0) / staged.length) : 0;

  return {
    n: records.length,
    nFittable: fit.length,
    nFlagged: records.filter((r) => r.qualityFlags.length > 0).length,
    days: daysOf(records).length,
    loadRt: bounds(records.map((r) => r.loadRt)),
    wetBulbC: bounds(records.map((r) => r.wetBulbC)),
    chwsC: bounds(records.map((r) => r.chwsC)),
    chwrC: bounds(records.map((r) => r.chwrC)),
    totalPlantKw: bounds(records.map((r) => r.totalPlantKw)),
    plantKwPerRt: bounds(records.map((r) => r.plantKwPerRt)),
    meanStaging: staged.length
      ? {
          chillers: mean((s) => s.chillers),
          chwp: mean((s) => s.chwp),
          cwp: mean((s) => s.cwp),
          ct: mean((s) => s.ct),
        }
      : null,
  };
}

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

/* ----------------------------------------------------------------- scoring */

export interface FitMetrics {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  /** Null when the target crosses or approaches zero, where MAPE is meaningless. */
  mapePct: number | null;
  r2: number;
}

/**
 * Error statistics for a prediction against a measurement.
 *
 * Pairs where either side is non-finite are dropped rather than treated as
 * zero, and `n` reports how many survived — a metric computed over a quarter of
 * the data should not look like one computed over all of it.
 */
export function fitMetrics(actual: number[], predicted: number[]): FitMetrics {
  const pairs = actual
    .map((a, i) => [a, predicted[i]] as const)
    .filter(([a, p]) => Number.isFinite(a) && Number.isFinite(p));
  const n = pairs.length;
  if (n === 0) return { n: 0, mae: NaN, rmse: NaN, bias: NaN, mapePct: null, r2: NaN };

  const err = pairs.map(([a, p]) => p - a);
  const mae = err.reduce((s, e) => s + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n);
  const bias = err.reduce((s, e) => s + e, 0) / n;
  const mean = pairs.reduce((s, [a]) => s + a, 0) / n;
  const ssTot = pairs.reduce((s, [a]) => s + (a - mean) ** 2, 0);
  const ssRes = err.reduce((s, e) => s + e * e, 0);
  const safeForMape = pairs.every(([a]) => a > 1e-6);
  const mapePct = safeForMape
    ? (pairs.reduce((s, [a, p]) => s + Math.abs((p - a) / a), 0) / n) * 100
    : null;

  return {
    n,
    mae: round(mae, 4),
    rmse: round(rmse, 4),
    bias: round(bias, 4),
    mapePct: mapePct == null ? null : round(mapePct, 4),
    r2: round(1 - ssRes / Math.max(ssTot, 1e-9), 5),
  };
}
