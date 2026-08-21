/**
 * Read access to the measured BMS dataset.
 *
 * Everything here is REAL MEASUREMENT (or a documented derivation of one) and
 * nothing is simulated — that separation is the reason this controller is not
 * folded into `simulationController`. A caller hitting `/api/bms/*` knows it is
 * looking at what the plant did, not at what the twin thinks it would do.
 */
import type { BmsDatasetSummary, PlantRecord, QualityFlag } from '../../../../shared/types/bms';
import { bmsDay, bmsDays, loadBmsHistory, loadBmsSummary, BmsArtifactError } from '../../data/bmsLoader';
import { recordStats } from '../../data/preprocessing';
import { ApiError } from './simulationController';

const STEP_MINUTES = 15;

/** Translate a missing/stale artifact into an HTTP 503 with the fix in it. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof BmsArtifactError) throw new ApiError(err.status, err.message);
    throw err;
  }
}

/** GET /api/bms/dataset-summary — provenance, timebase, gaps, RT re-derivation. */
export function getDatasetSummary(): BmsDatasetSummary & { stats: ReturnType<typeof recordStats> } {
  return guard(() => ({
    ...loadBmsSummary(),
    stats: recordStats(loadBmsHistory({ stepMinutes: STEP_MINUTES })),
  }));
}

export interface BmsDaySummary {
  day: string;
  records: number;
  flaggedRecords: number;
  qualityFlags: QualityFlag[];
  loadRtMin: number | null;
  loadRtMax: number | null;
}

/** GET /api/bms/days — the day picker, with each day's load range and flags. */
export function getDays(): { stepMinutes: number; days: BmsDaySummary[] } {
  const records = guard(() => loadBmsHistory({ stepMinutes: STEP_MINUTES }));
  const byDay = new Map<string, PlantRecord[]>();
  for (const r of records) {
    const key = r.t.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(r);
    else byDay.set(key, [r]);
  }

  const days: BmsDaySummary[] = [...byDay.entries()].map(([day, rows]) => {
    const loads = rows.map((r) => r.loadRt).filter((v): v is number => v != null);
    const flags = new Set<QualityFlag>();
    let flaggedRecords = 0;
    for (const r of rows) {
      if (r.qualityFlags.length > 0) flaggedRecords += 1;
      for (const f of r.qualityFlags) flags.add(f);
    }
    return {
      day,
      records: rows.length,
      flaggedRecords,
      qualityFlags: [...flags].sort(),
      loadRtMin: loads.length ? Math.min(...loads) : null,
      loadRtMax: loads.length ? Math.max(...loads) : null,
    };
  });

  days.sort((a, b) => a.day.localeCompare(b.day));
  return { stepMinutes: STEP_MINUTES, days };
}

/** GET /api/bms/day/:day — every measured bucket of one day. */
export function getDay(day: string): { day: string; stepMinutes: number; records: PlantRecord[] } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new ApiError(400, `day must be 'YYYY-MM-DD', received '${day}'`);
  }
  const records = guard(() => bmsDay(day, STEP_MINUTES));
  if (records.length === 0) {
    const available = guard(() => bmsDays(STEP_MINUTES));
    throw new ApiError(404, `no records for ${day}. This dataset covers ${available[0]} to ${available[available.length - 1]}.`);
  }
  return { day, stepMinutes: STEP_MINUTES, records };
}
