"""Validate the BMS RT column against the chilled-water energy balance.

The workbook's own Calculation_Audit sheet documents the formula it used:

    RT = 1.18892327296496 x SUM(riser flows) x (Header-hcwrt - Header-hcwst)

which is the standard balance   RT = (4.186/3.517) x Flow(L/s) x dT(degC)
with a least-squares zero-intercept factor fitted to the 133 rows where RT
was actually METERED. Everything else is reconstructed.

Note `Header-hcwf` is NOT the chilled-water header flow: at a ~696 L/s median
it matches three running CWPs, i.e. it is the CONDENSER header flow. Using it
here overstates RT by ~84%, which is how this was caught.
"""
from __future__ import annotations

from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parents[2]
z = np.load(REPO / "calibration/fixtures/.t1-month-cache.npz", allow_pickle=True)

g = lambda k: np.asarray(z[k], float)
risers = g("riser_finger_fls") + g("riser_l13_fls") + g("riser_main_fls") + g("riser_t1u_fls")
chws, chwr = g("hcwst"), g("hcwrt")
rt_bms, dt_bms, kw, kwrt, day = g("rt"), g("deltaT"), g("kw"), g("kwrt"), g("day").astype(int)

THEORY = 4.186 / 3.517          # 1.19022
AUDIT = 1.18892327296496        # workbook's fitted factor
dt = chwr - chws

print("=" * 76)
print("COOLING LOAD VALIDATION")
print("=" * 76)
print(f"theoretical coefficient 4.186/3.517 = {THEORY:.6f}")
print(f"workbook fitted factor              = {AUDIT:.6f}   ({100*(AUDIT/THEORY-1):+.3f}% vs theory)")

for label, k in (("theory", THEORY), ("audit ", AUDIT)):
    rt_calc = k * risers * dt
    ok = np.isfinite(rt_calc) & np.isfinite(rt_bms) & (rt_bms > 100)
    err = rt_calc[ok] - rt_bms[ok]
    pct = 100.0 * err / rt_bms[ok]
    print(f"\nRT via {label} coefficient   (n={ok.sum()})")
    print(f"   MAE {np.mean(np.abs(err)):8.4f} RT   RMSE {np.sqrt(np.mean(err**2)):8.4f} RT"
          f"   bias {np.mean(err):+8.4f} RT   MAPE {np.mean(np.abs(pct)):.5f} %")
    print(f"   p95|err| {np.percentile(np.abs(err),95):.4f} RT   max|err| {np.max(np.abs(err)):.4f} RT")

print("\n" + "-" * 76)
print("PROVENANCE — how much of the RT column is measured?")
print("   metered rows (audit sheet)     : 133   (rows D2:D134, 2025-12-01 00:00-02:12)")
print("   reconstructed rows             : 44,507")
print(f"   => {100*133/44640:.2f}% of the RT column is METERED; the rest is derived")
print("   workbook's own validation on the 133: MAPE 0.105%, MAE 3.36 RT, RMSE 4.17 RT")

print("\n" + "-" * 76)
print("ABNORMAL PERIODS")
neg = rt_bms < 0
print(f"   negative RT   : {int(neg.sum())} rows  -> 2025-12-23 11:41-11:42 (header dT inverted)")
print(f"   0 < RT <= 100 : {int(((rt_bms>=0)&(rt_bms<=100)).sum())} rows")
print(f"   CT4 power gap : 1,440 rows on 2025-12-31 (DPM_CT_04_kW absent; plant kW understated)")

print("\n" + "-" * 76)
print("HEADER-hcwf IDENTITY CHECK  (is it CHW or CW header flow?)")
hcwf = g("hcwf")
cw_sum = sum(g(f"ch{i}_cwfls") for i in range(1, 6))
chw_sum = sum(g(f"ch{i}_chwfls") for i in range(1, 6))
for name, arr in (("sum chiller CwFls ", cw_sum), ("sum chiller ChwFls", chw_sum),
                  ("sum riser ChwFls  ", risers)):
    d = hcwf - arr
    print(f"   hcwf vs {name}: MAE {np.nanmean(np.abs(d)):8.2f}  corr "
          f"{np.corrcoef(hcwf[np.isfinite(arr)], arr[np.isfinite(arr)])[0,1]:+.4f}")
print("   => hcwf tracks the CONDENSER header, not the chilled-water header")
