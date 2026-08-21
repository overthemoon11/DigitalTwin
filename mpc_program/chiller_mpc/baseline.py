"""Rule-based baseline controller (the plant's incumbent operation).

Mirrors the paper's description of pre-MPC operation (Sec. 4.2, 5.5, 5.6):
  * fixed preferred combination: two 1000 RT units + one 500 RT unit
    (chillers 3, 4 and 7), started at plant opening for pulldown;
  * reactive staging on CHR thresholds with conservative margins, which
    keeps CHR around 55-59 degF (Fig. 6d) - comfortable but wasteful;
  * fixed habits: "operators would stop the first chiller at 20:00 daily
    regardless of actual cooling demand"; all off at 22:00.

The same class (with 'jitter') generates the varied historical operating
data used to train the MPC's models: day-to-day threshold/schedule noise
plus occasional commissioning-style capacity-reduction trials, which give
the CHR model coverage of the high-CHR region the MPC later exploits.
"""
from __future__ import annotations

import numpy as np

from .config import PlantConfig, hhmm

CORE = ["CH3", "CH4", "CH7"]          # paper's baseline mix
EXTRA_ORDER = ["CH2", "CH1", "CH6"]   # stage-up order


class BaselineController:
    def __init__(self, plant: PlantConfig, jitter: dict | None = None):
        self.cfg = plant
        j = jitter or {}
        self.names = [c.name for c in plant.chillers]
        self.idx = {n: i for i, n in enumerate(self.names)}
        self.core = [self.idx[n] for n in j.get("core", CORE)]
        self.extras = [self.idx[n] for n in j.get("extras", EXTRA_ORDER)]
        self.stage_up_chr = j.get("stage_up_chr", 59.5)
        self.stage_dn_chr = j.get("stage_dn_chr", 54.5)
        self.emergency_chr = j.get("emergency_chr", 62.3)
        self.first_stop = j.get("first_stop", hhmm(20.0))
        self.second_stop = j.get("second_stop", hhmm(21.25))
        # commissioning trial: (start_step, end_step) forcing one core 1000RT
        # unit off while CHR stays below trial_chr_lim
        self.shed_trial = j.get("shed_trial", None)
        self.trial_chr_lim = j.get("trial_chr_lim", 62.0)
        # optional delayed-start trial (optimal-start commissioning data)
        self.start_delay = j.get("start_delay", 0)
        self.start_count = j.get("start_count", len(self.core))
        self._up_hold = 0
        self._dn_hold = 0
        self._extras_on: list[int] = []

    def act(self, s: int, recent: list[dict], day: int) -> np.ndarray:
        cfg = self.cfg
        n = cfg.n_ch
        rec_prev = recent[-1] if recent else None
        chr_meas = rec_prev["chr_f"] if rec_prev else 99.0
        dwell = rec_prev["dwell"] if rec_prev else np.full(n, -96)
        delta = rec_prev["delta"].copy() if rec_prev is not None else np.zeros(n, bool)

        if s < cfg.open_step or s >= cfg.close_step:
            self._extras_on = []
            return np.zeros(n, bool)

        # morning start: bring units on (staggered 15 min apart), possibly
        # delayed and deeper-staged on commissioning trial days
        start = cfg.open_step + self.start_delay
        if s < start:
            return np.zeros(n, bool)
        k = s - start
        order = self.core + self.extras
        if k < self.start_count:
            for i in order[:k + 1]:
                delta[i] = True
            return delta

        can_switch = np.abs(dwell) >= 2  # basic anti-short-cycle guard

        # scheduled evening habit: first unit off at fixed time regardless
        if s >= self.first_stop:
            i = self.core[2]  # the 500 RT unit
            if delta[i]:
                delta[i] = False
        if s >= self.second_stop and chr_meas < 61.0:
            i = self.core[1]
            if delta[i] and np.sum(delta) > 1:
                delta[i] = False

        # commissioning capacity-reduction trial (training data only)
        if self.shed_trial is not None:
            t0, t1 = self.shed_trial
            i = self.core[0]
            if t0 <= s < t1 and chr_meas < self.trial_chr_lim:
                if delta[i] and can_switch[i]:
                    delta[i] = False
            elif s >= t1 and not delta[i] and s < self.first_stop:
                if can_switch[i]:
                    delta[i] = True

        # reactive stage-up (not during morning pulldown: core mix only)
        in_day = s >= cfg.comfort_start - 2
        self._up_hold = self._up_hold + 1 if (in_day and chr_meas > self.stage_up_chr) else 0
        if in_day and (chr_meas > self.emergency_chr or self._up_hold >= 2):
            off_extras = [i for i in self.extras
                          if not delta[i] and can_switch[i]]
            if off_extras and s < hhmm(19.0):
                delta[off_extras[0]] = True
                self._extras_on.append(off_extras[0])
                self._up_hold = 0

        # conservative stage-down of extras only
        self._dn_hold = self._dn_hold + 1 if chr_meas < self.stage_dn_chr else 0
        if self._dn_hold >= 4 and self._extras_on and s > hhmm(13.0):
            i = self._extras_on[-1]
            if delta[i] and can_switch[i]:
                delta[i] = False
                self._extras_on.pop()
                self._dn_hold = 0

        return delta


def jittered_baseline(plant: PlantConfig, day: int, rng: np.random.Generator,
                      exploration: bool) -> BaselineController:
    """Day-to-day operating variation for historical training data."""
    j = {
        "stage_up_chr": 59.5 + rng.normal(0, 0.6),
        "stage_dn_chr": 54.5 + rng.normal(0, 0.6),
        "first_stop": hhmm(20.0) + rng.integers(-4, 3),
        "second_stop": hhmm(21.25) + rng.integers(-2, 3),
    }
    if rng.random() < 0.25:  # occasional alternate mix (unit rotation)
        j["core"] = ["CH2", "CH4", "CH6"]
        j["extras"] = ["CH3", "CH1", "CH7"]
    if exploration:
        # commissioning-style trials: run reduced capacity, let CHR float up
        t0 = int(rng.integers(hhmm(10.5), hhmm(15.0)))
        j["shed_trial"] = (t0, t0 + int(rng.integers(6, 16)))
        j["trial_chr_lim"] = float(rng.uniform(61.0, 62.8))
        j["stage_up_chr"] = float(rng.uniform(60.0, 62.0))
        j["first_stop"] = hhmm(20.0) + int(rng.integers(-6, 1))
        if rng.random() < 0.6:
            # delayed-start trial: teaches the CHR models what fast, deep
            # pulldowns from a warm loop actually do (optimal-start data)
            j["start_delay"] = int(rng.integers(4, 13))
            j["start_count"] = int(rng.integers(3, 5))
    return BaselineController(plant, j)
