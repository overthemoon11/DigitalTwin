# Physics Formula Reference & Validation

This document catalogs every physics/engineering formula used in the DigitalTwin
simulator, its location in the code, the authoritative ("professional / expert")
source it comes from, and whether it can be validated against the real plant
measurement data in **`T1_MVrawDataR2_2025_12_new.xlsx`**.

A runnable validation harness lives at
[tests/validation/physics/validate_physics.py](../tests/validation/physics/validate_physics.py).
Run it with:

```bash
python tests/validation/physics/validate_physics.py
```

It loads the Excel, recomputes each formula from the **raw sensor columns**, and
compares against the plant's own **derived/metered columns** (`kw`, `rt`,
`deltaT`, `kw/rt`). Result on the December 2025 dataset (44,640 one-minute rows):
**7 / 7 validatable checks pass.**

---

## 0. Verdict — are all the formulas correct?

Short answer: **the core plant physics is confirmed correct; not every formula in
the project has been *proven* against data, and a few values are deliberate
modeling heuristics rather than physical laws.** Breakdown:

| Category | Status |
|---|---|
| **Core water-side thermodynamics** (7 formulas: `Q=ṁcₚΔT`, `1.163`, `3.517`, ΔT, plant-power balance, COP, kW/RT, wet-bulb approach) | ✅ **Confirmed correct** — reproduce the metered data to ≤0.3 % over 44,640 rows. |
| **Standard formulas not exercised by this dataset** (air-side `CFM×1.08×ΔT`, `HP×0.746`, affinity cube law, Magnus dew point, CO₂ mass-balance *form*) | 🟦 **Form & constants are textbook-correct** (ASHRAE/NIST), but **not numerically validated here** — this file has no airflow / RH / CO₂ / speed points. No reason to believe they are wrong; they are simply unconfirmed. |
| **Engineering heuristics / tuned factors** (part-load COP `0.8+0.2·sin(...)`, `weatherLoadFactor`/`humidityLoadFactor`/`chwsSetpointModifiers` linear sensitivities, CO₂ ad-hoc scaling, empirical ΔT clamps) | ⚠️ **Modeling approximations, not physical laws.** They are reasonable for a demonstrator twin but should not be read as validated physics. |

So: nothing was found to be *physically wrong*, the fundamental laws and constants
are right, but "all formulas validated" is **not** a claim this dataset supports —
see §3 (unvalidated) and the data-gap table in §3.7.

---

## 1. What the dataset contains

`T1_MVrawDataR2_2025_12` is one-minute M&V (Measurement & Verification) data for a
**5-chiller water-cooled district-cooling plant**, December 2025:

| Group | Columns | Units |
|---|---|---|
| Derived KPIs | `avg kw`, `kw`, `kw/rt`, `rt`, `deltaT` | kW, kW/RT, RT, °C |
| Chiller compressor power | `DPM-CH-{1..5}-CP-{1,2}-kW`, `HL_CH_*_Power` | kW |
| CHW / CW pump power | `DPM-CHWP-{1..6}-kW`, `DPM-CWP-{1..6}-kW`, `*_VSDkW` | kW |
| Cooling-tower fan power | `CT_0{1..5}_DPM_kW`, `CT_*_VSD_*_kW` | kW |
| Chilled-water flow | `CH-{1..5}-ChwFls`, `CHW-Riser-*-ChwFls`, `Header-hcwf` | L/s |
| Chilled-water temps | `CH-{1..5}-ChwSt` (supply), `ChwRt` (return), `Header-hcwst/hcwrt` | °C |
| Condenser-water temps/flow | `CH-{1..5}-CwSt/CwRt/CwFls`, `Header-hcwst` | °C / L/s |
| Cooling-tower temps | `CT_{1..5}{A,B}_CWST/CWRT` | °C |
| Wet-bulb | `WST_{1..5}_WetBulbTemp` | °C |

Because it is a **water-side electrical + thermal** dataset, it directly validates
the chiller-plant thermodynamics. It does **not** contain airflow (CFM), zone CO₂,
zone RH, or per-device VFD speed, so the air-side and psychrometric formulas are
documented with references but cannot be numerically checked here.

