# Frontend redesign — workspace information architecture

The frontend was reorganised from a single screen with two permanent sidebars
into five product workspaces behind a compact navigation rail. The physics, the
MPC solver, the simulation and horizon APIs, the WebSocket telemetry, the
constraint validator, the BMS replay and the plant renderers are the existing
implementations; nothing in `backend/`, `shared/`, `calibration/` or
`mpc_program/` was touched.

## Why

The chiller route spent 300–660 px of every screen on navigation and
configuration an operator reads once per session, and rendered the digital twin
— the reason the product exists — into whatever width was left. Trajectories
were 240 × 34 px sparklines. Forty-odd constraint fields were read through a
300 px slot. Fixing that needed a different information architecture, not a
different colour palette.

## Two orthogonal axes

The old tab bar mixed "which plant am I looking at" with "what am I doing with
it", so `AHU` and `Constraints` appeared as alternatives to one another. They
are now separate controls in separate places:

| Axis | Control | Values |
| --- | --- | --- |
| System | Header, centre | Chiller Plant · District Cooling · AHU |
| Workspace | Left rail, 62 px | Plant · Simulation · Optimization · Analytics · Engineering |

District Cooling and AHU have a twin, controls, scenarios and KPIs but no
receding-horizon optimiser, so they expose three of the five workspaces rather
than a rail with two dead entries.

Routing is the URL hash — `#/chiller/analytics`, `#/chiller/engineering/solver`
— so back/forward and deep links work without adding a router dependency.

## Old location → new location

### Chiller plant

| Existing component / content | New location |
| --- | --- |
| `ChillerPlant2DView` / `ChillerPlant3DView` | **Plant** — hero card; renderer, zoom, pan, fit, focus, 3D, summary and pipe animation unchanged |
| Live KPI overlay (`scada-metrics`) | **Plant** — kept on the schematic, and promoted to the KPI strip above it |
| `MpcLeftSidebar` / Simulation Input | **Simulation** — configuration column (`SimulationInputPanel` reused verbatim) |
| `MpcLeftSidebar` / Optimal Control | **Plant** MPC card (compact) + **Optimization** before/after table (full, with provenance) |
| `MpcLeftSidebar` / Simulation Result | **Optimization** — impact cards, "Outcome over the run", caveats |
| `MpcLeftSidebar` / `MpcCycleStrip` | **Optimization** — "The receding-horizon cycle" |
| `MpcLeftSidebar` / `HorizonTrajectory` sparklines | **Analytics** and **Optimization** — full-size charts (260–330 px plots) |
| `ModelStatusPanel` | **Engineering → Model & calibration** |
| `MpcRightSidebar` / `ConstraintPanel` | **Engineering → Constraints** — same fields and setters, laid out as open cards in a column flow (`variant="workspace"`) |
| `MpcRightSidebar` / Run button | **Plant** MPC card, **Simulation** footer, **Optimization** run card, **Engineering → Constraints** header |
| `MpcStatusPanel` | Split: binding constraints + objective → **Optimization** "Why did the MPC choose this?"; statuses, violations, per-step diagnostics → **Engineering → Solver** |
| `ChillerScadaPanel` | **Engineering → Manual control** |
| `ChillerPointsList` | **Engineering → BMS points** — rebuilt as `BmsPointsTable`: real table, tag search, group filter, duty chips, editable points, dataset-replay comparison |
| `PlantAssetTree` | Assets side panel (header/page action) + Ctrl-K search |
| `ChillerKPIPanel` | **Analytics → Live equipment** |
| `AlertPanel` (chiller) | **Plant** — status card and the contextual equipment card |
| `CopilotChat` | Rebuilt as the **Plant AI Assistant** (`components/assistant/`) — header action, Ctrl-K, side panel, available from every workspace |
| Permanent left + right chiller sidebars | Removed |

### District Cooling (ETS) and AHU

| Existing component / content | New location |
| --- | --- |
| `EtsStationView` / `Ahu01StationView` | **Plant** — hero card |
| `HeatExchangeViewer` (district network) | **District Cooling → Plant**, "District network" sub-view with the existing building → ETS drill-down |
| `EtsControlPanel` / `AhuControlPanel` | **Controls** workspace |
| `DistrictCoolingControlPanel` | **District Cooling → Controls**, primary-loop card |
| `VirtualSimulatorPanel` (domino effect) | **Controls** workspace, cascade card |
| `EtsKPIPanel` / `AhuKPIPanel` / `KPIPanel` | **Plant** right column and **Engineering** |
| `AlertPanel` | **Plant** right column |
| `EtsAssetTree` / `AhuAssetTree` / `HeatExchangeAssetTree` | **Engineering** + Assets side panel |
| `SidebarModeRail` / `HeaderSidebarToggle` | Replaced by the workspace rail and its header toggle |

## Features recovered

Three real backend capabilities were wired into the store but unreachable from
the chiller UI. They now have a home:

- **Plant scenario library** (`plantConfig.scenarios`, `applyChillerScenario`) —
  **Simulation → Live twin scenarios**.
- **Fault injection** (`triggerPlantFault`: chiller trip, pump trip, tower fan
  fault, make-up failure) and **reset / advance** (`resetPlant`,
  `advancePlantSimulation`) — **Engineering → Manual control → Simulator
  operations**, behind a click-to-confirm.
- **District network view** — previously gated behind an `activeAppTab` value
  nothing set; now the "District network" sub-view of District Cooling → Plant.

## Data sources — unchanged

