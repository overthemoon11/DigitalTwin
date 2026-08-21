"""Results reporting: figures (paper Figs. 3-6/8 analogues) + CSV/JSON.

Static light-mode PNGs. Colors follow the validated reference palette
(dataviz skill): categorical slots in fixed order, color follows the
entity everywhere (baseline = orange, MPC = blue), status red reserved
for the CHR constraint line, ink/grid from the chrome tokens. Data
tables are exported alongside every figure (metrics.csv, day CSVs).
"""
from __future__ import annotations

import csv
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from . import RT_TO_KW  # noqa: E402
from .config import PlantConfig, STEPS_PER_DAY  # noqa: E402
from .forecasting import stack_records  # noqa: E402
from .gordon_ng import gn_power_kw_f, design_gn_coeffs  # noqa: E402

# reference palette (light mode)
C_MPC = "#2a78d6"        # slot 1 blue   - MPC everywhere
C_BASE = "#eb6834"       # slot 2 orange - baseline everywhere
C_SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]
C_LIMIT = "#d03b3b"      # status critical - constraint line only
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
SURFACE = "#fcfcfb"


def _style():
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "font.family": ["Segoe UI", "DejaVu Sans", "sans-serif"],
        "text.color": INK, "axes.labelcolor": INK2,
        "xtick.color": MUTED, "ytick.color": MUTED,
        "axes.edgecolor": AXIS, "axes.linewidth": 0.8,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.7,
        "axes.axisbelow": True,
        "axes.spines.top": False, "axes.spines.right": False,
        "font.size": 10, "axes.titlesize": 11, "axes.titleweight": "bold",
        "legend.frameon": False,
    })


def _hours(recs):
    return np.array([r["hour"] for r in recs])


def _comfort_shade(ax, plant):
    ax.axvspan(plant.comfort_start * 0.25, plant.close_step * 0.25,
               color=GRID, alpha=0.35, lw=0, zorder=0)


