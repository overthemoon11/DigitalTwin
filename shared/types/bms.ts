/**
 * Canonical shape of real T1 BMS history, shared by the backend and the UI.
 *
 * One record is one time bucket of measured plant operation, already
 * normalised out of the raw workbook by `data/scripts/export_bms_records.py`.
 * Raw BMS column names appear in that exporter and nowhere else, so a tag
 * rename upstream stays a one-file change.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. Units are fixed and named in the field: C, Ls, Kw, Rt, Pct.
 *      No field carries a unit that has to be remembered.
 *   2. A channel the workbook could not supply is `null` — never 0, and never
 *      a plausible-looking default. A fabricated reading that reads as
 *      measured is worse than an obvious hole.
 *
 * RECONSTRUCTED 2026-08-20 after this file was deleted from the working tree.
 * `isFittable` and `stagingOf` were recovered verbatim from the tsx transform
 * cache, so the runtime behaviour is the original. The type declarations around
 * them were rebuilt from the on-disk artifact and from every consumer, and are
 * exercised by tests/bmsData.test.js — see recovered/README.md.
 */

/* ------------------------------------------------------------------ records */

/**
 * Why a bucket is suspect. Set by the exporter; carried rather than dropped,
 * so reporting can show a gap while fitting skips it.
 *
 *   CT4_POWER_GAP       DPM_CT_04 absent (all of 2025-12-31)
 *   NEGATIVE_HEADER_DT  CHWR below CHWS: a sensor artefact, not cooling
 *   ZERO_RISER_FLOW     no measurable riser flow, so RT is not reconstructable
 *   NO_TIMESTAMP        row stamp missing or unparseable
 */
export type QualityFlag =
  | 'CT4_POWER_GAP'
  | 'NEGATIVE_HEADER_DT'
  | 'ZERO_RISER_FLOW'
  | 'NO_TIMESTAMP';

/**
 * One normalised time bucket of measured plant operation.
 *
 * Fleet arrays are always full length and positional — index 0 is unit 1 — so
 * an off unit is a 0 in place, never an absent entry: 5 chillers, 6 CHW pumps,
 * 6 CW pumps, 5 cooling towers.
 */
export interface PlantRecord {
  /** Bucket start, local plant time, 'YYYY-MM-DDTHH:MM:SS'. Sorts lexically. */
  t: string;
  /** Bucket width in minutes (15 for the MPC step). */
  minutes: number;

  /* load and weather */
  /** Cooling load, refrigeration tons. DERIVED — see `rtValidation` in the summary. */
  loadRt: number | null;
  /** Outdoor wet-bulb, degC. Mean of the five WST sensors. */
  wetBulbC: number | null;

  /* chilled water */
  chwsC: number | null;
  chwrC: number | null;
  /** CHWR - CHWS, K. Negative values are flagged, not clamped. */
  chwDeltaT: number | null;
  /**
   * Header flow from the `Header-hcwf` meter, L/s.
   *
   * Read the magnitude, not the tag. This runs ~696 L/s and tracks the sum of
   * the per-chiller CONDENSER meters (`cwFlowLs`, ~696) rather than the ~376
   * L/s of chilled water — the exporter's own column map calls it
   * `cw_header_flow_ls`. The "hcw" prefix means chilled water on `hcwst` and
   * `hcwrt` (7.58 / 14.45 degC) but condenser water here. Treating it as a
   * chilled-water flow overstates cooling by ~85%, which is why the RT identity
   * uses `riserFlowLs` instead.
   */
  chwFlowLs: number | null;
  /** Sum of the four riser flows, L/s. This is the flow in the RT identity. */
  riserFlowLs: number | null;

  /* condenser water */
  cwsC: number | null;
  cwrC: number | null;
  /** Sum of per-chiller condenser flows over running units, L/s. */
  cwFlowLs: number | null;
  /**
   * The `Header-hcwf` meter, L/s — CONDENSER water despite the tag prefix.
   * Tracks `cwFlowLs` closely, which is the cross-check that identified it.
   */
  cwHeaderFlowLs: number | null;

  /* staging — INFERRED from metered kW against a run threshold, not read from
   * status points: this site trends no run flags at all. */
  chillerStatus: number[];
  chwpStatus: number[];
  cwpStatus: number[];
  ctStatus: number[];

  /* power, all kW, all measured at DPM meters */
  chillerKw: number[];
  totalChillerKw: number | null;
  chwpKw: number | null;
  cwpKw: number | null;
  towerKw: number | null;
  totalPlantKw: number | null;
  /** DERIVED: totalPlantKw / loadRt. */
  plantKwPerRt: number | null;

  qualityFlags: QualityFlag[];
}