---

## 2. Validatable formulas (checked against the data)

### 2.1 Sensible heat / cooling load — `Q = ṁ · cₚ · ΔT`
- **Code:** [`coolingKwFromFlow()`](../frontend/src/services/plantPhysics.ts#L42) — `Q[kW] = Flow[m³/h] × ΔT[°C] × 1.163`
- **Constant `1.163`:** for water, `cₚ·ρ = 4.1868 kJ/(kg·K) × 1000 kg/m³ ÷ 3600 s/h = 1.163 kW per (m³/h·K)`. Equivalent to `4.1868 kW per (L/s·K)`.
- **Source:** ASHRAE *Handbook—Fundamentals* (2021), **Ch. 1, Eq. for sensible heat transfer** `q = ṁ cₚ Δt`. Specific heat/density of water: ASHRAE Fundamentals Ch. 33 (Physical Properties of Materials) / NIST.
- **Validation [C]:** `rt = Σ_chiller(flow × cₚ × ΔT) / 3.517` reproduces the metered `rt` column with **mean error 0.068 %, max 0.217 %**. ✅

### 2.2 Tons of refrigeration ↔ kW — `1 RT = 3.517 kW`
- **Code:** [`kwToRt()` / `rtToKw()`](../frontend/src/services/plantPhysics.ts#L47) — `RT_TO_KW = 3.517`
- **Exact value:** `1 ton = 12,000 BTU/h = 3.51685 kW`.
- **Source:** ASHRAE / AHRI definition of a ton of refrigeration (ASHRAE *Terminology*; AHRI Standard 550/590).
- **Validation:** embedded in check [C] (the `/3.517` step) and check [E]. ✅

### 2.3 Chilled-water ΔT — `ΔT = T_return − T_supply`
- **Code:** [`districtCoolingEngine.ts` secondary ΔT](../frontend/src/services/districtCoolingEngine.ts#L110); [`controlEngine.ts` `deltaT`](../frontend/src/services/controlEngine.ts#L306)
- **Source:** Counter-flow heat-exchanger temperature difference — ASHRAE *Fundamentals* Ch. 4 (Heat Transfer); ASHRAE *Systems & Equipment* Ch. 13 (Hydronic Heating & Cooling).
- **Validation [D]:** `deltaT` column = `Header-hcwrt − Header-hcwst` with **correlation 1.0000, mean error 0.000 %**. ✅

### 2.4 Plant power balance — `kW_total = Σ kW_devices`
- **Code:** total-plant-kW aggregation in [`controlEngine.ts`](../frontend/src/services/controlEngine.ts) feeding [`plantCop()`](../frontend/src/services/plantPhysics.ts#L112).
- **Source:** First law of thermodynamics / electrical power balance — ASHRAE *Fundamentals* Ch. 1; sub-metering follows **IPMVP Option B** (whole-facility / component metering).
- **Validation [B]:** metered `kw` = sum of all 27 device meters (chiller CP1+CP2 + CHWP + CWP + CT), **mean/p95/max error 0.000 %**. ✅

### 2.5 Plant efficiency & COP — `kW/RT` and `COP = Q_cool / P_elec`
- **Code:** [`plantEfficiencyKwPerRt()`](../frontend/src/services/plantPhysics.ts#L117), [`plantCop()`](../frontend/src/services/plantPhysics.ts#L112), `REF_CHILLER_COP = 6.0`.
- **Source:** Coefficient of Performance definition (dimensionless, `COP = useful cooling ÷ work input`) — ASHRAE *Fundamentals* Ch. 2; minimum-efficiency / rating context: ASHRAE **90.1**, AHRI **550/590**. `kW/ton` benchmark band: ASHRAE *Systems & Equipment* Ch. 43 (Centrifugal Chillers).
- **Validation [A], [E], [F]:**
  - [A] `kw/rt = kw ÷ rt` exactly (max error 0). ✅
  - [E] chiller COP = `rt·3.517 ÷ Σ chiller kW` = **6.90 mean** (100 % within physical band 2.5–9). ✅
  - [F] plant efficiency = **0.605 kW/RT mean** (100 % within 0.45–1.0, i.e. an efficient water-cooled plant). ✅

### 2.6 Psychrometrics — cooling-tower wet-bulb approach
- **Code:** condenser model in [`districtCoolingEngine.ts`](../frontend/src/services/districtCoolingEngine.ts); [`condenserCopBonus()` / `weatherCondenserOffset()`](../frontend/src/services/plantPhysics.ts#L104).
- **Principle:** the ambient **wet-bulb temperature is the thermodynamic floor of evaporative cooling** — water leaving a cooling tower approaches but can never drop below wet-bulb. `approach = T_leaving − T_wetbulb ≥ 0`; a well-designed tower runs a 3–5 °C approach. This is the physical basis the simulator relies on when it raises condenser-water temperature with hot/humid weather.
- **Source:** ASHRAE *Fundamentals* Ch. 1 (Psychrometrics — wet-bulb/adiabatic saturation); ASHRAE *Systems & Equipment* Ch. 40 (Cooling Towers).
- **Validation [G]:** using the per-tower sensors (`CT_*_CWST` leaving, `WST_*_WetBulbTemp`): mean wet-bulb 24.83 °C → tower-leaving 28.55 °C = **approach 3.72 °C** (p5 2.78), tower range 3.45 °C, and **100 % of rows respect the wet-bulb limit** (approach ≥ 0). ✅

### 2.7 Plate heat exchanger (ETS) — LMTD, effectiveness-NTU, approach
- **Code:** [`etsPhysics.js`](../frontend/src/services/etsPhysics.js) (`lmtdCounterflow`, `hxEffectiveness`, `ntuFromEffectivenessCounterflow`, `solveEtsThermoHydraulics`), used by [`etsHeatExchangeEngine.ts`](../frontend/src/services/etsHeatExchangeEngine.ts). Models the Marina Bay Sands ETS A-B03-01 (2 × 600 tR plate HX, primary from DCS, secondary to building).
- **Equations:**
  - Heat duty (both sides, steady state): `Q = ṁ_primary·cₚ·(T_dcr − T_dcs) = ṁ_secondary·cₚ·(T_chwr − T_chws)` (energy balance across the HX).
  - **LMTD** (counter-flow): `ΔT_lm = (ΔT₁ − ΔT₂) / ln(ΔT₁/ΔT₂)`, with `Q = U·A·ΔT_lm`.
  - **Effectiveness-NTU**: `ε = Q / Q_max`, `Q_max = C_min·(T_hot,in − T_cold,in)`; counter-flow `ε = [1 − e^(−NTU(1−Cr))] / [1 − Cr·e^(−NTU(1−Cr))]`, `NTU = UA/C_min`, `Cr = C_min/C_max`.
  - **Approach** (cold-end, the key ETS commissioning metric): `T_approach = T_chws − T_dcs` (secondary supply minus primary supply). The MBS screen shows 7.5 − 6.0 = **1.5 °C**.
- **Source:** ASHRAE *Fundamentals* Ch. 4 (Heat Transfer — LMTD & effectiveness-NTU); Kays & London, *Compact Heat Exchangers*; ASHRAE *Systems & Equipment* Ch. 13 (Hydronic) & Ch. 48 (district/ETS interfaces). The `ε`-NTU relations are the standard Kays & London counter-flow forms.
- **Validation:** the **energy-balance** form is the same `Q=ṁcₚΔT` confirmed in §2.1/§2.3 against the M&V data; LMTD/effectiveness-NTU are the recognized *design method* (not a free parameter to fit). The engine's baseline (466 RT → 1638 kW, approach 1.5 °C, primary flow ≈ 157 m³/h) reproduces the screenshot and is asserted by [tests/validation/ets/ets-physics.test.mjs](../tests/validation/ets/ets-physics.test.mjs).
- **Operator guide:** controllable parameters, causality tables, and schematic tag mapping — [ets-controls-and-physics.md](ets-controls-and-physics.md).

### 2.8 Chiller plant (L29 virtual simulator)
- **Code:** [`controlEngine.ts`](../frontend/src/services/controlEngine.ts), [`plantPhysics.ts`](../frontend/src/services/plantPhysics.ts), [`stagingController.ts`](../frontend/src/services/stagingController.ts).
- **Equations:** same water-side thermodynamics as §2.1–§2.6 (Q = ṁcₚΔT, COP, affinity laws, tower approach) plus staging/heuristic control in §4 of the operator guide.
- **Operator guide:** [chiller-plant-controls-and-physics.md](chiller-plant-controls-and-physics.md).

---

## 3. Formulas referenced but NOT validatable from this dataset

These are correct, sourced formulas; the December water-side dataset simply lacks
the required inputs (airflow, VFD speed %, zone air RH/CO₂). They are flagged
`SKIP` by the harness with their references.

### 3.1 Affinity laws — `P ∝ N³`, `Q ∝ N`
- **Code:** [`pumpPowerFromSpeed()` / `pumpFlowFromSpeed()`](../frontend/src/services/plantPhysics.ts#L63); fan cube-law in [`hvac-simulator.js`](../backend/src/simulator/hvac-simulator.js#L385).
- **Source:** Pump/fan **affinity (similarity) laws** — Hydraulic Institute ANSI/HI standards; ASHRAE *Fundamentals* Ch. 21 (Fans) & Ch. 22 (Pumps and Piping). Flow ∝ speed, head ∝ speed², power ∝ speed³.
- **Why not validated:** dataset has device **kW** but no per-device **VFD speed %** to form the ratio. (Could be validated if speed feedback were logged.)

### 3.2 Air-side sensible load — `Q[BTU/h] = CFM × 1.08 × ΔT`
- **Code:** [`hvac-simulator.js` zone & plant load](../backend/src/simulator/hvac-simulator.js#L307).
- **Constant `1.08`:** `0.075 lb/ft³ (air density) × 0.24 BTU/(lb·°F) (cₚ air) × 60 min/h = 1.08`.
- **Source:** ASHRAE *Fundamentals* Ch. 1 (the standard air-side sensible-heat equation) and Ch. 1 standard-air properties.
- **Why not validated:** this is a water-side plant dataset (no airflow / CFM points).

### 3.3 Fan/pump power from HP — `kW = HP × 0.746`
- **Code:** [`hvac-simulator.js`](../backend/src/simulator/hvac-simulator.js#L384) (`(fanMotorHp) * 0.746`).
- **Source:** unit conversion `1 hp = 0.7457 kW` (NIST).

### 3.4 Dew point (Magnus / Magnus–Tetens)
- **Code:** [`dewPointC()`](../frontend/src/services/districtCoolingEngine.ts#L79) with `a = 17.27`, `b = 237.7`.
- **Source:** Magnus–Tetens approximation; coefficients per **Alduchov & Eskridge (1996)**, *J. Applied Meteorology* and ASHRAE *Fundamentals* Ch. 1 (Psychrometrics).
- **Why not validated:** no zone dry-bulb + air-RH pair in dataset. (The plant **wet-bulb** sensors *are* validated psychrometrically — see §2.6 / check [G].)

### 3.5 CO₂ mass-balance ventilation model
- **Code:** [`hvac-simulator.js` CO₂ block](../backend/src/simulator/hvac-simulator.js#L322) (`CO2_GENERATION_RATE = 0.0084`, 30 % OA).
- **Source:** Steady-state contaminant mass balance — ASTM **D6245** (CO₂ to evaluate ventilation); ventilation rates per ASHRAE **62.1**. Per-person CO₂ generation ≈ 0.0084 cfm is the ASHRAE/ASTM textbook figure for a sedentary adult.
- **Why not validated:** no zone CO₂ / occupancy points in dataset.

### 3.6 First-order thermal lag — `x ← x + (target − x)(1 − e^(−Δt/τ))`
- **Code:** [`lag()`](../frontend/src/services/plantPhysics.ts#L123).
- **Source:** Standard first-order (RC) system step response — control-theory / ASHRAE *Fundamentals* Ch. 7 (Fundamentals of Control). This is a modeling smoother, not a measured quantity.

### 3.7 Missing data → formulas that stay unvalidated

The December file is a **water-side chiller-plant** export. Each row below names a
data point it does **not** contain, the formula(s) that therefore cannot be
checked, and the column(s) you would need to add to unblock validation.

| Missing data point | Not in this file | Formula(s) it blocks | Code | What to log to unblock |
|---|---|---|---|---|
| **Per-device VFD speed %** (pumps/fans) | only kW is logged, not speed | Affinity laws `P∝N³`, `Q∝N` (§3.1) | `pumpPowerFromSpeed`, `pumpFlowFromSpeed`, fan cube law | `CHWP_n_Speed%`, `CWP_n_Speed%`, `CT_n_FanSpeed%` alongside the existing `*_VSDkW` |
| **Air-side airflow (CFM)** | water-side only, no AHU/VAV flow | Air-side sensible load `Q=CFM×1.08×ΔT` (§3.2) | `hvac-simulator.js` zone/plant load | AHU supply-air flow (CFM) + supply/return air temps |
| **Motor nameplate HP** | not exported | `kW = HP×0.746` (§3.3) | `hvac-simulator.js` fan power | Equipment nameplate HP (static asset data, not telemetry) |
| **Zone dry-bulb + zone RH (pair)** | only tower wet-bulb present | Magnus dew point `dewPointC()` (§3.4) | `districtCoolingEngine.ts` | Zone/room dry-bulb temp **and** RH at the same timestamp |
| **Zone CO₂ + occupancy** | not in dataset | CO₂ mass-balance ventilation model (§3.5) | `hvac-simulator.js` CO₂ block | Zone CO₂ (ppm), occupancy count, and OA fraction |
| **Reference dew point / enthalpy** | not measured | independent psychrometric cross-checks | `districtCoolingEngine.ts` | a trusted psychrometric calc or measured dew point for spot-checks |

> Note: the **tower wet-bulb** (`WST_*_WetBulbTemp`) *is* present and is used by
> the validated approach check (§2.6 / [G]). Dew point still needs a dry-bulb + RH
> pair, which wet-bulb alone cannot provide.

---

## 4. How to extend the validation

1. **Add a check:** in `validate_physics.py`, append a `Check(...)` inside
   `run_checks()`, compute the formula from raw columns, compare to a metered
   column, and set a tolerance.
2. **Validate affinity laws:** if VFD speed-% feedback is exported alongside the
   kW columns, add a regression of `log(kW)` vs `log(speed)` and assert slope ≈ 3.
3. **Validate dew point directly:** add a dry-bulb + zone-RH pair and cross-check
   `dewPointC()` against a reference dew point. (Wet-bulb is already validated via
   the cooling-tower approach check [G] in §2.6.)
4. **Per-chiller energy balance:** compare each chiller's `flow×cₚ×ΔT/COP` against
   its measured `DPM-CH-n-CP-*` power for an independent COP check.

---

## 5. Reference list (professional / expert sources)

- **ASHRAE Handbook—Fundamentals (2021)** — Ch. 1 (Psychrometrics & sensible/latent
  heat equations), Ch. 2 (Thermodynamics & COP), Ch. 4 (Heat Transfer),
  Ch. 7 (Control), Ch. 21 (Fans), Ch. 22 (Pumps & Piping).
- **ASHRAE Handbook—HVAC Systems & Equipment** — Ch. 13 (Hydronic systems),
  Ch. 43 (Centrifugal chillers; kW/ton benchmarks).
- **ASHRAE Standard 90.1** — Energy Standard (chiller minimum efficiencies).
- **ASHRAE Standard 62.1** — Ventilation for Acceptable Indoor Air Quality.
- **AHRI Standard 550/590** — Performance Rating of Water-Chilling Packages
  (ton definition, COP/IPLV rating conditions).
- **ASTM D6245** — Using Indoor CO₂ Concentrations to Evaluate Ventilation.
- **Hydraulic Institute (ANSI/HI) standards** — pump affinity laws.
- **Alduchov, O.A. & Eskridge, R.E. (1996)** — *Improved Magnus form approximation
  of saturation vapor pressure*, J. Applied Meteorology 35(4) (dew-point coefficients).
- **IPMVP (EVO 10000-1)** — International Performance Measurement & Verification
  Protocol (sub-metering options).
- **NIST** — unit conversions (1 hp = 0.7457 kW; water properties).
