#!/usr/bin/env python3
"""
Physics-formula validation harness for the DigitalTwin project.

Loads real plant Measurement & Verification (M&V) data
(T1_MVrawDataR2_2025_12_new.xlsx) and checks that the deterministic
physics formulas used in the codebase reproduce the measured / derived
values that the plant's own metering produced.

Each check is tied to a specific formula and code location. The constants
used here are copied verbatim from frontend/src/services/plantPhysics.ts so
that this script literally exercises the project's numbers.

Usage:
    python validate_physics.py [path/to/T1_MVrawDataR2_2025_12_new.xlsx] [--rows N]

Exit code 0 if every validatable check passes, 1 otherwise.
"""

from __future__ import annotations
import sys
import argparse
from pathlib import Path

# Ensure UTF-8 output on Windows consoles (cp1252 can't encode Sigma/superscripts).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants mirrored from frontend/src/services/plantPhysics.ts
# ---------------------------------------------------------------------------
FLOW_COEFF = 1.163      # Q[kW] = Flow[m3/h] * dT[K] * 1.163
RT_TO_KW = 3.517        # 1 ton of refrigeration = 3.517 kW (thermal)
CP_WATER = 4.1868       # kJ/(kg*K), specific heat of water (== 3.6 * FLOW_COEFF)

SHEET = "T1_MVrawDataR2_2025_12"
DEFAULT_XLSX = "T1_MVrawDataR2_2025_12_new.xlsx"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class Check:
    def __init__(self, name, code_ref, reference):
        self.name = name
        self.code_ref = code_ref
        self.reference = reference
        self.passed = None
        self.detail = ""
        self.skipped = False

    def result(self, passed, detail):
        self.passed = passed
        self.detail = detail
        return self

    def skip(self, detail):
        self.skipped = True
        self.detail = detail
        return self


def find(cols, *substrings):
    """Return all columns containing every substring (case-insensitive)."""
    out = []
    for c in cols:
        cl = str(c).lower()
        if all(s.lower() in cl for s in substrings):
            out.append(c)
    return out


def find_one(cols, *substrings):
    hits = find(cols, *substrings)
    if not hits:
        raise KeyError(f"no column matching {substrings}")
    return hits[0]


def rel_stats(calc: pd.Series, ref: pd.Series):
    """Return (mean_abs_pct_err, p95_abs_pct_err, max_abs_pct_err)."""
    mask = ref.abs() > 1e-6
    pct = ((calc[mask] - ref[mask]).abs() / ref[mask].abs()) * 100.0
    pct = pct.replace([np.inf, -np.inf], np.nan).dropna()
    return pct.mean(), pct.quantile(0.95), pct.max()


