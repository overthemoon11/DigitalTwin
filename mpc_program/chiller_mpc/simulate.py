"""Closed-loop pipeline: history generation -> model training -> evaluation.

Evaluation protocol (mirrors the paper's before/after comparison, but with
the luxury of a simulator: identical weather, identical initial state and
identical noise realizations for both controllers on every test day, so the
difference is purely the control strategy).
"""
from __future__ import annotations

import time

import numpy as np

from .baseline import BaselineController, jittered_baseline
from .config import MPCConfig, PlantConfig, SimConfig, STEPS_PER_DAY, STEP_H
from .forecasting import (CHRPredictor, LoadForecaster, fit_gn_from_logs,
                          stack_records)
from .mpc import MPCController
from .plant import PlantSimulator
from .weather import World


def run_day(plant: PlantConfig, world: World, day: int, controller,
            noise_seed: int) -> list[dict]:
    ps = PlantSimulator(plant, world, day, noise_seed)
    recent: list[dict] = []
    for s in range(STEPS_PER_DAY):
        delta = controller.act(s, recent, day)
        recent.append(ps.step(s, delta))
    return recent


# ------------------------------------------------------------------ training


def generate_history(plant: PlantConfig, sim: SimConfig, world: World,
                     verbose: bool = True) -> dict:
    """Historical operating data under the incumbent (jittered) baseline.

    The second half of the days includes commissioning-style capacity
    trials so the CHR models see the high-CHR region (Sec. 2.3 Gap 3 /
    data-coverage requirement for the control-input feature).
    """
    rng = np.random.default_rng([sim.seed, 77])
    recs: list[dict] = []
    for d in range(sim.train_days):
        exploration = d >= sim.train_days // 2
        ctl = jittered_baseline(plant, d, rng, exploration)
        recs += run_day(plant, world, d, ctl, noise_seed=sim.seed + 1000)
    if verbose:
        print(f"history: {sim.train_days} days, {len(recs)} records "
              f"({int(np.sum([r['valid_load'] for r in recs]))} valid-load)")
    return stack_records(recs)


def train_models(plant: PlantConfig, sim: SimConfig, world: World,
                 logs: dict, verbose: bool = True):
    t0 = time.time()
    load_fc = LoadForecaster(plant, sim)
    lm = load_fc.fit(logs, world)
    chr_pred = CHRPredictor(plant, sim)
    cm = chr_pred.fit(logs, world)
    gn_coeffs, gm = fit_gn_from_logs(logs, plant)
    if verbose:
        r2s = [lm[n]["r2"] for n in lm]
        maes = [lm[n]["mae_rt"] for n in lm]
        print(f"load models (24): R2 {min(r2s):.3f}-{max(r2s):.3f}, "
              f"MAE {min(maes):.0f}-{max(maes):.0f} RT")
        print(f"CHR models (12): test R2 "
              f"{min(cm[j]['r2_test'] for j in cm):.3f}-"
              f"{max(cm[j]['r2_test'] for j in cm):.3f}, test RMSE "
              f"{min(cm[j]['rmse_test'] for j in cm):.2f}-"
              f"{max(cm[j]['rmse_test'] for j in cm):.2f} F")
        for i, c in enumerate(plant.chillers):
            print(f"GN {c.name}: R2={gm[i]['r2']:.3f} RMSE={gm[i]['rmse_kw']:.1f} kW "
                  f"MAPE={gm[i]['mape_pct']:.1f}%")
        print(f"training done in {time.time() - t0:.1f}s")
    return {"load_fc": load_fc, "chr_pred": chr_pred,
            "gn_coeffs": gn_coeffs,
            "metrics": {"load": lm, "chr": cm, "gn": gm}}


# ---------------------------------------------------------------- evaluation


