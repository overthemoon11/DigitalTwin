# T1 Chiller-Plant Digital-Twin API

Stateless HTTP scoring service over the calibrated physics engine. POST control
inputs, get computed efficiency + full plant state back. Every request runs in a
snapshot sandbox, so calls are **stateless, concurrent-safe and deterministic**
(same input → same output). Zero external deps (Node built-in `http`).

## Run

```bash
cd frontend
npm install        # once — installs tsx
npm run api        # listens on http://localhost:8787 (override with PORT=…)
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + model id |
| GET | `/schema` | manipulable inputs (bounds/step/default), calibrated envelope, output fields |
| POST | `/evaluate` | `{ controls, duty? }` → one evaluation |
| POST | `/evaluate/batch` | `{ cases: [{ controls, duty? }, …] }` → array (≤2000) |

### POST /evaluate

Request:
```json
{ "controls": { "ctrl-building-load": 3212.15, "ctrl-chws-sp": 7.5, "ctrl-cw-dt-sp": 4.43 } }
```
Only the controls you send are overridden; the rest stay at their row-1 defaults
(see `/schema`). Values are clamped to each control's range (no step snapping).

Response (abridged):
```json
{
  "inputs": { "...": 0 },
  "efficiency": { "kwPerRt": 0.608, "cop": 5.79 },
  "power": { "totalKw": 1952.6, "chillerKw": 1648, "chwpKw": 71.7, "cwpKw": 162, "ctKw": 70 },
  "thermal": { "buildingLoadRt": 3212.15, "deltaT": 6.68, "chws": 7.5, "chwr": 14.18,
               "cws": 29, "cwr": 33.4, "condFlowM3h": 2509, "towerApproach": 3.3, "wetBulb": 25.7 },
  "staging": { "chillers": 3, "chwp": 3, "cwp": 3, "ct": 4 },
  "calibration": { "status": "calibrated", "reasons": [] },
  "alarms": 0
}
```

## For ML / optimisation clients

- **Objective** = `efficiency.kwPerRt` (minimise). `power.totalKw` for absolute energy.
- **Always check `calibration.status`.** `"extrapolated"` means the inputs left the
  region covered by real data — the number is a physics extrapolation, low
  confidence. Penalise or reject those points so the optimiser can't chase
  fictitious savings outside the validated envelope (bounds in `/schema`).
- Use `/evaluate/batch` for grid sweeps / training-set generation.
- Determinism is guaranteed; no warm-up or ordering effects between calls.
