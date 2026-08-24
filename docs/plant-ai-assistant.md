# Plant AI Assistant

The chat panel is an **agent over the plant services**, not a command parser. An
operator asks a question in their own words; the backend classifies it, picks
tools from an allowlist, reads the Digital Twin / MPC / knowledge base, and
answers from what it read.

The two properties everything below is arranged to protect:

1. **No exact phrases.** "why is energy high", "why power consumption so high",
   "what is causing my plant to use more power" and "why is kW/RT bad" reach the
   same tools. Nothing is matched against a fixed string.
2. **No invented plant numbers.** Every figure in an answer comes from a tool
   result. When the data is not available the assistant says so.

---

## 1. Request path

```
                       operator message
                              │
              POST /api/assistant/chat[/stream]
                              │
                    ┌─────────▼──────────┐
                    │  assistant/index   │
                    └─────────┬──────────┘
                              │
   1  classify        intent.ts      weighted signals + conversation topics
   2  plan            planner.ts     rules first; the LLM may improve on them
   3  run tools       tools/         allowlist + argument validation
   4  select context  context.ts     prune to the topics actually asked about
   5  compose         composer.ts    a grounded answer built only from step 3
   6  generate        prompt.ts      the model rewrites the draft (if a model is up)
   7  audit           guard.ts       every plant figure must trace to step 3
                              │
                              ▼
      { message, sourceType, toolsUsed, blocks, actions,
        proposedActions, warnings, answeredBy, unverifiedFigures }
```

**The answer exists before the model is called.** Step 5 produces a complete,
correct reply from the tool results; step 6 rewrites it as better prose. That
ordering is what makes the assistant work with the language model offline, makes
the tests deterministic, and makes a hallucinated figure detectable — there is
always a verified version of the same answer to compare against.

### Files

| Path | Role |
|------|------|
| `backend/src/assistant/index.ts` | Public barrel. The API layer imports only from here. |
| `backend/src/assistant/intent.ts` | Free-form intent + topic + entity extraction. |
| `backend/src/assistant/planner.ts` | Rule plan, LLM plan, latency budget. |
| `backend/src/assistant/tools/registry.ts` | The allowlist and the argument boundary. |
| `backend/src/assistant/tools/plantTools.ts` | Twin state, efficiency, equipment, alarms, trends, constraints. |
| `backend/src/assistant/tools/mpcTools.ts` | Run, compare, explain, and assess trust in an MPC result. |
| `backend/src/assistant/tools/simulationTools.ts` | What-ifs, time advance, scenarios, control proposals. |
| `backend/src/assistant/tools/knowledgeTools.ts` | Knowledge-base search. |
| `backend/src/assistant/knowledge/` | Retrieval layer: glossary + project docs + the source interface. |
| `backend/src/assistant/context.ts` | Context selection — what the model is allowed to see. |
| `backend/src/assistant/composer.ts` | The grounded answer for every intent. |
| `backend/src/assistant/prompt.ts` | System prompt, facts block, grounded draft. |
| `backend/src/assistant/guard.ts` | Numeric audit and unbacked-saving detection. |
| `backend/src/assistant/conversation.ts` | Transcript, topics, pending proposals. |
| `backend/src/assistant/mpcMemory.ts` | The last real MPC runs, so they can be explained. |
| `backend/src/assistant/trends.ts` | Rolling short-window plant history. |
| `backend/src/assistant/providers/index.ts` | `AIProvider` interface and the shipped adapter. |

Dependency direction is one-way:

```
API  →  Assistant  →  { MPC, Digital Twin, BMS data, knowledge }
```

The only thing the plant side knows about the assistant is `mpcMemory`, a leaf
module the two MPC entry points write their runs into. It imports nothing back.

---

## 2. Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/assistant/chat` | One turn, one JSON reply. |
| POST | `/api/assistant/chat/stream` | The same turn as Server-Sent Events. |
| GET | `/api/assistant/status` | Assistant health — model **and** tools, separately. |
| GET | `/api/assistant/tools` | The tool allowlist and the knowledge sources. |
| POST | `/api/assistant/action/confirm` | Apply a change a previous turn proposed. |
| POST | `/api/assistant/conversation/clear` | Forget a conversation. |

