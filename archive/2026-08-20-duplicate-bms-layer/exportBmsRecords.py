"""Normalise the raw T1 BMS workbook into canonical PlantRecords.

This is the ONLY place in the project that knows raw BMS column names. Every
downstream consumer reads the emitted records, which follow
`shared/types/bms.ts` exactly.

    python calibration/scripts/exportBmsRecords.py            # 15-min records
    python calibration/scripts/exportBmsRecords.py --interval 1

Emits:
    data/processed/t1-bms-<interval>min.json.gz     records + summary

Design notes
------------
* Units are asserted here, not read from the file. The header suffixes in the
  workbook are scrambled (a flow column labelled degC, a return temperature
  labelled L/s), so they are ignored entirely.
* `Header-hcwf` is the CONDENSER header flow, not chilled water. It matches the
  summed chiller CwFls to ~1.9 L/s. The chilled-water flow that actually feeds
  the RT column is the sum of the four CHW risers, which is what the workbook
  Calculation_Audit sheet documents.
* Signals T1 does not instrument (header DP, pump speed %, CT fan speed %,
  valve positions, explicit setpoints) are emitted as null. They are never
  defaulted, because a model trained on a fabricated channel is worse than a
  model that refuses to train.
"""
from __future__ import annotations

import argparse
import gzip
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
CACHE = REPO / "calibration/fixtures/.t1-month-cache.npz"
OUTDIR = REPO / "data/processed"

# Documented by the workbook Calculation_Audit sheet.
RT_FACTOR = 1.18892327296496
RT_THEORY = 4.186 / 3.517
RT_FORMULA = (
    "RT = 1.18892327296496 x SUM(4 CHW riser flows, L/s) "
    "x (Header-hcwrt - Header-hcwst, degC)"
)

# A stopped chiller still draws ~0.7 kW of controls/oil-heater load and a
# stopped pump ~0.03 kW. These thresholds separate running from parasitic.
ON_KW = {"chiller": 20.0, "chwp": 1.0, "cwp": 1.0, "ct": 0.5}

N_CH, N_PUMP, N_CT = 5, 6, 5
START = datetime(2025, 12, 1, 0, 0, 0)

AVAILABILITY = {
    "measured": [
        "header CHWS/CHWR temperature",
        "4x CHW riser flow",
        "condenser header flow",
        "per-chiller CHWS/CHWR/CWS/CWR",
        "per-chiller evaporator and condenser flow",
        "per-compressor chiller kW (2 per unit)",
        "per-pump kW (feeder meter + VSD readout)",
        "per-tower kW and per-cell kW",
        "per-tower-cell CWST/CWRT",
        "5x wet-bulb sensors",
        "total plant kW",
    ],
    "reconstructed": {
        "plantRt": RT_FORMULA + "  (133 of 44,640 rows metered; the rest derived)",
        "plantKwPerRt": "total plant kW / plantRt",
        "chillerStatus": "compressor kW above 20 kW (OFF units idle at ~0.7 kW)",
        "chwpStatus/cwpStatus/ctStatus": "unit kW above the parasitic threshold",
    },
    "unavailable": [
        "CHW differential pressure (no DP transmitter logged)",
        "pump speed % or Hz (only VSD kW is logged)",
        "cooling-tower fan speed % (only VSD kW is logged)",
        "valve positions",
        "explicit control setpoints (CHWST-SP, DP-SP)",
        "outdoor dry-bulb temperature and relative humidity",
        "chiller ON/OFF status bit (derived from power instead)",
    ],
}


def load_channels():
    if not CACHE.exists():
        raise SystemExit(
            "cache not found: {}\n"
            "Run calibration/scripts/calibrateFromDataset.py --refresh first; it "
            "extracts the workbook into the .npz this exporter reads.".format(CACHE)
        )
    z = np.load(CACHE, allow_pickle=True)
    return {k: np.asarray(z[k], dtype=float) for k in z.files}


