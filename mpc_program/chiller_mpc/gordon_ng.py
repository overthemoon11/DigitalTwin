"""Gordon-Ng semi-empirical chiller power model (paper Sec. 3.3, Eq. 3).

    P = [Q*(Tcds - Tchs) + a1*Tcds*Tchs + a2*(Tcds - Tchs) + a3*Q^2]
        / (Tchs - a4*Q)

with temperatures in Kelvin, Q and P in kW. The paper feeds degF at the
interface; we convert to Kelvin here so the thermodynamic terms are sane.

The model is linear in (a1..a4) after rearrangement, so coefficients are
identified with ordinary least squares (Sec. 3.3: "obtained through
least-squares regression using historical operational data").
"""
from __future__ import annotations

import numpy as np

from . import RT_TO_KW, f_to_k


def gn_power_kw(q_kw, t_cds_k, t_chs_k, a):
    """Electric power (kW). Vectorized over q/temps. a = (a1,a2,a3,a4)."""
    q = np.asarray(q_kw, dtype=float)
    dt = t_cds_k - t_chs_k
    num = q * dt + a[0] * t_cds_k * t_chs_k + a[1] * dt + a[2] * q * q
    den = t_chs_k - a[3] * q
    return num / np.maximum(den, 1.0)


def gn_power_kw_f(q_rt, t_cds_f, t_chs_f, a):
    """Convenience wrapper: cooling in RT, temperatures in degF."""
    return gn_power_kw(np.asarray(q_rt) * RT_TO_KW, f_to_k(t_cds_f),
                       f_to_k(t_chs_f), a)


def design_gn_coeffs(qmax_rt: float, eff_best_kwprt: float, plr_best: float,
                     t_chs_f: float, t_cds_f: float, gamma: float = 0.3):
    """Construct 'truth' GN coefficients from a design efficiency target.

    At fixed design temperatures the GN model with a4=0 reduces to
    P(Q) = c0 + c1*Q + c2*Q^2 with c1 = dT/Tchs fixed by thermodynamics.
    We choose c0, c2 so that efficiency P/Q is minimal (= eff_best) at
    Q = plr_best * Qmax, which yields the U-shaped kW/RT curve of Fig. 6b.
    gamma splits the no-load loss c0 between the a1 and a2 terms.
    """
    t_chs = f_to_k(t_chs_f)
    t_cds = f_to_k(t_cds_f)
    dt = t_cds - t_chs
    c1 = dt / t_chs
    eff_best = eff_best_kwprt / RT_TO_KW          # kW electric / kW thermal
    h = (eff_best - c1) / 2.0
    if h <= 0:
        raise ValueError("eff_best below Carnot-like bound; raise eff_best")
    q_best = plr_best * qmax_rt * RT_TO_KW
    c0 = h * q_best
    c2 = h / q_best
    a2 = gamma * c0 * t_chs / dt
    a1 = (1.0 - gamma) * c0 / t_cds
    a3 = c2 * t_chs
    return np.array([a1, a2, a3, 0.0])


def fit_gn(q_rt, t_cds_f, t_chs_f, p_kw):
    """Identify (a1..a4) from operating records.

    The classic linear rearrangement
      P*Tchs - Q*dT = a1*Tcds*Tchs + a2*dT + a3*Q^2 + a4*P*Q
    is ill-conditioned with measurement noise (noisy P appears on both
    sides), so it is used only to seed a bounded nonlinear least-squares
    on the direct prediction residual, which is what actually matters.
    """
    from scipy.optimize import least_squares

    q = np.asarray(q_rt, dtype=float) * RT_TO_KW
    p = np.asarray(p_kw, dtype=float)
    t_cds = f_to_k(np.asarray(t_cds_f, dtype=float))
    t_chs = f_to_k(np.asarray(t_chs_f, dtype=float))
    dt = t_cds - t_chs
    # seed: a4 = 0 linear fit (well conditioned, non-negative coefficients)
    y = p * t_chs - q * dt
    x = np.column_stack([t_cds * t_chs, dt, q * q])
    a0, *_ = np.linalg.lstsq(x, y, rcond=None)
    a0 = np.append(np.maximum(a0, 1e-12), 0.0)

    def resid(a):
        num = q * dt + a[0] * t_cds * t_chs + a[1] * dt + a[2] * q * q
        den = np.maximum(t_chs - a[3] * q, 1.0)
        return (num / den - p) / np.maximum(p, 50.0)

    lo = [0.0, 0.0, 0.0, -5e-3]
    hi = [np.inf, np.inf, np.inf, 5e-3]
    sol = least_squares(resid, np.clip(a0, lo, hi), bounds=(lo, hi),
                        method="trf", max_nfev=200)
    return sol.x


def gn_metrics(q_rt, t_cds_f, t_chs_f, p_kw, a):
    """R2 / RMSE / MAPE of a fitted model (paper Table 5)."""
    pred = gn_power_kw_f(q_rt, t_cds_f, t_chs_f, a)
    p = np.asarray(p_kw, dtype=float)
    ss_res = float(np.sum((p - pred) ** 2))
    ss_tot = float(np.sum((p - p.mean()) ** 2))
    r2 = 1.0 - ss_res / max(ss_tot, 1e-9)
    rmse = float(np.sqrt(np.mean((p - pred) ** 2)))
    mape = float(np.mean(np.abs((p - pred) / np.maximum(p, 1.0)))) * 100.0
    return {"r2": r2, "rmse_kw": rmse, "mape_pct": mape}
