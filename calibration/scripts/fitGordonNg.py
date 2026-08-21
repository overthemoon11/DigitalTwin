"""Fit the Gordon-Ng chiller model to the real T1 December trend, and score it
against the affine part-load curve the engine currently uses.

    python calibration/scripts/fitGordonNg.py            # fit + report
    python calibration/scripts/fitGordonNg.py --write    # also emit the .ts

WHY THIS EXISTS
---------------
The engine prices a chiller as an AFFINE function of per-machine load percent:

    kW = CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT * loadPct
       = -29.41 + 6.664 * loadPct

That is an excellent fit inside the band T1 actually ran (three machines, all
month, 69-92% load each) and a dangerous one outside it, because the intercept
is NEGATIVE. Summed over n machines carrying a fixed plant load L,

    total = n * (-29.41 + 6.664 * 100 * (L/n) / 1250) = -29.41*n + 0.533*L

which falls monotonically with n: the model says more chillers is always
cheaper, forever. A staging optimiser handed that curve will stage up to the
last available machine at every load, and the "saving" is an artifact of
extrapolating a straight line out of the region that produced it.

Gordon-Ng has the physically correct structure for exactly this question:

    P = [Q*(Tcds - Tchs) + a1*Tcds*Tchs + a2*(Tcds - Tchs) + a3*Q^2]
        / (Tchs - a4*Q)

As Q -> 0 it tends to a1*Tcds, a POSITIVE no-load loss, so an idling machine
costs something and part-load efficiency degrades the way a real centrifugal
does. That is what makes staging a genuine trade-off rather than a one-way
street.

The fitting routine is imported from `mpc_program/chiller_mpc/gordon_ng.py`
rather than reimplemented, so the paper's identification procedure (linear seed,
then bounded nonlinear least squares on the direct prediction residual) is the
one used here too. That import is deliberate: it is the same code the synthetic
benchmark validates against known truth in `run_mpc.py --selftest`, so the
identification is exercised on a case where the answer is known before it is
trusted on a case where it is not.

The consumer of this fit is `chillerPartLoad.ts`, which does NOT replace the
engine's curve with this one. It multiplies the engine's level by the ratio of
the two models' shapes, normalised at the observed median load, so the factor is
exactly 1.0 where the affine curve is best evidenced and only bites outside it.

DATA
----
Per-machine operating points come from the numeric cache the BMS exporter
writes (`data/processed/.t1-bms-cache.npz`, 44,640 minutes x 136 canonical
channels), so this script never re-parses the 38 MB workbook.

    Q      per-chiller evaporator duty, RT
           = RT_FACTOR * ChwFls * (ChwRt - ChwSt)     [MEASURED]
    Tchs   per-chiller leaving chilled water, degC     [MEASURED]
    Tcds   per-chiller entering condenser water, degC  [MEASURED]
    P      CP-1 + CP-2 metered compressor power, kW    [MEASURED]

A machine counts as running when P > 50 kW (the exporter's own threshold).

SPLIT
-----
Chronological, on a whole-day boundary: the first 24 days train, the last 7
test. Never shuffled — these are 1-minute samples of a slowly varying process
and a random split would leak neighbouring minutes into the test set.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "mpc_program"))

from chiller_mpc.gordon_ng import fit_gn, gn_power_kw  # noqa: E402

CACHE = REPO / "data" / "processed" / ".t1-bms-cache.npz"
OUT_TS = REPO / "backend" / "src" / "digital-twin" / "chiller" / "calibration" / "gordonNgFit.ts"
OUT_JSON = REPO / "data" / "processed" / "gordon_ng_fit.json"

N_CH = 5
RUN_KW = 50.0
RT_FACTOR = 1.18892327296496
RT_TO_KW = 3.517
KELVIN = 273.15
CHILLER_CAPACITY_RT = 1250.0

# The engine's affine curve, quoted so this script can score it side by side.
CH_KW_INTERCEPT = -29.412439
CH_KW_SLOPE_PER_PCT = 6.664188

TEST_DAYS = 7


def load_points():
    """Per-machine (Q, Tchs, Tcds, P, day) for every running minute."""
    if not CACHE.exists():
        raise SystemExit(
            f"{CACHE} not found. Run `python data/scripts/export_bms_records.py --refresh` first."
        )
    z = np.load(CACHE, allow_pickle=True)
    epoch = z["epoch"]
    days = np.array([dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d") for t in epoch])

    out = []
    for n in range(1, N_CH + 1):
        p = z[f"ch{n}_cp1_kw"] + z[f"ch{n}_cp2_kw"]
        flow = z[f"ch{n}_chw_flow_ls"]
        chws = z[f"ch{n}_chwst_c"]
        chwr = z[f"ch{n}_chwrt_c"]
        cws = z[f"ch{n}_cwst_c"]
        q = RT_FACTOR * flow * (chwr - chws)

        ok = (
            np.isfinite(p) & np.isfinite(q) & np.isfinite(chws) & np.isfinite(cws)
            & (p > RUN_KW)
            & (q > 50.0)                    # a running machine making no cooling is a sensor gap
            & (q < CHILLER_CAPACITY_RT * 1.3)
            & (cws > chws + 5.0)            # lift must be physical
        )
        out.append(
            {
                "unit": n,
                "q_rt": q[ok],
                "t_chs_c": chws[ok],
                "t_cds_c": cws[ok],
                "p_kw": p[ok],
                "day": days[ok],
            }
        )
    return out


def metrics(actual, pred):
    a = np.asarray(actual, float)
    p = np.asarray(pred, float)
    err = p - a
    ss_tot = float(np.sum((a - a.mean()) ** 2))
    ss_res = float(np.sum(err**2))
    return {
        "n": int(a.size),
        "maeKw": round(float(np.mean(np.abs(err))), 4),
        "rmseKw": round(float(np.sqrt(np.mean(err**2))), 4),
        "biasKw": round(float(np.mean(err)), 4),
        "mapePct": round(float(np.mean(np.abs(err / np.maximum(a, 1.0))) * 100), 4),
        "r2": round(1.0 - ss_res / max(ss_tot, 1e-9), 5),
    }


def affine_pred(q_rt):
    """The engine's current curve, evaluated on the same points."""
    return CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT * (np.asarray(q_rt, float) / CHILLER_CAPACITY_RT * 100.0)