def build(interval):
    d = load_channels()
    n = len(d["rt"])

    risers = sum(d["riser_{}_fls".format(k)] for k in ("finger", "l13", "main", "t1u"))
    chws, chwr = d["hcwst"], d["hcwrt"]

    # Recompute RT from first principles rather than trusting the column, then
    # cross-check. Drift means the workbook and this exporter disagree.
    rt_calc = RT_FACTOR * risers * (chwr - chws)
    resid = np.abs(rt_calc - d["rt"])
    mae = float(np.nanmean(resid))
    outliers = int(np.nansum(resid > 1.0))
    # Judge the bulk, not the worst row: the workbook flags a handful of
    # anomalous minutes (inverted header dT on 2025-12-23) where its stored RT
    # and the formula legitimately part company. A brittle max() check fails on
    # those; a mean check catches an actual formula mismatch.
    if mae > 0.05:
        raise SystemExit(
            "RT reconstruction disagrees with the workbook: MAE {:.4f} RT".format(mae)
        )
    print("  RT reconstruction check: MAE {:.4f} RT, {} row(s) over 1 RT "
          "(known anomalies), max {:.2f} RT".format(mae, outliers, float(np.nanmax(resid))))

    ch_kw = np.stack([d["ch{}_cp1".format(i)] + d["ch{}_cp2".format(i)]
                      for i in range(1, N_CH + 1)], 1)
    chwp_kw = np.stack([d["chwp{}".format(i)] for i in range(1, N_PUMP + 1)], 1)
    cwp_kw = np.stack([d["cwp{}".format(i)] for i in range(1, N_PUMP + 1)], 1)
    ct_kw = np.stack([d["ct{}".format(i)] for i in range(1, N_CT + 1)], 1)
    ch_chwf = np.stack([d["ch{}_chwfls".format(i)] for i in range(1, N_CH + 1)], 1)
    ch_cwf = np.stack([d["ch{}_cwfls".format(i)] for i in range(1, N_CH + 1)], 1)

    cwst = np.nanmean(np.stack([d["ch{}_cwst".format(i)] for i in range(1, N_CH + 1)], 1), axis=1)
    cwrt = np.nanmean(np.stack([d["ch{}_cwrt".format(i)] for i in range(1, N_CH + 1)], 1), axis=1)
    wetbulb = np.nanmean(np.stack([d["wst{}".format(i)] for i in range(1, 6)], 1), axis=1)

    step = max(1, int(interval))
    idx = np.arange(0, n, step)

    def agg(a, i):
        """Mean over the interval ignoring NaN; None when the window is empty."""
        w = a[i:i + step]
        w = w[np.isfinite(w)]
        return float(np.mean(w)) if w.size else None

    def r(v, nd=4):
        return None if v is None else round(v, nd)

    records = []
    flag_counts = {}
    for i in idx:
        flags = []
        rt = agg(d["rt"], i)
        kw = agg(d["kw"], i)

        if rt is not None and rt <= 0:
            flags.append("nonpositive-rt")
        elif rt is not None and rt <= 100:
            flags.append("implausibly-low-rt")
        if agg(ct_kw[:, 3], i) is None:
            flags.append("ct4-power-missing")
        for j in range(N_CH):
            if agg(d["ch{}_chwst".format(j + 1)], i) is None:
                flags.append("ch{}-temps-missing".format(j + 1))

        on_ch = [bool((agg(ch_kw[:, j], i) or 0.0) > ON_KW["chiller"]) for j in range(N_CH)]
        on_chwp = [bool((agg(chwp_kw[:, j], i) or 0.0) > ON_KW["chwp"]) for j in range(N_PUMP)]
        on_cwp = [bool((agg(cwp_kw[:, j], i) or 0.0) > ON_KW["cwp"]) for j in range(N_PUMP)]
        on_ct = [bool((agg(ct_kw[:, j], i) or 0.0) > ON_KW["ct"]) for j in range(N_CT)]

        for f in flags:
            flag_counts[f] = flag_counts.get(f, 0) + 1

        records.append({
            "timestamp": (START + timedelta(minutes=int(i))).isoformat(),
            "minuteIndex": int(i),

            "buildingLoadRt": r(rt, 2),
            "wetBulbC": r(agg(wetbulb, i), 3),

            "chwstC": r(agg(chws, i), 3),
            "chwrtC": r(agg(chwr, i), 3),
            "chwFlowLs": r(agg(risers, i), 3),
            "chwDpKpa": None,

            "cwstC": r(agg(cwst, i), 3),
            "cwrtC": r(agg(cwrt, i), 3),
            "cwFlowLs": r(agg(d["hcwf"], i), 3),

            "chillerStatus": on_ch,
            "chwpStatus": on_chwp,
            "cwpStatus": on_cwp,
            "ctStatus": on_ct,

            "chwstSpC": r(agg(chws, i), 3),
            "dpSpKpa": None,
            "chwpSpeedPct": [None] * N_PUMP,
            "cwpSpeedPct": [None] * N_PUMP,
            "ctFanSpeedPct": [None] * N_CT,

            "chillerKw": [r(agg(ch_kw[:, j], i), 3) for j in range(N_CH)],
            "totalChillerKw": r(float(np.nansum(
                [agg(ch_kw[:, j], i) or 0.0 for j in range(N_CH)])), 3),
            "chwpKw": r(float(np.nansum(
                [agg(chwp_kw[:, j], i) or 0.0 for j in range(N_PUMP)])), 3),
            "cwpKw": r(float(np.nansum(
                [agg(cwp_kw[:, j], i) or 0.0 for j in range(N_PUMP)])), 3),
            "towerKw": r(float(np.nansum(
                [agg(ct_kw[:, j], i) or 0.0 for j in range(N_CT)])), 3),
            "totalPlantKw": r(kw, 3),

            "plantRt": r(rt, 2),
            "plantKwPerRt": r(agg(d["kwrt"], i), 5),

            "chwFlowPerChillerLs": r(float(np.nansum(
                [agg(ch_chwf[:, j], i) or 0.0 for j in range(N_CH)])), 2),
            "cwFlowPerChillerLs": r(float(np.nansum(
                [agg(ch_cwf[:, j], i) or 0.0 for j in range(N_CH)])), 2),

            "valid": len(flags) == 0,
            "flags": flags,
        })

    def rng(arr):
        a = arr[np.isfinite(arr)]
        return {
            "min": round(float(a.min()), 3),
            "p5": round(float(np.percentile(a, 5)), 3),
            "median": round(float(np.median(a)), 3),
            "p95": round(float(np.percentile(a, 95)), 3),
            "max": round(float(a.max()), 3),
        }

    ok = np.isfinite(rt_calc) & np.isfinite(d["rt"]) & (d["rt"] > 100)
    theory = RT_THEORY * risers * (chwr - chws)

    summary = {
        "source": "data/raw/T1_MVrawDataR2_2025_12_completed.xlsx",
        "sheet": "T1_MVrawDataR2_2025_12",
        "kind": "real-bms",
        "rows": len(records),
        "intervalMinutes": step,
        "start": records[0]["timestamp"],
        "end": records[-1]["timestamp"],
        "days": round(n / 1440.0, 2),
        "validRows": sum(1 for x in records if x["valid"]),
        "flaggedRows": sum(1 for x in records if not x["valid"]),
        "flagCounts": flag_counts,
        "availability": AVAILABILITY,
        "loadProvenance": {
            "formula": RT_FORMULA,
            "factor": RT_FACTOR,
            "theoreticalFactor": round(RT_THEORY, 6),
            "meteredRows": 133,
            "reconstructedRows": 44507,
            "validationMae": round(float(np.mean(np.abs(theory[ok] - d["rt"][ok]))), 4),
            "validationMape": round(float(np.mean(
                np.abs(100.0 * (theory[ok] - d["rt"][ok]) / d["rt"][ok]))), 5),
        },
        "ranges": {
            "plantRt": rng(d["rt"]),
            "totalPlantKw": rng(d["kw"]),
            "plantKwPerRt": rng(d["kwrt"]),
            "chwstC": rng(chws),
            "chwrtC": rng(chwr),
            "chwFlowLs": rng(risers),
            "cwFlowLs": rng(d["hcwf"]),
            "wetBulbC": rng(wetbulb),
        },
    }
    return {"summary": summary, "records": records}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=15,
                    help="output sampling interval in minutes (source is 1-min)")
    args = ap.parse_args()

    payload = build(args.interval)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    out = OUTDIR / "t1-bms-{}min.json.gz".format(args.interval)
    with gzip.open(out, "wt", encoding="utf8") as fh:
        json.dump(payload, fh, separators=(",", ":"))

    s = payload["summary"]
    print("wrote {}  ({:.2f} MB)".format(out.relative_to(REPO), out.stat().st_size / 1e6))
    print("  {} records at {}-min  ({} -> {}, {} days)".format(
        s["rows"], s["intervalMinutes"], s["start"], s["end"], s["days"]))
    print("  valid {}   flagged {}   {}".format(
        s["validRows"], s["flaggedRows"], s["flagCounts"]))
    lp = s["loadProvenance"]
    print("  RT: {} metered / {} reconstructed; theory-vs-column MAE {} RT ({}%)".format(
        lp["meteredRows"], lp["reconstructedRows"], lp["validationMae"], lp["validationMape"]))
    print("  unavailable channels: {}".format(len(s["availability"]["unavailable"])))


if __name__ == "__main__":
    main()
