/**
 * Real T1 BMS history, loaded from the normalised artifact.
 *
 * This is the explicit REAL-DATA path. Its synthetic counterpart is
 * `mpc/horizon/index.ts`'s `syntheticScenario`, and the two never blur: nothing
 * in this file can produce a generated record, and nothing in the synthetic
 * path can read the workbook. A caller always knows which one it asked for.
 *
 *     data/raw/*.xlsx
 *          |  python data/scripts/export_bms_records.py   (the ONLY xlsx reader)
 *          v
 *     data/processed/t1_2025_12_15min.json   PlantRecord[]
 *     data/processed/t1_2025_12_summary.json BmsDatasetSummary
 *          |  this file
 *          v
 *     preprocessing -> forecast / fitting / closed-loop replay
 *
 * Node never parses Excel. Re-reading 38 MB of workbook per request would be
 * slow and would put a second copy of the raw column names in the codebase; the
 * artifact is a small, versioned, explicitly-typed contract instead.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
  BmsDatasetSummary,
  BmsRecordsArtifact,
  PlantRecord,
} from '../../../shared/types/bms';
import { isFittable } from '../../../shared/types/bms';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const PROCESSED = join(REPO, 'data', 'processed');

export const DATASET_ID = 't1_2025_12';

/**
 * Bumped whenever the record SHAPE changes. A stale artifact is refused rather
 * than silently half-read, because a missing field reads as `null` and `null`
 * is how this codebase says "not measured" — exactly the wrong thing to infer
 * from a version skew.
 */
export const EXPECTED_ARTIFACT_VERSION = 1;

const EXPORT_HINT =
  'Run `python data/scripts/export_bms_records.py --refresh` to regenerate it from data/raw/.';

/** Artifact missing, unparseable or the wrong version. Surfaces as HTTP 503. */
export class BmsArtifactError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(`${message} ${EXPORT_HINT}`);
    this.name = 'BmsArtifactError';
  }
}

let recordsCache: { stepMinutes: number; records: PlantRecord[] } | null = null;
let summaryCache: BmsDatasetSummary | null = null;

/** Drop the in-process cache. Tests use this; nothing else should need it. */
export function clearBmsCache(): void {
  recordsCache = null;
  summaryCache = null;
}

function readJson<T>(path: string, what: string): T {
  if (!existsSync(path)) throw new BmsArtifactError(`${what} not found at ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    throw new BmsArtifactError(
      `${what} at ${path} is not valid JSON (${(err as Error).message}).`
    );
  }
}

export interface LoadOptions {
  stepMinutes?: number;
  /** Inclusive 'YYYY-MM-DD' bounds. */
  fromDay?: string;
  toDay?: string;
  /** Drop buckets carrying any quality flag. */
  dropFlagged?: boolean;
  /** Drop buckets a model must not learn from — see `isFittable`. */
  fittableOnly?: boolean;
}

/**
 * Measured plant history, one record per time bucket.
 *
 * The whole artifact is read once and filtered in memory: 2,976 records is
 * small, and a per-call read would make the horizon comparison (which walks the
 * same day several times) pay for the parse repeatedly.
 */
export function loadBmsHistory(opts: LoadOptions = {}): PlantRecord[] {
  const stepMinutes = opts.stepMinutes ?? 15;
  if (!recordsCache || recordsCache.stepMinutes !== stepMinutes) {
    const path = join(PROCESSED, `${DATASET_ID}_${stepMinutes}min.json`);
    const artifact = readJson<BmsRecordsArtifact>(path, `BMS records artifact (${stepMinutes} min)`);
    if (artifact.artifactVersion !== EXPECTED_ARTIFACT_VERSION) {
      throw new BmsArtifactError(
        `BMS artifact version ${artifact.artifactVersion} does not match the expected ${EXPECTED_ARTIFACT_VERSION}.`
      );
    }
    if (!Array.isArray(artifact.records) || artifact.records.length === 0) {
      throw new BmsArtifactError('BMS artifact contains no records.');
    }
    recordsCache = { stepMinutes, records: artifact.records };
  }

  let out = recordsCache.records;
  if (opts.fromDay) out = out.filter((r) => r.t.slice(0, 10) >= opts.fromDay!);
  if (opts.toDay) out = out.filter((r) => r.t.slice(0, 10) <= opts.toDay!);
  if (opts.dropFlagged) out = out.filter((r) => r.qualityFlags.length === 0);
  if (opts.fittableOnly) out = out.filter(isFittable);
  return out;
}

/** Provenance, timebase, gaps, missing signals and the RT re-derivation. */
export function loadBmsSummary(): BmsDatasetSummary {
  if (!summaryCache) {
    const path = join(PROCESSED, `${DATASET_ID}_summary.json`);
    const summary = readJson<BmsDatasetSummary>(path, 'BMS summary artifact');
    if (summary.artifactVersion !== EXPECTED_ARTIFACT_VERSION) {
      throw new BmsArtifactError(
        `BMS summary version ${summary.artifactVersion} does not match the expected ${EXPECTED_ARTIFACT_VERSION}.`
      );
    }
    summaryCache = summary;
  }
  return summaryCache;
}

/** Whether the artifacts are on disk — checked before offering BMS mode. */
export function bmsAvailable(stepMinutes = 15): boolean {
  return (
    existsSync(join(PROCESSED, `${DATASET_ID}_${stepMinutes}min.json`)) &&
    existsSync(join(PROCESSED, `${DATASET_ID}_summary.json`))
  );
}

/** Every recorded day, ascending. */
export function bmsDays(stepMinutes = 15): string[] {
  return [...new Set(loadBmsHistory({ stepMinutes }).map((r) => r.t.slice(0, 10)))].sort();
}

/** One recorded day of buckets, in order. */
export function bmsDay(day: string, stepMinutes = 15): PlantRecord[] {
  return loadBmsHistory({ stepMinutes, fromDay: day, toDay: day });
}
