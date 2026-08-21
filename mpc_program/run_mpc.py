"""Chiller-plant MPC simulator & optimizer - entry point.

Usage:
  python run_mpc.py                # full run: 28 training days, 6 test days
  python run_mpc.py --quick        # reduced run for a fast look
  python run_mpc.py --selftest     # internal consistency checks
  python run_mpc.py --train-days 28 --test-days 6 --beam 1500 --seed 42

Outputs (default ./results): summary.json, metrics.csv, model_metrics.csv,
per-day time series CSVs and figures fig_*.png.
"""
from __future__ import annotations

import argparse
import sys
import time

import numpy as np

from chiller_mpc.config import MPCConfig, PlantConfig, SimConfig
from chiller_mpc.weather import World
from chiller_mpc.simulate import (evaluate, generate_history, run_day,
                                  train_models)
from chiller_mpc.report import print_summary, write_outputs


def selftest() -> int:
    from chiller_mpc.gordon_ng import (design_gn_coeffs, fit_gn, gn_metrics,
                                       gn_power_kw_f)
    from chiller_mpc.mpc import MPCController

    plant = PlantConfig()
    sim = SimConfig(train_days=8, test_days=1, seed=7)
    rng = np.random.default_rng(0)
    print("selftest:")

    # 1. Gordon-Ng design calibration hits the specified best point
    for c in plant.chillers:
        a = design_gn_coeffs(c.qmax_rt, c.eff_best, c.plr_best,
                             plant.t_chs_set_f, plant.t_cds_design_f, c.gn_gamma)
        q = c.plr_best * c.qmax_rt
        eff = float(gn_power_kw_f(q, plant.t_cds_design_f,
                                  plant.t_chs_set_f, a)) / q
        assert abs(eff - c.eff_best) < 1e-6, (c.name, eff)
    print("  [ok] GN design calibration")

    # 2. GN identification recovers a clean model
    c = plant.chillers[0]
    a_true = design_gn_coeffs(c.qmax_rt, c.eff_best, c.plr_best,
                              plant.t_chs_set_f, plant.t_cds_design_f, c.gn_gamma)
    q = rng.uniform(150, c.qmax_rt, 400)
    tcds = rng.uniform(85, 96, 400)
    tchs = np.full(400, plant.t_chs_set_f)
    p = gn_power_kw_f(q, tcds, tchs, a_true)
    m = gn_metrics(q, tcds, tchs, p, fit_gn(q, tcds, tchs, p))
    assert m["r2"] > 0.999, m
    print(f"  [ok] GN clean-fit recovery (R2={m['r2']:.5f})")

    # 3. pipeline: history -> models
    world = World(plant, sim)
    logs = generate_history(plant, sim, world, verbose=False)
    models = train_models(plant, sim, world, logs, verbose=False)
    lm, cm = models["metrics"]["load"], models["metrics"]["chr"]
    assert min(v["r2"] for v in lm.values()) > 0.75, "load forecaster weak"
    assert min(v["r2_test"] for v in cm.values()) > 0.3, "CHR models weak"
    assert min(g["r2"] for g in models["metrics"]["gn"]) > 0.95, "GN fits weak"
    print("  [ok] model training quality")

    # 4. compiled CHR quadratic == direct polynomial evaluation
    cp = models["chr_pred"]
    chr_lags = np.array([58.2, 58.0, 57.9, 57.7, 57.6])
    q_meas = np.array([2200.0, 2150.0, 2100.0, 2050.0])
    frozen = cp.frozen_features(world, sim.train_days * 96 + 40, chr_lags, 44.1)
    packs = cp.compile(frozen)
    q_traj = rng.uniform(500, 3800, cp.N_HORIZON)
    ref = cp.predict_traj(frozen, q_traj, q_meas)
    ql = q_meas.copy()
    for k in range(1, cp.N_HORIZON + 1):
        a_, b_, c_ = packs[k - 1]
        q5 = np.concatenate([[q_traj[k - 1]], ql])
        t = a_ + b_ @ q5 + q5 @ c_ @ q5
        assert abs(t - ref[k - 1]) < 1e-6, (k, t, ref[k - 1])
        ql = np.concatenate([[q_traj[k - 1]], ql[:3]])
    print("  [ok] CHR compile == direct polynomial")

    # 5. fixed point satisfies the implicit thermal-balance equation
    mpc_cfg = MPCConfig(beam_width=400)
    ctl = MPCController(plant, mpc_cfg, world, models["load_fc"], cp,
                        models["gn_coeffs"])
    a_, b_, c_ = packs[3]
    alpha = np.full(5, a_ + 1.0)
    beta = np.full(5, b_[0])
    gamma = np.full(5, c_[0, 0])
    flow = np.array([0.0, 125.0, 187.5, 250.0, 312.5])
    cap = np.array([0.0, 2000.0, 3000.0, 4000.0, 5000.0])
    qf, tf = ctl._fixed_point(alpha, beta, gamma, flow, cap, plant.t_chs_set_f)
    for i in range(5):
        imp = np.clip(flow[i] * (tf[i] - plant.t_chs_set_f), 0, cap[i])
        assert abs(qf[i] - imp) < 1e-5 or qf[i] in (0.0, cap[i]), (i, qf[i], imp)
    print("  [ok] capacity/CHR fixed point consistency")

    # 6. closed-loop MPC day: dwell times & comfort respected
    d = sim.train_days
    recs = run_day(plant, world, d, ctl, noise_seed=123)
    delta = np.array([r["delta"] for r in recs])
    for i in range(plant.n_ch):
        x = delta[:, i].astype(int)
        edges = np.flatnonzero(np.diff(x)) + 1
        blocks = np.split(np.arange(len(x)), edges)
        for blk in blocks:
            if x[blk[0]] == 1:
                ends_at_close = blk[-1] + 1 >= plant.close_step
                assert len(blk) >= ctl.cfg.t_min_on_steps or ends_at_close, \
                    (plant.chillers[i].name, blk[0], len(blk))
    comfort = np.array([plant.comfort_start <= r["step"] < plant.close_step
                        for r in recs])
    chr_t = np.array([r["chr_true_f"] for r in recs])
    viol = int(np.sum(comfort & (chr_t > plant.t_chr_max_f)))
    print(f"  [ok] MPC day: min-ON dwell respected, CHR violations {viol} steps "
          f"(max CHR {chr_t[comfort].max():.1f}F)")
    print("selftest passed.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train-days", type=int, default=28)
    ap.add_argument("--test-days", type=int, default=6)
    ap.add_argument("--beam", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--outdir", default="results")
    ap.add_argument("--quick", action="store_true",
                    help="12 train days, 2 test days, beam 800")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()

    plant = PlantConfig()
    mpc_cfg = MPCConfig(beam_width=800 if args.quick else args.beam)
    sim = SimConfig(train_days=12 if args.quick else args.train_days,
                    test_days=2 if args.quick else args.test_days,
                    seed=args.seed)
    world = World(plant, sim)

    t0 = time.time()
    print(f"= generating {sim.train_days} days of historical operation "
          f"(jittered baseline + commissioning trials)")
    logs = generate_history(plant, sim, world)
    print("= training models (24 load + 12 CHR + 6 Gordon-Ng)")
    models = train_models(plant, sim, world, logs)
    print(f"= evaluating baseline vs MPC on {sim.test_days} unseen days")
    out = evaluate(plant, mpc_cfg, sim, world, models)
    print_summary(out)
    outdir = write_outputs(plant, out, models, world, args.outdir)
    print(f"outputs written to {outdir}  ({time.time() - t0:.0f}s total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