- Live plant state and baseline control: backend WebSocket via
  `usePlantTelemetry` / `useTwinStore`.
- Scenario configuration and recorded days: `/mpc/horizon/config`, `/bms/days`.
- Measured forecast preview: `/bms/day/:day` (new client function
  `fetchBmsDayRecords`; the route already existed).
- Run, arms, savings, provenance, caveats, solver diagnostics:
  `/mpc/horizon/compare`.
- Constraints and validation: the existing `mpcConstraints` slice and setters.
- Manual controls, duty rotation, scenarios, faults, reset: existing
  `/simulation/*` actions.

Nothing on any page is a fixture. Where a value cannot be derived from what the
server sent, the interface shows an em-dash and says why.

## Design system

`frontend/src/app/twin-ui.css` holds the tokens and every new component style;
`twin-legacy.css` normalises the reused legacy panels inside the new containers.
The token block re-points the pre-existing variables (`--accent`, `--primary`,
`--bg-dark`, …) so the ETS, AHU and SCADA styling inherits the new palette
without rewriting `App.css`.

- Ground `#f4f5f8`, surfaces white, lines `#e6e8ed`.
- One accent: blue `#4b7bf5`. Pastel gradients on the MPC opportunity KPI and
  the two optimisation impact cards, nowhere else.
- Cards 18–22 px radius, `0 4px 20px rgba(20,30,50,.04)` shadow.
- Chart convention, applied everywhere: baseline = neutral grey dashed,
  MPC = blue solid, disturbances = slate, physical channels = HVAC semantics
  (CHW `#44a7e8`, CHWR `#3569c8`, condenser `#32a76d`).
- Engineering units are never dropped: RT, kW, kW/RT, °C, psi, L/s, %, ms, K.

## Plant AI Assistant

`common/CopilotChat` was a 725-line component with its own inline `<style>`
block: uppercase section labels, boxed suggestions, emoji glyphs, indigo
gradients and a permanent `Try: "run peak summer scenario" · paste scenario
JSON · …` line under the input. It is now `components/assistant/`, built from
the same tokens and primitives as every workspace.

| Concern | Where it lives |
| --- | --- |
| Drawer, header, status, layout state | `AssistantPanel` (uses the shared `SidePanel`, which gained an optional `header` slot) |
| Welcome, suggestions, quick actions | `AssistantWelcome` |
| Thread, thinking state, error card | `Conversation` |
| Reply rendering | `MessageBody` |
| Input, examples, scenario JSON | `ChatComposer` |
| Per-system copy and command set | `assistantConfig.js` |
| Context chips, status derivation | `assistantState.js` |
| Styling | the `.tw-asst-*` block in `twin-ui.css` — no second theme |

Nothing about how a message is handled changed: every prompt still goes through
`sendCopilotMessage`, chiller intents are still parsed by `POST
/copilot/chiller`, ETS and AHU intents by their local engines, and the reply
still comes from the local LLM when it is up and the built-in plant analysis
when it is not.

What did change:

- **Two layouts.** Before the first message: welcome card, live suggestions,
  the five quick actions as a two-column grid. After: the thread takes the
  height and the actions collapse to one row of chips above the input.
- **Real model state.** The header read a hard-coded `Chiller Plant Chatbot ·
  Local LLM`. It now reads `/api/model/status` and the `model_status` socket
  frame — `Local model ready`, `Downloading model 42%`, `Local LLM offline`,
  `Thinking`, `Running scenario` — with a plain-language note saying what still
  works when the model is down, and a "Check again" action.
- **Replies are laid out, not dumped.** `MessageBody` recognises the shapes the
  existing formatters emit: an applied-action heading becomes a result banner,
  single labelled facts become key/value rows, a `>` line becomes a callout, and
  the `⚠️` parse-error line the store prepends becomes a warning callout with
  its text intact.
- **Chiller starters were dead code.** The old component computed
  `plantConfig.chatSuggestions` (plant alarms, kW/RT, COP) and then overwrote it
  with the building-twin endpoint, so a chiller alarm never reached the panel.
  Both sources are merged now, deduplicated against the quick-action commands,
  and "Suggested" shows only what is actually notable.
- **Progressive disclosure.** The permanent hint line is gone; the command
  examples and the scenario-JSON box (with the preset ids for that system) sit
  behind one "Examples & advanced" toggle. The capability is unchanged.
- **Icons.** The emoji (`☀️ 🔥 🏢 🔔 📉 💧 🌫️ 🌬️ 🌙 🔄`) were replaced with
  stroke icons added to `ui/TwIcons`, the shell's existing family.

QA: `tests/assistant-visual-qa.mjs` drives the welcome state, a suggested
action, a quick action, a typed question, a scenario, the scenario-JSON path,
clear, close/reopen and the busy state across all three systems, and asserts
zero drawer overflow and zero console errors at 1920×1080, 1440×900, 1366×768
and 420×820.

## Responsive behaviour

Verified at 1920×1080, 1600×900, 1440×900 and 1366×768 with no horizontal page
overflow on any workspace. At 1366×768 all four KPI cards stay on one line and
the twin keeps a 424 px floor; wide tables scroll inside their own container.
Under 1180 px the hero, simulation and optimisation grids collapse to one
column; collapsing the rail from the header swaps it for a horizontal tab bar.

## QA

`tests/worklio-visual-qa.mjs` drives the whole operator workflow end to end —
scenario → forecast → constraints → run MPC → result → analytics → solver → BMS
— captures every workspace at four viewports, and asserts zero horizontal
overflow and zero console errors.