def fig_day(plant: PlantConfig, out: dict, day: int, path: str):
    rb, rm = out["recs_base"][day], out["recs_mpc"][day]
    h = _hours(rb)
    pb = np.array([r["p_true_kw"] for r in rb])
    pm = np.array([r["p_true_kw"] for r in rm])
    cb = np.array([r["chr_true_f"] for r in rb])
    cm = np.array([r["chr_true_f"] for r in rm])
    nb = np.array([int(r["delta"].sum()) for r in rb])
    nm = np.array([int(r["delta"].sum()) for r in rm])

    fig, axes = plt.subplots(3, 1, figsize=(9.5, 8.4), sharex=True,
                             height_ratios=[1.2, 1.0, 0.6])
    ax = axes[0]
    ax.plot(h, pb, color=C_BASE, lw=2, label="Baseline")
    ax.plot(h, pm, color=C_MPC, lw=2, label="MPC")
    ax.fill_between(h, pm, pb, where=pb > pm, color=C_MPC, alpha=0.12, lw=0)
    kb, km = pb.sum() * 0.25, pm.sum() * 0.25
    ax.set_title(f"Plant power - day {day}  (baseline {kb:,.0f} kWh, "
                 f"MPC {km:,.0f} kWh, saving {100 * (1 - km / kb):.1f}%)",
                 loc="left")
    ax.set_ylabel("chiller power (kW)")
    ax.legend(loc="upper left")

    ax = axes[1]
    _comfort_shade(ax, plant)
    ax.plot(h, cb, color=C_BASE, lw=2, label="Baseline")
    ax.plot(h, cm, color=C_MPC, lw=2, label="MPC")
    ax.axhline(plant.t_chr_max_f, color=C_LIMIT, lw=1.4, ls=(0, (5, 3)))
    ax.text(0.3, plant.t_chr_max_f + 0.25, f"CHR limit {plant.t_chr_max_f:.0f}F",
            color=C_LIMIT, fontsize=9, va="bottom")
    ax.text(plant.comfort_start * 0.25 + 0.15, cb.min() - 0.5,
            "comfort window", color=INK2, fontsize=8.5, va="bottom")
    ax.set_title("Chilled water return temperature - MPC floats CHR near the "
                 "limit (Fig. 6d analogue)", loc="left")
    ax.set_ylabel("CHR (degF)")
    ax.legend(loc="lower right")

    ax = axes[2]
    ax.step(h, nb, where="post", color=C_BASE, lw=2, label="Baseline")
    ax.step(h, nm, where="post", color=C_MPC, lw=2, label="MPC")
    ax.set_title("Chillers running", loc="left")
    ax.set_ylabel("count")
    ax.set_xlabel("hour of day")
    ax.set_xticks(range(0, 25, 2))
    ax.set_yticks(range(0, 7))
    ax.set_xlim(0, 24)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def fig_schedules(plant: PlantConfig, out: dict, day: int, path: str):
    rb, rm = out["recs_base"][day], out["recs_mpc"][day]
    names = [c.name for c in plant.chillers]
    fig, ax = plt.subplots(figsize=(9.5, 4.2))
    for i, name in enumerate(names):
        for recs, color, off in ((rb, C_BASE, 0.18), (rm, C_MPC, -0.18)):
            on = np.array([r["delta"][i] for r in recs])
            h = _hours(recs)
            spans, start = [], None
            for k in range(len(on)):
                if on[k] and start is None:
                    start = h[k]
                if (not on[k] or k == len(on) - 1) and start is not None:
                    end = h[k] + (0.25 if on[k] else 0.0)
                    spans.append((start, end - start))
                    start = None
            ax.broken_barh(spans, (i + off - 0.16, 0.32), facecolors=color,
                           edgecolor=SURFACE, linewidth=1.2)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels([f"{n} ({int(c.qmax_rt)} RT)" for n, c in
                        zip(names, plant.chillers)])
    ax.set_xticks(range(0, 25, 2))
    ax.set_xlim(0, 24)
    ax.set_xlabel("hour of day")
    ax.invert_yaxis()
    ax.set_title(f"Chiller ON/OFF schedules - day {day} (Fig. 6a analogue)",
                 loc="left")
    handles = [plt.Rectangle((0, 0), 1, 1, color=C_BASE),
               plt.Rectangle((0, 0), 1, 1, color=C_MPC)]
    ax.legend(handles, ["Baseline", "MPC"], loc="upper right", ncols=2)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def fig_efficiency(plant: PlantConfig, out: dict, path: str):
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.2),
                                  width_ratios=[1.15, 1.0])
    plr = np.linspace(0.15, 1.0, 60)
    for i, c in enumerate(plant.chillers):
        a = design_gn_coeffs(c.qmax_rt, c.eff_best, c.plr_best,
                             plant.t_chs_set_f, plant.t_cds_design_f, c.gn_gamma)
        q = plr * c.qmax_rt
        eff = gn_power_kw_f(q, plant.t_cds_design_f, plant.t_chs_set_f, a) / q
        ax.plot(plr * 100, eff, color=C_SLOTS[i], lw=2,
                label=f"{c.name} ({int(c.qmax_rt)} RT)")
    ax.set_xlabel("part-load ratio (%)")
    ax.set_ylabel("efficiency (kW/RT)")
    ax.set_title("Chiller part-load efficiency (truth curves, Fig. 6b analogue)",
                 loc="left")
    ax.legend(ncols=2, fontsize=8.5)

    names = [c.name for c in plant.chillers]
    hb = np.zeros(len(names))
    hm = np.zeros(len(names))
    for d in out["days"]:
        hb += np.array([[r["delta"][i] for i in range(len(names))]
                        for r in out["recs_base"][d]]).sum(axis=0) * 0.25
        hm += np.array([[r["delta"][i] for i in range(len(names))]
                        for r in out["recs_mpc"][d]]).sum(axis=0) * 0.25
    x = np.arange(len(names))
    ax2.bar(x - 0.19, hb, 0.36, color=C_BASE, label="Baseline",
            edgecolor=SURFACE, linewidth=1)
    ax2.bar(x + 0.19, hm, 0.36, color=C_MPC, label="MPC",
            edgecolor=SURFACE, linewidth=1)
    ax2.set_xticks(x)
    ax2.set_xticklabels(names)
    ax2.set_ylabel(f"run hours over {len(out['days'])} test days")
    ax2.set_title("Equipment selection (MPC favors efficient units)",
                  loc="left")
    ax2.legend()
    ax2.grid(axis="x", visible=False)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def fig_forecasts(plant: PlantConfig, out: dict, models: dict, world, path: str):
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.0),
                                  width_ratios=[1.35, 1.0])
    # (a) hourly load: actual (baseline run, the training-definition proxy)
    load_fc = models["load_fc"]
    xs, ya, y1, y3 = [], [], [], []
    for d in out["days"]:
        logs = stack_records(out["recs_base"][d])
        for h in range(24):
            m = (logs["step"] >= 4 * h) & (logs["step"] < 4 * (h + 1)) & logs["valid_load"]
            if m.sum() < 2:
                continue
            xs.append((d - out["days"][0]) * 24 + h)
            ya.append(float(logs["q_total_rt"][m].mean()))
            y1.append(load_fc.predict_hour(world, (d * 96 + (h - 1) * 4), 1))
            y3.append(load_fc.predict_hour(world, (d * 96 + (h - 3) * 4), 3))
    ax.plot(xs, ya, color=INK2, lw=2, label="actual")
    ax.plot(xs, y1, color=C_MPC, lw=1.6, label="1 h forecast")
    ax.plot(xs, y3, color=C_SLOTS[2], lw=1.6, label="3 h forecast")
    mae1 = np.mean(np.abs(np.array(ya) - np.array(y1)))
    ax.set_title(f"Cooling load forecasts, test days (1 h MAE {mae1:.0f} RT)",
                 loc="left")
    ax.set_xlabel(f"hours since start of day {out['days'][0]}")
    ax.set_ylabel("cooling load (RT)")
    ax.legend()

    # (b) CHR prediction vs actual (Fig. 4 analogue). Pick an afternoon/
    # evening solve whose plan was then actually executed, so the panel
    # shows model accuracy rather than receding-horizon plan revision.
    d0 = out["days"][0]
    recs = out["recs_mpc"][d0]
    weights = 1 << np.arange(len(recs[0]["delta"]))
    executed = np.array([int(r["delta"] @ weights) for r in recs])
    snap, match = None, 0
    for x in out["mpc_diag"]:
        if "error" in x or x["day"] != d0 or not 48 <= x["s"] <= 82:
            continue
        plan = x["plan"]
        upto = x["s"] + len(plan)
        if upto > len(executed):
            continue
        m = int(np.argmin(np.concatenate(
            [plan == executed[x["s"]:upto], [False]])))
        if m > match:
            snap, match = x, m
    if snap is not None:
        s = snap["s"]
        kk = np.arange(1, match + 1)
        actual = np.array([recs[s - 1 + k]["chr_f"] for k in kk])
        pred = snap["chr_pred"][:match]
        ax2.plot(kk * 0.25, pred, color=C_MPC, lw=2, marker="o",
                 ms=4, label="MPC predicted")
        ax2.plot(kk * 0.25, actual, color=INK2, lw=2, label="actual (measured)")
        ax2.axhline(plant.t_chr_max_f, color=C_LIMIT, lw=1.4, ls=(0, (5, 3)))
        ax2.text(0.08, plant.t_chr_max_f - 0.25, "limit 63F", color=C_LIMIT,
                 fontsize=8.5, va="top")
        rmse = float(np.sqrt(np.mean((actual - pred) ** 2)))
        hh, mm = divmod(s * 15, 60)
        ax2.set_title(f"CHR prediction, {hh:02d}:{mm:02d} solve as executed "
                      f"(RMSE {rmse:.2f} F)", loc="left")
        ax2.set_xlabel("hours ahead")
        ax2.set_ylabel("CHR (degF)")
        ax2.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def fig_savings(out: dict, path: str):
    b = [r["kwh_ch"] for r in out["base"]]
    m = [r["kwh_ch"] for r in out["mpc"]]
    x = np.arange(len(b))
    fig, ax = plt.subplots(figsize=(8.5, 4.0))
    ax.bar(x - 0.19, b, 0.36, color=C_BASE, label="Baseline",
           edgecolor=SURFACE, linewidth=1)
    ax.bar(x + 0.19, m, 0.36, color=C_MPC, label="MPC",
           edgecolor=SURFACE, linewidth=1)
    for i, (bb, mm) in enumerate(zip(b, m)):
        ax.text(i, max(bb, mm) + 240, f"-{100 * (1 - mm / bb):.1f}%",
                ha="center", color=INK, fontsize=9.5, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels([f"day {d}" for d in out["days"]])
    ax.set_ylabel("daily chiller energy (kWh)")
    s = out["summary"]
    ax.set_title(f"Daily chiller energy - mean saving "
                 f"{s['saving_ch_pct']:.1f}% (Fig. 8a analogue)", loc="left")
    ax.set_ylim(0, max(b) * 1.15)
    ax.legend(loc="upper left")
    ax.grid(axis="x", visible=False)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ------------------------------------------------------------------- exports


def _fmt(v):
    return round(v, 4) if isinstance(v, float) else v


def write_outputs(plant: PlantConfig, out: dict, models: dict, world,
                  outdir: str) -> str:
    os.makedirs(outdir, exist_ok=True)
    _style()
    day0 = out["days"][0]
    fig_day(plant, out, day0, os.path.join(outdir, "fig_day.png"))
    fig_schedules(plant, out, day0, os.path.join(outdir, "fig_schedules.png"))
    fig_efficiency(plant, out, os.path.join(outdir, "fig_efficiency.png"))
    fig_forecasts(plant, out, models, world,
                  os.path.join(outdir, "fig_forecasts.png"))
    fig_savings(out, os.path.join(outdir, "fig_savings.png"))

    # per-day metrics table
    with open(os.path.join(outdir, "metrics.csv"), "w", newline="") as f:
        w = csv.writer(f)
        keys = list(out["base"][0].keys())
        w.writerow(["day", "controller"] + keys)
        for d, mb, mm in zip(out["days"], out["base"], out["mpc"]):
            w.writerow([d, "baseline"] + [_fmt(mb[k]) for k in keys])
            w.writerow([d, "mpc"] + [_fmt(mm[k]) for k in keys])

    # per-step time series for every test day and both controllers
    for d in out["days"]:
        for tag, recs in (("base", out["recs_base"][d]),
                          ("mpc", out["recs_mpc"][d])):
            with open(os.path.join(outdir, f"day{d}_{tag}.csv"), "w",
                      newline="") as f:
                w = csv.writer(f)
                names = [c.name for c in plant.chillers]
                w.writerow(["step", "hour", "t_amb_f", "t_wb_f", "t_cds_f",
                            "q_bldg_rt", "q_del_rt", "chr_f", "chs_f",
                            "p_ch_kw", "p_aux_kw", "n_on"] + names)
                for r in recs:
                    w.writerow([r["step"], r["hour"], _fmt(r["t_amb_f"]),
                                _fmt(r["t_wb_f"]), _fmt(r["t_cds_f"]),
                                _fmt(r["q_bldg_rt"]), _fmt(r["q_del_true_rt"]),
                                _fmt(r["chr_true_f"]), _fmt(r["chs_f"]),
                                _fmt(r["p_true_kw"]), _fmt(r["p_aux_kw"]),
                                int(r["delta"].sum())]
                               + [int(v) for v in r["delta"]])

    # model quality tables (paper Tables 3-5 analogues)
    mm = models["metrics"]
    with open(os.path.join(outdir, "model_metrics.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["model", "horizon", "r2", "err", "err_unit"])
        for n, v in mm["load"].items():
            w.writerow([f"load_{n}h", n, _fmt(v["r2"]), _fmt(v["mae_rt"]), "MAE RT"])
        for j, v in mm["chr"].items():
            w.writerow([f"chr_{15 * j}min", j, _fmt(v["r2_test"]),
                        _fmt(v["rmse_test"]), "RMSE degF"])
        for i, c in enumerate(plant.chillers):
            g = mm["gn"][i]
            w.writerow([f"gn_{c.name}", "", _fmt(g["r2"]), _fmt(g["rmse_kw"]),
                        "RMSE kW"])

    s = dict(out["summary"])
    s["saving_daily_pct"] = [round(v, 2) for v in s["saving_daily_pct"]]
    with open(os.path.join(outdir, "summary.json"), "w") as f:
        json.dump({k: _fmt(v) if not isinstance(v, list) else v
                   for k, v in s.items()}, f, indent=2)
    return outdir


def print_summary(out: dict):
    s = out["summary"]
    line = "-" * 64
    print(line)
    print(f"{'':28s}{'Baseline':>12s}{'MPC':>12s}{'delta':>10s}")
    print(line)
    rows = [
        ("Chiller energy (kWh/day)", s["kwh_ch_base"] / s["n_days"],
         s["kwh_ch_mpc"] / s["n_days"], f"-{s['saving_ch_pct']:.2f}%"),
        ("Total energy (kWh/day)", s["kwh_total_base"] / s["n_days"],
         s["kwh_total_mpc"] / s["n_days"], f"-{s['saving_total_pct']:.2f}%"),
        ("Plant efficiency (kW/RT)", s["kw_per_rt_base"], s["kw_per_rt_mpc"],
         f"{100 * (s['kw_per_rt_mpc'] / s['kw_per_rt_base'] - 1):+.1f}%"),
        ("CHR mean, comfort win (F)", s["chr_mean_base"], s["chr_mean_mpc"], ""),
        ("CHR violations (min)", s["viol_minutes_base"], s["viol_minutes_mpc"], ""),
        ("Chiller starts", s["starts_base"], s["starts_mpc"], ""),
        ("Chiller-hours", s["chiller_hours_base"], s["chiller_hours_mpc"], ""),
    ]
    for name, b, m, d in rows:
        bs = f"{b:,.2f}" if isinstance(b, float) else f"{b:,}"
        ms = f"{m:,.2f}" if isinstance(m, float) else f"{m:,}"
        print(f"{name:28s}{bs:>12s}{ms:>12s}{d:>10s}")
    print(line)
    daily = ", ".join(f"{v:.1f}%" for v in s["saving_daily_pct"])
    print(f"daily chiller savings: {daily}  (std {s['saving_daily_std']:.2f}%)")
    print(line)
