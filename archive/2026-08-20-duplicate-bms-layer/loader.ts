/**
 * Real-BMS history loader.
 *
 * The explicit counterpart to synthetic history generation. Both produce
 * `PlantRecord[]`, so downstream model fitting and evaluation can consume
 * either — but the caller must choose which, by name. Nothing here ever reads
 * a spreadsheet and nothing in the synthetic path ever reads real data:
 *
 *     source === 'bms'        -> loadBmsHistory()        real, measured
 *     source === 'synthetic'  -> generateSyntheticHistory()  fabricated
 *
 * Keeping those two doors separate is the whole point. A model trained on
 * synthetic data that silently claims to be site-calibrated is worse than no
 * model, so provenance travels with the data rather than being remembered.
 *
 * The normalisation from raw BMS columns happens offline in
 * `calibration/scripts/exportBmsRecords.py`; this reads its output.
 */
import { gunzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BmsDatasetSummary, PlantRecord } from '../../../../shared/types/bms';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const PROCESSED = join(REPO, 'data', 'processed');

export interface BmsHistory {
  summary: BmsDatasetSummary;
  records: PlantRecord[];
}

export class BmsDataUnavailableError extends Error {
  constructor(readonly path: string) {
    super(
      `BMS records not found at ${path}. Generate them with:\n` +
        `  python calibration/scripts/exportBmsRecords.py --interval 15`
    );
    this.name = 'BmsDataUnavailableError';
  }
}

/** Parsed payloads are cached per interval — the 15-min file is ~3 MB decoded
 *  and is read by model fitting, the API and the evaluation harness. */
const cache = new Map<number, BmsHistory>();

export interface LoadOptions {
  /** Sampling interval in minutes; must match an exported file. */
  intervalMinutes?: number;
  /** Drop rows the exporter flagged (missing channels, anomalous RT). */
  validOnly?: boolean;
  /** Inclusive minute-index window, for train/test splits. */
  fromMinute?: number;
  toMinute?: number;
}

/**
 * Load real T1 BMS history as canonical records.
 *
 * Throws rather than falling back to synthetic data: a caller that asked for
 * measured history must not silently receive fabricated history.
 */
export function loadBmsHistory(opts: LoadOptions = {}): BmsHistory {
  const interval = opts.intervalMinutes ?? 15;

  let payload = cache.get(interval);
  if (!payload) {
    const path = join(PROCESSED, `t1-bms-${interval}min.json.gz`);
    if (!existsSync(path)) throw new BmsDataUnavailableError(path);
    payload = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as BmsHistory;
    cache.set(interval, payload);
  }

  let records = payload.records;
  if (opts.validOnly) records = records.filter((r) => r.valid);
  if (opts.fromMinute != null) records = records.filter((r) => r.minuteIndex >= opts.fromMinute!);
  if (opts.toMinute != null) records = records.filter((r) => r.minuteIndex <= opts.toMinute!);

  return { summary: payload.summary, records };
}

/** Summary only — no record array. Used by the dataset-summary endpoint. */
export function loadBmsSummary(intervalMinutes = 15): BmsDatasetSummary {
  return loadBmsHistory({ intervalMinutes }).summary;
}

export function isBmsDataAvailable(intervalMinutes = 15): boolean {
  return existsSync(join(PROCESSED, `t1-bms-${intervalMinutes}min.json.gz`));
}

/**
 * Chronological train/test split.
 *
 * Time-ordered, never shuffled: these are time series with strong daily
 * autocorrelation, so a random split leaks tomorrow into today and inflates
 * every score. The boundary falls on a whole day so a test fold always
 * contains complete diurnal cycles.
 */
export function splitByTime(
  records: PlantRecord[],
  trainFraction = 0.8
): { train: PlantRecord[]; test: PlantRecord[]; boundaryMinute: number } {
  if (records.length === 0) return { train: [], test: [], boundaryMinute: 0 };
  const first = records[0].minuteIndex;
  const last = records[records.length - 1].minuteIndex;
  const span = last - first;
  const rawBoundary = first + Math.floor(span * trainFraction);
  // snap up to the next midnight so folds are whole days
  const boundaryMinute = Math.ceil(rawBoundary / 1440) * 1440;
  return {
    train: records.filter((r) => r.minuteIndex < boundaryMinute),
    test: records.filter((r) => r.minuteIndex >= boundaryMinute),
    boundaryMinute,
  };
}
