"""Receding-horizon MPC controller (paper Secs. 3.4-3.7).

Solves, every 15 minutes, the MINLP of Eq. (21a)-(21p):

  min  sum_k [ sum_i delta_i(k) P_gn,i(k) + penalties ]
  s.t. thermal balance & saturating capacity        (21b, 21d)
       demand satisfaction w/ slack                 (21c)
       CHR polynomial prediction models             (21e)
       CHR max / average / rate-of-change bounds    (21f-21h)
       minimum ON/OFF dwell times                   (21i, 21j)
       active-chiller bounds & operating schedule   (21k, 21l)
       fixed CHS/CDS setpoints, flow ~ ON capacity  (21m, 21n)
       binary ON/OFF decisions                      (21o)

Solver: instead of BONMIN we use an exact-leaning dynamic search - a
vectorized beam over chiller-combination trajectories with dominance
pruning (merging nodes that agree on combo, dwell signature, predicted
CHR and recent capacity). Per step every admissible combination
transition (<= max_switches_per_step changes among dwell-eligible
chillers) is expanded; the per-step coupling between delivered capacity
and predicted CHR (Eqs. 6+12) is solved in closed form because the
compiled CHR model is quadratic in capacity. Soft-constraint penalties
mirror the paper's slack variables, so a least-violation schedule is
always returned (the paper's fallback-strategy role).
"""
from __future__ import annotations

import numpy as np

from .config import MPCConfig, PlantConfig, STEPS_PER_DAY
from .forecasting import CHRPredictor, LoadForecaster
from .gordon_ng import gn_power_kw_f
from .weather import World


