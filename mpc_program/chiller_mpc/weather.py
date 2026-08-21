"""Synthetic tropical (Bangkok-like) weather, building load and forecasts.

The 'World' is the ground truth the plant simulator runs against. The MPC
never reads truth directly: it sees noisy measurements (via plant records)
and weather-service forecasts whose error grows with horizon, mirroring the
paper's inputs (Sec. 3.1: forecasted + historical environmental data).

Absolute time is indexed in 15-min steps: abs_step = day * 96 + step.
"""
from __future__ import annotations

import numpy as np

from .config import PlantConfig, SimConfig, STEPS_PER_DAY, hhmm


def _stull_wetbulb_c(t_c, rh):
    """Stull (2011) wet-bulb approximation, T in degC, RH in %."""
    t = np.asarray(t_c, dtype=float)
    r = np.asarray(rh, dtype=float)
    return (t * np.arctan(0.151977 * np.sqrt(r + 8.313659))
            + np.arctan(t + r) - np.arctan(r - 1.676331)
            + 0.00391838 * r ** 1.5 * np.arctan(0.023101 * r) - 4.686035)


def c_to_f(t_c):
    return np.asarray(t_c) * 1.8 + 32.0


class World:
    """Deterministic per-day weather + true building heat pickup."""

    def __init__(self, plant: PlantConfig, sim: SimConfig, seed_offset: int = 0):
        self.plant = plant
        self.sim = sim
        self.seed = sim.seed + seed_offset
        self._days: dict[int, dict] = {}

    # ------------------------------------------------------------------ truth
    def day(self, d: int) -> dict:
        if d in self._days:
            return self._days[d]
        rng = np.random.default_rng([self.seed, d, 11])
        h = np.arange(STEPS_PER_DAY) * 0.25
        diurnal = 0.5 * (1.0 + np.cos(2.0 * np.pi * (h - 15.0) / 24.0))
        off = rng.normal(0.0, 1.1)
        ar = np.zeros(STEPS_PER_DAY)
        for k in range(1, STEPS_PER_DAY):
            ar[k] = 0.85 * ar[k - 1] + rng.normal(0.0, 0.18)
        t_c = 26.2 + off + 4.6 * diurnal + ar
        rh = np.clip(80.0 - 24.0 * diurnal + rng.normal(0, 2.0, STEPS_PER_DAY)
                     - 3.0 * off, 45.0, 96.0)
        cloud = rng.uniform(0.55, 1.0)
        sol = np.maximum(0.0, np.sin(np.pi * (h - 6.5) / 12.5)) * cloud
        sol *= np.clip(1.0 + rng.normal(0, 0.08, STEPS_PER_DAY), 0.7, 1.3)

        weekend = (d % 7) in (5, 6)
        holiday = d in self.sim.holidays
        occ = self._occupancy(h, weekend, holiday)

        lo = np.zeros(STEPS_PER_DAY)
        for k in range(1, STEPS_PER_DAY):
            lo[k] = 0.85 * lo[k - 1] + rng.normal(0.0, 55.0)
        q_bldg = occ * (1800.0 + 68.0 * (t_c - 24.0)) + 850.0 * sol + lo
        open_mask = (np.arange(STEPS_PER_DAY) >= self.plant.open_step) & \
                    (np.arange(STEPS_PER_DAY) < self.plant.close_step)
        q_bldg = np.where(open_mask, np.maximum(q_bldg, 60.0), 0.0)

        day = {"t_amb_c": t_c, "t_amb_f": c_to_f(t_c), "rh": rh,
               "t_wb_f": c_to_f(_stull_wetbulb_c(t_c, rh)), "sol": sol,
               "q_bldg_rt": q_bldg, "weekend": weekend, "holiday": holiday}
        self._days[d] = day
        return day

    @staticmethod
    def _occupancy(h, weekend: bool, holiday: bool):
        """Retail-mall occupancy factor (plant 05:30, mall 10:00-22:00)."""
        occ = np.zeros_like(h)
        occ = np.where((h >= 5.5) & (h < 10.0), 0.50, occ)      # AHU startup
        ramp = np.clip((h - 10.0) / 2.5, 0.0, 1.0)
        occ = np.where((h >= 10.0) & (h < 19.0), 0.55 + 0.45 * ramp, occ)
        decay = np.clip((h - 19.0) / 2.5, 0.0, 1.0)
        occ = np.where((h >= 19.0) & (h < 22.0), 1.0 - 0.55 * decay, occ)
        mult = 1.10 if (weekend or holiday) else 1.0
        return occ * mult

    # ------------------------------------------------------- indexed accessors
    def _get(self, key: str, abs_step: int) -> float:
        return float(self.day(abs_step // STEPS_PER_DAY)[key][abs_step % STEPS_PER_DAY])

    def t_amb_f(self, abs_step: int) -> float:
        return self._get("t_amb_f", abs_step)

    def rh(self, abs_step: int) -> float:
        return self._get("rh", abs_step)

    def t_wb_f(self, abs_step: int) -> float:
        return self._get("t_wb_f", abs_step)

    def q_bldg_rt(self, abs_step: int) -> float:
        return self._get("q_bldg_rt", abs_step)

    def t_cds_f(self, abs_step: int) -> float:
        """Condenser water supply: wet-bulb reset with floor (Sec. 4.2)."""
        return max(self.plant.t_cds_min_f,
                   self.t_wb_f(abs_step) + self.plant.t_cds_approach_f)

    def calendar(self, abs_step: int) -> dict:
        d, s = divmod(abs_step, STEPS_PER_DAY)
        day = self.day(d)
        return {"hour": s * 0.25, "weekend": day["weekend"],
                "holiday": day["holiday"], "step": s, "day": d}

    # ------------------------------------------------------------- forecasts
    def wx_forecast(self, issue_abs: int, target_abs: int):
        """Weather-service forecast of (T_amb degF, RH %) for target step.

        Error is drawn once per target step (so successive re-forecasts are
        consistent) and scaled by lead time, emulating a forecast provider.
        """
        lead_h = max(0.0, (target_abs - issue_abs) * 0.25)
        sig_t = self.sim.wx_fc_sigma0_c + self.sim.wx_fc_sigma_slope_c * lead_h
        rng = np.random.default_rng([self.seed, target_abs, 23])
        eps_t, eps_rh = rng.normal(0.0, 1.0, 2)
        t_f = self.t_amb_f(target_abs) + 1.8 * sig_t * eps_t
        rh = float(np.clip(self.rh(target_abs) + 6.0 * sig_t * eps_rh, 40, 98))
        return t_f, rh