def gn_pred(q_rt, t_cds_c, t_chs_c, a):
    return gn_power_kw(
        np.asarray(q_rt, float) * RT_TO_KW,
        np.asarray(t_cds_c, float) + KELVIN,
        np.asarray(t_chs_c, float) + KELVIN,
        a,
    )


def split(points, boundary_day):
    tr = points["day"] < boundary_day
    te = ~tr
    return tr, te


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="emit the TypeScript artifact")
    args = ap.parse_args()

    per_unit = load_points()
    all_days = sorted({d for u in per_unit for d in set(u["day"].tolist())})
    boundary = all_days[-TEST_DAYS]
    print(f"{len(all_days)} days; train < {boundary} <= test ({TEST_DAYS} days held out)\n")

    units = []
    pooled = {k: [] for k in ("q_rt", "t_chs_c", "t_cds_c", "p_kw", "day")}

    for u in per_unit:
        if u["q_rt"].size < 500:
            print(f"CH-{u['unit']}: only {u['q_rt'].size} usable minutes — skipped")
            units.append({"unit": u["unit"], "coeffs": None, "n": int(u["q_rt"].size)})
            continue
        for k in pooled:
            pooled[k].append(u[k])

        tr, te = split(u, boundary)
        a = fit_gn(u["q_rt"][tr], u["t_cds_c"][tr] * 9 / 5 + 32, u["t_chs_c"][tr] * 9 / 5 + 32, u["p_kw"][tr])
        gn_te = metrics(u["p_kw"][te], gn_pred(u["q_rt"][te], u["t_cds_c"][te], u["t_chs_c"][te], a))
        af_te = metrics(u["p_kw"][te], affine_pred(u["q_rt"][te]))
        plr = u["q_rt"] / CHILLER_CAPACITY_RT * 100
        print(
            f"CH-{u['unit']}: n={u['q_rt'].size:6d}  PLR {plr.min():5.1f}-{plr.max():5.1f}%  "
            f"GN heldout MAE {gn_te['maeKw']:6.2f} kW (R2 {gn_te['r2']:.4f})  "
            f"affine {af_te['maeKw']:6.2f} kW (R2 {af_te['r2']:.4f})"
        )
        units.append(
            {
                "unit": u["unit"],
                "coeffs": [float(x) for x in a],
                "n": int(u["q_rt"].size),
                "heldOut": gn_te,
                "affineHeldOut": af_te,
                "plrMin": round(float(plr.min()), 2),
                "plrMax": round(float(plr.max()), 2),
            }
        )

    P = {k: np.concatenate(v) for k, v in pooled.items()}
    tr, te = split(P, boundary)
    a_pool = fit_gn(P["q_rt"][tr], P["t_cds_c"][tr] * 9 / 5 + 32, P["t_chs_c"][tr] * 9 / 5 + 32, P["p_kw"][tr])

    gn_tr = metrics(P["p_kw"][tr], gn_pred(P["q_rt"][tr], P["t_cds_c"][tr], P["t_chs_c"][tr], a_pool))
    gn_te = metrics(P["p_kw"][te], gn_pred(P["q_rt"][te], P["t_cds_c"][te], P["t_chs_c"][te], a_pool))
    af_tr = metrics(P["p_kw"][tr], affine_pred(P["q_rt"][tr]))
    af_te = metrics(P["p_kw"][te], affine_pred(P["q_rt"][te]))

    print("\npooled fleet model")
    print(f"  coefficients a1..a4 = {[f'{x:.6g}' for x in a_pool]}")
    print(f"  Gordon-Ng  train {gn_tr}")
    print(f"  Gordon-Ng  test  {gn_te}")
    print(f"  affine     train {af_tr}")
    print(f"  affine     test  {af_te}")

    # The whole point: what each model says OUTSIDE the observed band.
    plr = P["q_rt"] / CHILLER_CAPACITY_RT * 100
    lo, hi = float(np.percentile(plr, 1)), float(np.percentile(plr, 99))
    t_chs_ref = float(np.median(P["t_chs_c"]))
    t_cds_ref = float(np.median(P["t_cds_c"]))
    print(f"\n  observed per-machine PLR band (p1-p99): {lo:.1f}% - {hi:.1f}%")
    print("  extrapolation check, kW per machine at the median temperatures:")
    extrap = []
    for pct in (10, 20, 30, 40, 50, 60, 70, 80, 90, 100):
        q = CHILLER_CAPACITY_RT * pct / 100
        g = float(gn_pred([q], [t_cds_ref], [t_chs_ref], a_pool)[0])
        f = float(affine_pred([q])[0])
        extrap.append({"plrPct": pct, "gordonNgKw": round(g, 1), "affineKw": round(f, 1),
                       "gordonNgKwPerRt": round(g / q, 4), "affineKwPerRt": round(f / q, 4)})
        flag = "  <-- affine is non-physical" if f <= 0 else ""
        print(f"    PLR {pct:3d}%  GN {g:7.1f} kW ({g/q:.3f} kW/RT)   affine {f:7.1f} kW ({f/q:.3f} kW/RT){flag}")

    artifact = {
        "generatedBy": "calibration/scripts/fitGordonNg.py",
        "source": str(CACHE.relative_to(REPO)).replace("\\", "/"),
        "trainDays": [all_days[0], all_days[-TEST_DAYS - 1]],
        "testDays": [boundary, all_days[-1]],
        "pooled": {
            "coeffs": [float(x) for x in a_pool],
            "train": gn_tr,
            "heldOut": gn_te,
            "affineTrain": af_tr,
            "affineHeldOut": af_te,
            "tChsMedianC": round(t_chs_ref, 3),
            "tCdsMedianC": round(t_cds_ref, 3),
            "observedPlrPct": {"p1": round(lo, 2), "p99": round(hi, 2)},
        },
        "units": units,
        "extrapolation": extrap,
    }
    OUT_JSON.write_text(json.dumps(artifact, indent=1), encoding="utf-8")
    print(f"\nwrote {OUT_JSON.relative_to(REPO)}")

    if args.write:
        OUT_TS.write_text(render_ts(artifact), encoding="utf-8")
        print(f"wrote {OUT_TS.relative_to(REPO)}")
    else:
        print("(re-run with --write to regenerate the TypeScript artifact)")
    return 0