### Request

```json
{
  "message": "why did MPC increase CHWST?",
  "conversationId": "conv-…",
  "context": { "page": "optimization", "selectedEquipment": "ch-3" }
}
```

Only four context keys are accepted, each a short string. The frontend cannot
push arbitrary application state into a prompt.

### Response

```json
{
  "conversationId": "conv-…",
  "message": "## Why the MPC chose this …",
  "sourceType": "MPC_PREDICTION",
  "sources": [{ "tool": "getMPCExplanationContext", "sourceType": "MPC_PREDICTION" }],
  "toolsUsed": ["getMPCExplanationContext"],
  "toolErrors": [],
  "blocks": [{ "kind": "comparison", "label": "Total plant power", "before": "1,806 kW", "after": "1,736 kW", "delta": "3.9%" }],
  "actions": [{ "id": "mpc-trust", "label": "Is this result trustworthy?", "prompt": "…" }],
  "proposedActions": [],
  "warnings": [],
  "intent": "MPC_EXPLAIN",
  "answeredBy": "llm",
  "unverifiedFigures": [],
  "latencyMs": 7725
}
```

### Streaming frames

```
event: stage   data: {"tool":"runMPC","label":"Running MPC"}
event: delta   data: {"text":"…"}
event: final   data: { …the full response above… }
event: error   data: {"error":"…"}
```

A client that ignores `delta` and waits for `final` gets exactly the
non-streaming response.

---

## 3. Source types

Every answer is labelled, and the labels are never blurred.

| Source | Meaning |
|--------|---------|
| `LIVE_BMS` | Measured from field devices. |
| `HISTORICAL_BMS` | Measured T1 trend history. |
| `DIGITAL_TWIN` | Calculated by the calibrated plant model. Not a measurement. |
| `MPC_PREDICTION` | What the optimiser expects. Not yet observed. |
| `WHAT_IF_SIMULATION` | A hypothetical condition scored on the twin. |
| `KNOWLEDGE_BASE` | Glossary or project documentation. |
| `GENERAL_KNOWLEDGE` | Textbook HVAC. Says nothing about this plant. |
| `MIXED` | More than one kind contributed. |

The panel renders this as a badge on every answer.

---

## 4. Tools

`GET /api/assistant/tools` returns the live manifest. Kinds:

- **read** — never mutates.
- **simulate** — may move the *twin* (a scenario, a time advance); never a real plant.
- **write** — builds a preview only. Execution requires `action/confirm`.

| Tool | Kind | Source |
|------|------|--------|
| `getPlantState` | read | DIGITAL_TWIN |
| `getPlantSummary` | read | DIGITAL_TWIN |
| `getPlantEfficiency` | read | DIGITAL_TWIN |
| `getEquipmentStatus` | read | DIGITAL_TWIN |
| `getChillerStatus` | read | DIGITAL_TWIN |
| `getPumpStatus` | read | DIGITAL_TWIN |
| `getCoolingTowerStatus` | read | DIGITAL_TWIN |
| `getActiveAlarms` | read | DIGITAL_TWIN |
| `getPlantTrends` | read | DIGITAL_TWIN / HISTORICAL_BMS |
| `getCurrentConstraints` | read | DIGITAL_TWIN |
| `getPlantControls` | read | DIGITAL_TWIN |
| `getMPCResult` | read | MPC_PREDICTION |
| `getMPCDiagnostics` | read | MPC_PREDICTION |
| `getMPCExplanationContext` | read | MPC_PREDICTION |
| `getModelCalibrationStatus` | read | DIGITAL_TWIN |
| `runMPC` | simulate | MPC_PREDICTION |
| `compareBaselineVsMPC` | simulate | MPC_PREDICTION |
| `runWhatIfScenario` | simulate | WHAT_IF_SIMULATION |
| `runSimulation` | simulate | DIGITAL_TWIN |
| `listScenarios` | read | DIGITAL_TWIN |
| `applyScenario` | simulate | WHAT_IF_SIMULATION |
| `applyCustomScenario` | simulate | WHAT_IF_SIMULATION |
| `proposeControlChange` | write | DIGITAL_TWIN |
| `searchKnowledgeBase` | read | KNOWLEDGE_BASE |

