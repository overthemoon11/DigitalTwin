# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Chiller-plant MPC optimisation simulator.** The plant page is now an
  optimisation tool rather than a manual control panel: left sidebar = what
  happened (Simulation Input, Optimal Control before→after, Simulation Result
  before→after), centre = the unchanged digital twin, right = what the plant is
  allowed to do (Constraint Input + MPC execution).
  - `services/chiller/mpc/` — `ChillerPlantSimulator` (a typed adapter over the
    calibrated engine, not a second physics model), `ConstraintValidator`,
    `CandidateGenerator`, `ObjectiveFunction` and an `MpcOptimizer` interface
    whose shipped strategy is a constrained coordinate search. Every candidate
    is simulated then validated; infeasible candidates score `Infinity` and can
    never win regardless of predicted power. Swapping the optimiser for a
    nonlinear/SciPy/CasADi solver needs no UI change.
  - Objective is Total Plant kW = chiller + CHWP + CWP + tower, with no target
    efficiency baked in.
  - Six manipulated variables: CHWST-SP, DP-SP, chiller staging, CHWP / CWP /
    CT fan speed. Building load and wet bulb are disturbances.
  - Baseline is captured at RUN and never mutated, so before/after is honest;
    the optimum is committed to the live engine so the schematic and KPI tiles
    move through the normal path.
- **Tower fan ↔ condenser temperature coupling for optimisation.** The engine's
  static mode fixes CWS at `max(setpoint, wet bulb + approach)`, so commanding a
  fan speed alone would cut tower kW for free. The MPC simulator inverts the
  fitted `CT_FAN_SPEED_COEFF` law to get the approach a commanded fan speed can
  hold, making the tower↔chiller trade-off real.
- `evaluatePlant` now accepts a `staging` override and reports a `hydraulic`
  block (header flows, VSD speeds, measured DP, per-chiller load %) — the
  quantities constraint checks need.

### Changed

- **Chiller twin recalibrated to the whole Dec-2025 trend.** Every reference
  level was previously anchored to dataset row 1 (Dec-1 00:00). That row is an
  outlier — its CHWP and CT meters read ~22% above the month norm — and the twin
  carried that bias into every other minute. Month-wide plant-kW replay improves
  from **3.86% MAE / +3.45% bias to 0.97% MAE / +0.02% bias** across 43,026
  minutes. The trade is a looser M&V window (0.28% → 0.95% on those 133 rows),
  which is the intended direction: that window is 2.2 hours of the outlier day.
- **Staging thresholds taken from observed behaviour.** Three chillers carry T1
  to its monthly peak; the previous 90%-of-nameplate rule (1125 RT/unit) started
  a fourth several hundred RT early. Now 1184 RT/unit, measured.
- **Condenser lift de-confounded**, 5.23 → 4.52 %/°C. Load and CWS correlate at
  r = 0.67, so the joint fit attributes load to CWS; the shipped value is the
  pooled within-load-bin slope. Still above the literature range, so it stays
  flagged for a CWS step test before closed-loop use.
- **Tower fan law rewritten** to key off approach (CWS − wet-bulb) instead of
  the CWS setpoint alone, which conflated "the operator asked for colder water"
  with "the weather got cooler". Tower kW MAE 29% → 8%.
- **Reference weather corrected**: default RH 65 → 59.37 %, so the engine's
  Stull estimate lands on the plant's median measured wet-bulb (24.8 °C rather
  than 25.7 °C). The tower model depends on this.
- API `/health` and `/schema` now report the calibration basis, the blocked-CV
  score, and the known limits of the fit.

### Added

- `frontend/scripts/calibrateFromDataset.py` — staged grey-box calibration:
  exclusion masks, an identifiability audit that refuses to fit parameters the
  data cannot determine, a changepoint scan, per-component fits, and blocked
  cross-validation. Emits the generated `t1MonthCalibration.ts`, `t1MvRows.ts`
  and `t1Row86.ts`.
- `frontend/scripts/validateMonth.ts` — replays all 43,026 usable minutes
  through the real engine (not a re-implementation) and fails above a 1.5% gate.
- Replay payloads can now pin measured **CWS, wet-bulb and staging counts**.
  Staging is a BMS decision, so on a historical replay it is an input;
  `--stage-model` scores the twin's own staging heuristics instead.

### Notes

- Machine-learning surrogates were benchmarked and rejected: on identical
  blocked folds, gradient-boosted trees scored 1.18–1.20% against 0.83% for
  physics-structured least squares, and got the CWS counterfactual sign
  asymmetric. See §8 of `docs/chiller-plant-controls-and-physics.md`.
- The twin no longer reproduces dataset row 1 exactly at boot; it now boots at
  the month's median operating point. `validateRow86.ts`'s boot guard was
  updated to match.

## [2.0.0] - 2026-03-12

### Added

- **Foundry Local SDK integration**: replaced raw HTTP calls with the `foundry-local-sdk` npm package for on-device AI model lifecycle management.
- **Model status banner**: new `ModelStatusBanner` component in the frontend that shows download progress, loading state, and error notifications.
- **Model status API**: `GET /api/model/status` endpoint and WebSocket `model_status` messages for real-time model state updates.
- **Foundry Local service**: new `backend/src/services/foundry-local-service.js` encapsulating model discovery, download, loading, chat completion (synchronous and streaming), and graceful shutdown.
- **AGENTS.md**: Copilot agent configuration document for GitHub Copilot and compatible coding agents.
- **Foundry Local SKILL.md**: comprehensive SDK reference at `.github/skills/foundry-local/SKILL.md`.
- **CHANGELOG.md**: this file.

### Changed

- **ES Modules**: all backend code converted from CommonJS (`require`/`module.exports`) to ES Modules (`import`/`export`). Backend `package.json` now includes `"type": "module"`.
- **Node.js 20+**: minimum Node.js version raised from 18 to 20.
- **Copilot service**: `copilot-service.js` now uses the SDK's `chatCompletion()` instead of raw `fetch()`. Fallback responses are model-status-aware.
- **Backend entry point**: `index.js` initialises the Foundry Local SDK on startup, broadcasts model status via WebSocket, and performs graceful shutdown on `SIGINT`.
- **Zustand store**: `useTwinStore.js` tracks `modelStatus` and handles `model_status` WebSocket messages.
- **CONTRIBUTING.md**: updated prerequisites (Node.js 20+, SDK installation), coding standards (ES Modules, SDK usage), and file structure.
- **README.md**: updated architecture diagram, prerequisites, Foundry Local setup instructions, API reference, and project structure.
- **blogpost.md**: updated Foundry Local integration section to describe SDK usage instead of raw HTTP calls.
- **Documentation**: all Markdown files converted to British English spelling and grammar; em dashes removed throughout.

### Removed

- `FOUNDRY_LOCAL_URL` environment variable and raw HTTP connector. The SDK manages the connection internally.

## [1.0.0] - 2026-01-26

### Added

- Initial release with React + Three.js frontend, Node.js/Express backend, and HVAC simulator.
- JSON-based digital twin state (schema, baseline, live state).
- AI copilot with Foundry Local (raw HTTP chat completions).
- 3D building visualisation with GLB model and procedural fallback.
- Fault injection (20+ scenarios) and alert management.
- KPI dashboard (energy, comfort, IAQ, operational).
- WebSocket real-time updates.
- Comprehensive test suite (API, WebSocket, E2E, schema validation, health checks).
- PowerShell and batch startup scripts.
- Blender MCP asset pipeline documentation.