/** On-disk records artifact written by the exporter. */
export interface BmsRecordsArtifact {
  artifactVersion: number;
  datasetId: string;
  stepMinutes: number;
  records: PlantRecord[];
}

/* ------------------------------------------------------------------ helpers */

/** Running-unit counts for one bucket. */
export interface Staging {
  chillers: number;
  chwp: number;
  cwp: number;
  ct: number;
}

const countOn = (xs: number[]): number => xs.reduce((n, v) => n + (v ? 1 : 0), 0);

/** How many units of each type were running in this bucket. */
export function stagingOf(r: PlantRecord): Staging {
  return {
    chillers: countOn(r.chillerStatus),
    chwp: countOn(r.chwpStatus),
    cwp: countOn(r.cwpStatus),
    ct: countOn(r.ctStatus),
  };
}

/**
 * Whether a bucket may be fitted on.
 *
 * A deliberately higher bar than "usable for reporting": any quality flag
 * disqualifies it, and so does a missing value in any channel a model reads.
 * Reporting still shows these buckets — the plant really did run through
 * them — but a model must not learn from a hole.
 */
export function isFittable(r: PlantRecord): boolean {
  if (r.qualityFlags.length > 0) return false;
  return (
    r.loadRt != null &&
    r.wetBulbC != null &&
    r.chwsC != null &&
    r.chwrC != null &&
    r.totalPlantKw != null
  );
}

/* ------------------------------------------------------------------ summary */

/** How well a model could actually be pinned down by this site's data. */
export type CalibrationStatus = 'site-calibrated' | 'partially-calibrated' | 'default';

/** Which data a model was fitted against. 'none' means it was not fitted. */
export type TrainedOn = 'bms' | 'synthetic' | 'none';

/**
 * Provenance for one model in the twin, surfaced to the UI so a run can say
 * which of its numbers are site-calibrated and which are assumptions.
 */
export interface ModelStatus {
  id: string;
  label: string;
  status: CalibrationStatus;
  trainedOn: TrainedOn;
  /** Channels this model needs that the site does not trend. */
  missingInputs: string[];
  /** Fit quality, or null when the model was never fitted. */
  metrics: Record<string, number> | null;
  note: string;
}

/** Fit or reconstruction error, in the unit named by each key. */
export interface ErrorStats {
  n: number;
  maeRt?: number;
  rmseRt?: number;
  biasRt?: number;
  mapePct?: number;
  maxAbsErrRt?: number;
  maeKw?: number;
  rmseKw?: number;
  biasKw?: number;
  note?: string;
}

/**
 * Everything known about the dataset that is not a record: where it came from,
 * how it was timed, what was measured versus derived, and what is missing.
 *
 * Written by the exporter alongside the records so provenance travels with the
 * data instead of living in someone else's memory.
 */
export interface BmsDatasetSummary {
  artifactVersion: number;
  datasetId: string;
  source: { workbook: string; sheet: string; sizeBytes: number };
  stepMinutes: number;
  recordCount: number;
  /** Every 'YYYY-MM-DD' present, ascending. */
  days: string[];

  timebase: {
    first: string;
    last: string;
    rows: number;
    parsedTimestamps: number;
    unparsedTimestamps: number;
    intervalSecondsMode: number;
    intervalHistogram: Record<string, number>;
    duplicateTimestamps: number;
    expectedRowsAt1Min: number;
    missingRowsVsExpected: number;
  };

  equipment: { chillers: number; chwPumps: number; cwPumps: number; coolingTowers: number };

  columnsMapped: number;
  columnsUncertain: number;

  /** Per-field: MEASURED, DERIVED or INFERRED, in prose. */
  provenance: Record<string, string>;

  /** Evidence that the reconstructed cooling load matches the workbook. */
  rtValidation: {
    coolingLoadFormula: string;
    factorWorkbook: number;
    factorPhysics: number;
    factorRefitFromMeasuredRows: number;
    vsMeasuredRows: Record<string, ErrorStats>;
    vsAllRows: Record<string, ErrorStats>;
    plantKwSumVsWorkbookColumn: ErrorStats;
    abnormal: Record<string, number>;
  };

  /**
   * Channels this site does not trend, each with what it blocks. A control
   * listed here cannot be calibrated or optimised, and must be reported as
   * not-available rather than handed a fabricated optimum.
   */
  missingSignals: Record<string, string>;

  knownAnomalies: Array<{
    code: string;
    from: string;
    to: string;
    detail: string;
    action: string;
  }>;

  /** Percent of the month each unit ran, positionally by unit index. */
  runningUnits: {
    chillers: number[];
    chwPumps: number[];
    cwPumps: number[];
    coolingTowers: number[];
    note: string;
  };
}