Every tool declares a typed argument spec. `tools/schema.ts` coerces the string
forms a language model tends to emit, clamps numbers to their declared range and
reports the clamp, refuses unknown values for an enum, and records an unknown
argument rather than dropping it silently. An unknown tool name returns an error
string; there is no path from generated text to an arbitrary function call.

### `getPlantState`

The most important tool — the shape everything else reasons over:

```json
{
  "timestamp": "…", "dataSource": "physics-engine",
  "buildingLoadRt": 3094, "wetBulbC": 24.8, "ambientTempC": 31, "humidityRh": 59,
  "chwstC": 7.58, "chwrtC": 14.44, "chwDeltaTC": 6.86, "chwFlowLs": 379,
  "dpPsi": 15, "dpKpa": 103.4,
  "cwsC": 28.47, "cwrC": 32.73, "towerApproachC": 3.8, "ctFanSpeedPct": 71,
  "activeChillers": ["CH-3","CH-4","CH-5"], "runningChillers": 3, "chillerLoadPct": 82.5,
  "chillerKw": 1539.2, "chwpKw": 59.5, "cwpKw": 156.2, "towerKw": 60,
  "totalPlantKw": 1815, "plantKwPerRt": 0.587, "plantCop": 6,
  "alarms": [],
  "constraintStatus": { "feasible": true, "violations": [], "maxChwrC": 16 },
  "calibration": { "status": "extrapolated", "reasons": ["…"] }
}
```

### `getMPCExplanationContext`

Explains the **last real run** — including one started from the Optimization
workspace, because both MPC entry points record into `mpcMemory`. If no run
exists it solves one and says so in `basis`. It returns baseline vs MPC controls,
conditions, the power split, CHWR against its limit, binding constraints,
objective components, unmet cooling, solver status, calibration warnings, and a
`trust` assessment.

`trust.verdict` is one of `verified` / `qualified` / `questionable`, with the
reasons named. A run is `questionable` when the arms delivered different cooling,
when the solver fell back, when steps were infeasible, or when the optimum still
violates something. Those caveats are never suppressed — they appear in the
answer and in `warnings`.

---

## 5. Safety model

**Read-only by default.** No chat message can move a setpoint. A control
request — or "apply the MPC result", which proposes the whole optimised control
vector at once — produces a `ProposedAction` carrying:

- the current and proposed value of each control,
- an **expected effect simulated on the twin** (not described by the model),
- warnings — calibration envelope, new alarms, power increases.

The operator confirms, and only then does `POST /api/assistant/action/confirm`
execute it. Proposals are single-use and expire after 15 minutes; a replayed
confirmation is refused. Nothing in the assistant writes to a real BMS.

Two `simulate` tools do move the shared twin — `runSimulation` (advance virtual
time) and `applyScenario` (load a preset). Both are pre-existing capabilities of
the old chat, both say `committedToTwin: true` in their result, and both are
reported in the answer.

### Preventing invented numbers

Four independent mechanisms:

1. The model is never asked for a plant number. Facts are injected, and the
   system prompt states that a figure absent from FACTS may not be used.
2. It receives a **grounded draft** rather than raw JSON, so it has nothing to
   derive and therefore nothing to guess.