# ---------------------------------------------------------------------------
# Validation checks
# ---------------------------------------------------------------------------
def run_checks(df: pd.DataFrame) -> list[Check]:
    cols = list(df.columns)
    checks: list[Check] = []

    # -- [A] Efficiency reciprocal: kw/rt == kw / rt ------------------------
    c = Check(
        "Plant efficiency  kW/RT = totalPlantKw / coolingRT",
        "plantPhysics.ts: plantEfficiencyKwPerRt() / plantCop()",
        "ASHRAE Handbook—HVAC Systems & Equipment, Ch.43 (chiller plant kW/ton).",
    )
    calc = df["kw"] / df["rt"]
    err = (calc - df["kw/rt"]).abs().max()
    checks.append(c.result(err < 1e-6, f"max abs error = {err:.2e} (tol 1e-6)"))

    # -- [B] Plant power additivity: kw == sum(all electrical meters) -------
    c = Check(
        "Total plant power = Σ(chiller + CHWP + CWP + CT meters)",
        "controlEngine.ts: totalPlantKw aggregation; plantPhysics plantCop()",
        "First law / power balance — ASHRAE Fundamentals Ch.1; sub-metering per IPMVP Option B.",
    )
    meters = (
        find(cols, "DPM", "CH-", "CP")          # chiller compressors CP1+CP2
        + find(cols, "DPM-CHWP")                 # chilled-water pumps
        + find(cols, "DPM-CWP")                  # condenser-water pumps
        + [x for x in cols if "CT" in x and "DPM" in x]   # cooling-tower fans
    )
    s = df[meters].sum(axis=1)
    mean_pct, p95, mx = rel_stats(s, df["kw"])
    checks.append(c.result(mean_pct < 0.5, f"{len(meters)} meters; mean err {mean_pct:.3f}%  p95 {p95:.3f}%  max {mx:.3f}% (tol mean<0.5%)"))

    # -- [C] Cooling load: Q = flow * dT * 1.163 ; RT = Q / 3.517 ----------
    c = Check(
        "Cooling load RT = Σ_chiller(flow * cp * dT) / 3.517",
        "plantPhysics.ts: coolingKwFromFlow() [1.163], rtToKw/kwToRt [3.517]",
        "Sensible heat eq. Q=m*cp*dT — ASHRAE Fundamentals Ch.1; 1 ton = 3.51685 kW (ASHRAE/ARI definition).",
    )
    flows = find(cols, "CH-", "ChwFls")
    sts = find(cols, "CH-", "ChwSt")
    rts = find(cols, "CH-", "ChwRt")
    # pair them per chiller index 1..5
    q = pd.Series(0.0, index=df.index)
    paired = 0
    for i in range(1, 6):
        f = find(cols, f"CH-{i}-ChwFls")
        st = find(cols, f"CH-{i}-ChwSt")
        rt = find(cols, f"CH-{i}-ChwRt")
        if f and st and rt:
            dT = df[rt[0]] - df[st[0]]
            # flow is L/s; convert to m3/h (*3.6) then apply project FLOW_COEFF
            q = q + (df[f[0]] * 3.6) * dT * FLOW_COEFF
            paired += 1
    rt_calc = q / RT_TO_KW
    mean_pct, p95, mx = rel_stats(rt_calc, df["rt"])
    checks.append(c.result(mean_pct < 2.0, f"{paired} chillers; mean err {mean_pct:.3f}%  p95 {p95:.3f}%  max {mx:.3f}% (tol mean<2%)"))

    # -- [D] Delta-T definition: dT = return - supply ----------------------
    c = Check(
        "Chilled-water dT = header return - header supply",
        "districtCoolingEngine.ts secondaryDeltaT; controlEngine deltaT",
        "Counter-flow heat-exchanger dT — ASHRAE Fundamentals Ch.4 (Heat Transfer).",
    )
    try:
        hst = find_one(cols, "hcwst")
        hrt = find_one(cols, "hcwrt")
        dT = df[hrt] - df[hst]
        corr = dT.corr(df["deltaT"])
        mean_pct, p95, mx = rel_stats(dT, df["deltaT"])
        checks.append(c.result(corr > 0.99 and mean_pct < 2.0, f"corr {corr:.4f}; mean err {mean_pct:.3f}% (tol corr>0.99)"))
    except KeyError as e:
        checks.append(c.skip(f"header temp columns not found: {e}"))

    # -- [E] COP physical bounds: coolingKw / chillerKw in [2.5, 9] --------
    c = Check(
        "Chiller COP = coolingKw / chiller electrical kW within physical bounds",
        "plantPhysics.ts: plantCop(); REF_CHILLER_COP",
        "Carnot-limited COP; water-cooled centrifugal range 5-7 — ASHRAE 90.1 / AHRI 550/590.",
    )
    ch_pow = find(cols, "DPM", "CH-", "CP")
    cooling_kw = df["rt"] * RT_TO_KW
    cop = cooling_kw / df[ch_pow].sum(axis=1).replace(0, np.nan)
    cop = cop.replace([np.inf, -np.inf], np.nan).dropna()
    frac_ok = ((cop >= 2.5) & (cop <= 9.0)).mean()
    checks.append(c.result(frac_ok > 0.95, f"mean COP {cop.mean():.2f} (min {cop.min():.2f} max {cop.max():.2f}); {frac_ok*100:.1f}% within [2.5,9]"))

    # -- [F] kW/RT plausibility band ---------------------------------------
    c = Check(
        "Plant efficiency kW/RT within efficient water-cooled band [0.45, 1.0]",
        "plantPhysics.ts: plantEfficiencyKwPerRt()",
        "Typical all-in water-cooled plant 0.5-0.85 kW/ton — ASHRAE Handbook Systems Ch.43.",
    )
    eff = df["kw/rt"].dropna()
    frac_ok = ((eff >= 0.45) & (eff <= 1.0)).mean()
    checks.append(c.result(frac_ok > 0.9, f"mean {eff.mean():.3f} kW/RT; {frac_ok*100:.1f}% within [0.45,1.0]"))

    # -- [G] Psychrometric: cooling-tower approach >= 0 (wet-bulb limit) ----
    c = Check(
        "Cooling-tower approach = leaving CW temp - ambient wet-bulb >= 0",
        "districtCoolingEngine condenser model; plantPhysics condenserCopBonus()/weatherCondenserOffset()",
        "Wet-bulb is the thermodynamic floor of evaporative cooling — ASHRAE Fundamentals Ch.1 (Psychrometrics); ASHRAE Systems & Equipment Ch.40 (Cooling Towers).",
    )
    wb_cols = find(cols, "WetBulb")
    ct_leave = [x for x in cols if x.startswith("CT_") and x.upper().endswith("CWST")]  # leaving tower (cold)
    ct_enter = [x for x in cols if x.startswith("CT_") and x.upper().endswith("CWRT")]  # entering tower (hot)
    if wb_cols and ct_leave:
        wb = df[wb_cols].replace(0, np.nan).mean(axis=1)
        leave = df[ct_leave].replace(0, np.nan).mean(axis=1)
        approach = (leave - wb)
        m = approach.notna() & wb.notna()
        frac_ok = (approach[m] >= -0.5).mean()             # -0.5 K allows sensor tolerance
        band_ok = ((approach[m] >= 0) & (approach[m] <= 8)).mean()
        rng_txt = ""
        if ct_enter:
            rng = (df[ct_enter].replace(0, np.nan).mean(axis=1) - leave)
            rng_txt = f"; tower range {rng[m].mean():.2f} K"
        ok = frac_ok > 0.99
        checks.append(c.result(ok, f"WB {wb[m].mean():.2f} -> leaving {leave[m].mean():.2f} = approach {approach[m].mean():.2f} K (p5 {approach[m].quantile(.05):.2f}); {frac_ok*100:.2f}% >= -0.5 K, {band_ok*100:.1f}% in [0,8]{rng_txt}"))
    else:
        checks.append(c.skip("wet-bulb or tower-temp columns not found"))

    # -- Formulas this dataset CANNOT validate (documented, not failed) -----
    for name, ref, why in [
        ("Pump/fan affinity laws  P ∝ N³, Q ∝ N",
         "plantPhysics.ts pumpPowerFromSpeed/pumpFlowFromSpeed; hvac-simulator fan cube law",
         "needs per-device VFD speed %, not present (only kW). Ref: ASHRAE Fundamentals Ch.21 (Fans/Pumps); Hydraulic Institute affinity laws."),
        ("Air-side sensible load  Q = CFM × 1.08 × dT",
         "hvac-simulator.js _simulateZones/_simulatePlant",
         "this is a water-side dataset (no airflow CFM). Ref: ASHRAE Fundamentals Ch.1 — 1.08 = 0.075 lb/ft³ × 0.24 BTU/lb·°F × 60."),
        ("Dew point (Magnus formula)",
         "districtCoolingEngine.ts dewPointC()",
         "no zone dry-bulb + RH pair in dataset (wet-bulb is validated separately in check [G]). Ref: Magnus-Tetens, Alduchov & Eskridge 1996; ASHRAE Fundamentals Ch.1 (Psychrometrics)."),
        ("CO₂ mass-balance ventilation model",
         "hvac-simulator.js _simulateZones CO2 block",
         "no zone CO₂ in dataset. Ref: ASHRAE 62.1 ventilation; mass-balance per ASTM D6245."),
    ]:
        checks.append(Check(name, ref, why).skip("not present in this dataset — see reference"))

    return checks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="?", default=DEFAULT_XLSX)
    ap.add_argument("--rows", type=int, default=None, help="limit rows for a quick run")
    args = ap.parse_args()

    path = Path(args.xlsx)
    if not path.exists():
        # try repo root relative to this file
        alt = Path(__file__).resolve().parents[3] / DEFAULT_XLSX
        if alt.exists():
            path = alt
        else:
            print(f"ERROR: cannot find {args.xlsx}", file=sys.stderr)
            sys.exit(2)

    print(f"Loading {path} ...")
    df = pd.read_excel(path, sheet_name=SHEET, header=0, nrows=args.rows)
    df.columns = [str(c).strip() for c in df.columns]
    print(f"Loaded {len(df):,} rows x {df.shape[1]} columns\n")

    checks = run_checks(df)

    print("=" * 78)
    print("PHYSICS FORMULA VALIDATION REPORT")
    print("=" * 78)
    failed = 0
    for ch in checks:
        if ch.skipped:
            tag = "SKIP"
        elif ch.passed:
            tag = "PASS"
        else:
            tag = "FAIL"
            failed += 1
        print(f"\n[{tag}] {ch.name}")
        print(f"       code : {ch.code_ref}")
        print(f"       ref  : {ch.reference}")
        print(f"       -> {ch.detail}")

    print("\n" + "=" * 78)
    validatable = [c for c in checks if not c.skipped]
    passed = sum(1 for c in validatable if c.passed)
    print(f"SUMMARY: {passed}/{len(validatable)} validatable checks passed; "
          f"{sum(1 for c in checks if c.skipped)} documented as not covered by this dataset.")
    print("=" * 78)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
