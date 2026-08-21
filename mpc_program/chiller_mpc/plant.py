"""Ground-truth chiller plant simulator ("the real building").

Physics per 15-min step (sub-stepped at 5 min):
  * Chilled-water flow follows the number/size of running chillers
    (paper Eq. 11, generalized to capacity-proportional base flows).
  * Delivered cooling saturates: Q_del = min(sum Qmax_on,
    flow_factor * (CHR - CHS_set)), the physical reading of Eq. 6 + Eq. 8.
    When saturated the actual CHS floats above setpoint, which is exactly
    the paper's condition for load measurements being invalid (Sec. 3.1).
  * Loop/building thermal inertia integrates the imbalance between the true
    building heat pickup and delivered cooling:
        dCHR = (Q_bldg - Q_del) / loop_rt_step_per_f   [degF per step]
  * With no chillers running, the loop soaks toward soak_t_f.
  * Per-chiller electric power from 'true' Gordon-Ng coefficients; the MPC
    only ever sees noisy measurements of it.
"""
from __future__ import annotations

import numpy as np

from .config import PlantConfig, STEPS_PER_DAY, STEP_H
from .gordon_ng import design_gn_coeffs, gn_power_kw_f
from .weather import World

N_SUB = 3


class PlantSimulator:
    def __init__(self, plant: PlantConfig, world: World, day: int,
                 noise_seed: int, chr_init_f: float | None = None):
        self.cfg = plant
        self.world = world
        self.day = day
        self.rng = np.random.default_rng([noise_seed, day, 5])
        self.qmax = np.array(plant.qmax_rt)
        self.a_true = [design_gn_coeffs(c.qmax_rt, c.eff_best, c.plr_best,
                                        plant.t_chs_set_f, plant.t_cds_design_f,
                                        c.gn_gamma)
                       for c in plant.chillers]
        # signed dwell: +n = ON for n steps, -n = OFF for n steps
        self.dwell = np.full(plant.n_ch, -96, dtype=np.int32)
        self.delta = np.zeros(plant.n_ch, dtype=bool)
        if chr_init_f is None:
            # loop state at 00:00: soaked partway up from ~evening CHR
            chr_init_f = (plant.soak_t_f
                          - (plant.soak_t_f - 61.5) * np.exp(-2.0 / plant.soak_tau_h)
                          + self.rng.normal(0.0, 0.4))
        self.chr_f = float(chr_init_f)

    # ------------------------------------------------------------------
    def step(self, s: int, delta_cmd: np.ndarray) -> dict:
        """Advance one 15-min step under commanded ON/OFF vector."""
        cfg = self.cfg
        abs_step = self.day * STEPS_PER_DAY + s
        open_now = cfg.open_step <= s < cfg.close_step
        cmd = np.asarray(delta_cmd, dtype=bool).copy()
        if not open_now:
            cmd[:] = False  # plant interlock outside operating hours

        switched = cmd != self.delta
        self.dwell = np.where(
            switched, np.where(cmd, 1, -1),
            np.where(self.delta, np.minimum(self.dwell + 1, 10_000),
                     np.maximum(self.dwell - 1, -10_000)))
        self.delta = cmd

        q_bldg = self.world.q_bldg_rt(abs_step)
        t_cds = self.world.t_cds_f(abs_step)
        cap_on = float(np.sum(self.qmax[cmd]))
        flow_fac = cap_on / cfg.dt_design_f  # RT of delivery per degF of dT

        q_del_acc = 0.0
        chs_acc = 0.0
        for _ in range(N_SUB):
            if cap_on > 0.0:
                q_del = min(cap_on,
                            max(0.0, flow_fac * (self.chr_f - cfg.t_chs_set_f)))
                self.chr_f += (q_bldg - q_del) / cfg.loop_rt_step_per_f / N_SUB
                chs_act = self.chr_f - q_del / flow_fac
            else:
                q_del = 0.0
                tau_steps = cfg.soak_tau_h / (STEP_H / N_SUB)
                self.chr_f += (cfg.soak_t_f - self.chr_f) * (1.0 - np.exp(-1.0 / tau_steps))
                chs_act = self.chr_f
            q_del_acc += q_del / N_SUB
            chs_acc += chs_act / N_SUB
        q_del, chs_act = q_del_acc, chs_acc

        # per-chiller split (capacity-proportional, Eq. 6 weights)
        share = np.where(cmd, self.qmax / max(cap_on, 1e-9), 0.0)
        q_i = share * q_del
        p_i = np.zeros(cfg.n_ch)
        for i in range(cfg.n_ch):
            if cmd[i]:
                p_i[i] = gn_power_kw_f(q_i[i], t_cds, chs_act, self.a_true[i])
        p_aux = float(np.sum(self.qmax[cmd])) * cfg.pump_kw_per_rt_cap

        # noisy measurements (what controllers and model fitting see)
        n = self.rng
        rec = {
            "day": self.day, "step": s, "abs_step": abs_step,
            "hour": s * 0.25,
            "t_amb_f": self.world.t_amb_f(abs_step),
            "rh": self.world.rh(abs_step),
            "t_wb_f": self.world.t_wb_f(abs_step),
            "t_cds_f": t_cds,
            "chr_f": self.chr_f + n.normal(0.0, cfg.noise_t_f),
            "chs_f": chs_act + n.normal(0.0, cfg.noise_t_f),
            "q_total_rt": max(0.0, q_del * (1 + n.normal(0.0, cfg.noise_q_frac))),
            "q_i_rt": np.maximum(0.0, q_i * (1 + n.normal(0.0, cfg.noise_q_frac, cfg.n_ch))),
            "p_i_kw": np.maximum(0.0, p_i * (1 + n.normal(0.0, cfg.noise_p_frac, cfg.n_ch))),
            "p_ch_kw": 0.0,  # filled below
            "p_aux_kw": p_aux,
            "delta": cmd.copy(), "dwell": self.dwell.copy(),
            "valid_load": bool(cap_on > 0 and chs_act <= cfg.t_chs_set_f + 0.3),
            # truth columns (never fed to controllers/models; analysis only)
            "chr_true_f": self.chr_f, "q_bldg_rt": q_bldg,
            "q_del_true_rt": q_del, "p_true_kw": float(np.sum(p_i)),
        }
        rec["p_ch_kw"] = float(np.sum(rec["p_i_kw"]))
        return rec
