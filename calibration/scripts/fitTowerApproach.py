# -*- coding: utf-8 -*-
"""Fit the cooling-tower approach (CWS - wet bulb) against the December trend.

Why this exists
---------------
The horizon simulator used to obtain CWS by INVERTING the engine's tower law:
pick a fan speed, ask what approach that speed can hold. The dataset has no fan
speed channel at all, so that law was never fitted against observed fan speeds,
and the inversion returned ~2.7 K where the plant measured 4.64 K. A 2 K
approach error is worth about 5% of plant power, and it pushed every horizon
step outside the twin's calibration envelope.

This fits approach against quantities the site actually measures AND that the
simulator knows before it evaluates the plant: wet bulb, cooling load, and how
many towers are running.

Chronological split, never shuffled - these are time series with a strong daily
cycle, so a random split leaks tomorrow into today and flatters the score.

    python calibration/scripts/fitTowerApproach.py
"""
from __future__ import annotations

import io
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ARTIFACT = os.path.join(REPO, "data", "processed", "t1_2025_12_15min.json")

TRAIN_FRACTION = 0.8


def load():
    with io.open(ARTIFACT, encoding="utf8") as fh:
        recs = json.load(fh)["records"]
    ok = [r for r in recs if not r["qualityFlags"]]
    need = ("cwsC", "wetBulbC", "loadRt", "cwrC", "cwFlowLs")
    ok = [r for r in ok if all(r.get(k) is not None for k in need)]
    return ok


def design(recs):
    """Feature matrix. Every column must be knowable BEFORE the plant is
    evaluated, otherwise the simulator cannot use the fit.

    Two features, and the second one is deliberate rather than earned:

    - `wetBulbC` carries the model. Alone it scores 0.107 K held-out MAE
      (r = -0.918); everything else is decoration on top of it.
    - `loadRt` adds only ~0.006 K of accuracy, because December's load barely
      moved. It stays anyway: without a load term the tower cannot see staging
      at all, so shedding a chiller would leave CWS unchanged and the MPC would
      optimise against a condenser that never responds to it. The coefficient
      is small, correctly signed and physically necessary.

    Dropped: a tower COUNT term fitted to +0.18 K per tower - more towers, worse
    approach - which is backwards. It correlates at +0.064 and 83% of the month
    ran four towers, so the sign is an artefact of load confounding, not a
    relation. A quadratic in wet bulb is also dropped: it buys 0.02 K over a
    4 K observed span and would extrapolate wildly beyond it.
    """
    wb = np.array([r["wetBulbC"] for r in recs])
    load = np.array([r["loadRt"] for r in recs]) / 1000.0
    X = np.column_stack([np.ones_like(wb), wb, load])
    y = np.array([r["cwsC"] - r["wetBulbC"] for r in recs])
    return X, y, ["intercept", "wetBulbC", "loadRt/1000"]


def metrics(y, yhat):
    err = yhat - y
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    return {
        "n": int(len(y)),
        "maeK": float(np.mean(np.abs(err))),
        "rmseK": float(np.sqrt(np.mean(err ** 2))),
        "biasK": float(np.mean(err)),
        "maxAbsK": float(np.max(np.abs(err))),
        "r2": 1.0 - ss_res / ss_tot if ss_tot else float("nan"),
    }


def show(tag, m):
    print(
        "  %-18s n=%-5d MAE %.3f K   RMSE %.3f K   bias %+.3f K   max %.2f K   R2 %.3f"
        % (tag, m["n"], m["maeK"], m["rmseK"], m["biasK"], m["maxAbsK"], m["r2"])
    )


def main():
    recs = load()
    if not recs:
        sys.exit("no usable records; run data/scripts/export_bms_records.py --refresh")

    # Whole-day chronological boundary, so a fold holds complete diurnal cycles.
    days = sorted({r["t"][:10] for r in recs})
    cut_day = days[int(len(days) * TRAIN_FRACTION)]
    train = [r for r in recs if r["t"][:10] < cut_day]
    test = [r for r in recs if r["t"][:10] >= cut_day]

    print("Tower approach fit  (CWS - wet bulb)")
    print("  records %d   train %d (to %s)   test %d (from %s)\n"
          % (len(recs), len(train), days[days.index(cut_day) - 1], len(test), cut_day))

    Xtr, ytr, names = design(train)
    Xte, yte, _ = design(test)

    coeff, *_ = np.linalg.lstsq(Xtr, ytr, rcond=None)

    print("coefficients")
    for name, c in zip(names, coeff):
        print("  %-14s %+.6f" % (name, c))

    print("\nfit quality")
    show("train", metrics(ytr, Xtr @ coeff))
    show("test (held out)", metrics(yte, Xte @ coeff))

    # The baseline worth beating: the constant the inverted law effectively used.
    Xall, yall, _ = design(recs)
    show("constant 2.7 K", metrics(yall, np.full_like(yall, 2.7)))
    show("constant = mean", metrics(yall, np.full_like(yall, float(ytr.mean()))))
    show("fitted, all rows", metrics(yall, Xall @ coeff))

    # Refit on everything for the shipped constants: the held-out score above is
    # the honest estimate of accuracy, but the shipped model should see all data.
    final, *_ = np.linalg.lstsq(Xall, yall, rcond=None)
    print("\nshipped coefficients (refit on all %d rows)" % len(recs))
    for name, c in zip(names, final):
        print("  %-14s %+.6f" % (name, c))
    show("in-sample", metrics(yall, Xall @ final))

    lo, hi = float(np.min(yall)), float(np.max(yall))
    print("\nobserved approach range %.2f - %.2f K  (clamp the model to this)" % (lo, hi))

    out = {
        "source": "data/processed/t1_2025_12_15min.json",
        "features": names,
        "coefficients": [float(c) for c in final],
        "heldOut": metrics(yte, Xte @ coeff),
        "inSample": metrics(yall, Xall @ final),
        "observedApproachK": {"min": lo, "max": hi},
        "trainDaysTo": days[days.index(cut_day) - 1],
        "testDaysFrom": cut_day,
    }
    dest = os.path.join(REPO, "data", "processed", "tower_approach_fit.json")
    with io.open(dest, "w", encoding="utf8") as fh:
        fh.write(json.dumps(out, indent=2))
    print("\nwrote %s" % os.path.relpath(dest, REPO))


if __name__ == "__main__":
    main()
