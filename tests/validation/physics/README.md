# Physics formula validation

Validates the project's deterministic physics formulas against real plant
M&V data (`T1_MVrawDataR2_2025_12_new.xlsx`, 1-minute data, Dec 2025).

```bash
# from repo root (uses pandas + openpyxl)
python tests/validation/physics/validate_physics.py

# quick run on first N rows
python tests/validation/physics/validate_physics.py --rows 2000

# explicit path
python tests/validation/physics/validate_physics.py /path/to/T1_MVrawDataR2_2025_12_new.xlsx
```

Exit code `0` = all validatable checks pass, `1` = a check failed.

Each check is mapped to the formula's code location and an authoritative
engineering reference. The full catalog (including formulas this dataset cannot
cover, with their sources) is in
[../../../docs/physics-formulas-reference.md](../../../docs/physics-formulas-reference.md).

Requires: `pip install pandas openpyxl`.
