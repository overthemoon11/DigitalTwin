/**
 * Tool planning.
 *
 * Two planners, same output shape. The rule planner maps a classification onto
 * tool calls and always produces something; the LLM planner is asked to improve
 * on it and is ignored whenever it produces nonsense.
 *
 * That ordering — rules first, model second, rules again as the floor — is
 * deliberate. The assistant has to keep working with the model offline, because
 * the model lives on a VPN and the plant does not. It also makes the whole
 * routing layer testable without a GPU.
 */
import type { AIProvider } from './providers/index';
import type { AssistantPageContext } from './types';
import type { Classification, Topic } from './intent';
import { getTool, toolCatalogue, toolNames } from './tools/registry';
import { isNum } from './util';

export interface PlannedCall {
  tool: string;
  args: Record<string, unknown>;
  /** Shown in the streaming status line: "Reading plant state…". */
  label: string;
  /** Where the call came from, for the trace. */
  origin: 'rules' | 'llm';
}

export interface Plan {
  calls: PlannedCall[];
  /** Free-text note the answer layer may use, e.g. why a tool was skipped. */
  notes: string[];
}

const LABELS: Record<string, string> = {
  getPlantState: 'Reading plant state',
  getPlantSummary: 'Reading plant status',
  getPlantEfficiency: 'Checking plant efficiency',
  getEquipmentStatus: 'Checking equipment',
  getChillerStatus: 'Checking chillers',
  getPumpStatus: 'Checking pumps',
  getCoolingTowerStatus: 'Checking cooling towers',
  getActiveAlarms: 'Checking alarms',
  getPlantTrends: 'Reading recent trend',
  getCurrentConstraints: 'Reading constraints',
  getPlantControls: 'Reading control setpoints',
  getMPCResult: 'Reading the last MPC run',
  getMPCDiagnostics: 'Reading solver diagnostics',
  getMPCExplanationContext: 'Reading MPC diagnostics',
  getModelCalibrationStatus: 'Checking model calibration',
  runMPC: 'Running MPC',
  compareBaselineVsMPC: 'Comparing baseline against MPC',
  runWhatIfScenario: 'Running the what-if on the twin',
  runSimulation: 'Advancing the simulation',
  listScenarios: 'Listing scenarios',
  applyScenario: 'Applying the scenario',
  proposeControlChange: 'Preparing the setpoint change',
  searchKnowledgeBase: 'Searching the knowledge base',
};

function call(tool: string, args: Record<string, unknown> = {}, origin: 'rules' | 'llm' = 'rules'): PlannedCall {
  return { tool, args, label: LABELS[tool] ?? `Running ${tool}`, origin };
}

/* ───────────────────────────────────────────── topic → trend channels ──── */

const TOPIC_CHANNELS: Partial<Record<Topic, string[]>> = {
  chwst: ['chwstC', 'chwrtC', 'buildingLoadRt'],
  chwrt: ['chwrtC', 'chwstC', 'chwDeltaT', 'buildingLoadRt'],
  deltaT: ['chwDeltaT', 'chwstC', 'chwrtC', 'buildingLoadRt'],
  dp: ['dpPsi', 'chwpKw', 'chwDeltaT'],
  chwp: ['chwpKw', 'dpPsi', 'chwDeltaT'],
  cwp: ['cwpKw', 'cwsC', 'cwrC'],
  tower: ['ctFanPct', 'towerKw', 'cwsC', 'wetBulbC'],
  condenser: ['cwsC', 'cwrC', 'wetBulbC', 'chillerKw'],
  chiller: ['chillerKw', 'runningChillers', 'buildingLoadRt'],
  staging: ['runningChillers', 'buildingLoadRt', 'chillerKw'],
  weather: ['wetBulbC', 'ambientTempC', 'cwsC'],
  load: ['buildingLoadRt', 'chwDeltaT', 'totalPlantKw'],
  energy: ['totalPlantKw', 'chillerKw', 'chwpKw', 'cwpKw', 'towerKw'],
  efficiency: ['plantKwPerRt', 'cop', 'totalPlantKw', 'buildingLoadRt'],
};