def day_metrics(plant: PlantConfig, recs: list[dict]) -> dict:
    logs = stack_records(recs)
    s = logs["step"]
    comfort = (s >= plant.comfort_start) & (s < plant.close_step)
    chr_t = logs["chr_true_f"]
    viol = comfort & (chr_t > plant.t_chr_max_f)
    delta = logs["delta"]
    starts = int(np.sum((delta[1:] & ~delta[:-1]).sum(axis=1)) + delta[0].sum())
    kwh_ch = float(logs["p_true_kw"].sum() * STEP_H)
    kwh_aux = float(logs["p_aux_kw"].sum() * STEP_H)
    rt_h = float(logs["q_del_true_rt"].sum() * STEP_H)
    return {
        "kwh_ch": kwh_ch, "kwh_aux": kwh_aux, "kwh_total": kwh_ch + kwh_aux,
        "rt_h": rt_h, "kw_per_rt": kwh_ch / max(rt_h, 1e-9),
        "chr_max_comfort": float(chr_t[comfort].max()),
        "chr_mean_comfort": float(chr_t[comfort].mean()),
        "viol_minutes": int(viol.sum()) * 15,
        "viol_degmin": float(np.sum(np.maximum(
            0.0, chr_t[comfort] - plant.t_chr_max_f)) * 15.0),
        "unmet_rt_h": float(np.sum(np.maximum(
            0.0, (logs["q_bldg_rt"] - logs["q_del_true_rt"])[comfort])) * STEP_H),
        "peak_kw": float((logs["p_true_kw"] + logs["p_aux_kw"]).max()),
        "n_starts": starts,
        "chiller_hours": float(delta.sum() * STEP_H),
    }


def evaluate(plant: PlantConfig, mpc_cfg: MPCConfig, sim: SimConfig,
             world: World, models: dict, verbose: bool = True) -> dict:
    days = list(range(sim.train_days, sim.train_days + sim.test_days))
    out = {"days": days, "base": [], "mpc": [], "recs_base": {}, "recs_mpc": {},
           "mpc_diag": None}
    mpc = MPCController(plant, mpc_cfg, world, models["load_fc"],
                        models["chr_pred"], models["gn_coeffs"])
    for d in days:
        t0 = time.time()
        base_ctl = BaselineController(plant)   # nominal incumbent operation
        recs_b = run_day(plant, world, d, base_ctl, noise_seed=sim.seed + 2000)
        recs_m = run_day(plant, world, d, mpc, noise_seed=sim.seed + 2000)
        mb, mm = day_metrics(plant, recs_b), day_metrics(plant, recs_m)
        out["base"].append(mb)
        out["mpc"].append(mm)
        out["recs_base"][d] = recs_b
        out["recs_mpc"][d] = recs_m
        if verbose:
            sv = 100.0 * (1.0 - mm["kwh_ch"] / mb["kwh_ch"])
            print(f"day {d}: base {mb['kwh_ch']:,.0f} kWh | MPC "
                  f"{mm['kwh_ch']:,.0f} kWh | saving {sv:5.2f}% | "
                  f"CHRmax {mm['chr_max_comfort']:.1f}F | viol "
                  f"{mm['viol_minutes']}min | {time.time() - t0:.1f}s")
    out["mpc_diag"] = mpc.diag
    n_err = sum(1 for x in mpc.diag if "error" in x)
    if n_err and verbose:
        print(f"WARNING: {n_err} MPC solves fell back due to errors")
    out["summary"] = summarize(out)
    return out


def summarize(out: dict) -> dict:
    def tot(rows, k):
        return float(np.sum([r[k] for r in rows]))

    b, m = out["base"], out["mpc"]
    kwh_b, kwh_m = tot(b, "kwh_ch"), tot(m, "kwh_ch")
    tt_b, tt_m = tot(b, "kwh_total"), tot(m, "kwh_total")
    daily = [100.0 * (1.0 - mm["kwh_ch"] / mb["kwh_ch"])
             for mb, mm in zip(b, m)]
    return {
        "n_days": len(b),
        "kwh_ch_base": kwh_b, "kwh_ch_mpc": kwh_m,
        "saving_ch_pct": 100.0 * (1.0 - kwh_m / kwh_b),
        "kwh_total_base": tt_b, "kwh_total_mpc": tt_m,
        "saving_total_pct": 100.0 * (1.0 - tt_m / tt_b),
        "saving_daily_pct": daily,
        "saving_daily_std": float(np.std(daily)),
        "kw_per_rt_base": tot(b, "kwh_ch") / max(tot(b, "rt_h"), 1e-9),
        "kw_per_rt_mpc": tot(m, "kwh_ch") / max(tot(m, "rt_h"), 1e-9),
        "viol_minutes_base": int(np.sum([r["viol_minutes"] for r in b])),
        "viol_minutes_mpc": int(np.sum([r["viol_minutes"] for r in m])),
        "chr_mean_base": float(np.mean([r["chr_mean_comfort"] for r in b])),
        "chr_mean_mpc": float(np.mean([r["chr_mean_comfort"] for r in m])),
        "starts_base": int(np.sum([r["n_starts"] for r in b])),
        "starts_mpc": int(np.sum([r["n_starts"] for r in m])),
        "chiller_hours_base": tot(b, "chiller_hours"),
        "chiller_hours_mpc": tot(m, "chiller_hours"),
    }
