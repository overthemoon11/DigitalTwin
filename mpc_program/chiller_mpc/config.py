"""Plant, MPC and simulation configuration.

Defaults are calibrated to the case-study plant of the paper (Sec. 4):
a 5000 RT plant with four 1000 RT and two 500 RT water-cooled centrifugal
chillers (named CH1..CH4, CH6, CH7), fixed 44 degF CHS setpoint, condenser
water reset on wet-bulb, plant hours 05:30-22:00, CHR comfort limit 63 degF.
"""
from __future__ import annotations

from dataclasses import dataclass, field

STEPS_PER_DAY = 96          # 15-minute steps
STEP_MIN = 15
STEP_H = 0.25


def hhmm(h: float) -> int:
    """Clock hours (e.g. 5.5 for 05:30) -> step index."""
    return int(round(h * 60 / STEP_MIN))


@dataclass
class ChillerSpec:
    """Static description of one chiller (truth side).

    eff_best: best-point efficiency in kW/RT at design temperatures.
    plr_best: part-load ratio at which efficiency is best (Fig. 6b shape).
    Paper Table 6 range: 1000 RT units ~0.57-0.62 kW/RT, 500 RT units worse.
    """
    name: str
    qmax_rt: float
    eff_best: float
    plr_best: float = 0.70
    gn_gamma: float = 0.30   # split of the no-load loss between GN a1/a2 terms


@dataclass
class PlantConfig:
    chillers: list[ChillerSpec] = field(default_factory=lambda: [
        ChillerSpec("CH1", 1000.0, 0.605, 0.72),
        ChillerSpec("CH2", 1000.0, 0.598, 0.70),
        ChillerSpec("CH3", 1000.0, 0.590, 0.70),
        ChillerSpec("CH4", 1000.0, 0.575, 0.70),
        ChillerSpec("CH6",  500.0, 0.636, 0.72),
        ChillerSpec("CH7",  500.0, 0.645, 0.72),
    ])
    t_chs_set_f: float = 44.0        # fixed CHS setpoint (Eq. 21m)
    dt_design_f: float = 16.0        # design CHW delta-T at full load
    # GN truth curves are calibrated at the typical *operating* condenser
    # temperature (wet-bulb reset ~85-90 degF), so kW/RT lands in the
    # paper's 0.57-0.66 range at the temperatures actually seen.
    t_cds_design_f: float = 89.0
    t_cds_min_f: float = 85.0        # condenser reset floor
    t_cds_approach_f: float = 7.0    # condenser supply = wetbulb + approach
    # Loop thermal inertia: RT of cooling deficit sustained for one 15-min
    # step that raises CHR by 1 degF (lumped loop water + connected mass).
    loop_rt_step_per_f: float = 1400.0
    soak_t_f: float = 70.5           # loop temp drifts here when plant is off
    soak_tau_h: float = 7.0
    pump_kw_per_rt_cap: float = 0.048  # aux (pump) kW per RT of ON capacity
    # plant operating schedule (steps)
    open_step: int = hhmm(5.5)       # 05:30 plant start allowed
    close_step: int = hhmm(22.0)     # 22:00 plant off
    comfort_start: int = hhmm(9.75)  # CHR limit enforced 09:45 (mall opens 10:00)
    min_on_daytime_end: int = hhmm(20.0)  # >=1 chiller required until 20:00
    # comfort / CHR limits (Sec. 3.5.2, Fig. 4: 63 degF constraint)
    t_chr_max_f: float = 63.0
    t_chr_avg_max_f: float = 62.0
    d_chr_max_f: float = 1.5         # max CHR change per 15-min step
    # measurement noise (1-sigma)
    noise_t_f: float = 0.15
    noise_p_frac: float = 0.010
    noise_q_frac: float = 0.015

    @property
    def n_ch(self) -> int:
        return len(self.chillers)

    @property
    def qmax_rt(self) -> list[float]:
        return [c.qmax_rt for c in self.chillers]


@dataclass
class MPCConfig:
    horizon_steps: int = 12          # 3 h of 15-min steps (Sec. 3.7.2)
    beam_width: int = 1500
    max_switches_per_step: int = 2
    t_min_on_steps: int = 4          # 1 h minimum ON (Eq. 21i)
    t_min_off_steps: int = 4         # 1 h minimum OFF (Eq. 21j)
    n_ch_max: int = 6                # Eq. 21k
    # penalty weights (soft-constraint prices, objective is in kW)
    alpha_demand: float = 0.8        # kW per RT of unmet forecast load (Eq. 7)
    alpha_chr: float = 800.0         # kW per degF above T_chr_max (Eq. 13)
    alpha_chr_avg: float = 800.0     # kW per degF above average limit (Eq. 14)
    alpha_chr_rate: float = 300.0    # kW per degF beyond rate limit (Eq. 15)
    alpha_pdem: float = 5.0          # kW per kW above demand cap (Eq. 19)
    alpha_switch: float = 150.0      # kW-equivalent per chiller start/stop
    p_demand_max_kw: float = 2600.0
    terminal_margin_f: float = 0.5   # CHR(N) <= max - margin (horizon guard)
    comfort_lead_steps: int = 2      # meet the CHR limit 30 min before the
                                     # comfort window opens (pulldown buffer)
    chr_guard_f: float = 0.7         # floor of the margin under the 63F limit
    # per-horizon robustness: margin_j = max(guard, sigma_k * test RMSE_j),
    # so decisions committed far ahead carry the model's own uncertainty
    chr_sigma_k: float = 1.0
    include_aux_in_objective: bool = False  # strict paper objective (Eq. 21a)
    dedupe_chr_res_f: float = 0.05
    dedupe_q_res_rt: float = 25.0


@dataclass
class SimConfig:
    train_days: int = 28
    test_days: int = 6
    seed: int = 42
    # weather-service forecast error grows with horizon (degC 1-sigma)
    wx_fc_sigma0_c: float = 0.30
    wx_fc_sigma_slope_c: float = 0.08
    ridge_lambdas: tuple = (1e-3, 1e-2, 1e-1, 1.0, 10.0, 100.0)
    holidays: tuple = ()             # day indices treated as holidays
