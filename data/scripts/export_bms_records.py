"""Normalise the raw T1 BMS workbook into a canonical, versioned artifact.

    python data/scripts/export_bms_records.py [--refresh] [--step-min 15]

WHY THIS EXISTS
Only Python reads .xlsx here (openpyxl). Rather than add an Excel parser to the
Node backend and re-parse 38 MB on every request, this script does the read once
and emits a small, explicit contract the TypeScript side consumes:

    data/processed/t1_2025_12_<step>min.json   canonical PlantRecord[]
    data/processed/t1_2025_12_summary.json     dataset summary + provenance
    docs/bms-data-mapping.md                   generated raw -> canonical report

WHAT IT DOES NOT DO
It does not impute. Rows the workbook's own audit sheet flags as unreliable are
carried through with a quality flag and excluded from the statistics, never
silently patched. Signals the workbook lacks (DP, pump/fan speeds, setpoints)
are absent from the records and enumerated in the summary, so a consumer can
report "not available" instead of defaulting to a fabricated number.

THE CACHE
Reading 44,640 rows x 193 columns through openpyxl takes minutes. The parsed
numeric matrix is therefore cached as `.t1-bms-cache.npz` keyed by the column
map's own version; `--refresh` forces a re-read. The cache is derived data and
is git-ignored — the workbook in `data/raw/` is the only source of truth.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover - environment problem, not a code path
    sys.exit("numpy is required: pip install numpy openpyxl")

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bms_columns as B  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
WORKBOOK = REPO / "data" / "raw" / "T1_MVrawDataR2_2025_12_completed.xlsx"
OUT_DIR = REPO / "data" / "processed"
CACHE = OUT_DIR / ".t1-bms-cache.npz"
MAP_DOC = REPO / "docs" / "bms-data-mapping.md"

ARTIFACT_VERSION = 1
DATASET_ID = "t1_2025_12"
RT_TO_KW = 3.517


# --------------------------------------------------------------- reading

def read_workbook(refresh: bool):
    """-> (dict of canonical name -> float array, list of datetime|None)."""
    if CACHE.exists() and not refresh:
        z = np.load(CACHE, allow_pickle=True)
        if int(z["version"][0]) == ARTIFACT_VERSION:
            epoch = z["epoch"]
            ts = [None if not np.isfinite(e) else dt.datetime.fromtimestamp(e) for e in epoch]
            return {k: z[k] for k in z.files if k not in ("version", "epoch")}, ts

    try:
        from openpyxl import load_workbook
    except ImportError:  # pragma: no cover
        sys.exit("openpyxl is required to read the workbook: pip install openpyxl")
    if not WORKBOOK.exists():
        sys.exit(f"workbook not found at {WORKBOOK}")

    print(f"reading {WORKBOOK.name} ({WORKBOOK.stat().st_size / 1e6:.1f} MB) ...")
    wb = load_workbook(WORKBOOK, read_only=True, data_only=True)
    ws = wb[B.SHEET]

    n_rows = B.LAST_DATA_ROW - B.FIRST_DATA_ROW + 1
    data = {c.name: np.full(n_rows, np.nan) for c in B.NUMERIC_COLS}
    stamps: list[dt.datetime | None] = [None] * n_rows

    date_idx = B.BY_NAME["date"].idx
    time_idx = B.BY_NAME["time"].idx

    for i, row in enumerate(ws.iter_rows(min_row=B.FIRST_DATA_ROW,
                                         max_row=B.LAST_DATA_ROW,
                                         values_only=True)):
        if i >= n_rows:
            break
        stamps[i] = _stamp(row[date_idx] if date_idx < len(row) else None,
                           row[time_idx] if time_idx < len(row) else None)
        for c in B.NUMERIC_COLS:
            if c.idx >= len(row):
                continue
            v = row[c.idx]
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                data[c.name][i] = float(v)
        if (i + 1) % 10000 == 0:
            print(f"  {i + 1:,} rows")
    wb.close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        CACHE,
        version=np.array([ARTIFACT_VERSION]),
        epoch=np.array([np.nan if s is None else s.timestamp() for s in stamps]),
        **data,
    )
    print(f"cached parsed values to {CACHE.name}")
    return data, stamps


def _stamp(d, t):
    """Combine the workbook's separate Date and Time cells."""
    if d is None:
        return None
    if isinstance(d, dt.datetime):
        day = d.date()
    elif isinstance(d, dt.date):
        day = d
    else:
        return None
    if isinstance(t, dt.datetime):
        clock = t.time()
    elif isinstance(t, dt.time):
        clock = t
    elif isinstance(t, (int, float)):
        # Excel serial fraction of a day.
        secs = int(round(float(t) % 1.0 * 86400))
        clock = dt.time(secs // 3600 % 24, secs // 60 % 60, secs % 60)
    else:
        clock = dt.time(0, 0, 0)
    return dt.datetime.combine(day, clock)


# --------------------------------------------------------------- deriving

def _mean_where(values, mask):
    """Row-wise mean of `values` over the units where `mask`, skipping holes.

    A unit that is running but whose sensor is missing must be left OUT of the
    average, not counted as zero — on 2025-12-31 CH-5 keeps running while its
    condenser thermometer drops out, and counting the hole as 0 degC pulls the
    plant condenser temperature down by 7 K. Returns NaN when no unit qualifies:
    the mean of nothing is not a temperature, and the bucket average skips it.
    """
    m = (mask > 0) & np.isfinite(values)
    tot = np.where(m, np.nan_to_num(values), 0.0).sum(axis=0)
    cnt = m.sum(axis=0)
    return np.where(cnt > 0, tot / np.maximum(cnt, 1), np.nan)


def _sum_where(values, mask):
    """Row-wise sum of `values` over the units where `mask`.

    Unlike the mean, this returns 0 when nothing is running, because that is the
    true answer: no machines on means no power and no flow. Keeping it a number
    matters for the bucket average — a minute when the plant was off really did
    contribute zero to that quarter-hour, and dropping it would report the
    average of the minutes the plant happened to be running instead.
    """
    m = mask > 0
    return np.where(m, np.nan_to_num(values), 0.0).sum(axis=0)


def derive(D, ts):
    """Canonical per-minute series + the masks that say which rows are usable."""
    n = len(ts)
    S: dict[str, np.ndarray] = {}
    S["epoch"] = np.array([np.nan if s is None else s.timestamp() for s in ts])

    # Per-machine power is the sum of the two metered compressors.
    ch_kw = np.vstack([D[f"ch{i}_cp1_kw"] + D[f"ch{i}_cp2_kw"] for i in range(1, B.N_CH + 1)])
    chwp_kw = np.vstack([D[f"chwp{i}_kw"] for i in range(1, B.N_PUMP + 1)])
    cwp_kw = np.vstack([D[f"cwp{i}_kw"] for i in range(1, B.N_PUMP + 1)])
    ct_kw = np.vstack([D[f"ct{i}_kw"] for i in range(1, B.N_CT + 1)])

    S["ch_kw"], S["chwp_kw"], S["cwp_kw"], S["ct_kw"] = ch_kw, chwp_kw, cwp_kw, ct_kw

    # ON/OFF is INFERRED from power: this site trends no status points at all.
    S["ch_on"] = (ch_kw > B.RUN_KW["ch"]).astype(float)
    S["chwp_on"] = (chwp_kw > B.RUN_KW["chwp"]).astype(float)
    S["cwp_on"] = (cwp_kw > B.RUN_KW["cwp"]).astype(float)
    S["ct_on"] = (ct_kw > B.RUN_KW["ct"]).astype(float)

    S["ch_chw_flow"] = np.vstack([D[f"ch{i}_chw_flow_ls"] for i in range(1, B.N_CH + 1)])
    S["ch_cw_flow"] = np.vstack([D[f"ch{i}_cw_flow_ls"] for i in range(1, B.N_CH + 1)])
    S["ch_cwst"] = np.vstack([D[f"ch{i}_cwst_c"] for i in range(1, B.N_CH + 1)])
    S["ch_cwrt"] = np.vstack([D[f"ch{i}_cwrt_c"] for i in range(1, B.N_CH + 1)])

    S["riser_flow"] = np.nansum(
        np.vstack([D[f"riser_{k}_flow_ls"] for k in B.RISER_KEYS]), axis=0
    )
    S["chws"] = D["header_chwst_c"]
    S["chwr"] = D["header_chwrt_c"]
    S["chw_dt"] = S["chwr"] - S["chws"]
    S["cw_header_flow"] = D["cw_header_flow_ls"]

    S["wetbulb"] = np.nanmean(
        np.vstack([D[f"wst{i}_wetbulb_c"] for i in range(1, B.N_CT + 1)]), axis=0
    )

    # The workbook's own RT column, and the identity it was built from. Both are
    # kept: `plant_rt` is what the records report, `rt_recon` is what validates
    # it. Overwriting one with the other would destroy the only cross-check.
    S["plant_rt"] = D["plant_rt"]
    S["rt_recon_workbook"] = B.RT_FACTOR_WORKBOOK * S["riser_flow"] * S["chw_dt"]
    S["rt_recon_physics"] = B.RT_FACTOR_PHYSICS * S["riser_flow"] * S["chw_dt"]
    S["workbook_kw"] = D["total_plant_kw"]
    S["workbook_kw_per_rt"] = D["plant_kw_per_rt"]

    # PER-MINUTE fleet aggregates.
    #
    # Computed here, at the sampling rate, and only then averaged into buckets.
    # The alternative — average each machine over the bucket, then sum the ones
    # whose bucket status came out ON — silently rewrites history whenever a
    # changeover falls inside a bucket: a machine that ran 3 minutes of 15
    # either disappears entirely or is charged for all 15. Averaging the totals
    # instead gives the bucket the energy that actually flowed through it, which
    # is what a kWh figure has to be built from.
    S["total_ch_kw"] = _sum_where(ch_kw, S["ch_on"])
    S["total_chwp_kw"] = _sum_where(chwp_kw, S["chwp_on"])
    S["total_cwp_kw"] = _sum_where(cwp_kw, S["cwp_on"])
    S["total_ct_kw"] = _sum_where(ct_kw, S["ct_on"])
    S["total_plant_kw"] = (
        np.nan_to_num(S["total_ch_kw"]) + np.nan_to_num(S["total_chwp_kw"])
        + np.nan_to_num(S["total_cwp_kw"]) + np.nan_to_num(S["total_ct_kw"])
    )
    S["chw_flow"] = _sum_where(S["ch_chw_flow"], S["ch_on"])
    S["cw_flow"] = _sum_where(S["ch_cw_flow"], S["ch_on"])
    S["cws"] = _mean_where(S["ch_cwst"], S["ch_on"])
    S["cwr"] = _mean_where(S["ch_cwrt"], S["ch_on"])

    # Quality flags, one boolean row-mask each.
    S["flag_ct4"] = ~np.isfinite(D["ct4_kw"])
    S["flag_negdt"] = np.isfinite(S["chw_dt"]) & (S["chw_dt"] < 0)
    S["flag_zeroflow"] = np.isfinite(S["riser_flow"]) & (S["riser_flow"] <= 0)
    S["flag_nostamp"] = ~np.isfinite(S["epoch"])
    S["unusable"] = S["flag_negdt"] | S["flag_zeroflow"] | S["flag_nostamp"]

    S["n"] = np.array([n])
    return S


# ------------------------------------------------------------- validating

def err_stats(a, b, mask):
    """Error of `b` against `a` over `mask`, in whatever unit they carry."""
    ok = mask & np.isfinite(a) & np.isfinite(b)
    if not ok.any():
        return {"n": 0}
    err = b[ok] - a[ok]
    return {
        "n": int(ok.sum()),
        "mae": round(float(np.mean(np.abs(err))), 4),
        "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
        "bias": round(float(np.mean(err)), 4),
        "mape": round(float(np.mean(np.abs(err / np.maximum(np.abs(a[ok]), 1e-9))) * 100), 4),
        "maxabs": round(float(np.max(np.abs(err))), 3),
    }


def validate(S):
    """Evidence that the reconstructed cooling load matches the workbook.

    Two populations are scored separately and both are reported:

      vsMeasuredRows  the 133 rows the workbook marks as directly measured.
                      This is the only real test of the identity.
      vsAllRows       every row. The workbook itself reconstructed 44,507 of
                      them with the same identity, so agreement here mostly
                      confirms we recovered the workbook's constant — it is a
                      consistency check, not an accuracy claim.
    """
    n = int(S["n"][0])
    usable = ~S["unusable"]
    # The workbook's measured window is rows 2-134, i.e. the first 133 records.
    measured = np.zeros(n, dtype=bool)
    measured[:133] = True
    measured &= usable

    def stats(key):
        raw = err_stats(S["plant_rt"], S[key], measured)
        return {
            "n": raw["n"], "maeRt": raw.get("mae"), "rmseRt": raw.get("rmse"),
            "biasRt": raw.get("bias"), "mapePct": raw.get("mape"),
            "maxAbsErrRt": raw.get("maxabs"),
        }

    def stats_all(key):
        # Every row, including the two the identity itself flags. This one is a
        # consistency check on the constant, not an accuracy claim, so excluding
        # the awkward rows would defeat its purpose.
        raw = err_stats(S["plant_rt"], S[key], np.ones_like(usable, dtype=bool))
        return {
            "n": raw["n"], "maeRt": raw.get("mae"), "rmseRt": raw.get("rmse"),
            "biasRt": raw.get("bias"), "mapePct": raw.get("mape"),
            "maxAbsErrRt": raw.get("maxabs"),
        }

    # Metered plant total against the workbook's own kw column. CT-4's meter is
    # absent for a whole day, so those rows are excluded rather than counted as
    # a model error.
    summed = S["total_plant_kw"]
    kw_mask = usable & ~S["flag_ct4"]
    kw_raw = err_stats(S["workbook_kw"], summed, kw_mask)

    return {
        "coolingLoadFormula": "RT = factor * sum(4 riser flows, L/s) * (CHWR - CHWS, K)",
        "factorWorkbook": B.RT_FACTOR_WORKBOOK,
        "factorPhysics": round(B.RT_FACTOR_PHYSICS, 8),
        "factorRefitFromMeasuredRows": round(_refit_factor(S, measured), 8),
        "vsMeasuredRows": {
            "workbookFactor": stats("rt_recon_workbook"),
            "physicsFactor": stats("rt_recon_physics"),
        },
        "vsAllRows": {
            "workbookFactor": stats_all("rt_recon_workbook"),
            "physicsFactor": stats_all("rt_recon_physics"),
        },
        "plantKwSumVsWorkbookColumn": {
            "n": kw_raw["n"], "maeKw": kw_raw.get("mae"), "rmseKw": kw_raw.get("rmse"),
            "biasKw": kw_raw.get("bias"),
            "note": "sum(running chiller+CHWP+CWP+CT kW) vs the workbook `kw` column, over usable rows with CT-4 present",
        },
        "abnormal": {
            "negativeHeaderDtRows": int(S["flag_negdt"].sum()),
            "zeroRiserFlowRows": int(S["flag_zeroflow"].sum()),
            "ct4PowerMissingRows": int(S["flag_ct4"].sum()),
            "unusableRows": int(S["unusable"].sum()),
        },
    }


def _refit_factor(S, mask):
    """Least-squares factor that best reproduces the measured RT rows."""
    ok = mask & np.isfinite(S["plant_rt"]) & np.isfinite(S["riser_flow"]) & np.isfinite(S["chw_dt"])
    x = S["riser_flow"][ok] * S["chw_dt"][ok]
    y = S["plant_rt"][ok]
    if x.size == 0 or not np.any(x):
        return float("nan")
    return float(np.dot(x, y) / np.dot(x, x))


def timebase(S, ts):
    """Sampling regularity, duplicates and gaps in the raw stamps."""
    # Sorted, because the workbook's ROW order is not chronological: each day's
    # 23:59 row sits immediately before that day's 00:00 row. Diffing in row
    # order would report 30 impossible one-day jumps instead of the single
    # duplicate and single two-minute gap that are actually in the data.
    good = sorted(t for t in ts if t is not None)
    deltas = np.diff(np.array([t.timestamp() for t in good])) if len(good) > 1 else np.array([])
    hist: dict[str, int] = {}
    for d in deltas:
        k = str(int(round(d)))
        hist[k] = hist.get(k, 0) + 1
    mode = float(max(hist, key=lambda k: hist[k])) if hist else float("nan")
    span_min = int((good[-1] - good[0]).total_seconds() // 60) + 1 if len(good) > 1 else 0
    return {
        "first": good[0].strftime("%Y-%m-%d %H:%M:%S") if good else None,
        "last": good[-1].strftime("%Y-%m-%d %H:%M:%S") if good else None,
        "rows": len(ts),
        "parsedTimestamps": len(good),
        "unparsedTimestamps": len(ts) - len(good),
        "intervalSecondsMode": mode,
        "intervalHistogram": dict(sorted(hist.items(), key=lambda kv: -kv[1])),
        "duplicateTimestamps": int(len(good) - len({t for t in good})),
        "expectedRowsAt1Min": span_min,
        "missingRowsVsExpected": span_min - len({t for t in good}),
    }


# ------------------------------------------------------------- resampling

def resample(S, ts, step_min):
    """Aggregate to `step_min` buckets aligned on the wall clock.

    Continuous channels average; a unit counts as running for the bucket when it
    ran for at least half of it. Buckets keep the union of their rows' quality
    flags, so nothing silently launders a flagged minute into a clean average.

    Fleet quantities (plant kW, header flows, condenser temperatures) are
    recomputed from the BUCKET means and the BUCKET staging rather than averaged
    from the per-minute totals. Otherwise a bucket that straddles a changeover
    would report a total belonging to neither lineup.
    """
    good = [(i, t) for i, t in enumerate(ts) if t is not None]
    if not good:
        return []
    start = good[0][1].replace(second=0, microsecond=0)
    start -= dt.timedelta(minutes=start.minute % step_min)

    order = np.full(len(ts), -1, dtype=int)
    for i, t in good:
        order[i] = int((t - start).total_seconds() // (step_min * 60))
    nb = int(order.max()) + 1

    def mean_by_bucket(a):
        out = np.full(nb, np.nan)
        for b in range(nb):
            v = a[order == b]
            v = v[np.isfinite(v)]
            if v.size:
                out[b] = v.mean()
        return out

    def frac_by_bucket(a):
        out = np.zeros(nb)
        for b in range(nb):
            v = a[order == b]
            if v.size:
                out[b] = float(np.mean(v))
        return out

    def fleet_mean(rows):
        return np.vstack([mean_by_bucket(rows[u]) for u in range(rows.shape[0])])

    def fleet_on(rows):
        return np.vstack([(frac_by_bucket(rows[u]) >= 0.5).astype(int) for u in range(rows.shape[0])])

    # Per-machine kW is a bucket mean (that is just what the meter did), but the
    # STATUS is a majority vote and the fleet TOTALS come from the per-minute
    # aggregates — see the note in `derive`.
    ch_kw = fleet_mean(S["ch_kw"])
    ch_on = fleet_on(S["ch_on"])
    chwp_on = fleet_on(S["chwp_on"])
    cwp_on = fleet_on(S["cwp_on"])
    ct_on = fleet_on(S["ct_on"])

    total_ch = mean_by_bucket(S["total_ch_kw"])
    total_chwp = mean_by_bucket(S["total_chwp_kw"])
    total_cwp = mean_by_bucket(S["total_cwp_kw"])
    total_ct = mean_by_bucket(S["total_ct_kw"])
    total_kw = mean_by_bucket(S["total_plant_kw"])
    chw_flow_b = mean_by_bucket(S["chw_flow"])
    cw_flow_b = mean_by_bucket(S["cw_flow"])
    cws_b = mean_by_bucket(S["cws"])
    cwr_b = mean_by_bucket(S["cwr"])

    load = mean_by_bucket(S["plant_rt"])
    wetbulb = mean_by_bucket(S["wetbulb"])
    chws = mean_by_bucket(S["chws"])
    chwr = mean_by_bucket(S["chwr"])
    riser = mean_by_bucket(S["riser_flow"])
    cw_header = mean_by_bucket(S["cw_header_flow"])

    flag_ct4 = frac_by_bucket(S["flag_ct4"].astype(float)) > 0
    flag_negdt = frac_by_bucket(S["flag_negdt"].astype(float)) > 0
    flag_zero = frac_by_bucket(S["flag_zeroflow"].astype(float)) > 0

    def r(v, dp=3):
        return None if v is None or not np.isfinite(v) else round(float(v), dp)

    rows_per_bucket = np.array([int((order == b).sum()) for b in range(nb)])

    records = []
    for b in range(nb):
        if rows_per_bucket[b] == 0:
            continue
        flags = []
        if flag_ct4[b]:
            flags.append("CT4_POWER_GAP")
        if flag_negdt[b]:
            flags.append("NEGATIVE_HEADER_DT")
        if flag_zero[b]:
            flags.append("ZERO_RISER_FLOW")

        dtc = None if not (np.isfinite(chwr[b]) and np.isfinite(chws[b])) else chwr[b] - chws[b]
        records.append({
            "t": (start + dt.timedelta(minutes=b * step_min)).strftime("%Y-%m-%dT%H:%M:%S"),
            # How many raw minutes actually landed in this bucket, NOT the
            # nominal width. Normally step_min; the one short bucket in this
            # month is where a raw minute is missing, and saying so is better
            # than implying the average covers time it does not.
            "minutes": int(rows_per_bucket[b]),
            "loadRt": r(load[b]),
            "wetBulbC": r(wetbulb[b]),
            "chwsC": r(chws[b]),
            "chwrC": r(chwr[b]),
            "chwDeltaT": r(dtc),
            "chwFlowLs": r(chw_flow_b[b]),
            "riserFlowLs": r(riser[b]),
            "cwsC": r(cws_b[b]),
            "cwrC": r(cwr_b[b]),
            "cwFlowLs": r(cw_flow_b[b]),
            "cwHeaderFlowLs": r(cw_header[b]),
            "chillerStatus": [int(v) for v in ch_on[:, b]],
            "chwpStatus": [int(v) for v in chwp_on[:, b]],
            "cwpStatus": [int(v) for v in cwp_on[:, b]],
            "ctStatus": [int(v) for v in ct_on[:, b]],
            "chillerKw": [r(v) for v in ch_kw[:, b]],
            "totalChillerKw": r(total_ch[b]),
            "chwpKw": r(total_chwp[b]),
            "cwpKw": r(total_cwp[b]),
            "towerKw": r(total_ct[b]),
            "totalPlantKw": r(total_kw[b]),
            # From the ROUNDED pair, so the ratio a reader can recompute from
            # the two published columns is the ratio published here.
            "plantKwPerRt": (
                round(r(total_kw[b]) / r(load[b]), 4)
                if r(load[b]) not in (None, 0) and r(total_kw[b]) is not None
                else None
            ),
            "qualityFlags": flags,
        })
    return records


# ---------------------------------------------------------- mapping report

def write_mapping_doc(S):
    n_named = len(B.ALL_COLS)
    L = [
        f"# BMS data mapping - {WORKBOOK.name}",
        "",
        "> GENERATED FILE - produced by `data/scripts/export_bms_records.py`.",
        "> Edit `data/scripts/bms_columns.py` and re-run; do not edit this by hand.",
        ">",
        "> For what is measured vs derived vs assumed, see [`data-provenance.md`](data-provenance.md).",
        "",
        "## Source",
        "",
        "| | |",
        "|---|---|",
        f"| Sheet | `{B.SHEET}` (193 columns, {n_named} named) |",
        f"| Data rows | {int(S['n'][0])} (workbook rows {B.FIRST_DATA_ROW}-{B.LAST_DATA_ROW}) |",
        f"| Period | {S['period'][0]} to {S['period'][1]} |",
        "| Interval | 1 minute |",
        f"| Audit sheet | `{B.AUDIT_SHEET}` - documents the missing-value completion |",
        "",
        "**Header units are unreliable.** Several headers carry a parenthetical",
        "unit that contradicts the data (`CH-1-ChwFls (degC)` is a flow in L/s;",
        "`CH-1-ChwRt (RT)` is a temperature in degC). Every unit below is inferred",
        "from magnitude and tag stem, never copied from the header text.",
        "",
        "## Raw column -> standard name -> unit -> usage",
        "",
        "| # | Raw BMS column | Standard internal name | Unit | Usage | Certainty |",
        "|---:|---|---|---|---|---|",
    ]
    for c in sorted(B.ALL_COLS, key=lambda c: c.idx):
        cert = "**uncertain**" if c.certainty == "uncertain" else c.certainty
        L.append(f"| {c.idx} | `{c.raw}` | `{c.name}` | {c.unit} | {c.usage} | {cert} |")

    L += ["", "### Notes on uncertain or derived columns", ""]
    for c in B.ALL_COLS:
        if c.note:
            L.append(f"- **`{c.name}`** (`{c.raw}`): {c.note}")

    L += [
        "",
        "## Signals this dataset does NOT contain",
        "",
        "Consumers must report these as *not available* rather than defaulting.",
        "",
        "| Requested signal | Why it is missing |",
        "|---|---|",
    ]
    for k, v in B.MISSING_SIGNALS.items():
        L.append(f"| `{k}` | {v} |")

    L += [
        "",
        "## Known anomalies (from the workbook's own audit sheet)",
        "",
        "| Code | Period | Detail | Action |",
        "|---|---|---|---|",
    ]
    for a in B.KNOWN_ANOMALIES:
        L.append(f"| `{a['code']}` | {a['from']} - {a['to']} | {a['detail']} | {a['action']} |")

    MAP_DOC.parent.mkdir(parents=True, exist_ok=True)
    MAP_DOC.write_text("\n".join(L) + "\n", encoding="utf-8")
    return MAP_DOC


# --------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-read the workbook, ignoring the cache")
    ap.add_argument("--step-min", type=int, default=15, help="bucket width in minutes")
    ap.add_argument("--out-dir", type=Path, default=None, help="write artifacts here instead of data/processed")
    args = ap.parse_args()

    out_dir = args.out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    D, ts = read_workbook(args.refresh)
    S = derive(D, ts)
    tb = timebase(S, ts)
    S["period"] = (tb["first"], tb["last"])

    records = resample(S, ts, args.step_min)
    days = sorted({r["t"][:10] for r in records})

    # Truncated, not rounded: an availability figure should never read higher
    # than the machine achieved.
    def pct(mask_rows, u):
        return math.floor(float(np.nanmean(mask_rows[u])) * 1000) / 10

    running_pct = {
        "chillers": [pct(S["ch_on"], u) for u in range(B.N_CH)],
        "chwPumps": [pct(S["chwp_on"], u) for u in range(B.N_PUMP)],
        "cwPumps": [pct(S["cwp_on"], u) for u in range(B.N_PUMP)],
        "coolingTowers": [pct(S["ct_on"], u) for u in range(B.N_CT)],
        "note": "percent of the month each unit was running (kW threshold)",
    }

    summary = {
        "artifactVersion": ARTIFACT_VERSION,
        "datasetId": DATASET_ID,
        "source": {
            "workbook": WORKBOOK.name,
            "sheet": B.SHEET,
            "sizeBytes": WORKBOOK.stat().st_size if WORKBOOK.exists() else 0,
        },
        "stepMinutes": args.step_min,
        "recordCount": len(records),
        "days": days,
        "timebase": tb,
        "equipment": {
            "chillers": B.N_CH, "chwPumps": B.N_PUMP,
            "cwPumps": B.N_PUMP, "coolingTowers": B.N_CT,
        },
        "columnsMapped": len(B.ALL_COLS),
        "columnsUncertain": sum(1 for c in B.ALL_COLS if c.certainty == "uncertain"),
        "provenance": {
            "chwFlowLs": "MEASURED (sum of the per-chiller evaporator meters, ~376 L/s; agrees with the riser total)",
            "cwHeaderFlowLs": "MEASURED (Header-hcwf, ~696 L/s). CONDENSER water despite the 'hcw' tag prefix - see the mapping report",
            "loadRt": "DERIVED in the workbook (only 133 of 44,640 rows measured)",
            "plantKwPerRt": "DERIVED (kw / rt)",
            "equipmentStatus": f"INFERRED from metered kW against RUN_KW {B.RUN_KW}",
            "wetBulbC": "MEASURED (mean of 5 WST sensors)",
            "temperatures": "MEASURED",
            "power": "MEASURED (DPM meters)",
        },
        "rtValidation": validate(S),
        "missingSignals": B.MISSING_SIGNALS,
        "knownAnomalies": B.KNOWN_ANOMALIES,
        "runningUnits": running_pct,
    }

    rec_path = out_dir / f"{DATASET_ID}_{args.step_min}min.json"
    sum_path = out_dir / f"{DATASET_ID}_summary.json"
    rec_path.write_text(json.dumps({
        "artifactVersion": ARTIFACT_VERSION,
        "datasetId": DATASET_ID,
        "stepMinutes": args.step_min,
        "records": records,
    }, indent=1), encoding="utf-8")
    sum_path.write_text(json.dumps(summary, indent=1), encoding="utf-8")
    doc = write_mapping_doc(S)

    rel = lambda p: p.relative_to(REPO) if REPO in p.parents else p
    print(f"wrote {rel(rec_path)}  ({len(records)} records over {len(days)} days)")
    print(f"wrote {rel(sum_path)}")
    print(f"wrote {rel(doc)}")
    v = summary["rtValidation"]["vsMeasuredRows"]["workbookFactor"]
    print(f"RT identity vs the {v['n']} measured rows: MAPE {v['mapePct']}%, MAE {v['maeRt']} RT")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
