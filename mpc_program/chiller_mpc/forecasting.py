"""Learned system models (paper Sec. 3.1-3.3).

* Ridge regression with chronological (time-series) cross-validation for
  the regularization weight - closed form, numpy only.
* LoadForecaster: 24 independent hourly-horizon models (Sec. 3.1) using
  forecasted weather, on-site weather history and temporal features.
* CHRPredictor: 12 polynomial (degree-2, full interactions) Ridge models,
  one per 15-min step of the 3-h horizon (Sec. 3.2, Eqs. 1-2). Future
  cooling capacity enters as an explicit input, and each fitted model is
  compiled to  T_chr = A + b.q + q^T C q  in the capacity trajectory
  q = [Q(k), Q(k-1), ..., Q(k-4)], so the MPC evaluates control decisions
  in closed form.
* Gordon-Ng identification from operating logs (Sec. 3.3).

All models are trained on noisy *measured* records only - never on the
simulator's hidden truth.
"""
from __future__ import annotations

import numpy as np

from .config import PlantConfig, SimConfig, STEPS_PER_DAY
from .gordon_ng import fit_gn, gn_metrics
from .weather import World

# --------------------------------------------------------------------- ridge


def _ridge_fit(x, y, lam):
    """Standardized ridge, unpenalized intercept. Returns predictor params."""
    mu = x.mean(axis=0)
    sig = x.std(axis=0)
    sig[sig < 1e-9] = 1.0
    xs = (x - mu) / sig
    ym = y.mean()
    n = xs.shape[1]
    w = np.linalg.solve(xs.T @ xs + lam * np.eye(n), xs.T @ (y - ym))
    return {"mu": mu, "sig": sig, "w": w, "b": ym}


def _ridge_predict(m, x):
    return m["b"] + ((x - m["mu"]) / m["sig"]) @ m["w"]


def _cv_lambda(x, y, lambdas, n_blocks=4):
    """Expanding-window time-series CV (paper: 3-fold, temporal order kept)."""
    edges = np.linspace(0, len(y), n_blocks + 1, dtype=int)
    best, best_mse = lambdas[0], np.inf
    for lam in lambdas:
        mses = []
        for i in range(1, n_blocks):
            tr = slice(0, edges[i])
            va = slice(edges[i], edges[i + 1])
            if edges[i] < 20 or edges[i + 1] - edges[i] < 5:
                continue
            m = _ridge_fit(x[tr], y[tr], lam)
            mses.append(float(np.mean((y[va] - _ridge_predict(m, x[va])) ** 2)))
        mse = float(np.mean(mses)) if mses else np.inf
        if mse < best_mse:
            best, best_mse = lam, mse
    return best


def _r2(y, yhat):
    ss = float(np.sum((y - y.mean()) ** 2))
    return 1.0 - float(np.sum((y - yhat) ** 2)) / max(ss, 1e-9)


# ------------------------------------------------------------ load forecaster


