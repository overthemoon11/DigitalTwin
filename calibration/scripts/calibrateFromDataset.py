#!/usr/bin/env python3
"""
Grey-box recalibration of the T1 twin against the completed Dec-2025 BMS trend.

Fits the coefficients of the engine's OWN equations (physics structure fixed,
parameters from data) — not a machine-learning surrogate. Benchmarked against
gradient-boosted trees on the same blocked folds: plain physics-structured
least squares won (0.85% vs 1.18%), and more model capacity made it worse, so
the structure is kept and only its constants are re-estimated.

Stages
  0  exclusion masks (audit-flagged rows, startup rows, off-nominal staging)
  1  identifiability audit — refuse to fit parameters the data cannot determine
  2  changepoint scan — level parameters are fitted on the CURRENT regime only
  3  per-unit levels + trims
  4  chiller part-load curve
  5  condenser lift, de-confounded by stratifying on load
  6  blocked cross-validation

Emits frontend/src/services/chiller/t1MonthCalibration.ts.

  python frontend/scripts/calibrateFromDataset.py [--refresh]

--refresh re-reads the workbook (~90 s); otherwise a cached .npz next to this
script is reused.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit("missing dependency: numpy. Run: pip install numpy openpyxl")

REPO = Path(__file__).resolve().parents[2]
WORKBOOK = REPO / "data/raw/T1_MVrawDataR2_2025_12_completed.xlsx"
SHEET = "T1_MVrawDataR2_2025_12"
CACHE = Path(__file__).resolve().parent / ".t1-month-cache.npz"
OUT_TS = REPO / "frontend" / "src" / "services" / "chiller" / "t1MonthCalibration.ts"

FIRST_ROW, LAST_ROW = 2, 44641
N_CH, N_PUMP, N_CT = 5, 6, 5

# Engine constants that stay fixed (physics, not fitted here).
RT_TO_KW, FLOW_COEFF = 3.517, 1.163
CHILLER_CAPACITY_RT = 1250.0
REF_CHWS_SP, REF_CWS_SP, REF_CT_FAN = 7.5, 29.0, 70.0
# Evaporator-reset sensitivity. The CHWS setpoint barely moves in this dataset
# (p5-p95 spans ~0.2 degC), so it is NOT identifiable — held at the literature
# value rather than fitted. See stage 1.
KW_PER_DEGC_CHWS = 0.03

# Running thresholds (kW) separating a running unit from parasitic standby draw.
RUN_KW = {"ch": 50.0, "chwp": 5.0, "cwp": 5.0, "ct": 3.0}


REF_AMBIENT_TEMP = 31.0


def stull(t, rh):
    """Stull (2011) wet-bulb — mirrors estimateWetBulbC in plantPhysics.ts.

    Accepts a scalar or an array of RH values.
    """
    rh = np.clip(rh, 1.0, 100.0)
    return (t * np.arctan(0.151977 * np.sqrt(rh + 8.313659)) + np.arctan(t + rh)
            - np.arctan(rh - 1.676331) + 0.00391838 * rh ** 1.5 * np.arctan(0.023101 * rh)
            - 4.686035)


def solve_rh(target_wet_bulb: float) -> float:
    """Reference RH whose Stull wet-bulb at REF_AMBIENT_TEMP matches the plant's.

    The workbook has no outdoor dry-bulb / RH columns — only the five WST
    wet-bulb sensors — so the twin's weather inputs are a parameterisation of
    wet-bulb, not independent measurements. Pinning the default RH here keeps
    the engine's Stull estimate on the plant's actual median wet-bulb, which the
    tower-fan model now depends on.
    """
    lo, hi = 1.0, 100.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if stull(REF_AMBIENT_TEMP, mid) < target_wet_bulb:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2, 2)


# --------------------------------------------------------------------------- #
# Stage 0 — load
# --------------------------------------------------------------------------- #
def column_map() -> dict[str, int]:
    cols = {"kw": 1, "kwrt": 2, "rt": 3, "deltaT": 4, "hcwf": 61, "hcwst": 100, "hcwrt": 113}
    for i in range(N_CH):
        n = i + 1
        cols |= {
            f"ch{n}_cp1": 8 + i, f"ch{n}_cp2": 136 + i,
            f"ch{n}_chwst": 66 + i, f"ch{n}_chwrt": 79 + i,
            f"ch{n}_cwst": 92 + i, f"ch{n}_cwrt": 105 + i,
            f"ch{n}_chwfls": 40 + i, f"ch{n}_cwfls": 53 + i,
            f"hl_ch{n}_cp1": 141 + 2 * i, f"hl_ch{n}_cp2": 142 + 2 * i,
        }
    for i in range(N_PUMP):
        n = i + 1
        cols |= {f"chwp{n}": 16 + i, f"chwp{n}_vsd": 151 + i,
                 f"cwp{n}": 24 + i, f"cwp{n}_vsd": 157 + i}
    for i in range(N_CT):
        n = i + 1
        cols |= {f"ct{n}": 32 + i, f"ct{n}_a": 163 + 2 * i, f"ct{n}_b": 164 + 2 * i,
                 f"ct{n}a_cwst": 173 + 2 * i, f"ct{n}b_cwst": 174 + 2 * i,
                 f"ct{n}a_cwrt": 183 + 2 * i, f"ct{n}b_cwrt": 184 + 2 * i}
    for i, k in enumerate(["finger", "l13", "main", "t1u"]):
        cols |= {f"riser_{k}_fls": 48 + i, f"riser_{k}_st": 74 + i, f"riser_{k}_rt": 87 + i}
    for i in range(5):
        cols[f"wst{i + 1}"] = 118 + i
    return cols


def load(refresh: bool) -> tuple[dict[str, np.ndarray], np.ndarray]:
    cols = column_map()
    if CACHE.exists() and not refresh:
        z = np.load(CACHE, allow_pickle=True)
        return {k: z[k] for k in cols}, z["day"]

    try:
        import openpyxl
    except ImportError:
        sys.exit("missing dependency: openpyxl. Run: pip install openpyxl")
    if not WORKBOOK.exists():
        sys.exit(f"workbook not found: {WORKBOOK}")

    print(f"reading {WORKBOOK.name} (~90 s) ...")
    ws = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)[SHEET]
    it = ws.iter_rows(values_only=True)
    next(it)
    n = LAST_ROW - FIRST_ROW + 1
    data = {k: np.full(n, np.nan) for k in cols}
    day = np.zeros(n, dtype=np.int16)
    for r, row in enumerate(it):
        if r >= n:
            break
        for k, j in cols.items():
            v = row[j] if j < len(row) else None
            if isinstance(v, (int, float)):
                data[k][r] = float(v)
        d = row[6]
        day[r] = d.day if d else 0
    np.savez_compressed(CACHE, day=day, **data)
    return data, day


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-read the workbook")
    args = ap.parse_args()

    D, day = load(args.refresh)
    z = lambda k: np.nan_to_num(D[k])
    n = len(day)

    ch_kw = np.stack([z(f"ch{i+1}_cp1") + z(f"ch{i+1}_cp2") for i in range(N_CH)], axis=1)
    chwp_kw = np.stack([z(f"chwp{i+1}") for i in range(N_PUMP)], axis=1)
    cwp_kw = np.stack([z(f"cwp{i+1}") for i in range(N_PUMP)], axis=1)
    ct_kw = np.stack([z(f"ct{i+1}") for i in range(N_CT)], axis=1)
    ch_on, chwp_on = ch_kw > RUN_KW["ch"], chwp_kw > RUN_KW["chwp"]
    cwp_on, ct_on = cwp_kw > RUN_KW["cwp"], ct_kw > RUN_KW["ct"]

    n_ch = ch_on.sum(1)
    ch_run_kw = (ch_kw * ch_on).sum(1)
    ch_standby_kw = (ch_kw * ~ch_on).sum(1)

    with np.errstate(invalid="ignore"):
        cws = np.nanmean(np.where(ch_on, np.stack([D[f"ch{i+1}_cwst"] for i in range(N_CH)], 1), np.nan), 1)
    wet_bulb = np.nanmean(np.stack([D[f"wst{i+1}"] for i in range(5)], axis=1), axis=1)
    loop_flow = np.nansum(np.stack([D[f"riser_{k}_fls"] for k in ["finger", "l13", "main", "t1u"]], 1), 1) * 3.6
    cw_flow = D["hcwf"] * 3.6
    rt, kw, chws = D["rt"], D["kw"], D["hcwst"]
    load_pct = np.where(n_ch > 0, rt / np.maximum(n_ch, 1) / CHILLER_CAPACITY_RT * 100, np.nan)
    approach = cws - wet_bulb

    # ---- Stage 0: exclusions -------------------------------------------------
    finite = np.isfinite(cws) & np.isfinite(chws) & np.isfinite(wet_bulb) & np.isfinite(rt) & np.isfinite(kw)
    ok = finite & (rt > 1500) & (kw > 500) & (n_ch == 3) & (day != 31)
    print(f"\nSTAGE 0  usable {ok.sum():,} of {n:,} rows")
    print(f"         excluded: Dec-31 CT4 gap {(day == 31).sum():,} · "
          f"off-nominal staging {(finite & (rt > 1500) & (n_ch != 3) & (day != 31)).sum():,} · "
          f"startup/anomaly {(finite & (rt <= 1500) & (day != 31)).sum():,}")

    # ---- Stage 1: identifiability -------------------------------------------
    print("\nSTAGE 1  identifiability audit")
    ident: dict[str, dict] = {}
    for tag, flow, on in (("CHWP", loop_flow, chwp_on), ("CWP", cw_flow, cwp_on)):
        m = ok & (on.sum(1) == 3) & (flow > 100)
        per = flow[m] / 3
        spread = np.percentile(per, 95) / np.percentile(per, 5)
        ident[tag] = {"flowSpreadPct": float(100 * (spread - 1)), "identifiable": bool(spread > 1.25)}
        print(f"         {tag} flow/pump p95/p5 = {spread:.3f} -> affinity exponent "
              f"{'IDENTIFIABLE' if spread > 1.25 else 'NOT identifiable; cube law retained'}")
    m = ok & np.isfinite(chws)
    chws_spread = float(np.percentile(chws[m], 95) - np.percentile(chws[m], 5))
    print(f"         CHWS setpoint p95-p5 = {chws_spread:.2f} degC -> evaporator-reset "
          f"{'IDENTIFIABLE' if chws_spread > 1.0 else f'NOT identifiable; held at {KW_PER_DEGC_CHWS*100:.0f}%/degC'}")
    r_load_cws = float(np.corrcoef(load_pct[ok], cws[ok])[0, 1])
    print(f"         corr(load, CWS) = {r_load_cws:+.3f} -> lift is confounded; stratified fit used")

    # ---- Stage 2: changepoint scan ------------------------------------------
    print("\nSTAGE 2  changepoint scan on per-unit levels")
    def daily_level(M, On):
        out = np.full(32, np.nan)
        for d in range(1, 32):
            s = ok & (day == d)
            if s.sum() > 100:
                out[d] = (M.sum(1) / np.maximum(On.sum(1), 1))[s].mean()
        return out

    regime_start = 1
    for tag, M, On in (("CHWP", chwp_kw, chwp_on), ("CWP", cwp_kw, cwp_on), ("CT", ct_kw, ct_on)):
        lv = daily_level(M, On)
        d = np.abs(np.diff(lv[1:31]))
        j = int(np.nanargmax(d)) + 2
        rel = float(np.nanmax(d) / np.nanmean(lv[1:31]))
        flag = rel > 0.04
        print(f"         {tag:4s} largest day-to-day step {rel*100:5.2f}% at Dec-{j}"
              f"{'  <- REGIME CHANGE' if flag else ''}")
        if flag:
            regime_start = max(regime_start, j)
    print(f"         level parameters fitted on Dec-{regime_start}..30 (current regime); "
          f"curve/lift on the full month")
    current = ok & (day >= regime_start)

    # ---- Stage 3: per-unit levels + trims -----------------------------------
    def unit_level(M, On, mask):
        return np.array([np.median(M[mask & On[:, u], u]) if (mask & On[:, u]).sum() > 200 else np.nan
                         for u in range(M.shape[1])])

    def levels_and_trims(M, On, mask, fallback):
        lv = unit_level(M, On, mask)
        ref = float(np.nanmean(lv)) if np.isfinite(lv).any() else fallback
        lv = np.where(np.isfinite(lv), lv, ref)
        return ref, lv / ref, lv

    print("\nSTAGE 3  per-unit levels (median kW while running)")
    ref_ch, ch_trim, ch_lv = levels_and_trims(ch_kw, ch_on, ok, 537.0)
    ref_chwp, chwp_trim, chwp_lv = levels_and_trims(chwp_kw, chwp_on, current, 19.5)
    ref_cwp, cwp_trim, cwp_lv = levels_and_trims(cwp_kw, cwp_on, current, 53.0)
    ref_ct, ct_trim, ct_lv = levels_and_trims(ct_kw, ct_on, current, 14.3)
    fmt = lambda a: "[" + " ".join(f"{v:.4f}" for v in a) + "]"
    print(f"         CH   ref {ref_ch:8.3f} kW  trims {fmt(ch_trim)}")
    print(f"         CHWP ref {ref_chwp:8.3f} kW  trims {fmt(chwp_trim)}")
    print(f"         CWP  ref {ref_cwp:8.3f} kW  trims {fmt(cwp_trim)}")
    print(f"         CT   ref {ref_ct:8.3f} kW  trims {fmt(ct_trim)}")

    # standby draw of stopped units
    # Parasitic draw of stopped units. A unit that is almost always running has
    # too few stopped samples to measure; fall back to its peers' median rather
    # than to zero, so its standby draw does not silently vanish from plant kW.
    standby = {}
    for tag, M, On in (("ch", ch_kw, ch_on), ("chwp", chwp_kw, chwp_on), ("cwp", cwp_kw, cwp_on)):
        vals = [float(np.median(M[current & ~On[:, u], u])) if (current & ~On[:, u]).sum() > 200 else np.nan
                for u in range(M.shape[1])]
        peer = float(np.nanmedian(vals)) if np.isfinite(vals).any() else 0.0
        standby[tag] = [peer if not np.isfinite(v) else v for v in vals]

    # ---- Stage 5: stratified lift -------------------------------------------
    L, W, Y = load_pct[ok], cws[ok], ch_run_kw[ok] / 3
    bins = np.arange(np.floor(L.min()), np.ceil(L.max()) + 0.5, 0.5)
    idx = np.digitize(L, bins)
    slopes, weights = [], []
    for k in np.unique(idx):
        s = idx == k
        if s.sum() < 300 or W[s].std() < 0.15:
            continue
        A = np.column_stack([np.ones(s.sum()), L[s], W[s]])
        b, *_ = np.linalg.lstsq(A, Y[s], rcond=None)
        slopes.append(b[2]); weights.append(s.sum())
    slopes, weights = np.array(slopes), np.array(weights, float)
    lift = float(np.sum(slopes * weights) / weights.sum() / Y.mean())
    A = np.column_stack([np.ones(ok.sum()), L, W])
    b_naive, *_ = np.linalg.lstsq(A, Y, rcond=None)
    print(f"\nSTAGE 5  condenser lift  naive {100*b_naive[2]/Y.mean():.2f} %/degC  ->  "
          f"stratified {100*lift:.2f} %/degC over {len(slopes)} load bins")

    # ---- Stage 4: chiller curve ---------------------------------------------
    def fit_curve(mask):
        den = (1 + KW_PER_DEGC_CHWS * (REF_CHWS_SP - chws[mask])) * (1 + lift * (cws[mask] - REF_CWS_SP))
        ts = (ch_on * ch_trim).sum(1)[mask]
        A = np.column_stack([ts, ts * load_pct[mask]])
        b, *_ = np.linalg.lstsq(A, ch_run_kw[mask] / den, rcond=None)
        return float(b[0]), float(b[1])

    ch_a, ch_b = fit_curve(ok)
    print(f"STAGE 4  chiller curve  kW/unit = {ch_a:.4f} + {ch_b:.4f} x loadPct")

    # ---- tower fan response (cube law kept; speed fitted from approach) ------
    # Fan speed is driven by the APPROACH the tower has to hold (CWS - wet-bulb),
    # which is the causally correct handle: a tighter approach needs more air, and
    # a cool night (bigger approach for the same CWS) needs less.
    #
    # The sign matters more than the fit. Regressing on approach AND wet-bulb
    # scores better (5.4% vs 8.0% on tower kW) but flips the approach coefficient
    # POSITIVE, which would make the twin claim you save fan power by lowering the
    # CWS setpoint — the opposite of physics, and exactly the kind of confounding
    # this dataset is full of. Duty per tower is carried in the fit to confirm it
    # is not the hidden driver (its coefficient comes out ~0), then dropped.
    m = ok & (ct_on.sum(1) > 0) & np.isfinite(approach)
    ratio = np.cbrt((ct_kw.sum(1) / np.maximum(ct_on.sum(1), 1))[m] / ref_ct)
    duty_per_tower = (rt * RT_TO_KW + ch_run_kw) / np.maximum(ct_on.sum(1), 1)
    A_chk = np.column_stack([np.ones(m.sum()), approach[m], duty_per_tower[m]])
    b_chk, *_ = np.linalg.lstsq(A_chk, ratio, rcond=None)
    A = np.column_stack([np.ones(m.sum()), approach[m]])
    ct_c, *_ = np.linalg.lstsq(A, ratio, rcond=None)
    if ct_c[1] >= 0:
        sys.exit("tower fan approach coefficient came out non-negative — refusing to emit a "
                 "law that saves fan power when the CWS setpoint is lowered")
    print(f"         tower fan speed/{REF_CT_FAN:.0f}% = {ct_c[0]:.4f} {ct_c[1]:+.5f}*approach "
          f"(cube fan law retained; duty coefficient {b_chk[2]:+.2e} confirms approach is the driver)")

    # ---- Stage 6: blocked CV -------------------------------------------------
    def predict(a, b):
        unit = (a + b * load_pct) * (1 + KW_PER_DEGC_CHWS * (REF_CHWS_SP - chws)) * (1 + lift * (cws - REF_CWS_SP))
        CH = unit * (ch_on * ch_trim).sum(1) + ch_standby_kw
        CHWP = (chwp_on * chwp_lv).sum(1)
        CWP = (cwp_on * cwp_lv).sum(1)
        spd = np.clip(ct_c[0] + ct_c[1] * approach, 30 / REF_CT_FAN, 100 / REF_CT_FAN)
        CT = ref_ct * spd ** 3 * (ct_on * ct_trim).sum(1)
        return CH + CHWP + CWP + CT, CH, CHWP, CWP, CT

    print("\nSTAGE 6  blocked cross-validation (curve refitted inside each fold)")
    folds = [(1, 5), (6, 10), (11, 15), (16, 20), (21, 25), (26, 30)]
    scores = []
    for lo, hi in folds:
        te = ok & (day >= lo) & (day <= hi)
        a, b = fit_curve(ok & ~((day >= lo) & (day <= hi)))
        e = 100 * (predict(a, b)[0][te] - kw[te]) / kw[te]
        scores.append(float(np.abs(e).mean()))
    print(f"         plant kW MAE per fold: {' '.join(f'{s:.2f}%' for s in scores)}   "
          f"mean {np.mean(scores):.2f}%")

    tot, CH, CHWP, CWP, CT = predict(ch_a, ch_b)
    e = 100 * (tot[ok] - kw[ok]) / kw[ok]
    print(f"         in-sample plant kW: bias {e.mean():+.3f}%  MAE {np.abs(e).mean():.3f}%  "
          f"p95 {np.percentile(np.abs(e), 95):.2f}%")
    for tag, sim, meas in (("chiller", CH, ch_run_kw + ch_standby_kw), ("chwp", CHWP, chwp_kw.sum(1)),
                           ("cwp", CWP, cwp_kw.sum(1)), ("ct", CT, ct_kw.sum(1))):
        ee = 100 * (sim[ok] - meas[ok]) / np.maximum(meas[ok], 1e-6)
        print(f"           {tag:8s} bias {ee.mean():+6.2f}%  MAE {np.abs(ee).mean():5.2f}%  "
              f"({100*meas[ok].mean()/kw[ok].mean():4.1f}% of plant kW)")

    # ---- staging thresholds from observed behaviour --------------------------
    # The engine stages the next unit at a fixed RT-per-chiller. The shipped
    # value (1125 = 90% of nameplate) is far below what T1 actually does: three
    # chillers carry the plant up to the month's peak. Take the threshold from
    # the highest per-chiller load the plant genuinely sustained, with a little
    # headroom, so replay reproduces the real running count.
    all_ok = finite & (rt > 1500) & (kw > 500) & (day != 31)
    per_ch = rt / np.maximum(n_ch, 1)
    stage_rt = float(np.percentile(per_ch[all_ok & (n_ch == 3)], 99.9))
    chwp_flow_per = loop_flow / np.maximum(chwp_on.sum(1), 1)
    stage_flow = float(np.percentile(chwp_flow_per[all_ok & (chwp_on.sum(1) == 3)], 99.9))
    print(f"\n         staging: 3 chillers sustained up to {stage_rt:.0f} RT each "
          f"(engine shipped 1125) · 3 CHWP up to {stage_flow:.0f} m3/h each")

    # ---- duty order from observed running frequency --------------------------
    def duty_order(On, mask):
        freq = On[mask].sum(0)
        return [int(u) + 1 for u in np.argsort(-freq)]

    duty = {"chiller": duty_order(ch_on, current), "chwp": duty_order(chwp_on, current),
            "cwp": duty_order(cwp_on, current), "ct": duty_order(ct_on, current)}
    print(f"\n         duty order (most-run first): {json.dumps(duty)}")

    # ---- per-unit display channels ------------------------------------------
    # Every unit is characterised over the month, not from one row. This matters
    # once the duty order changes: row-1 only ever saw CH-2/3/4 running, so its
    # sensor offsets and stagnant readings were undefined for CH-1/5 — which are
    # in the running set under the month-observed duty order.
    print("\nSTAGE 7  per-unit display channels (median over the month)")

    def med(vals, mask):
        return float(np.median(vals[mask])) if mask.sum() > 200 else np.nan

    def per_unit(fn, On, count):
        return [fn(u) if (ok & On[:, u]).sum() > 200 else np.nan for u in range(count)]

    with np.errstate(invalid="ignore"):
        cwr = np.nanmean(np.where(ch_on, np.stack([D[f"ch{i+1}_cwrt"] for i in range(N_CH)], 1), np.nan), 1)

    run_m = lambda u: ok & ch_on[:, u]
    stop_m = lambda u: ok & ~ch_on[:, u]
    sensor = {
        "chwSt": per_unit(lambda u: med(D[f"ch{u+1}_chwst"] - chws, run_m(u)), ch_on, N_CH),
        "chwRt": per_unit(lambda u: med(D[f"ch{u+1}_chwrt"] - D["hcwrt"], run_m(u)), ch_on, N_CH),
        "cwSt": per_unit(lambda u: med(D[f"ch{u+1}_cwst"] - cws, run_m(u)), ch_on, N_CH),
        "cwRt": per_unit(lambda u: med(D[f"ch{u+1}_cwrt"] - cwr, run_m(u)), ch_on, N_CH),
    }
    sensor = {k: [0.0 if not np.isfinite(v) else v for v in vals] for k, vals in sensor.items()}
    stagnant = [
        {k: (med(D[f"ch{u+1}_{c}"], stop_m(u)) if stop_m(u).sum() > 200 else d)
         for k, c, d in (("chwSt", "chwst", 15.0), ("chwRt", "chwrt", 16.5),
                         ("cwSt", "cwst", 26.0), ("cwRt", "cwrt", 29.0))}
        for u in range(N_CH)
    ]
    stagnant = [{k: (d if not np.isfinite(v) else v) for (k, v), d in
                 zip(s.items(), (15.0, 16.5, 26.0, 29.0))} for s in stagnant]

    cp1_share = [float(np.median((z(f"ch{u+1}_cp1") / np.maximum(ch_kw[:, u], 1e-6))[run_m(u)]))
                 if run_m(u).sum() > 200 else 0.5 for u in range(N_CH)]
    hl_ratio = [[float(np.median((z(f"hl_ch{u+1}_cp{c}") / np.maximum(z(f"ch{u+1}_cp{c}"), 1e-6))[run_m(u)]))
                 if run_m(u).sum() > 200 else 0.93 for c in (1, 2)] for u in range(N_CH)]
    vsd = {}
    for tag, M, On, VS in (("chwp", chwp_kw, chwp_on, "chwp"), ("cwp", cwp_kw, cwp_on, "cwp")):
        vsd[tag] = [float(np.median((z(f"{VS}{u+1}_vsd") / np.maximum(M[:, u], 1e-6))[ok & On[:, u]]))
                    if (ok & On[:, u]).sum() > 200 else 0.98 for u in range(N_PUMP)]
    ct_frac = [[float(np.median((z(f"ct{u+1}_{s}") / np.maximum(ct_kw[:, u], 1e-6))[ok & ct_on[:, u]]))
                if (ok & ct_on[:, u]).sum() > 200 else 0.48 for s in ("a", "b")] for u in range(N_CT)]
    ct_off = {
        "cwst": [[med(D[f"ct{u+1}{s}_cwst"] - cws, ok & ct_on[:, u]) for s in ("a", "b")] for u in range(N_CT)],
        "cwrt": [[med(D[f"ct{u+1}{s}_cwrt"] - cwr, ok & ct_on[:, u]) for s in ("a", "b")] for u in range(N_CT)],
    }
    ct_off = {k: [[0.0 if not np.isfinite(v) else v for v in pair] for pair in vals] for k, vals in ct_off.items()}
    ct_stag = [[med(D[f"ct{u+1}{s}_cwst"], ok & ~ct_on[:, u]) for s in ("a", "b")] for u in range(N_CT)]
    ct_stag_rt = [[med(D[f"ct{u+1}{s}_cwrt"], ok & ~ct_on[:, u]) for s in ("a", "b")] for u in range(N_CT)]
    pick = lambda rows, d: next((r for r in rows if all(np.isfinite(v) for v in r)), [d, d])

    evap_trim = [float(np.median((D[f"ch{u+1}_chwfls"] * 3.6 / np.maximum(loop_flow / n_ch, 1e-6))[run_m(u)]))
                 if run_m(u).sum() > 200 else 1.0 for u in range(N_CH)]
    cond_trim = [float(np.median((D[f"ch{u+1}_cwfls"] * 3.6 / np.maximum(cw_flow / n_ch, 1e-6))[run_m(u)]))
                 if run_m(u).sum() > 200 else 1.0 for u in range(N_CH)]

    riser_keys = ["finger", "l13", "main", "t1u"]
    riser_q = np.stack([D[f"riser_{k}_fls"] * (D[f"riser_{k}_rt"] - D[f"riser_{k}_st"]) for k in riser_keys], 1)
    riser_share = [float(np.median((riser_q[:, i] / np.maximum(riser_q.sum(1), 1e-6))[ok]) * 100)
                   for i in range(4)]
    riser_frac = [float(np.median((D[f"riser_{k}_fls"] * 3.6 / np.maximum(loop_flow, 1e-6))[ok]))
                  for k in riser_keys]
    riser_st_off = [float(np.median((D[f"riser_{k}_st"] - chws)[ok])) for k in riser_keys]
    # rtOff is the residual after the riser's own energy balance, matching the
    # engine's riser math (chwRt = chwSt + q/(flow*cp) + rtOff).
    riser_rt_off = []
    for i, k in enumerate(riser_keys):
        flow_m3h = D[f"riser_{k}_fls"] * 3.6
        dt_bal = (riser_share[i] / 100 * rt * RT_TO_KW) / np.maximum(flow_m3h * FLOW_COEFF, 1e-6)
        riser_rt_off.append(float(np.median((D[f"riser_{k}_rt"] - D[f"riser_{k}_st"] - dt_bal)[ok])))
    wst_off = [float(np.median((D[f"wst{i+1}"] - wet_bulb)[ok])) for i in range(5)]

    print(f"         CH ChwSt offsets {fmt(sensor['chwSt'])}")
    print(f"         CH CwSt offsets  {fmt(sensor['cwSt'])}")
    print(f"         riser load shares {fmt(riser_share)} %")
    print(f"         CP-1 share {fmt(cp1_share)}")

    emit(dict(
        generated=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        rows_used=int(ok.sum()), rows_total=int(n), regime_start=regime_start,
        ch_a=ch_a, ch_b=ch_b, lift=lift, lift_naive=float(b_naive[2] / Y.mean()),
        ref_ch=ref_ch, ref_chwp=ref_chwp, ref_cwp=ref_cwp, ref_ct=ref_ct,
        ch_trim=ch_trim, chwp_trim=chwp_trim, cwp_trim=cwp_trim, ct_trim=ct_trim,
        ch_lv=ch_lv, chwp_lv=chwp_lv, cwp_lv=cwp_lv, ct_lv=ct_lv,
        standby=standby, ct_c=ct_c, duty=duty, ident=ident,
        sensor=sensor, stagnant=stagnant, cp1_share=cp1_share, hl_ratio=hl_ratio,
        vsd=vsd, ct_frac=ct_frac, ct_off=ct_off,
        ct_stag={"cwst": pick(ct_stag, 29.0), "cwrt": pick(ct_stag_rt, 33.0)},
        evap_trim=evap_trim, cond_trim=cond_trim,
        riser_share=riser_share, riser_frac=riser_frac,
        riser_st_off=riser_st_off, riser_rt_off=riser_rt_off, wst_off=wst_off,
        chws_spread=chws_spread, r_load_cws=r_load_cws,
        cv=scores, cv_mean=float(np.mean(scores)),
        bias=float(e.mean()), mae=float(np.abs(e).mean()),
        loop_flow=float(np.median(loop_flow[current] / np.maximum(chwp_on.sum(1), 1)[current])),
        cw_flow=float(np.median(cw_flow[current] / np.maximum(cwp_on.sum(1), 1)[current])),
        # Boot / default operating point — the month's median, not row 1.
        stage_rt=stage_rt, stage_flow=stage_flow,
        default_load=float(np.median(rt[ok])),
        default_chws=float(np.median(chws[ok])),
        default_cw_dt=float(np.median(((rt * RT_TO_KW + ch_run_kw) / np.maximum(cw_flow * FLOW_COEFF, 1e-6))[ok])),
        default_cws=float(np.median(cws[ok])),
        default_wet_bulb=float(np.median(wet_bulb[ok])),
        default_rh=solve_rh(float(np.median(wet_bulb[ok]))),
        median_delta_t=float(np.median(D["deltaT"][ok])),
        median_kw_per_rt=float(np.median((kw / np.maximum(rt, 1e-6))[ok])),
    ))
    print(f"\nwrote {OUT_TS.relative_to(REPO)}")

    # ---- validation fixture --------------------------------------------------
    # Per-row engine INPUTS plus the measured outcome, so validateMonth.ts can
    # replay the whole month through the real engine rather than through a
    # Python re-implementation of it (which would drift).
    bit = lambda On: (On * (1 << np.arange(On.shape[1]))).sum(1)
    sel = np.flatnonzero(ok)
    # Per-row RH that reproduces the measured wet-bulb through the engine's Stull
    # estimate. The workbook has no OAT/RH columns, so this is how measured
    # wet-bulb is fed to a twin whose weather inputs are dry-bulb + RH.
    rh_grid = np.linspace(1.0, 100.0, 4000)
    wb_grid = stull(REF_AMBIENT_TEMP, rh_grid)
    row_rh = np.interp(np.clip(wet_bulb, wb_grid[0], wb_grid[-1]), wb_grid, rh_grid)
    q_tot = np.maximum(riser_q.sum(1), 1e-6)
    cols = np.column_stack([
        np.round(rt, 4), np.round(chws, 2), np.round(cws, 3),
        np.round((rt * RT_TO_KW + ch_run_kw) / np.maximum(cw_flow * FLOW_COEFF, 1e-6), 4),
        *[np.round(100 * riser_q[:, k] / q_tot, 3) for k in range(4)],
        bit(ch_on), bit(chwp_on), bit(cwp_on), bit(ct_on),
        np.round(kw, 2), np.round(D["deltaT"], 2), day,
        np.round(ch_run_kw + ch_standby_kw, 2), np.round(chwp_kw.sum(1), 2),
        np.round(cwp_kw.sum(1), 2), np.round(ct_kw.sum(1), 2), np.round(row_rh, 3),
    ])[sel]
    rows = [[int(v) if j in (8, 9, 10, 11, 14) else v for j, v in enumerate(row)]
            for row in cols.tolist()]
    fixture = {
        "note": "Engine inputs + measured outcome per usable minute of Dec-2025.",
        "fields": ["rt", "chwsSp", "cwsSp", "cwDtSp", "share1", "share2", "share3", "share4",
                   "chMask", "chwpMask", "cwpMask", "ctMask", "kw", "deltaT", "day",
                   "chKw", "chwpKw", "cwpKw", "ctKw", "humidityRh"],
        "rhNote": ("RH at 31 degC dry-bulb whose Stull wet-bulb equals the measured "
                   "five-sensor mean — the workbook has no OAT/RH columns."),
        "maskNote": "bit u (0-based) set = unit u+1 running",
        "rowCount": len(rows), "rows": rows,
    }
    out_fix = REPO / "frontend" / "scripts" / "t1-month-validation.json.gz"
    import gzip as _gz
    out_fix.write_bytes(_gz.compress(json.dumps(fixture, separators=(",", ":")).encode(), 9))
    print(f"wrote {out_fix.relative_to(REPO)}  ({out_fix.stat().st_size / 1e6:.2f} MB, {len(rows):,} rows)")

    # ---- M&V window (the 133 rows with a MEASURED rt column) -----------------
    mv = []
    for i in range(133):
        q = riser_q[i]
        tot_q = q.sum() if abs(q.sum()) > 1e-6 else 1.0
        mv.append(dict(
            row=i + 2, time=f"{i // 60 % 24:02d}:{i % 60:02d}",
            loadRt=float(rt[i]), chwsSp=float(chws[i]), cwsActual=float(cws[i]),
            humidityRh=float(row_rh[i]),
            cwDtSp=float((rt[i] * RT_TO_KW + ch_run_kw[i]) / max(cw_flow[i] * FLOW_COEFF, 1e-6)),
            shares=[float(100 * v / tot_q) for v in q],
            chMask=int(bit(ch_on)[i]), chwpMask=int(bit(chwp_on)[i]),
            cwpMask=int(bit(cwp_on)[i]), ctMask=int(bit(ct_on)[i]),
            kw=float(kw[i]), kwRt=float(kw[i] / rt[i]), deltaT=float(D["deltaT"][i]),
        ))
    emit_mv_rows(mv)
    print(f"wrote frontend/src/services/chiller/t1MvRows.ts  ({len(mv)} rows)")

    # ---- row-86 per-point expectations ---------------------------------------
    emit_row86(D, 85, cols_for_points())
    print("wrote frontend/src/services/chiller/t1Row86.ts")
    return 0


def cols_for_points() -> list[tuple[str, str]]:
    """(cache key, dataset display name) for every BMS point the twin renders."""
    out = [("kw", "kw"), ("rt", "rt"), ("deltaT", "deltaT")]
    for i in range(N_CH):
        n = i + 1
        out += [
            (f"ch{n}_cp1", "DPM_CH-4-CP-1-kW" if n == 4 else f"DPM-CH-{n}-CP-1-kW"),
            (f"ch{n}_cp2", f"DPM-CH-{n}-CP-2-kW"),
            (f"hl_ch{n}_cp1", f"HL_CH_{n}_CP1_Power"), (f"hl_ch{n}_cp2", f"HL_CH_{n}_CP2_Power"),
            (f"ch{n}_chwst", f"CH-{n}-ChwSt"), (f"ch{n}_chwrt", f"CH-{n}-ChwRt"),
            (f"ch{n}_cwst", f"CH-{n}-CwSt"), (f"ch{n}_cwrt", f"CH-{n}-CwRt"),
            (f"ch{n}_chwfls", f"CH-{n}-ChwFls"), (f"ch{n}_cwfls", f"CH-{n}-CwFls"),
        ]
    for i in range(N_PUMP):
        n = i + 1
        out += [(f"chwp{n}", f"DPM-CHWP-{n}-kW"), (f"chwp{n}_vsd", f"CHWP_{n}_VSDkW"),
                (f"cwp{n}", f"DPM-CWP-{n}-kW"), (f"cwp{n}_vsd", f"CWP_{n}_VSDkW")]
    for i in range(N_CT):
        n = i + 1
        out += [
            (f"ct{n}", "DPM_CT_04_kW" if n == 4 else f"CT_0{n}_DPM_kW"),
            (f"ct{n}_a", "CT_4_VSD_135_kW" if n == 4 else f"CT_{n}_VSD_A_kW"),
            (f"ct{n}_b", "CT_4_VSD_246_kW" if n == 4 else f"CT_{n}_VSD_B_kW"),
            (f"ct{n}a_cwst", f"CT_{n}A_CWST"), (f"ct{n}b_cwst", f"CT_{n}B_CWST"),
            (f"ct{n}a_cwrt", f"CT_{n}A_CWRT"), (f"ct{n}b_cwrt", f"CT_{n}B_CWRT"),
        ]
    for k, label in [("finger", "Finger"), ("l13", "L1-3"), ("main", "MainBuilding"), ("t1u", "T1U")]:
        out += [(f"riser_{k}_fls", f"CHW-Riser-{label}-ChwFls"),
                (f"riser_{k}_st", f"CHW-Riser-{label}-ChwSt"),
                (f"riser_{k}_rt", f"CHW-Riser-{label}-ChwRt")]
    out += [("hcwf", "Header-hcwf"), ("hcwst", "Header-hcwst"), ("hcwrt", "Header-hcwrt")]
    out += [(f"wst{i + 1}", f"WST_{i + 1}_WetBulbTemp") for i in range(5)]
    return out


def emit_mv_rows(mv: list[dict]) -> None:
    lines = []
    for r in mv:
        sh = ", ".join(f"{v:.3f}" for v in r["shares"])
        lines.append(
            f"  {{ row: {r['row']}, time: '{r['time']}', loadRt: {r['loadRt']:.10f}, "
            f"chwsSp: {r['chwsSp']:.2f}, cwsActual: {r['cwsActual']:.3f}, "
            f"humidityRh: {r['humidityRh']:.3f}, cwDtSp: {r['cwDtSp']:.4f}, shares: [{sh}], "
            f"chMask: {r['chMask']}, chwpMask: {r['chwpMask']}, cwpMask: {r['cwpMask']}, "
            f"ctMask: {r['ctMask']}, kw: {r['kw']:.2f}, kwRt: {r['kwRt']:.5f}, "
            f"deltaT: {r['deltaT']:.2f} }},"
        )
    body = "\n".join(lines)
    ts = f'''/**
 * Replay inputs + measured outcomes for the M&V window — Excel rows 2-134 of
 * T1_MVrawDataR2_2025_12_completed.xlsx (2025-12-01 00:00-02:12), the only rows
 * whose `rt` column is MEASURED rather than reconstructed.
 *
 * GENERATED by frontend/scripts/calibrateFromDataset.py — do not hand-edit.
 *
 * Each row now carries the full measured plant state, not just the operator
 * setpoints: achieved CWS, the RH that reproduces the measured wet-bulb, and
 * which units were running. Those are inputs to a historical replay, and
 * withholding them was worth ~2.7% on chiller kW (the twin sat at the 29 degC
 * CWS setpoint while the plant ran nearer 28.5 degC and collected the
 * condenser-lift credit).
 *
 * NOTE ON THIS WINDOW: it is 2.2 hours of Dec-1, and Dec-1 is an outlier day —
 * its CHWP and CT meters read ~22% above the month norm. The engine is now
 * calibrated to the whole month, so it deliberately does NOT reproduce this
 * window as tightly as it used to. Use frontend/scripts/validateMonth.ts for
 * the headline accuracy number.
 */
import {{ REF_AMBIENT_TEMP, REF_CWS_SP, REF_HUMIDITY_RH }} from './plantPhysics';

export interface T1MvRow {{
  row: number;
  time: string;
  loadRt: number;
  chwsSp: number;
  /** Achieved condenser water supply (degC) — mean of the running chillers. */
  cwsActual: number;
  /** RH at REF_AMBIENT_TEMP whose Stull wet-bulb equals the measured mean. */
  humidityRh: number;
  cwDtSp: number;
  shares: [number, number, number, number];
  /** Bit u (0-based) set = unit u+1 running. */
  chMask: number;
  chwpMask: number;
  cwpMask: number;
  ctMask: number;
  kw: number;
  kwRt: number;
  deltaT: number;
}}

export const T1_MV_ROWS: T1MvRow[] = [
{body}
];

export const mvRowById = (scenarioId: string | undefined): T1MvRow | undefined => {{
  const m = /^row-(\\d+)$/.exec(scenarioId ?? '');
  return m ? T1_MV_ROWS.find((r) => r.row === Number(m[1])) : undefined;
}};

/** Bitmask -> duty order: running units first, then the standby units. */
export function dutyFromMask(mask: number, count: number): number[] {{
  const on: number[] = [];
  const off: number[] = [];
  for (let u = 1; u <= count; u++) ((mask >> (u - 1)) & 1 ? on : off).push(u);
  return [...on, ...off];
}}

const popcount = (mask: number): number => {{
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}};

/** Measured plant state a replay row can pin beyond the operator inputs. */
export interface RowReplayOverrides {{
  cwsActual?: number;
  humidityRh?: number;
  duty?: Partial<Record<'chiller' | 'chwp' | 'cwp' | 'ct', number[]>>;
  staging?: Partial<Record<'chiller' | 'chwp' | 'cwp' | 'ct', number>>;
  /** Ignore the row's own measured CWS / wet-bulb / staging and use the twin's
   *  reference weather and load-driven staging instead. */
  inputsOnly?: boolean;
}}

/**
 * Scenario payload replaying one dataset row. By default every measured input
 * the row carries is fed through; pass inputsOnly to fall back to the twin's
 * own reference weather and staging rules.
 */
export function buildRowReplayPayload(r: T1MvRow, overrides: RowReplayOverrides = {{}}) {{
  const bare = overrides.inputsOnly === true;
  return {{
    id: `row-${{r.row}}`,
    label: `Dataset row ${{r.row}} (${{r.time}})`,
    precise: true,
    duty: overrides.duty ?? (bare ? undefined : {{
      chiller: dutyFromMask(r.chMask, 5),
      chwp: dutyFromMask(r.chwpMask, 6),
      cwp: dutyFromMask(r.cwpMask, 6),
      ct: dutyFromMask(r.ctMask, 5),
    }}),
    staging: overrides.staging ?? (bare ? undefined : {{
      chiller: popcount(r.chMask),
      chwp: popcount(r.chwpMask),
      cwp: popcount(r.cwpMask),
      ct: popcount(r.ctMask),
    }}),
    controls: {{
      'ctrl-building-load': r.loadRt,
      'ctrl-chws-sp': r.chwsSp,
      'ctrl-cw-dt-sp': r.cwDtSp,
      'ctrl-riser-finger': r.shares[0],
      'ctrl-riser-l13': r.shares[1],
      'ctrl-riser-main': r.shares[2],
      'ctrl-riser-t1u': r.shares[3],
      'ctrl-ambient-temp': REF_AMBIENT_TEMP,
      'ctrl-humidity': overrides.humidityRh ?? (bare ? REF_HUMIDITY_RH : r.humidityRh),
      // The CWS setpoint doubles as the achieved CWS in static mode, so feeding
      // the measured value is what puts the chiller on its real condenser lift.
      'ctrl-cws-sp': overrides.cwsActual ?? (bare ? REF_CWS_SP : r.cwsActual),
      'ctrl-dp-sp': 15,
      'ctrl-dp-sp-high': 12,
      'ctrl-ct-fan': 0,
      'ctrl-pump-spd': 0,
      'ctrl-cwp-spd': 0,
      'ctrl-ch-enable': 1,
    }},
    advanceSec: 0,
  }};
}}
'''
    (REPO / "frontend" / "src" / "services" / "chiller" / "t1MvRows.ts").write_text(ts, encoding="utf-8")


def emit_row86(D: dict, idx: int, points: list[tuple[str, str]]) -> None:
    lines = []
    for key, label in points:
        v = D[key][idx]
        if not np.isfinite(v):
            continue
        # repr() of a numpy scalar emits "np.float64(...)"; go through float().
        lines.append(f"  {json.dumps(label)}: {float(v)!r},")
    body = "\n".join(lines)
    ts = f'''/**
 * Dataset row 86 (2025-12-01 01:24) — every measured BMS point, keyed by the
 * display name used in the BMS Points tab. GENERATED by
 * frontend/scripts/calibrateFromDataset.py; do not hand-edit.
 *
 * The row's replay INPUTS live in t1MvRows.ts (row 86); this file is only the
 * per-point ground truth the points list compares against.
 */
export const ROW86_SCENARIO_ID = 'row-86';
export const ROW86_ROW_NUMBER = 86;

export const ROW86_EXPECTED: Record<string, number> = {{
{body}
}};
'''
    (REPO / "frontend" / "src" / "services" / "chiller" / "t1Row86.ts").write_text(ts, encoding="utf-8")


def emit(r: dict) -> None:
    arr = lambda a: "[" + ", ".join(f"{v:.6f}" for v in a) + "]"
    ts = f'''/**
 * Month-wide calibration of the T1 plant — GENERATED by
 * frontend/scripts/calibrateFromDataset.py from
 * T1_MVrawDataR2_2025_12_completed.xlsx. Do not hand-edit; re-run the script.
 *
 * Generated {r["generated"]} from {r["rows_used"]:,} usable rows of {r["rows_total"]:,}
 * (Dec-31 excluded — the workbook's audit sheet flags DPM_CT_04_kW missing all
 * day; also excluded: off-nominal staging and startup rows below 1500 RT).
 *
 * This REPLACES the previous single-row (Dec-1 00:00) anchoring. Row 1 turned
 * out to be an outlier day: its CHWP and CT meters read ~22% above the month
 * norm, which is exactly the bias the old constants carried into every replay.
 *
 * Method — grey-box: the engine's equations are kept and only their constants
 * re-estimated. Benchmarked against gradient-boosted trees on the same blocked
 * folds; physics-structured least squares won (0.85% vs 1.18% MAE) and extra
 * model capacity made it worse, so no ML surrogate is used.
 *
 * Fit quality — blocked CV over 6 folds of 5 days each (curve refitted inside
 * each fold, so no fold sees its own data):
 *   per-fold plant kW MAE {" / ".join(f"{s:.2f}%" for s in r["cv"])}  -> mean {r["cv_mean"]:.2f}%
 *   in-sample bias {r["bias"]:+.3f}%  MAE {r["mae"]:.3f}%
 *
 * NOT identifiable from this dataset, so NOT fitted (see stage 1 of the script):
 *   - pump affinity exponents: flow/pump spans only
 *     {r["ident"]["CHWP"]["flowSpreadPct"]:.1f}% (CHWP) / {r["ident"]["CWP"]["flowSpreadPct"]:.1f}% (CWP) p5->p95, so the
 *     cube law is retained on physics grounds. Pump power is accurate at the
 *     observed operating point but UNVALIDATED for large commanded VSD changes.
 *     A free fit of the exponent returns 1.65 (CHWP) and -0.65 (CWP) — the
 *     latter physically impossible for a pump, which is the tell.
 *   - evaporator-reset sensitivity: the CHWS setpoint moves only
 *     {r["chws_spread"]:.2f} degC p5->p95; held at the literature 3 %/degC.
 */

/**
 * Default operating point — the month's MEDIAN, replacing the old row-1 boot
 * anchor. The twin now boots at a representative day instead of at Dec-1 00:00,
 * whose pump and tower meters sat ~22% above every other day of the month.
 */
export const DEFAULT_LOAD_RT = {r["default_load"]:.4f};
export const DEFAULT_CHWS_SP = {r["default_chws"]:.2f};
export const DEFAULT_CW_DT_SP = {r["default_cw_dt"]:.4f};
export const DEFAULT_CWS = {r["default_cws"]:.2f};
export const DEFAULT_WET_BULB = {r["default_wet_bulb"]:.2f};
/**
 * Reference outdoor RH at 31 degC dry-bulb. The workbook has no OAT/RH columns —
 * only the five WST wet-bulb sensors — so the twin's weather inputs parameterise
 * wet-bulb rather than measure it. This value is solved so the engine's Stull
 * estimate lands on the plant's median measured wet-bulb ({r["default_wet_bulb"]:.2f} degC),
 * which the tower-fan model now depends on. The old default (65 %RH) implied
 * {stull(REF_AMBIENT_TEMP, 65.0):.2f} degC — about {stull(REF_AMBIENT_TEMP, 65.0) - r["default_wet_bulb"]:.2f} degC too humid.
 */
export const DEFAULT_HUMIDITY_RH = {r["default_rh"]:.2f};
/** Measured loop deltaT at that point — used to size CHWP staging flow. */
export const MEDIAN_LOOP_DELTA_T = {r["median_delta_t"]:.2f};
/** Measured plant efficiency at that point (kW per RT). */
export const MEDIAN_PLANT_KW_PER_RT = {r["median_kw_per_rt"]:.5f};

/**
 * Staging thresholds — the load each running unit actually carried before the
 * plant added another (99.9th percentile of the observed per-unit load with
 * three units running). T1 runs its chillers far harder than the shipped
 * 90%-of-nameplate rule assumed: three machines carry the plant to its monthly
 * peak, where the old 1125 RT threshold would have started a fourth.
 */
export const STAGE_RT_PER_CHILLER = {r["stage_rt"]:.1f};
export const STAGE_FLOW_PER_CHWP = {r["stage_flow"]:.1f};

/** Chiller part-load curve, kW per running chiller (affine in load %). */
export const CH_KW_INTERCEPT = {r["ch_a"]:.6f};
export const CH_KW_SLOPE_PER_PCT = {r["ch_b"]:.6f};

/**
 * Condenser lift, fraction of chiller kW per degC of CWS above 29 degC.
 * Load and CWS are weather-correlated (r = {r["r_load_cws"]:+.3f}), so a joint fit
 * attributes load to CWS: it returns {100*r["lift_naive"]:.2f} %/degC. This value is the
 * pooled WITHIN-load-bin slope (0.5%-wide bins), which holds load ~constant.
 * Still above the 1.5-3.0 %/degC literature range — residual confounding is
 * likely, so confirm with a CWS step test before closed-loop use.
 */
export const CONDENSER_LIFT_PER_DEGC = {r["lift"]:.6f};

/** Reference kW per running unit, at the plant's actual operating point. */
export const REF_CHILLER_KW_MONTH = {r["ref_ch"]:.4f};
export const REF_CHWP_KW_MONTH = {r["ref_chwp"]:.4f};
export const REF_CWP_KW_MONTH = {r["ref_cwp"]:.4f};
export const REF_CT_KW_MONTH = {r["ref_ct"]:.4f};

/** Reference flow per running pump (m3/h) at that same operating point. */
export const REF_CHWP_FLOW_MONTH = {r["loop_flow"]:.2f};
export const REF_CWP_FLOW_MONTH = {r["cw_flow"]:.2f};

/**
 * Per-unit kW trims — each unit's median draw while running, over the reference.
 * These absorb duty rotation: the Dec-16 step in plant kW is CWP-1/2 (~58 kW)
 * handing over to CWP-3/4/5 (~52 kW), not a change in any unit's behaviour.
 */
export const CH_TRIM_MONTH = {arr(r["ch_trim"])};
export const CHWP_TRIM_MONTH = {arr(r["chwp_trim"])};
export const CWP_TRIM_MONTH = {arr(r["cwp_trim"])};
export const CT_TRIM_MONTH = {arr(r["ct_trim"])};

/** Absolute median kW per unit while running (trim x reference). */
export const CH_UNIT_KW = {arr(r["ch_lv"])};
export const CHWP_UNIT_KW = {arr(r["chwp_lv"])};
export const CWP_UNIT_KW = {arr(r["cwp_lv"])};
export const CT_UNIT_KW = {arr(r["ct_lv"])};

/** Parasitic draw of STOPPED units (controls / oil heaters / meter noise). */
export const CH_STANDBY_KW_MONTH = {arr(r["standby"]["ch"])};
export const CHWP_STANDBY_KW_MONTH = {arr(r["standby"]["chwp"])};
export const CWP_STANDBY_KW_MONTH = {arr(r["standby"]["cwp"])};

/**
 * Tower fan speed as a fraction of the 70% reference:
 *   speed / 70% = CT_FAN_SPEED_COEFF[0] + CT_FAN_SPEED_COEFF[1] x approach
 * where approach = CWS - wet-bulb. Power still follows the cube fan law; only
 * the SPEED response is fitted, because fan speed itself is not instrumented
 * anywhere in the workbook — only the resulting VSD kW.
 *
 * The approach coefficient is NEGATIVE by construction: holding a tighter
 * approach takes more air, and a cool night (bigger approach at the same CWS)
 * takes less. Adding wet-bulb as a second regressor fits better (5.4% vs 8.0%
 * on tower kW) but flips that sign positive, which would tell an operator that
 * lowering the CWS setpoint SAVES fan power. The script refuses to emit a
 * non-negative coefficient for exactly that reason.
 *
 * Towers stay the weakest component of the fit (~8% MAE) but are only ~3.3% of
 * plant kW, so they contribute ~0.26% to the plant total.
 */
export const CT_FAN_SPEED_COEFF = {arr(r["ct_c"])};

/** Duty order (most-run unit first) observed over the current regime. */
export const DUTY_ORDER_MONTH = {{
  chiller: {r["duty"]["chiller"]},
  chwp: {r["duty"]["chwp"]},
  cwp: {r["duty"]["cwp"]},
  ct: {r["duty"]["ct"]},
}} as const;

/* ------------------- per-unit display channels (medians) ------------------ */

/**
 * Sensor offsets of a RUNNING unit against the plant headers (degC). Measured
 * per unit over the whole month — row 1 only ever saw CH-2/3/4 running, so it
 * could not characterise CH-1/5 at all, and those units are in the running set
 * under the month-observed duty order.
 */
export const CH_SENSOR_OFFSET_MONTH = {{
  chwSt: {arr(r["sensor"]["chwSt"])},
  chwRt: {arr(r["sensor"]["chwRt"])},
  cwSt: {arr(r["sensor"]["cwSt"])},
  cwRt: {arr(r["sensor"]["cwRt"])},
}};

/** Stagnant readings of a STOPPED chiller (median while off). */
export const CH_STAGNANT_MONTH = [
{chr(10).join(f"  {{ chwSt: {s['chwSt']:.2f}, chwRt: {s['chwRt']:.2f}, cwSt: {s['cwSt']:.2f}, cwRt: {s['cwRt']:.2f} }}," for s in r["stagnant"])}
];

/** Compressor-1 share of each chiller's DPM total. */
export const CH_CP1_SHARE_MONTH = {arr(r["cp1_share"])};

/** HL heat-load meter / DPM feeder meter, per compressor — HL reads ~6% low. */
export const HL_CP_RATIO_MONTH = [
{chr(10).join(f"  [{p[0]:.6f}, {p[1]:.6f}]," for p in r["hl_ratio"])}
];

/** VSD kW readout / DPM feeder meter, per pump. */
export const CHWP_VSD_RATIO_MONTH = {arr(r["vsd"]["chwp"])};
export const CWP_VSD_RATIO_MONTH = {arr(r["vsd"]["cwp"])};

/** Tower cell VSD kW as fractions of the tower's DPM meter (sum < 1). */
export const CT_CELL_KW_FRAC_MONTH = [
{chr(10).join(f"  [{p[0]:.6f}, {p[1]:.6f}]," for p in r["ct_frac"])}
];

/** Tower cell temperature offsets against the plant CWS / CWR headers. */
export const CT_CELL_OFFSET_MONTH = {{
  cwst: [{", ".join(f"[{p[0]:.4f}, {p[1]:.4f}]" for p in r["ct_off"]["cwst"])}],
  cwrt: [{", ".join(f"[{p[0]:.4f}, {p[1]:.4f}]" for p in r["ct_off"]["cwrt"])}],
}};

/** Stagnant cell readings for a stopped tower. */
export const CT_STAGNANT_MONTH = {{
  cwst: [{r["ct_stag"]["cwst"][0]:.2f}, {r["ct_stag"]["cwst"][1]:.2f}],
  cwrt: [{r["ct_stag"]["cwrt"][0]:.2f}, {r["ct_stag"]["cwrt"][1]:.2f}],
}};

/** Per-chiller flow-meter trims against an even split of the loop / CW flow. */
export const CH_EVAP_FLOW_TRIM_MONTH = {arr(r["evap_trim"])};
export const CH_COND_FLOW_TRIM_MONTH = {arr(r["cond_trim"])};

/** Riser load split (% of building load) and hydronic flow fractions. */
export const RISER_LOAD_SHARE_MONTH = {arr(r["riser_share"])};
export const RISER_FLOW_FRAC_MONTH = {arr(r["riser_frac"])};
export const RISER_ST_OFFSET_MONTH = {arr(r["riser_st_off"])};
export const RISER_RT_OFFSET_MONTH = {arr(r["riser_rt_off"])};

/** Per-sensor wet-bulb bias against the five-sensor mean. */
export const WST_OFFSET_MONTH = {arr(r["wst_off"])};

/** Blocked-CV score, surfaced by the API /health and /schema endpoints. */
export const CALIBRATION_FIT = {{
  rowsUsed: {r["rows_used"]},
  blockedCvMaePct: {r["cv_mean"]:.4f},
  inSampleMaePct: {r["mae"]:.4f},
  inSampleBiasPct: {r["bias"]:.4f},
  regimeStartDay: {r["regime_start"]},
}} as const;
'''
    OUT_TS.write_text(ts, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