3. `guard.ts` audits the generated text: every figure carrying a plant unit must
   appear in the corpus the model was given (tool payloads, knowledge excerpts,
   the operator's own message, the recent transcript, and the verified draft).
   Hedged textbook figures — "typically 2% per Kelvin" — are excluded by design.
   Anything left over is returned in `unverifiedFigures`, and two or more raises
   a visible caveat.
4. A quantified **saving or cost** claim whose number is not in the corpus is
   refused outright and the verified answer is published instead. Currency
   figures are always refused: nothing in this stack produces money.

---

## 6. Knowledge base

`searchKnowledgeBase(query)` ranks a lexical (BM25-ish) index with synonym
folding, a title-subject bonus and per-document weighting. Two sources ship:

- **HVAC glossary** (`knowledge/hvacGlossary.ts`) — ~30 curated entries written
  to be quoted as finished answers. This is the assistant's HVAC competence with
  no model and no corpus.
- **Project documentation** (`knowledge/docsSource.ts`) — every `docs/*.md`,
  split at heading boundaries.

### Adding a source

Implement `KnowledgeSource` and register it:

```ts
registerKnowledgeSource({
  name: 'Chiller manuals',
  kind: 'manuals',
  available: () => existsSync(dir),
  documents: () => [...],   // { id, title, source, category, text, tags, weight?, ref? }
});
```

Nothing else moves. For text files there is a zero-code path: **drop `.md` or
`.txt` files into `docs/knowledge/`** and they are indexed automatically. That is
where equipment manuals, control sequences of operation, commissioning reports
and site SOPs belong.

Swapping the ranker for embeddings is a change to one function
(`searchKnowledgeBase`) behind the same interface.

---

## 7. AI provider

```ts
interface AIProvider {
  readonly name: string;
  status(): AIProviderStatus;
  complete(messages, options): Promise<string | null>;
  stream?(messages, onDelta, options): Promise<string | null>;
}
```

The shipped adapter wraps `services/llm-service.js`, which already routes between
an OpenAI-compatible endpoint and Foundry Local. Replace it with
`setAiProvider(myProvider)`; no call site changes. The tests install a scripted
provider to exercise the LLM path without a model.

### Status semantics

The panel used to print "Local model ready" unconditionally. Two things can be up
or down independently and are now reported separately:

| health | Meaning |
|--------|---------|
| `ready` | Tools respond and a model is up. |
| `connecting` | Tools respond; the model is still starting or downloading. |
| `degraded` | Tools respond; **no model**. Answers are composed from verified data. |
| `unavailable` | The plant tools are not responding. This is the only outage. |

`openai-compatible-service.js` now refuses to report `ready` when the configured
model is not served. If the endpoint offers exactly one model under a different
id, it uses that one and says so in the status message; if it offers several, it
reports an error naming them.

---

## 8. Configuration

`backend/.env`:

```bash
LLM_PROVIDER=openai              # or "foundry"
OPENAI_BASE_URL=http://…/v1
OPENAI_MODEL=…                   # must match GET /v1/models
# OPENAI_API_KEY=…
# OPENAI_CHAT_TIMEOUT_MS=120000
```

No configuration is required for the assistant itself. With no model reachable
it runs in `degraded` health and answers every question from the tools.

Run:

```bash
npm run backend      # :3007
npm run frontend     # :3006, proxies /api and /ws
```

---

## 9. Tests

```bash
cd backend && npm test          # 223 tests, of which 75 cover the assistant
```

`backend/tests/assistant.test.js` covers free-form routing (five wordings of one
question reaching the same tools), concept vs measurement, MPC run / explain /
trust, what-ifs with an absolute value, a relative value and no value at all,
write safety (propose → confirm → replay refused), the tool allowlist and
argument validation, missing data and tool failure, conversation follow-ups,
hallucination control in four forms, the provider abstraction with the model
absent / empty / throwing, streaming stages, the knowledge base, and the
acceptance questions from the specification, and the apply-MPC confirmation.

Everything runs against the deterministic composer or a scripted provider, so no
test needs a GPU or a VPN.

---

## 10. Known limits

- **Trend history is in-memory and short.** `trends.ts` holds ~30 minutes,
  sampled from the 2 s plant tick, and starts empty on every backend restart.
  Real history is the BMS artifact, reached with
  `getPlantTrends({ source: 'bms' })`.
- **`compareBaselineVsMPC` is slow** — roughly a second per 15-minute step, so
  the chat default is 6 steps (1.5 h). Longer runs belong in the Optimization
  workspace.
- **Retrieval is lexical, not semantic.** A question sharing no vocabulary with
  the corpus will not retrieve, and correctly returns nothing rather than a weak
  guess.
- **One shared twin.** A scenario or time advance requested in the chat moves the
  plant every other operator is viewing. That was true before this work and is
  now stated in the reply.
- **The assistant is chiller-plant only.** The ETS and AHU panels still answer
  from their local engines through the previous `sendCopilotMessage` path.
