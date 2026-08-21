# Chiller-Plant MPC — Simulator & Optimizer

Python implementation of the chiller-plant Model Predictive Control approach in:

> Khunmaturod, Lekawat, Tongdee, Khampanchai (AltoTech Global),
> *"Model Predictive Control for chiller plant energy efficiency: Leveraging
> multi-horizon forecasting and machine learning-based system models"*,
> Journal of Building Engineering 119 (2026) 115345. (`MPC.pdf` in this folder)

The package contains **both sides of the problem**:

* a ground-truth **plant simulator** calibrated to the paper's case study — a
  5000 RT plant (4×1000 RT + 2×500 RT centrifugal chillers), tropical weather,
  retail-mall load profile, chilled-water-loop thermal inertia; and
* the **MPC optimizer** of the paper — multi-horizon load forecasting, CHR
  (chilled-water-return) prediction models with future cooling capacity as an
  explicit input, Gordon-Ng chiller power models, and a receding-horizon
  MINLP over binary chiller ON/OFF decisions every 15 minutes —
  benchmarked against the plant's incumbent rule-based operation.

## Quick start

```
pip install numpy scipy matplotlib
python run_mpc.py --selftest      # internal consistency checks (~30 s)
python run_mpc.py                 # full pipeline (~1 min): 28 train + 6 test days
python run_mpc.py --quick         # reduced run
```

Outputs land in `./results`: `summary.json`, `metrics.csv` (per day),
`model_metrics.csv` (per model, paper Tables 3–5 analogues), per-day
time-series CSVs, and figures `fig_day/schedules/efficiency/forecasts/savings.png`.

## Results (this repo's default seeds)

| metric | baseline | MPC | delta |
|---|---|---|---|
| chiller energy, 6 unseen days | 21,571 kWh/day | 20,046 kWh/day | **−7.1 %** |
| total plant energy (incl. pumps) | 23,815 kWh/day | 21,787 kWh/day | **−8.5 %** |
| CHR comfort violations | 0 min | **0 min** | — |
| CHR mean in comfort window | 56.4 °F | 61.0 °F | floats near limit |
| chiller-hours | 322 h | 236 h | −27 % |

Extended 12-day validation: **7.3 % chiller / 8.8 % total savings, zero
violations**, daily savings 5.4–9.6 % (σ 1.2 %). The paper reports 11.07 %
(13.1 % weather-normalized over 43 days) against a manual baseline; this
simulator's baseline is a reasonably disciplined rule-based sequencer, so the
margin here is more conservative. The savings come from the same three
mechanisms the paper identifies: **efficient-unit selection**, **CHR floating**
(operating at 60–62 °F instead of 54–59 °F while honoring the 63 °F limit),
and **proactive staging** (optimal morning start, midday shedding, early
evening shutdown).

## How it maps to the paper

| Paper | Code |
|---|---|
| §3.1 load forecast, 24 hourly models, Fig. 2 | `forecasting.LoadForecaster` (Ridge per horizon; forecast weather + on-site history + temporal features; valid-sample gaps handled) |
| §3.2 CHR forecast, 12 polynomial models, Eqs. 1–2 | `forecasting.CHRPredictor` (degree-2 polynomial Ridge per 15-min horizon; future capacity Q_total(k) and its recent rates are explicit inputs; time-series CV for λ) |
| §3.3 Gordon-Ng chiller model, Eq. 3 | `gordon_ng.py` (Kelvin internally; identified per chiller from noisy logs via bounded nonlinear least squares) |
| §3.4–3.6 MINLP, Eqs. 21a–21p | `mpc.MPCController` (objective 21a; thermal balance + saturation 21b/21d; demand slack 21c; CHR model constraint 21e; CHR max/avg/rate 21f–21h; min ON/OFF 21i–21j; N-bounds & schedule 21k–21l; fixed setpoints & flow 21m–21n) |
| §3.7 BONMIN, multi-method fallback, 15-min receding horizon | vectorized beam/DP search over combination trajectories (see below); penalties-as-slacks mean a least-violation schedule always exists; exception fallback holds the previous action |
| §4 plant: 4×1000+2×500 RT, 44 °F CHS, condenser wet-bulb reset, 05:30–22:00 | `config.PlantConfig`, `plant.PlantSimulator`, `weather.World` |
| §5.5 baseline: fixed mix (CH3/CH4/CH7), stop first chiller at 20:00 regardless | `baseline.BaselineController` |
| §5.6 extended validation | `run_mpc.py --test-days 12` |

### The solver

The paper's decision space is binary chiller ON/OFF over a 3-h horizon
(12 × 15-min steps), solved by BONMIN. Here the same MINLP is solved by a
**vectorized beam search with dominance pruning** (a DP over combination
trajectories): each step expands every admissible combination transition
(≤ 2 switches among dwell-eligible chillers, schedule bounds), merges nodes
that agree on (combination, dwell signature, predicted CHR, recent capacity),
and keeps the best `beam_width` (default 1500) by cost. The per-step coupling
between delivered capacity and predicted CHR (Eqs. 6 + 12) is solved in
closed form, because each fitted CHR model is compiled to a quadratic
`T = A + b·q + qᵀCq` in the recent-capacity vector `q`. A full solve takes
~80 ms; 96 solves/day.