class LoadForecaster:
    """24 independent models, one per forecast hour (Sec. 3.1, Fig. 2)."""

    N_HOURS = 24

    def __init__(self, plant: PlantConfig, sim: SimConfig):
        self.plant = plant
        self.sim = sim
        self.models: dict[int, dict] = {}
        self.metrics: dict[int, dict] = {}
        s = np.arange(STEPS_PER_DAY)
        self._open_frac_hour = np.array([
            np.mean((s[h * 4:(h + 1) * 4] >= plant.open_step)
                    & (s[h * 4:(h + 1) * 4] < plant.close_step))
            for h in range(24)])

    # features -----------------------------------------------------------
    def _features(self, world: World, issue_abs: int, target_abs: int):
        t_fc, rh_fc = world.wx_forecast(issue_abs, target_abs)
        cal = world.calendar(target_abs)
        hr = cal["hour"]
        th = 2.0 * np.pi * hr / 24.0
        open_frac = self._open_frac_hour[int(hr) % 24]
        hist = [world.t_amb_f(a) for a in range(max(0, issue_abs - 96), issue_abs + 1, 4)]
        t_mean24 = float(np.mean(hist))
        wk = 1.0 * (cal["weekend"] or cal["holiday"])
        f = [t_fc, rh_fc, world.t_amb_f(issue_abs), world.rh(issue_abs),
             t_mean24, np.sin(th), np.cos(th), np.sin(2 * th), np.cos(2 * th),
             wk, open_frac, t_fc * open_frac,
             np.sin(th) * open_frac, np.cos(th) * open_frac, wk * open_frac]
        return np.array(f)

    # training -----------------------------------------------------------
    def fit(self, logs: dict, world: World):
        """logs: stacked record arrays over the historical days."""
        abs_step = logs["abs_step"]
        q = logs["q_total_rt"]
        valid = logs["valid_load"]
        # hourly load proxy (mean of valid delivered-RT samples in the hour)
        n_hours = (abs_step.max() + 1) // 4
        y_hour = np.full(n_hours, np.nan)
        for h in range(n_hours):
            m = (abs_step >= 4 * h) & (abs_step < 4 * (h + 1))
            sel = m & valid
            cal_open = self._open_frac_hour[h % 24] > 0
            if sel.sum() >= 2:
                y_hour[h] = q[sel].mean()
            elif not cal_open:
                y_hour[h] = 0.0     # plant scheduled off: load proxy is zero
        issues = np.arange(24, n_hours)  # need 24 h of on-site history
        for n in range(1, self.N_HOURS + 1):
            xs, ys = [], []
            for ih in issues:
                th_ = ih + n
                if th_ >= n_hours or np.isnan(y_hour[th_]):
                    continue
                xs.append(self._features(world, ih * 4, th_ * 4))
                ys.append(y_hour[th_])
            x = np.array(xs)
            y = np.array(ys)
            cut = int(len(y) * 0.75)
            lam = _cv_lambda(x[:cut], y[:cut], self.sim.ridge_lambdas)
            m_tr = _ridge_fit(x[:cut], y[:cut], lam)
            yhat = _ridge_predict(m_tr, x[cut:])
            self.metrics[n] = {"r2": _r2(y[cut:], yhat),
                               "mae_rt": float(np.mean(np.abs(y[cut:] - yhat))),
                               "lam": lam, "n": len(y)}
            self.models[n] = _ridge_fit(x, y, lam)   # refit on all data
        return self.metrics

    # inference ----------------------------------------------------------
    def predict_hour(self, world: World, issue_abs: int, horizon_h: int) -> float:
        n = int(np.clip(horizon_h, 1, self.N_HOURS))
        target_abs = (issue_abs // 4) * 4 + 4 * n
        x = self._features(world, issue_abs, target_abs)
        val = float(_ridge_predict(self.models[n], x[None, :])[0])
        if self._open_frac_hour[(target_abs // 4) % 24] == 0:
            return 0.0
        return max(0.0, val)

    def predict_steps(self, world: World, issue_abs: int, n_steps: int,
                      q_now_rt: float) -> np.ndarray:
        """15-min-resolution load forecast for the MPC horizon (Eq. 7 input),
        interpolated between the hourly-model anchors."""
        n_hours = int(np.ceil(n_steps / 4)) + 1
        anchors_k = [0.0] + [4.0 * n for n in range(1, n_hours + 1)]
        anchors_q = [q_now_rt] + [self.predict_hour(world, issue_abs, n)
                                  for n in range(1, n_hours + 1)]
        k = np.arange(1, n_steps + 1, dtype=float)
        q = np.interp(k, anchors_k, anchors_q)
        # zero out steps when the plant is scheduled closed
        s0 = issue_abs % STEPS_PER_DAY
        steps = (s0 + np.arange(1, n_steps + 1)) % STEPS_PER_DAY
        open_mask = (steps >= self.plant.open_step) & (steps < self.plant.close_step)
        return np.where(open_mask, np.maximum(q, 0.0), 0.0)


# ------------------------------------------------------------- CHR predictor


class CHRPredictor:
    """12 direct multi-horizon polynomial models of CHR (Sec. 3.2).

    Raw feature vector for horizon j (t0 = solve time, k = t0 + j):
      q-affine:  Q_tot(k), r(k), r(k-1), r(k-2), r(k-3)   [r = step change]
      frozen:    CHR(t0), CHR lags 15/30/45/60 min, CHS(t0),
                 T_amb(t0), RH(t0), T_amb forecast at k,
                 sin/cos of target hour (occupancy pattern proxy, so the
                 model can infer the load level behind a given capacity)
    Degree-2 polynomial with all pairwise interactions (Eq. 1), Ridge (Eq. 2).
    """

    N_HORIZON = 12
    N_Q = 5          # q-affine raw features
    N_FROZEN = 11

    def __init__(self, plant: PlantConfig, sim: SimConfig):
        self.plant = plant
        self.sim = sim
        n_raw = self.N_Q + self.N_FROZEN
        self.terms = [(i,) for i in range(n_raw)] + \
                     [(i, j) for i in range(n_raw) for j in range(i, n_raw)]
        # affine maps: raw q-features = L @ q, with q = [Q(k),...,Q(k-4)]
        self.L = np.zeros((self.N_Q, 5))
        self.L[0, 0] = 1.0
        for r in range(1, 5):
            self.L[r, r - 1] = 1.0
            self.L[r, r] = -1.0
        self.models: dict[int, dict] = {}
        self.metrics: dict[int, dict] = {}

    # ------------------------------------------------------------ features
    def _raw_features(self, q5: np.ndarray, frozen: np.ndarray) -> np.ndarray:
        return np.concatenate([self.L @ q5, frozen])

    def _design(self, f_rows: np.ndarray) -> np.ndarray:
        cols = [f_rows[:, t[0]] if len(t) == 1 else f_rows[:, t[0]] * f_rows[:, t[1]]
                for t in self.terms]
        return np.column_stack(cols)

    # ------------------------------------------------------------ training
    def fit(self, logs: dict, world: World):
        cfg = self.plant
        abs_step = logs["abs_step"]
        step = logs["step"]
        chr_m = logs["chr_f"]
        chs_m = logs["chs_f"]
        q_m = logs["q_total_rt"]
        t_amb = logs["t_amb_f"]
        rh = logs["rh"]
        idx = np.arange(len(abs_step))
        contiguous = np.concatenate([[False], np.diff(abs_step) == 1])
        for j in range(1, self.N_HORIZON + 1):
            rows, ys = [], []
            for i in idx:
                s0 = step[i]
                # t0 from just before plant start (so the MPC's morning
                # solves are in-distribution) up to targets before close
                if not (cfg.open_step - 6 <= s0 and s0 + j <= cfg.close_step - 1):
                    continue
                if i - 4 < 0 or i + j >= len(idx):
                    continue
                if not (np.all(contiguous[i - 3:i + j + 1])):
                    continue
                q5 = np.array([q_m[i + j], q_m[i + j - 1], q_m[i + j - 2],
                               q_m[i + j - 3], q_m[i + j - 4]])
                th = 2.0 * np.pi * ((s0 + j) * 0.25 % 24.0) / 24.0
                frozen = np.array([chr_m[i], chr_m[i - 1], chr_m[i - 2],
                                   chr_m[i - 3], chr_m[i - 4], chs_m[i],
                                   t_amb[i], rh[i],
                                   world.wx_forecast(abs_step[i], abs_step[i] + j)[0],
                                   np.sin(th), np.cos(th)])
                rows.append(self._raw_features(q5, frozen))
                ys.append(chr_m[i + j])
            f = np.array(rows)
            y = np.array(ys)
            x = self._design(f)
            cut = int(len(y) * 0.75)
            lam = _cv_lambda(x[:cut], y[:cut], self.sim.ridge_lambdas)
            m_tr = _ridge_fit(x[:cut], y[:cut], lam)
            yhat_te = _ridge_predict(m_tr, x[cut:])
            yhat_tr = _ridge_predict(m_tr, x[:cut])
            self.metrics[j] = {
                "r2_train": _r2(y[:cut], yhat_tr),
                "rmse_train": float(np.sqrt(np.mean((y[:cut] - yhat_tr) ** 2))),
                "r2_test": _r2(y[cut:], yhat_te),
                "rmse_test": float(np.sqrt(np.mean((y[cut:] - yhat_te) ** 2))),
                "lam": lam, "n": len(y)}
            m = _ridge_fit(x, y, lam)
            # fold standardization into raw-scale coefficients:
            # y = b0 + sum_col w/sig * (t_col - mu)  ->  c + sum phi*t_col
            phi = m["w"] / m["sig"]
            c = m["b"] - float(np.sum(m["w"] * m["mu"] / m["sig"]))
            self.models[j] = {"phi": phi, "c": c}
        return self.metrics

    # ---------------------------------------------------------- compilation
    def compile(self, frozen_by_j: np.ndarray):
        """Compile each horizon model to (A_j, b_j, C_j) so that
        T_chr(j) = A_j + b_j . q + q^T C_j q,  q = [Q(j),...,Q(j-4)] in RT.

        frozen_by_j: (12, N_FROZEN) frozen feature values per horizon
        (they differ only in the forecast-weather column).
        """
        packs = []
        n_raw = self.N_Q + self.N_FROZEN
        for j in range(1, self.N_HORIZON + 1):
            mdl = self.models[j]
            fz = frozen_by_j[j - 1]
            # each raw feature i: f_i = w_i . q + c_i
            w = np.zeros((n_raw, 5))
            c = np.zeros(n_raw)
            w[:self.N_Q] = self.L
            c[self.N_Q:] = fz
            a_ = mdl["c"]
            b_ = np.zeros(5)
            c_ = np.zeros((5, 5))
            for phi, t in zip(mdl["phi"], self.terms):
                if phi == 0.0:
                    continue
                if len(t) == 1:
                    i = t[0]
                    a_ += phi * c[i]
                    b_ += phi * w[i]
                else:
                    i, k = t
                    a_ += phi * c[i] * c[k]
                    b_ += phi * (c[i] * w[k] + c[k] * w[i])
                    c_ += phi * 0.5 * (np.outer(w[i], w[k]) + np.outer(w[k], w[i]))
            packs.append((a_, b_, c_))
        return packs

    def predict_traj(self, frozen_by_j: np.ndarray, q_traj: np.ndarray,
                     q_meas_lags: np.ndarray) -> np.ndarray:
        """Reference (uncompiled) prediction for a capacity trajectory.
        q_traj: (12,) planned Q_total; q_meas_lags: [Q(0),Q(-1),Q(-2),Q(-3)]."""
        full = np.concatenate([q_meas_lags[::-1], q_traj])  # index 3 == Q(0)
        out = np.zeros(self.N_HORIZON)
        for j in range(1, self.N_HORIZON + 1):
            q5 = np.array([full[3 + j - m] for m in range(5)])
            f = self._raw_features(q5, frozen_by_j[j - 1])
            x = self._design(f[None, :])
            mdl = self.models[j]
            out[j - 1] = mdl["c"] + float((x @ mdl["phi"])[0])
        return out

    def frozen_features(self, world: World, t0_abs: int, chr_lags: np.ndarray,
                        chs_now: float) -> np.ndarray:
        """Build (12, N_FROZEN) frozen-feature matrix at solve time."""
        rows = []
        for j in range(1, self.N_HORIZON + 1):
            th = 2.0 * np.pi * (((t0_abs + j) % STEPS_PER_DAY) * 0.25) / 24.0
            rows.append([chr_lags[0], chr_lags[1], chr_lags[2], chr_lags[3],
                         chr_lags[4], chs_now,
                         world.t_amb_f(t0_abs), world.rh(t0_abs),
                         world.wx_forecast(t0_abs, t0_abs + j)[0],
                         np.sin(th), np.cos(th)])
        return np.array(rows)


# --------------------------------------------------------- Gordon-Ng fitting


def fit_gn_from_logs(logs: dict, plant: PlantConfig):
    """Identify per-chiller Gordon-Ng coefficients from noisy records."""
    coeffs, metrics = [], []
    delta = logs["delta"]           # (n, n_ch) bool
    q_i = logs["q_i_rt"]
    p_i = logs["p_i_kw"]
    for i, ch in enumerate(plant.chillers):
        m = delta[:, i] & (q_i[:, i] > 0.12 * ch.qmax_rt) & (p_i[:, i] > 10.0)
        a = fit_gn(q_i[m, i], logs["t_cds_f"][m], logs["chs_f"][m], p_i[m, i])
        coeffs.append(a)
        metrics.append(gn_metrics(q_i[m, i], logs["t_cds_f"][m],
                                  logs["chs_f"][m], p_i[m, i], a))
    return coeffs, metrics


def stack_records(records: list[dict]) -> dict:
    """List of per-step record dicts -> dict of stacked numpy arrays."""
    out = {}
    for k in records[0]:
        v0 = records[0][k]
        if isinstance(v0, np.ndarray):
            out[k] = np.stack([r[k] for r in records])
        else:
            out[k] = np.array([r[k] for r in records])
    return out