def render_ts(a: dict) -> str:
    p = a["pooled"]
    c = p["coeffs"]
    units = ",\n".join(
        "  { unit: %d, coeffs: %s, n: %d }"
        % (u["unit"], "null" if u["coeffs"] is None else "[" + ", ".join(f"{x:.10g}" for x in u["coeffs"]) + "]", u["n"])
        for u in a["units"]
    )
    j = lambda m: json.dumps(m)  # noqa: E731
    return f'''/**
 * Gordon-Ng chiller power model fitted to the real T1 December trend —
 * GENERATED by `calibration/scripts/fitGordonNg.py`. Do not hand-edit.
 *
 *     P = [Q*(Tcds - Tchs) + a1*Tcds*Tchs + a2*(Tcds - Tchs) + a3*Q^2]
 *         / (Tchs - a4*Q)              Q, P in kW; temperatures in KELVIN
 *
 * WHY THE TWIN KEEPS BOTH THIS AND THE AFFINE CURVE
 * -------------------------------------------------
 * The engine's affine part-load curve is the better in-sample fit and stays the
 * model behind every reported plant kW. But its intercept is negative, so
 * extrapolated below the band T1 actually ran it says an idling chiller costs
 * less than nothing and staging up is always free. Gordon-Ng tends to a
 * positive no-load loss instead, which is what a real centrifugal does, so it
 * is the model the MPC uses to price STAGING decisions that leave the observed
 * per-machine load band.
 *
 * Scored on {p["heldOut"]["n"]} held-out minutes ({a["testDays"][0]} to {a["testDays"][1]}, never shuffled):
 *
 *   Gordon-Ng   MAE {p["heldOut"]["maeKw"]} kW   MAPE {p["heldOut"]["mapePct"]}%   R2 {p["heldOut"]["r2"]}
 *   affine      MAE {p["affineHeldOut"]["maeKw"]} kW   MAPE {p["affineHeldOut"]["mapePct"]}%   R2 {p["affineHeldOut"]["r2"]}
 *
 * Observed per-machine load band (p1-p99): {p["observedPlrPct"]["p1"]}% - {p["observedPlrPct"]["p99"]}%.
 * Outside it BOTH models are extrapolating; only this one extrapolates in a
 * shape a chiller can actually have.
 */

/** Fleet-pooled coefficients (a1..a4), Kelvin basis. */
export const GORDON_NG_FLEET = [{", ".join(f"{x:.10g}" for x in c)}] as const;

/** Per-machine fits, for a future mixed-fleet model. Not used by the twin yet. */
export const GORDON_NG_UNITS: Array<{{ unit: number; coeffs: number[] | null; n: number }}> = [
{units}
];

export const GORDON_NG_FIT = {{
  source: {json.dumps(a["source"])},
  trainDays: {json.dumps(a["trainDays"])},
  testDays: {json.dumps(a["testDays"])},
  train: {j(p["train"])},
  heldOut: {j(p["heldOut"])},
  affineTrain: {j(p["affineTrain"])},
  affineHeldOut: {j(p["affineHeldOut"])},
  observedPlrPct: {j(p["observedPlrPct"])},
  tChsMedianC: {p["tChsMedianC"]},
  tCdsMedianC: {p["tCdsMedianC"]},
}} as const;

const KELVIN = 273.15;
const RT_TO_KW = 3.517;

/**
 * Compressor power for one machine, kW.
 *
 * `qRt` is that machine's evaporator duty, `tChsC` its leaving chilled water
 * and `tCdsC` its entering condenser water.
 */
export function gordonNgChillerKw(qRt: number, tChsC: number, tCdsC: number): number {{
  const [a1, a2, a3, a4] = GORDON_NG_FLEET;
  const q = Math.max(qRt, 0) * RT_TO_KW;
  const tChs = tChsC + KELVIN;
  const tCds = tCdsC + KELVIN;
  const dt = tCds - tChs;
  const num = q * dt + a1 * tCds * tChs + a2 * dt + a3 * q * q;
  const den = Math.max(tChs - a4 * q, 1);
  const kw = num / den;
  return Number.isFinite(kw) && kw > 0 ? kw : 0;
}}

/** True when this per-machine load is outside the band the fit was estimated over. */
export function plrIsExtrapolated(plrPct: number): boolean {{
  return plrPct < GORDON_NG_FIT.observedPlrPct.p1 || plrPct > GORDON_NG_FIT.observedPlrPct.p99;
}}
'''


if __name__ == "__main__":
    raise SystemExit(main())