### Deliberate deviations from the paper (each one flagged in code)

1. **Solver**: beam/DP instead of BONMIN — no external MINLP dependency,
   equivalent role, always returns a least-penalty schedule (their fallback
   strategy's purpose).
2. **CHR model features**: added sin/cos of target hour. The paper's feature
   list has no temporal features; without them the model cannot distinguish a
   14:00 capacity deficit from an 08:00 surplus in an occupancy-driven
   building (their load forecaster does use temporal features).
3. **Load anchor**: the near-term forecast anchor is a loop-inertia load
   observer `Q_load ≈ Q_delivered + C_loop·dCHR/dt`, not raw delivered
   cooling — otherwise the MPC's own over/under-delivery feeds back into its
   demand target (verified failure mode: an overcooling spiral).
4. **Robustness margins**: the CHR limit is tightened per horizon step by the
   CHR model's own validated test RMSE (`max(0.7 °F, 1σ_j)`), and the comfort
   deadline is pulled 30 min early. The paper reports operating ≥ 0.5 °F
   under the limit; these margins are how this implementation achieves zero
   violations on unseen days.
5. **Switching cost** (`alpha_switch`): small kW-equivalent per start/stop to
   prevent gratuitous cycling that min-ON/OFF times alone permit.
6. **Flow model**: Eq. 11 generalized to capacity-proportional base flows so
   mixed 1000/500 RT combinations make hydraulic sense.
7. **Pump energy** is simulated and reported (`kwh_total`) but excluded from
   the MPC objective by default (`include_aux_in_objective=False`), matching
   Eq. 21a exactly.

### Training data (the cold-start question)

Models are fitted **only on noisy measured records** from 28 days of
simulated historical operation under the incumbent controller with realistic
day-to-day variation, including commissioning-style trials (capacity
reductions with CHR floats, delayed/deep morning pulldowns). Those trials
matter: without them the CHR models never see the high-CHR / fast-pulldown
regimes the MPC later exploits, and constraint violations follow (verified
during development). A real deployment needs the same coverage — either from
historical operational diversity or a short commissioning period.

## Layout

```
chiller_mpc/
  config.py       plant / MPC / simulation parameters (all tuning knobs)
  gordon_ng.py    Gordon-Ng power model: truth curves, identification, metrics
  weather.py      tropical weather, building load truth, forecast provider
  plant.py        ground-truth simulator (CHR loop dynamics, saturation, noise)
  baseline.py     incumbent rule-based controller (+ jittered history variants)
  forecasting.py  Ridge/TS-CV, 24 load models, 12 CHR models + compilation
  mpc.py          the MINLP solver / receding-horizon controller
  simulate.py     history generation, training, closed-loop evaluation
  report.py       figures + CSV/JSON exports
run_mpc.py        CLI entry point (--selftest, --quick, --train-days, ...)
```

Units: °F for temperatures (Kelvin inside Gordon-Ng), RT for cooling,
kW electric for power, 15-min steps.

## Key tuning knobs (`config.py`)

| knob | default | effect |
|---|---|---|
| `MPCConfig.alpha_demand` | 0.8 kW/RT | price of unmet forecast load; higher = more conservative capacity |
| `MPCConfig.chr_guard_f` / `chr_sigma_k` | 0.7 °F / 1.0 | comfort robustness vs. savings trade-off |
| `MPCConfig.alpha_switch` | 150 | cycling suppression |
| `MPCConfig.beam_width` | 1500 | solve quality vs. time |
| `PlantConfig.loop_rt_step_per_f` | 1400 | loop thermal inertia (RT·step/°F) |
| `SimConfig.train_days` / `test_days` | 28 / 6 | data volume / validation length |

## Using it with a real plant

The controller side (`forecasting.py`, `mpc.py`) only consumes measurement
records (dicts with CHR/CHS/ambient/capacity/power/status) and a weather
forecast provider. To retarget:
replace `World` with a weather/forecast adapter, feed historian records to
`train_models`, fit `PlantConfig` to the real plant (capacities, CHS setpoint,
design ΔT, loop inertia from a shutdown transient), and wire
`MPCController.act` outputs to BMS start/stop commands. The plant simulator
then becomes an offline what-if/regression harness.

## Limitations

* Chiller ON/OFF staging only — CHS/condenser setpoints are fixed
  (Eq. 21m); the paper lists continuous setpoint optimization as future work
  (the Johnson Controls reference material shows what that extension adds).
* No minimum-load/surge modeling, no time-of-use tariffs or demand-response
  (a demand-charge cap exists, Eq. 19).
* The plant is synthetic; absolute kWh are calibrated to be plausible for the
  paper's plant, but savings percentages depend on how wasteful the incumbent
  baseline is — treat them as mechanism validation, not a site guarantee.