function channelsFor(topics: Topic[]): string[] {
  const out = new Set<string>();
  for (const t of topics) for (const c of TOPIC_CHANNELS[t] ?? []) out.add(c);
  if (!out.size) ['totalPlantKw', 'plantKwPerRt', 'buildingLoadRt', 'chwrtC'].forEach((c) => out.add(c));
  return [...out].slice(0, 6);
}

/* ─────────────────────────────────────────── entities → what-if args ──── */

/**
 * Turn "what happens if wet bulb becomes 29 °C" into
 * `{ wetBulbC: 29 }` — the tool argument, not a sentence about it.
 *
 * Ambiguity is resolved by unit first and by the topics present second, which
 * is how "8 °C" becomes CHWST in a CHWST question and wet bulb in a weather
 * one. A quantity that cannot be assigned is left out rather than guessed.
 */
export function whatIfArgsFrom(text: string, c: Classification): Record<string, number> {
  const args: Record<string, number> = {};
  const t = text.toLowerCase();
  const has = (topic: Topic) => c.topics.includes(topic);
  const mentions = (re: RegExp) => re.test(t);

  for (const q of c.entities.quantities) {
    switch (q.unit) {
      case 'RT':
        args.buildingLoadRt = q.value;
        break;
      case 'kPa':
        args.dpKpa = q.value;
        break;
      case 'psi':
        args.dpPsi = q.value;
        break;
      case 'C':
      case 'K': {
        if (mentions(/wet\s*-?\s*bulb|wetbulb|\bwb\b/)) args.wetBulbC = q.value;
        else if (mentions(/chwr|return/) || (has('chwrt') && !has('chwst'))) args.chwrtC = q.value;
        else if (mentions(/chws|chwst|supply/) || has('chwst')) args.chwstC = q.value;
        else if (mentions(/\bcws\b|condenser\s*water/) || has('condenser')) args.cwsC = q.value;
        else if (mentions(/outdoor|ambient|dry\s*-?\s*bulb|\boat\b|outside/)) args.ambientTempC = q.value;
        else if (has('weather')) args.wetBulbC = q.value;
        else args.chwstC = q.value;
        break;
      }
      case '%': {
        if (mentions(/humidity|\brh\b/)) args.humidityRh = q.value;
        else if (mentions(/tower|\bct\b|fan/) || has('tower')) args.ctFanPct = q.value;
        else if (mentions(/\bcwp\b|condenser\s*(?:water\s*)?pump/) || has('cwp')) args.cwpSpeedPct = q.value;
        else if (mentions(/\bchwp\b|chilled\s*water\s*pump|pump/) || has('chwp')) args.chwpSpeedPct = q.value;
        break;
      }
      default:
        break;
    }
  }

  /*
   * A bare number with no unit.
   *
   * "What happens if wet bulb becomes 30" is the natural way to ask, and it
   * carries no unit at all. The variable named in the sentence decides which
   * argument it is, and the plausible range for that variable decides whether
   * the number can be it — a "30" next to "wet bulb" is degrees; a "30" that
   * would be an impossible load is left alone rather than forced.
   */
  const BARE: Array<[RegExp, string, [number, number]]> = [
    [/wet\s*-?\s*bulb|wetbulb/, 'wetBulbC', [10, 35]],
    [/outdoor|ambient|dry\s*-?\s*bulb|\boat\b|outside\s+temp/, 'ambientTempC', [15, 48]],
    [/chws|chwst|supply\s*temp/, 'chwstC', [4, 14]],
    [/chwr|chwrt|return\s*temp/, 'chwrtC', [8, 20]],
    [/\bcws\b|condenser\s*water/, 'cwsC', [20, 40]],
    [/\bload\b|tonnage|demand/, 'buildingLoadRt', [200, 8000]],
    [/\bdp\b|differential\s*pressure/, 'dpPsi', [5, 40]],
    [/humidity|\brh\b/, 'humidityRh', [20, 100]],
  ];
  if (!Object.keys(args).length) {
    // Only numbers introduced as a target — "becomes 30", "to 30", "at 30",
    // "reaches 30" — so a "3" in "3 chillers" is not read as a temperature.
    const targets = [...t.matchAll(/\b(?:becomes?|reaches?|hits?|goes?\s+to|rises?\s+to|drops?\s+to|to|at|of|=)\s*(-?\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n));
    for (const [pattern, key, [lo, hi]] of BARE) {
      if (!pattern.test(t) || key in args) continue;
      const value = targets.find((n) => n >= lo && n <= hi);
      if (value !== undefined) args[key] = value;
    }
  }

  /*
   * A hypothetical with a direction and no value.
   *
   * The step sizes are chosen to be large enough to show a response and small
   * enough to stay near the operating point — the tool reports what it actually
   * simulated, so the operator is never left guessing what "increases" meant.
   */
  if (!Object.keys(args).length) {
    const up = /\b(increase|increases|increasing|rise|rises|rising|higher|goes?\s+up|warmer|hotter|more)\b/.test(t);
    const down = /\b(decrease|decreases|decreasing|drop|drops|falling|falls|lower|reduce|reduces|reducing|goes?\s+down|cooler|colder|less)\b/.test(t);
    const sign = up ? 1 : down ? -1 : 0;
    if (sign) {
      if (mentions(/wet\s*-?\s*bulb|wetbulb|humid/)) args.wetBulbDeltaC = sign * 3;
      else if (mentions(/outdoor|ambient|dry\s*-?\s*bulb|outside|weather/)) args.ambientTempDeltaC = sign * 3;
      else if (mentions(/\bload\b|demand|tonnage/)) args.buildingLoadDeltaRt = sign * 400;
      else if (mentions(/chws|chwst|supply\s*temp/)) args.chwstDeltaC = sign * 0.5;
      else if (mentions(/\bdp\b|differential/)) args.dpDeltaPsi = sign * 3;
    }
  }

  // "3 chillers", "run four machines" — a bare count next to a chiller word.
  const staging = t.match(/\b(\d)\s*(?:chillers?|machines?|units?)\b/);
  if (staging) args.runningChillers = Number(staging[1]);

  // A bare number with a load word and no unit, e.g. "simulate 3500 load".
  if (args.buildingLoadRt === undefined) {
    const bare = t.match(/\b(?:load|tonnage|demand)\D{0,12}?(\d{3,4})\b|\b(\d{3,4})\s*(?:rt\b|tons?\b|load\b)/);
    const value = Number(bare?.[1] ?? bare?.[2]);
    if (Number.isFinite(value) && value >= 200 && value <= 8000) args.buildingLoadRt = value;
  }

  return args;
}

/* ───────────────────────────────────────────────────────── rule planner ── */

/**
 * The deterministic plan. Every intent maps to tools that produce the facts an
 * answer to that intent needs — no intent falls through to "no tools", except
 * the ones that genuinely need none.
 */
export function rulePlan(
  message: string,
  c: Classification,
  page?: AssistantPageContext
): Plan {
  const calls: PlannedCall[] = [];
  const notes: string[] = [];
  const add = (tool: string, args: Record<string, unknown> = {}) => {
    if (!calls.some((x) => x.tool === tool)) calls.push(call(tool, args));
  };

  // Equipment the operator has selected in the schematic is part of the
  // question when the question does not name one itself.
  const selected = page?.selectedEquipment;
  const equipmentIds = c.entities.equipment.length
    ? c.entities.equipment
    : selected
      ? [selected]
      : [];

  switch (c.intent) {
    case 'GENERAL_KNOWLEDGE':
      add('searchKnowledgeBase', { query: message });
      break;

    case 'PLANT_STATUS':
      add('getPlantSummary');
      break;

    case 'PLANT_DIAGNOSTIC':
      add('getPlantState');
      add('getPlantTrends', { channels: channelsFor(c.topics), minutes: 20 });
      // A "why is X poor" question about power needs the efficiency breakdown
      // and its targets, which getPlantState alone does not carry.
      if (c.topics.includes('efficiency') || c.topics.includes('energy')) add('getPlantEfficiency');
      if (c.topics.includes('chiller') || c.topics.includes('staging')) add('getChillerStatus');
      if (c.topics.includes('chwp') || c.topics.includes('cwp') || c.topics.includes('dp')) add('getPumpStatus');
      if (c.topics.includes('tower') || c.topics.includes('condenser')) add('getCoolingTowerStatus');
      add('searchKnowledgeBase', { query: message, limit: 2 });
      break;

    case 'EFFICIENCY':
      add('getPlantEfficiency');
      add('getPlantState');
      add('getPlantTrends', { channels: channelsFor(['efficiency', ...c.topics] as Topic[]), minutes: 20 });
      add('searchKnowledgeBase', { query: message, limit: 2 });
      break;

    case 'OPTIMIZATION_ADVICE':
      // The brief is explicit: an optimisation question inspects the plant
      // automatically rather than answering in the abstract. The optimiser
      // itself is cheap here, so the recommendation is a real solved optimum
      // rather than a list of generic levers.
      add('getPlantState');
      add('getPlantEfficiency');
      add('getCurrentConstraints');
      add('runMPC', { apply: false });
      add('searchKnowledgeBase', { query: 'chiller plant optimisation levers', limit: 2 });
      break;

    case 'EQUIPMENT':
      if (equipmentIds.length === 1 && /^ch-\d$/.test(equipmentIds[0])) {
        add('getChillerStatus', { chillerId: equipmentIds[0] });
      } else if (equipmentIds.length) {
        add('getEquipmentStatus', { equipmentId: equipmentIds[0] });
      } else if (c.topics.includes('tower')) {
        add('getCoolingTowerStatus');
      } else if (c.topics.includes('chwp') || c.topics.includes('cwp')) {
        add('getPumpStatus');
      } else {
        add('getChillerStatus');
      }
      add('getPlantState');
      break;

    case 'ALARMS':
      add('getActiveAlarms');
      break;

    case 'TRENDS':
      add('getPlantTrends', { channels: channelsFor(c.topics), minutes: 30 });
      add('getPlantState');
      break;

    case 'CONSTRAINTS':
      add('getCurrentConstraints');
      add('getPlantState');
      break;

    case 'MPC_EXPLAIN':
      add('getMPCExplanationContext');
      break;

    case 'MPC_TRUST':
      add('getMPCExplanationContext');
      add('getModelCalibrationStatus');
      break;

    case 'MPC_RUN':
    case 'MPC_APPLY':
      // Never applied from a sentence, in either case. MPC_APPLY re-solves and
      // returns the optimum as a pending action; the confirm endpoint is the
      // only thing that can commit it.
      add('runMPC', { apply: false });
      break;

    case 'MPC_COMPARE': {
      const steps = c.entities.durationMinutes
        ? Math.max(2, Math.min(24, Math.round(c.entities.durationMinutes / 15)))
        : 6;
      add('compareBaselineVsMPC', { steps });
      break;
    }

    case 'WHAT_IF': {
      const args = whatIfArgsFrom(message, c);
      if (Object.keys(args).length) {
        add('runWhatIfScenario', args);
      } else {
        // A hypothetical we could not turn into numbers still deserves the
        // current state, so the reply can say what it would need.
        notes.push('no numeric condition could be extracted from the question');
        add('getPlantState');
        add('searchKnowledgeBase', { query: message, limit: 2 });
      }
      break;
    }

    case 'SIMULATE_TIME':
      add('runSimulation', { minutes: c.entities.durationMinutes ?? 30 });
      break;

    case 'SCENARIO':
      if (c.entities.scenarioJson && !c.entities.scenarioJson.id) {
        // A custom payload: the ids and values are validated inside the tool.
        add('applyCustomScenario', { payload: JSON.stringify(c.entities.scenarioJson) });
        // So a rejected payload can be answered with the ids that DO exist.
        add('getPlantControls');
      } else if (c.entities.scenarioHint) {
        add('applyScenario', { scenarioId: c.entities.scenarioHint });
      } else {
        add('listScenarios');
      }
      break;

    case 'CONTROL_WRITE':
      add('proposeControlChange', { request: message });
      add('getPlantState');
      break;

    case 'CAPABILITIES':
    case 'SMALL_TALK':
      break;

    case 'OUT_OF_DOMAIN':
      notes.push('the question is outside this plant\'s scope');
      break;

    case 'UNKNOWN':
    default:
      // The important case. An unrecognised question is answered from the
      // knowledge base and the live plant — never with a command menu.
      add('searchKnowledgeBase', { query: message, limit: 3 });
      add('getPlantState');
      break;
  }

  return { calls, notes };
}

/* ────────────────────────────────────────────────────────── LLM planner ── */

const PLANNER_SYSTEM = `You are the tool planner for a chiller-plant operations assistant.
Decide which tools to call to answer the operator's message. Reply with JSON only.

Format:
{"calls":[{"tool":"toolName","args":{}}],"reason":"one short sentence"}

Rules:
- Use at most 4 calls. Prefer 1-2.
- Only use tools from the list. Never invent a tool or an argument name.
- Plant numbers must come from tools. If the answer needs a measurement, call a tool.
- For definitions and general HVAC concepts, use searchKnowledgeBase only.
- For "why did the MPC ..." use getMPCExplanationContext.
- compareBaselineVsMPC is slow; use it only when the operator asks for a comparison over time.
- Never set apply=true on runMPC.
- For proposeControlChange, pass the operator's own wording as "request". Do not invent a controlId.
- If no tool is needed, reply {"calls":[]}.`;

interface LlmPlanResponse {
  calls?: Array<{ tool?: string; args?: Record<string, unknown> }>;
  reason?: string;
}

/** Pull the first JSON object out of a model reply that may be wrapped in prose. */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Ask the model for a plan, and keep it only if it is sane.
 *
 * "Sane" means: parseable, every tool on the allowlist, at most four calls, and
 * no attempt to set `apply`. Anything else falls back to the rule plan — an
 * unusable plan is not a reason to give the operator an unusable answer.
 */
export async function llmPlan(
  provider: AIProvider,
  message: string,
  c: Classification,
  history: Array<{ role: string; content: string }>,
  fallback: Plan
): Promise<Plan> {
  if (!provider.status().ready) return fallback;

  const hint = [
    `Rule-based classification: ${c.intent} (confidence ${c.confidence}).`,
    c.topics.length ? `Topics: ${c.topics.join(', ')}.` : '',
    `Default plan: ${fallback.calls.map((x) => x.tool).join(', ') || 'none'}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const raw = await provider.complete(
    [
      { role: 'system', content: `${PLANNER_SYSTEM}\n\nTools:\n${toolCatalogue()}` },
      ...history.slice(-4).map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 800) })),
      { role: 'user', content: `${hint}\n\nOperator message: ${message}` },
    ],
    { temperature: 0, maxTokens: 400 }
  );

  const parsed = extractJson(raw ?? '') as LlmPlanResponse | null;
  if (!parsed || !Array.isArray(parsed.calls)) return fallback;

  const calls: PlannedCall[] = [];
  for (const entry of parsed.calls.slice(0, 4)) {
    const tool = getTool(String(entry?.tool ?? ''));
    if (!tool) continue;
    const args = (entry?.args && typeof entry.args === 'object' ? entry.args : {}) as Record<string, unknown>;
    // Applying an optimum is a human decision, whatever the model asked for.
    if ('apply' in args) delete args.apply;
    // Nor is the search budget. A model asked to plan a turn will happily set
    // maxCycles to something small "to be quick", and a shallower search is a
    // worse optimum reported with the same confidence.
    if ('maxCycles' in args) delete args.maxCycles;
    /*
     * A control proposal always carries the operator's own sentence.
     *
     * Models reliably guess a plausible-looking control id — "chwst" rather
     * than "ctrl-chws-sp" — and the tool then correctly refuses a control that
     * does not exist, turning a normal request into an error. The wording is
     * the one input that is never wrong, so it is always attached; an id the
     * model supplied stays as a hint beside it.
     */
    if (tool.name === 'proposeControlChange' && !args.request) args.request = message;
    if (calls.some((x) => x.tool === tool.name)) continue;
    calls.push(call(tool.name, args, 'llm'));
  }

  if (!calls.length && fallback.calls.length) return fallback;
  return { calls, notes: fallback.notes };
}

/** Tool names in the allowlist, for the status endpoint. */
export { toolNames };

/** Ensure a plan never exceeds the turn's latency budget. */
export function trimPlanForBudget(plan: Plan, budgetMs: number): Plan {
  let spend = 0;
  const calls: PlannedCall[] = [];
  const notes = [...plan.notes];
  for (const c of plan.calls) {
    const cost = getTool(c.tool)?.costMs ?? 50;
    if (spend + cost > budgetMs && calls.length) {
      notes.push(`skipped ${c.tool} to stay within the response time budget`);
      continue;
    }
    spend += cost;
    calls.push(c);
  }
  return { calls, notes };
}

export { isNum };
