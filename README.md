# Smart Building HVAC Digital Twin

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r150-black.svg)](https://threejs.org/)

A web-based digital twin demo for multi-floor office building HVAC operations, featuring:
- **JSON-based twin state** as the single source of truth
- **Deterministic HVAC simulator** with physics-based models
- **AI-powered Operations Copilot** for natural language building control
- **Interactive 3D visualisation** with React + Three.js
- **Comprehensive fault injection** for testing and diagnostics
- **Real-time controls and KPIs**

![HVAC Digital Twin Screenshot](docs/AppDemo.png)
## Features

### 🏢 Building Simulation
- Multi-zone thermal modelling
- VAV and AHU simulation
- Chiller, boiler, and pump dynamics
- CO2 and air quality modelling

### 🤖 Plant AI Assistant
- Free-form questions — no command vocabulary to learn
- Answers grounded in the Digital Twin, the MPC solver and a plant knowledge base
- Explains **why** the MPC chose a setting, from the solver's own diagnostics
- Says how far a reported saving can be trusted, and why not
- Runs what-if conditions on the twin instead of describing them
- Setpoint changes are proposed with a simulated preview and require confirmation
- Works with the language model offline — replies are composed from the verified data
- See [docs/plant-ai-assistant.md](docs/plant-ai-assistant.md)

### ⚡ Fault Injection
- 20+ fault scenarios for testing:
  - Plant failures (chiller, boiler, pumps)
  - AHU failures (fan, coil freeze, economizer)
  - VAV failures (stuck damper, reheat)
  - Sensor failures (drift, complete failure)
  - Communication and power failures

### 📊 KPIs & Monitoring
- Energy consumption and cost
- Comfort compliance
- Air quality (CO2) tracking
- Equipment efficiency

## Architecture

```mermaid
graph TD
    subgraph Frontend["Web Frontend (React)"]
        3D["3D View<br/>Three.js"]
        AT["Asset Tree"]
        CP["Controls / KPIs / Chat<br/>Copilot Panel"]
        MSB["Model Status Banner"]
    end

    subgraph Backend["Backend (Node.js / Express)"]
        TM["Twin Manager<br/>JSON I/O"]
        SIM["HVAC<br/>Simulator"]
        FLS["Foundry Local<br/>SDK Service"]
    end

    subgraph Data["twin/*.json<br/>(State files)"]
    end

    subgraph FL["Foundry Local<br/>(on-device inference)"]
    end

    Frontend -- "REST + WebSocket" --> Backend
    TM --> Data
    FLS --> FL
```

## Quick Start

### Prerequisites
- Node.js 20+ ([download](https://nodejs.org))
- Foundry Local (optional, for AI copilot features): [install instructions](https://foundrylocal.ai)
- On Windows (PowerShell), ensure the current user can execute `C:\Program Files\nodejs\npm.ps1` without a digital signature (see tip below).
> [!TIP]
> If you get an error like the following:
> 
> npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded. The file C:\Program Files\nodejs\npm.ps1 is not digitally
> signed. You cannot run this script on the current system. For more information about running scripts and setting
> execution policy, see about_Execution_Policies at https:/go.microsoft.com/fwlink/?LinkID=135170.
>
> Then please set
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

### Prerequisites for the MPC / calibration pipeline

The chiller-plant MPC ships with real BMS data and fitted models. Running the
app needs only Node; re-exporting the data or re-fitting the models needs Python
3.11+ with `numpy scipy matplotlib openpyxl`.

### Option 0: Root task runner (all commands in one place)

```powershell
npm run install:all           # install backend + frontend dependencies

npm run backend               # http://localhost:3007
npm run frontend              # http://localhost:3006

npm run test:all              # typecheck + backend tests + golden + frontend build
npm test                      # backend test suite only
npm run test:golden           # twin output vs the characterization golden
npm run typecheck             # tsc --noEmit, backend and frontend

npm run data:export:refresh   # re-read the BMS workbook -> data/processed artifacts
npm run calibrate             # re-fit every model from the exported artifacts
npm run benchmark:selftest    # the synthetic MPC benchmark's own checks
```

See [`docs/mpc-digital-twin-integration.md`](docs/mpc-digital-twin-integration.md)
for what each of those does, what is calibrated against real data and what is a
physics default.

### Option A: Manual Startup (Recommended)

Open **two separate terminals** and run:

**Terminal 1 - Backend:**
```powershell
cd c:\path\to\DigitalTwin\backend
npm install
node src/index.js
```

**Terminal 2 - Frontend:**
```powershell
cd c:\path\to\DigitalTwin\frontend
npm install
npm run dev
```

Then open http://localhost:3006 in your browser.

### Option B: Using Startup Scripts

From the project root directory:

**PowerShell:**
```powershell
cd c:\path\to\DigitalTwin
.\start-demo.ps1
```

**Command Prompt:**
```cmd
cd c:\path\to\DigitalTwin
start-demo.bat
```

The scripts will:
1. Check Node.js installation
2. Install dependencies (if needed)
3. Reset twin state to baseline
4. Open two terminal windows (backend + frontend)
5. Open browser automatically

**Script Options (PowerShell):**
```powershell
.\start-demo.ps1 -SkipInstall      # Skip dependency check
.\start-demo.ps1 -BackendOnly      # Start only backend
.\start-demo.ps1 -FrontendOnly     # Start only frontend
.\start-demo.ps1 -NoBrowser        # Don't open browser
```

### Option C: With Foundry Local (AI Features)

The backend uses the `foundry-local-sdk` npm package to manage AI models on-device. No separate CLI setup is required.

1. Install the SDK (already included in backend dependencies):
   ```powershell
   cd backend
   # Windows
   npm install --foreground-scripts --winml foundry-local-sdk
   # macOS / Linux
   npm install --foreground-scripts foundry-local-sdk
   ```
2. Start the backend as above. The SDK will automatically download and load the `phi-3.5-mini` model on first run.
3. A **model status banner** in the UI shows download progress, loading state, and readiness.

To use a different model, set the `FOUNDRY_MODEL` environment variable before starting:
```powershell
$env:FOUNDRY_MODEL = 'qwen2.5-0.5b'
node src/index.js
```

## Features

### 3D Building Visualisation
- Interactive 3D view of zones, AHUs, chiller, and boiler
- Colour-coded zones by temperature and CO₂ levels
- Click to select assets and view details
- Real-time updates as simulation runs

### Control Panel
- Adjust zone temperature setpoints
- Modify AHU supply air temperature
- Activate demand response levels
- Run simulation steps manually

### KPIs Dashboard
- **Energy**: Total power, daily energy, cost estimate
- **Comfort**: Temperature deviation, compliance %
- **IAQ**: CO₂ levels, ventilation adequacy
- **Operational**: Filter life, chiller efficiency

### Alert Management
- Automatic fault detection (CO₂, temperature, filter loading)
- Acknowledge and track alerts
- Recommended actions for each alert

### Plant AI Assistant
- Ask anything in your own words; the backend routes it by intent, not by phrase
- Every plant figure comes from a tool call — nothing is recalled or estimated
- Each answer is labelled with its provenance: live BMS, Digital Twin, MPC
  prediction, what-if simulation, or general HVAC knowledge
- Degrades to verified-data answers when no language model is reachable

## API Reference

### Twin State

```
GET  /api/twin              - Get complete twin state
GET  /api/twin/assets       - Get all assets
GET  /api/twin/telemetry    - Get telemetry (filter by ?assetId=&pointType=)
GET  /api/twin/controls     - Get controls
PUT  /api/twin/controls/:id - Update control value
GET  /api/twin/kpis         - Get KPIs
GET  /api/twin/alerts       - Get alerts (?active=true for active only)
PUT  /api/twin/alerts/:id/acknowledge - Acknowledge alert
```

### Simulation

```
POST /api/twin/simulate     - Run simulation step
POST /api/twin/fault        - Apply fault scenario
POST /api/twin/reset        - Reset to baseline state
GET  /api/twin/explain/:id  - Get explanation for KPI or alert
```

### Chiller-plant MPC

```
GET  /api/mpc/config              - design constraints + violation labels
GET  /api/mpc/baseline            - the live plant as disturbances + control state
POST /api/mpc/optimize            - steady-state optimum at ONE operating point
POST /api/mpc/simulate            - score a single candidate control state
POST /api/mpc/restore             - commit a control state to the twin

GET  /api/mpc/horizon/config      - solver defaults, run modes, recorded days
POST /api/mpc/horizon/compare     - baseline vs MPC over IDENTICAL conditions
GET  /api/mpc/model-status        - per-model calibration status + missing signals
GET  /api/mpc/twin-validation     - twin vs measured plant, channel by channel
```

### Real BMS dataset

```
GET  /api/bms/dataset-summary     - provenance, timebase, gaps, RT re-derivation
GET  /api/bms/days                - recorded days with load range + quality flags
GET  /api/bms/day/:day            - every measured 15-minute bucket of one day
```

### Plant AI Assistant

```
POST /api/assistant/chat               - One turn, one JSON reply
POST /api/assistant/chat/stream        - The same turn as Server-Sent Events
GET  /api/assistant/status             - Health of the model AND of the tools
GET  /api/assistant/tools              - The tool allowlist + knowledge sources
POST /api/assistant/action/confirm     - Apply a change a previous turn proposed
POST /api/assistant/conversation/clear - Forget a conversation
```

### Copilot (legacy — ETS and AHU panels)

```
POST /api/copilot/chat      - Send message to the building-twin copilot
POST /api/copilot/chiller   - Chiller command parsing (now also an assistant tool)
```

### Model Status

```
GET  /api/model/status      - Get AI model download/loading status
```

Model status updates are also pushed via WebSocket (`type: 'model_status'`).

## Reset Twin State

To reset the digital twin to its baseline state:

**Via API:**
```bash
curl -X POST http://localhost:3007/api/twin/reset
```

**Via UI:**
Click "Reset to Baseline" button in the Controls panel.

## Running Tests

### Full Test Suite

Run all tests from the project root:

**PowerShell:**
```powershell
cd tests
.\run-all-tests.ps1
.\run-all-tests.ps1 -Verbose        # Show detailed output
.\run-all-tests.ps1 -BackendOnly    # Run only backend tests
.\run-all-tests.ps1 -ValidationOnly # Run only validation tests
```

**Command Prompt:**
```cmd
cd tests
run-all-tests.bat
```

### Backend Simulator Tests

```bash
cd backend
npm test
```

Tests cover 5 impact scenarios:
1. Raise cooling setpoint → energy reduction
2. Increase occupancy → CO₂ rise
3. Filter loading → increased fan power
4. Demand response → energy/comfort tradeoff
5. Stuck VAV damper → zone anomaly + alert

### Test Categories

| Category | Description | Location |
|----------|-------------|----------|
| **API Tests** | REST endpoint validation | `tests/backend/api.test.js` |
| **WebSocket Tests** | Real-time connectivity | `tests/backend/websocket.test.js` |
| **Simulator Tests** | HVAC physics validation | `backend/tests/simulator.test.js` |
| **E2E Tests** | End-to-end workflows | `tests/integration/e2e.test.js` |
| **Data Flow Tests** | Data consistency checks | `tests/integration/data-flow.test.js` |
| **Schema Tests** | JSON schema validation | `tests/validation/twin-schema.test.js` |
| **Health Checks** | System availability | `tests/validation/health-check.test.js` |

### Prerequisites for Integration Tests

- Backend server must be running on port 3007
- Frontend server must be running on port 3006 (for full E2E)

Start servers first:
```powershell
.\start-demo.ps1
```
Then run tests in another terminal.

## Project Structure

```
digitaltwin/
├── package.json            # root task runner (see Option 0 above)
├── start-demo.ps1 / .bat   # startup scripts
├── shared/types/           # contracts BOTH sides import
│   ├── plant.ts            #   the twin's state
│   ├── mpc.ts              #   steady-state MPC: controls, constraints, results
│   ├── horizon.ts          #   time-domain MPC: forecasts, loop state, runs
│   └── bms.ts              #   canonical shape of real measured history
├── frontend/               # React web application
│   ├── src/
│   │   ├── features/mpc/   #   the MPC simulator UI (both sidebars)
│   │   ├── components/     #   SCADA views, asset trees, panels
│   │   ├── api/            #   thin typed clients, no domain logic
│   │   ├── store/          #   Zustand: UI state + request orchestration
│   │   └── app/App.jsx     #   layout
│   └── package.json
├── backend/                # Node.js API server (runs .ts through tsx)
│   ├── src/
│   │   ├── digital-twin/   #   THE calibrated plant model + its fits
│   │   ├── mpc/            #   simulator adapter, constraints, optimisers
│   │   │   └── horizon/    #     receding-horizon controller + closed loop
│   │   ├── control/        #   baseline (incumbent) controllers
│   │   ├── data/           #   BMS artifact loader + preprocessing
│   │   ├── evaluation/     #   twin-vs-plant validation
│   │   ├── api/            #   routes + controllers (no domain logic)
│   │   └── index.js        #   Express + WebSocket server
│   ├── tests/              # backend test suite
│   └── package.json
├── data/
│   ├── raw/                # the BMS workbook (source of truth, never edited)
│   ├── scripts/            # bms_columns.py + export_bms_records.py
│   └── processed/          # versioned JSON artifacts the backend reads
├── calibration/scripts/    # model-fitting scripts -> generated .ts artifacts
├── mpc_program/            # the synthetic Python MPC benchmark (Mode 1)
├── tests/                  # cross-cutting suites
│   ├── characterization/   #   golden file: proves the twin's output is unchanged
│   ├── backend/            #   API & WebSocket tests
│   ├── integration/        #   E2E & data flow
│   └── validation/         #   schema & health checks
├── twin/                   # legacy twin state (schema, baseline, live)
├── assets/                 # 3D models (GLB files)
└── docs/                   # documentation
```

## Building Model

The digital twin models a 3-floor office building:

- **Floor 1**: Lobby + Mechanical Room
- **Floor 2**: Open Office + 2 Conference Rooms
- **Floor 3**: Open Office + Executive Suite

**HVAC System:**
- 2 Air Handling Units (AHU-1 serves F1-2, AHU-2 serves F3)
- 6 VAV boxes (one per zone)
- 200-ton Chiller
- 2M BTU Boiler
- CHW and HW pumps

## Simulator Physics

### Zone Thermal Model (1R1C)
```
dT/dt = (Q_internal - Q_cooling) / C_thermal
```

### CO₂ Mass Balance
```
dCO₂/dt = (G_people × occupancy - V_oa × ΔCO₂) / Volume
```

### Fan Power (Affinity Laws)
```
P = P_rated × (speed / 100)³ × filter_factor
```

### Chiller COP
```
COP = COP_design × f(part_load) × f(condenser_temp)
```

## Licence

MIT