class MPCController:
    def __init__(self, plant: PlantConfig, mpc: MPCConfig, world: World,
                 load_fc: LoadForecaster, chr_pred: CHRPredictor,
                 gn_coeffs: list[np.ndarray]):
        self.plant = plant
        self.cfg = mpc
        self.world = world
        self.load_fc = load_fc
        self.chr_pred = chr_pred
        self.gn = gn_coeffs
        self.diag: list[dict] = []
        n = plant.n_ch
        qmax = np.array(plant.qmax_rt)
        nc = 1 << n
        bits = ((np.arange(nc)[:, None] >> np.arange(n)) & 1).astype(bool)
        self.bits = bits                                  # (64, n)
        self.cap = bits @ qmax                            # RT
        self.flow = self.cap / plant.dt_design_f          # RT deliverable per degF
        self.n_on = bits.sum(axis=1)
        self.share = np.where(bits, qmax[None, :], 0.0) / np.maximum(
            self.cap[:, None], 1e-9)
        self.xor = np.arange(nc)[:, None] ^ np.arange(nc)[None, :]
        self.pc = np.array([bin(v).count("1") for v in range(nc)])
        self.tcap = max(mpc.t_min_on_steps, mpc.t_min_off_steps)
        # horizon-dependent CHR limit: subtract the CHR model's validated
        # test RMSE per step (floored at chr_guard_f) from the hard bound
        rmse = np.array([chr_pred.metrics.get(j, {}).get("rmse_test", 0.5)
                         for j in range(1, mpc.horizon_steps + 1)])
        self.chr_lim_j = plant.t_chr_max_f - np.maximum(
            mpc.chr_guard_f, mpc.chr_sigma_k * rmse)

    # ------------------------------------------------------------- schedule
    def _sched_bounds(self, s_mod: int) -> tuple[int, int]:
        p = self.plant
        if not (p.open_step <= s_mod < p.close_step):
            return 0, 0
        if s_mod < p.min_on_daytime_end:
            return 1, self.cfg.n_ch_max
        return 0, self.cfg.n_ch_max

    # ------------------------------------------------------------------ act
    def act(self, s: int, recent: list[dict], day: int) -> np.ndarray:
        p = self.plant
        if not recent or not (p.open_step <= s < p.close_step):
            return np.zeros(p.n_ch, bool)
        try:
            return self._solve(s, recent, day)
        except Exception as e:  # paper Sec. 3.7.1: never fail to output
            self.diag.append({"day": day, "s": s, "error": repr(e)})
            return recent[-1]["delta"].copy()

    # ---------------------------------------------------------------- solve
    def _solve(self, s: int, recent: list[dict], day: int) -> np.ndarray:
        p, cfg = self.plant, self.cfg
        prev = recent[-1]
        t0_abs = day * STEPS_PER_DAY + (s - 1)
        combo0 = int(np.dot(prev["delta"].astype(int), 1 << np.arange(p.n_ch)))
        dwell0 = np.clip(prev["dwell"], -self.tcap, self.tcap).astype(np.int16)

        def hist(key, back, default):
            i = len(recent) - 1 - back
            return recent[i][key] if i >= 0 else default

        chr_lags = np.array([hist("chr_f", b, recent[0]["chr_f"]) for b in range(5)])
        q_lags = np.array([hist("q_total_rt", b, 0.0) for b in range(4)])
        chs_now = prev["chs_f"]
        t_cds = prev["t_cds_f"]           # held over horizon (Eq. 21m)
        chs_set = p.t_chs_set_f

        frozen = self.chr_pred.frozen_features(self.world, t0_abs, chr_lags, chs_now)
        packs = self.chr_pred.compile(frozen)
        # near-term load anchor via loop-inertia observer:
        # building load ~= delivered + C_loop * dCHR/dt (not raw delivered,
        # which would let over/under-delivery feed back into the forecast)
        q_obs = [hist("q_total_rt", b, 0.0)
                 + self.plant.loop_rt_step_per_f
                 * (hist("chr_f", b, chr_lags[0]) - hist("chr_f", b + 1, chr_lags[0]))
                 for b in range(3)]
        q_now = float(np.clip(np.median(q_obs), 0.0, 1.2 * self.cap[-1]))
        q_load = self.load_fc.predict_steps(self.world, t0_abs,
                                            cfg.horizon_steps, q_now)

        # beam state
        combo = np.array([combo0])
        dwell = dwell0[None, :].copy()
        qlag = q_lags[None, :].copy()          # [Q(k-1)..Q(k-4)]
        chr_prev = np.array([chr_lags[0]])
        chr_sum = np.zeros(1)
        cost = np.zeros(1)
        path = np.zeros((1, 0), dtype=np.int16)
        n_comfort = 0

        for k in range(1, cfg.horizon_steps + 1):
            s_mod = (s + k - 1) % STEPS_PER_DAY
            n_min, n_max = self._sched_bounds(s_mod)
            comfort = (p.comfort_start - cfg.comfort_lead_steps) <= s_mod \
                < p.close_step

            # ---- admissible transitions (Eqs. 21i-21l)
            on_now = self.bits[combo]                       # (M, n)
            elig = np.where(on_now, dwell >= cfg.t_min_on_steps,
                            -dwell >= cfg.t_min_off_steps)
            elig_int = elig @ (1 << np.arange(p.n_ch))
            xor_m = self.xor[combo]                         # (M, 64)
            allowed = ((xor_m & ~elig_int[:, None]) == 0) \
                & (self.pc[xor_m] <= cfg.max_switches_per_step) \
                & (self.n_on >= n_min)[None, :] & (self.n_on <= n_max)[None, :]
            if n_max == 0:
                allowed[:] = False
                allowed[:, 0] = True                        # schedule override
            node_i, succ = np.nonzero(allowed)
            if len(node_i) == 0:                            # emergency fallback
                node_i = np.arange(len(combo))
                succ = combo.copy()

            ql = qlag[node_i]                               # (P, 4)
            a_, b_, c_ = packs[k - 1]
            crr = c_[1:, 1:]
            alpha = a_ + ql @ b_[1:] + np.einsum("pi,ij,pj->p", ql, crr, ql)
            beta = b_[0] + 2.0 * ql @ c_[0, 1:]
            gamma = c_[0, 0]

            flow = self.flow[succ]
            cap = self.cap[succ]
            q_new, t_new = self._fixed_point(alpha, beta, gamma, flow, cap, chs_set)

            # ---- power via fitted Gordon-Ng (Eq. 21a with Eq. 3)
            p_tot = np.zeros(len(succ))
            on_succ = self.bits[succ]
            for i in range(p.n_ch):
                m = on_succ[:, i]
                if np.any(m):
                    qi = self.share[succ[m], i] * q_new[m]
                    p_tot[m] += gn_power_kw_f(qi, t_cds, chs_set, self.gn[i])

            # ---- penalties (slack prices)
            pen = cfg.alpha_demand * np.maximum(0.0, q_load[k - 1] - q_new)
            pen += cfg.alpha_pdem * np.maximum(0.0, p_tot - cfg.p_demand_max_kw)
            pen += cfg.alpha_switch * self.pc[combo[node_i] ^ succ]
            if comfort:
                pen += cfg.alpha_chr * np.maximum(0.0, t_new - self.chr_lim_j[k - 1])
                rate = np.abs(t_new - chr_prev[node_i])
                pen += cfg.alpha_chr_rate * np.maximum(0.0, rate - p.d_chr_max_f)
                if k == cfg.horizon_steps:
                    pen += cfg.alpha_chr * np.maximum(
                        0.0, t_new - (self.chr_lim_j[k - 1] - cfg.terminal_margin_f))

            new_cost = cost[node_i] + p_tot + pen
            new_sum = chr_sum[node_i] + (t_new if comfort else 0.0)
            if comfort:
                n_comfort += 1

            # ---- dwell bookkeeping
            on_old = on_now[node_i]
            same = on_succ == on_old
            d = dwell[node_i]
            new_dwell = np.where(
                same, np.where(on_succ, np.minimum(d + 1, self.tcap),
                               np.maximum(d - 1, -self.tcap)),
                np.where(on_succ, 1, -1)).astype(np.int16)

            new_qlag = np.column_stack([q_new, ql[:, :3]])
            new_path = np.column_stack([path[node_i], succ.astype(np.int16)])

            # ---- dominance pruning + beam truncation
            key = self._pack_key(succ, new_dwell, t_new, q_new)
            order = np.argsort(new_cost, kind="stable")
            _, first = np.unique(key[order], return_index=True)
            keep = order[np.sort(first)]
            if len(keep) > cfg.beam_width:
                keep = keep[np.argsort(new_cost[keep], kind="stable")[:cfg.beam_width]]

            combo, dwell, qlag = succ[keep], new_dwell[keep], new_qlag[keep]
            chr_prev, chr_sum, cost = t_new[keep], new_sum[keep], new_cost[keep]
            path = new_path[keep]

        # average-CHR constraint at the leaves (Eq. 21g)
        total = cost.copy()
        if n_comfort > 0:
            avg = chr_sum / n_comfort
            total += cfg.alpha_chr_avg * n_comfort * np.maximum(
                0.0, avg - p.t_chr_avg_max_f)
        best = int(np.argmin(total))
        plan = path[best]
        self._log_diag(day, s, plan, packs, q_lags, q_load, t_cds, float(total[best]))
        return self.bits[plan[0]].copy()

    # ------------------------------------------------------------ internals
    def _fixed_point(self, alpha, beta, gamma, flow, cap, chs_set):
        """Solve T = alpha + beta*Q + gamma*Q^2, Q = clip(flow*(T-chs), 0, cap)
        (Eqs. 6+12 coupling) in closed form; saturate at capacity (Eq. 8)."""
        off = flow <= 0
        bb = beta - 1.0 / np.maximum(flow, 1e-9)
        cc = alpha - chs_set
        with np.errstate(divide="ignore", invalid="ignore"):
            q_lin = -cc / np.where(np.abs(bb) > 1e-12, bb, -1e-12)
            disc = bb * bb - 4.0 * gamma * cc
            use_quad = (np.abs(gamma) > 1e-12) & (disc >= 0.0)
            sq = np.sqrt(np.maximum(disc, 0.0))
            g = np.where(use_quad, gamma, 1.0)
            # stable quadratic roots: r1 large-magnitude, r2 = cc/(gamma*r1)
            r1 = (-bb - np.sign(bb + (bb == 0)) * sq) / (2.0 * g)
            r2 = cc / (g * np.where(np.abs(r1) > 1e-12, r1, 1e-12))
        # pick the root nearest the linear solution (physical branch)
        q = np.where(use_quad,
                     np.where(np.abs(r1 - q_lin) <= np.abs(r2 - q_lin), r1, r2),
                     q_lin)
        q = np.clip(np.where(off, 0.0, q), 0.0, cap)
        t = alpha + beta * q + gamma * q * q
        return q, np.clip(t, chs_set, 80.0)

    def _pack_key(self, succ, dwell, t_new, q_new):
        base = 2 * self.tcap + 1
        dpack = np.zeros(len(succ), dtype=np.int64)
        for i in range(dwell.shape[1]):
            dpack = dpack * base + (dwell[:, i] + self.tcap)
        tq = (np.round(t_new / self.cfg.dedupe_chr_res_f).astype(np.int64)
              * 4096 + np.round(q_new / self.cfg.dedupe_q_res_rt).astype(np.int64))
        return (succ.astype(np.int64) * (base ** dwell.shape[1] + 1) + dpack) \
            * 100_000_003 + tq

    def _rollout(self, plan, packs, q_lags, chs_set):
        """Re-evaluate the winning schedule for diagnostics/plots."""
        ql = q_lags.copy()
        qs, ts = [], []
        for k, cmb in enumerate(plan, start=1):
            a_, b_, c_ = packs[k - 1]
            alpha = a_ + ql @ b_[1:] + ql @ c_[1:, 1:] @ ql
            beta = b_[0] + 2.0 * ql @ c_[0, 1:]
            gamma = c_[0, 0]
            q, t = self._fixed_point(np.array([alpha]), np.array([beta]),
                                     np.array([gamma]),
                                     np.array([self.flow[cmb]]),
                                     np.array([self.cap[cmb]]), chs_set)
            qs.append(float(q[0]))
            ts.append(float(t[0]))
            ql = np.concatenate([[q[0]], ql[:3]])
        return np.array(qs), np.array(ts)

    def _log_diag(self, day, s, plan, packs, q_lags, q_load, t_cds, cost):
        q_traj, t_traj = self._rollout(plan, packs, q_lags, self.plant.t_chs_set_f)
        p_traj = np.zeros(len(plan))
        for k, cmb in enumerate(plan):
            for i in range(self.plant.n_ch):
                if self.bits[cmb, i]:
                    p_traj[k] += float(gn_power_kw_f(
                        self.share[cmb, i] * q_traj[k], t_cds,
                        self.plant.t_chs_set_f, self.gn[i]))
        self.diag.append({
            "day": day, "s": s, "plan": np.asarray(plan, dtype=int),
            "n_on_plan": self.n_on[np.asarray(plan, dtype=int)],
            "chr_pred": t_traj, "q_pred": q_traj, "p_pred": p_traj,
            "q_load_fc": q_load.copy(), "cost": cost})
