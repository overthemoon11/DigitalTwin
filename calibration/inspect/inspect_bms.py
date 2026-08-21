"""BMS dataset inspection — produces the column mapping + quality report.

Reads sheet/heading metadata straight from the workbook (authoritative) and
uses the cached numeric extract for the statistics, so a 39 MB workbook does
not have to be parsed twice.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import openpyxl

REPO = Path(__file__).resolve().parents[2]
WORKBOOK = REPO / "data/raw/T1_MVrawDataR2_2025_12_completed.xlsx"
CACHE = REPO / "calibration/fixtures/.t1-month-cache.npz"

print("=" * 78)
print("BMS DATASET INSPECTION")
print("=" * 78)
print(f"workbook : {WORKBOOK.relative_to(REPO)}  ({WORKBOOK.stat().st_size/1e6:.1f} MB)")

wb = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)
print(f"sheets   : {wb.sheetnames}")
for name in wb.sheetnames:
    ws = wb[name]
    print(f"   - {name:34s} rows={ws.max_row}  cols={ws.max_column}")

ws = wb[wb.sheetnames[0]]
rows = ws.iter_rows(min_row=1, max_row=4, values_only=True)
header = next(rows)
units = next(rows)
sample = next(rows)
sample2 = next(rows)
wb.close()

print(f"\nheader row : {sum(h is not None for h in header)} named columns")
print(f"row 2      : {[u for u in units[:6]]}   <- units row?")
print(f"row 3      : {[s for s in sample[:6]]}")
print(f"row 4      : {[s for s in sample2[:6]]}")

# ---------------------------------------------------------------- statistics
z = np.load(CACHE, allow_pickle=True)
n = len(z["rt"])
print(f"\ncached numeric extract: {len(z.files)} channels x {n} rows")
print(f"  1-minute sampling over December 2025 => {n/60/24:.1f} days")

day = z["day"]
print(f"  day index range: {int(day.min())}..{int(day.max())}")
uniq, counts = np.unique(day, return_counts=True)
odd = [(int(d), int(c)) for d, c in zip(uniq, counts) if c != 1440]
print(f"  days without exactly 1440 samples: {odd if odd else 'none'}")


def stat(key, unit, note=""):
    if key not in z.files:
        print(f"  {key:22s} {'MISSING':>12s}")
        return
    a = np.asarray(z[key], dtype=float)
    finite = np.isfinite(a)
    nz = finite & (a != 0)
    miss = (~finite).sum()
    print(f"  {key:22s} {unit:6s} n={finite.sum():6d} miss={miss:5d} "
          f"zero={int((finite & (a == 0)).sum()):6d} "
          f"min={np.nanmin(a[finite]) if finite.any() else float('nan'):9.2f} "
          f"med={np.nanmedian(a[nz]) if nz.any() else float('nan'):9.2f} "
          f"max={np.nanmax(a[finite]) if finite.any() else float('nan'):10.2f} {note}")


print("\n--- plant-level ---")
stat("rt", "RT", "cooling load (M&V column)")
stat("kw", "kW", "total plant power")
stat("kwrt", "kW/RT", "efficiency")
stat("deltaT", "degC", "header delta-T")
stat("hcwf", "L/s", "header CHW flow")
stat("hcwst", "degC", "header CHW supply")
stat("hcwrt", "degC", "header CHW return")

print("\n--- wet bulb (5 sensors) ---")
for i in range(1, 6):
    stat(f"wst{i}", "degC")

print("\n--- chillers (per unit) ---")
for i in range(1, 6):
    for suffix, unit in (("cp1", "kW"), ("cp2", "kW"), ("chwst", "degC"),
                         ("chwrt", "degC"), ("cwst", "degC"), ("cwrt", "degC"),
                         ("chwfls", "L/s"), ("cwfls", "L/s")):
        stat(f"ch{i}_{suffix}", unit)
    print()

print("--- pumps ---")
for i in range(1, 7):
    stat(f"chwp{i}", "kW")
    stat(f"chwp{i}_vsd", "kW")
for i in range(1, 7):
    stat(f"cwp{i}", "kW")
    stat(f"cwp{i}_vsd", "kW")

print("\n--- cooling towers ---")
for i in range(1, 6):
    stat(f"ct{i}", "kW")
    stat(f"ct{i}_a", "kW")
    stat(f"ct{i}_b", "kW")

print("\n--- CHW risers ---")
for k in ("finger", "l13", "main", "t1u"):
    for suffix, unit in (("fls", "L/s"), ("st", "degC"), ("rt", "degC")):
        stat(f"riser_{k}_{suffix}", unit)

print("\n--- channels present but not listed above ---")
listed = set()
for i in range(1, 6):
    listed |= {f"ch{i}_{s}" for s in ("cp1", "cp2", "chwst", "chwrt", "cwst", "cwrt", "chwfls", "cwfls")}
    listed |= {f"ct{i}", f"ct{i}_a", f"ct{i}_b", f"wst{i}"}
for i in range(1, 7):
    listed |= {f"chwp{i}", f"chwp{i}_vsd", f"cwp{i}", f"cwp{i}_vsd"}
for k in ("finger", "l13", "main", "t1u"):
    listed |= {f"riser_{k}_{s}" for s in ("fls", "st", "rt")}
listed |= {"day", "rt", "kw", "kwrt", "deltaT", "hcwf", "hcwst", "hcwrt"}
extra = sorted(set(z.files) - listed)
print("  " + (", ".join(extra) if extra else "(none)"))
