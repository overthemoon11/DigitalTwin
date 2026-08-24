/**
 * Free-form intent routing.
 *
 * This replaces the `if (message === 'show me a summary')` chain. It is not a
 * phrase table: each intent is a set of weighted signals, the message scores
 * against all of them, and the highest score wins. "why is energy high", "why
 * power consumption so high", "what is causing my plant to use more power" and
 * "why is kW/RT bad" all reach the same place because they share signals, not
 * because anyone listed them.
 *
 * Two things this layer must get right:
 *
 *   Concept versus measurement. "What is CHWST" wants a definition; "why is
 *   CHWST high" wants the plant. The difference is a question form, not a
 *   keyword, so question form is scored explicitly.
 *
 *   Follow-ups. "What if I raise the pump speed?" carries no subject at all.
 *   The previous turn's topics are folded in with a lower weight, which is
 *   enough to keep a conversation on the same equipment without letting an old
 *   subject override a clearly new one.
 *
 * When the language model is available it may override this with a better plan.
 * When it is not, this IS the router — which is why it has to work on its own.
 */
import type { ConversationTurn } from './types';

export type Intent =
  | 'GENERAL_KNOWLEDGE'
  | 'PLANT_STATUS'
  | 'PLANT_DIAGNOSTIC'
  | 'EFFICIENCY'
  | 'OPTIMIZATION_ADVICE'
  | 'EQUIPMENT'
  | 'ALARMS'
  | 'TRENDS'
  | 'CONSTRAINTS'
  | 'MPC_EXPLAIN'
  | 'MPC_RUN'
  | 'MPC_APPLY'
  | 'MPC_COMPARE'
  | 'MPC_TRUST'
  | 'WHAT_IF'
  | 'SIMULATE_TIME'
  | 'SCENARIO'
  | 'CONTROL_WRITE'
  | 'CAPABILITIES'
  | 'SMALL_TALK'
  | 'OUT_OF_DOMAIN'
  | 'UNKNOWN';

/** Subsystems a question can be about. Drives context selection. */
export type Topic =
  | 'chwst' | 'chwrt' | 'deltaT' | 'flow' | 'dp' | 'chwp' | 'cwp' | 'tower'
  | 'chiller' | 'staging' | 'condenser' | 'weather' | 'load' | 'energy'
  | 'efficiency' | 'alarms' | 'constraints' | 'calibration' | 'mpc' | 'cost';

export interface ExtractedEntities {
  /** Numbers with a recognised unit, e.g. `{ value: 30, unit: 'C' }`. */
  quantities: Array<{ value: number; unit: string; raw: string }>;
  /** Equipment mentioned by id or name, normalised to twin ids. */
  equipment: string[];
  /** Minutes/hours mentioned as a duration. */
  durationMinutes: number | null;
  /** A preset scenario name found in the text. */
  scenarioHint: string | null;
  /**
   * A pasted scenario payload.
   *
   * The advanced disclosure in the composer has always accepted raw scenario
   * JSON, and an agent that could not read it would have removed a capability
   * the panel still offers. Parsed here rather than in the planner so the
   * classifier can route on it.
   */
  scenarioJson: { id?: string; controls?: Record<string, number>; label?: string } | null;
  /** True when the message is phrased as a definition request. */
  asksDefinition: boolean;
  /** True when the message asks for a cause. */
  asksWhy: boolean;
  /** True when the message is hypothetical. */
  isHypothetical: boolean;
}

export interface Classification {
  intent: Intent;
  confidence: number;
  /** Runner-up, kept so the planner prompt can mention the ambiguity. */
  alternatives: Array<{ intent: Intent; score: number }>;
  topics: Topic[];
  entities: ExtractedEntities;
  /** True when the subject came from the previous turn rather than this one. */
  usedConversationContext: boolean;
}

/* ─────────────────────────────────────────────────────── topic signals ──── */

const TOPIC_PATTERNS: Array<[Topic, RegExp]> = [
  ['chwst', /\b(chwst|chws|chilled\s*water\s*supply|supply\s*(?:water\s*)?temp|leaving\s*(?:chilled\s*)?water|lwt|设定)\b/i],
  ['chwrt', /\b(chwrt|chwr|chilled\s*water\s*return|return\s*(?:water\s*)?temp|returning\s*water)\b/i],
  ['deltaT', /\b(delta\s*-?\s*t|deltat|\bdt\b|temperature\s+difference|approach\s+temp)\b/i],
  ['flow', /\b(flow|litres?\s*per\s*second|l\/s|lps|gpm|m3\/h|header\s*flow)\b/i],
  ['dp', /\b(dp|differential\s*pressure|delta\s*-?\s*p|head\s*pressure|kpa|psi)\b/i],
  ['chwp', /\b(chwp|chilled\s*water\s*pumps?|primary\s*pumps?|secondary\s*pumps?)\b/i],
  ['cwp', /\b(cwp|condenser\s*water\s*pumps?|condenser\s*pumps?)\b/i],
  ['tower', /\b(cooling\s*towers?|\bct\b|tower\s*fans?|fan\s*speed|approach)\b/i],
  ['chiller', /\b(chillers?|ch-?\d|compressors?|machines?)\b/i],
  ['staging', /\b(staging|stage\s*(?:up|down)?|sequenc\w+|how\s*many\s*chillers|units?\s*online|start\s+ch|stop\s+ch)\b/i],
  ['condenser', /\b(condenser|cws|cwr|condensing|heat\s*reject\w*)\b/i],
  ['weather', /\b(wet\s*-?\s*bulb|wetbulb|\bwb\b|humidity|outdoor|ambient|dry\s*-?\s*bulb|weather|oat)\b/i],
  ['load', /\b(load|tonnage|\brt\b|tons?|demand|cooling\s*requirement)\b/i],
  ['energy', /\b(energy|power|\bkw\b|kwh|consumption|electricit\w+|draw|usage)\b/i],
  ['efficiency', /\b(efficien\w+|kw\s*\/?\s*rt|kw\s*per\s*(?:rt|ton)|\bcop\b|performance|specific\s*power|inefficien\w+)\b/i],
  ['alarms', /\b(alarms?|alerts?|faults?|trips?|warnings?|problems?|issues?|anything\s*wrong)\b/i],
  ['constraints', /\b(constraints?|limit\w*|bounds?|allowed|maximum|minimum|envelope|binding|restrict\w*)\b/i],
  ['calibration', /\b(calibrat\w+|validated?|accuracy|trustworth\w+|reliab\w+|confidence|extrapolat\w+)\b/i],
  ['mpc', /\b(mpc|model\s*predictive|optimi[sz]er|solver|optimisation\s*run|optimization\s*run)\b/i],
  ['cost', /\b(cost|tariff|bill|money|savings?\s*in\s*(?:dollars|usd|\$)|\$)\b/i],
];

function detectTopics(text: string): Topic[] {
  const found: Topic[] = [];
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) found.push(topic);
  }
  return found;
}

/* ────────────────────────────────────────────────────── entity capture ──── */

const EQUIPMENT_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/\bch(?:iller)?\s*-?\s*([1-5])\b/gi, (m) => `ch-${m[1]}`],
  [/\bchwp\s*-?\s*([1-6])\b/gi, (m) => `chwp-${m[1]}`],
  [/\bcwp\s*-?\s*([1-6])\b/gi, (m) => `cwp-${m[1]}`],
  [/\bct\s*-?\s*0?([1-5])\b/gi, (m) => `ct-${m[1]}`],
];

const SCENARIO_HINTS: Array<[string, RegExp]> = [
  ['peak-summer', /\bpeak\s*-?\s*summer|hot\s+afternoon\b/i],
  ['night-low-load', /\bnight\s*(?:low\s*load|setback|time)\b/i],
  ['aggressive-chws', /\baggressive\s*chws|tight\s*chws\b/i],
  ['high-header-dp', /\bhigh\s*(?:header\s*)?dp\b/i],
  ['humid-monsoon', /\bmonsoon|humid\s+day\b/i],
  ['condenser-stress', /\bcondenser\s*stress|hot\s+condenser\b/i],
  ['part-load-tune', /\bpart\s*-?\s*load\s*(?:tune|scenario)|shoulder\s+season\b/i],
  ['baseline', /\b(?:design\s+)?baseline\s*(?:scenario)?\b/i],
];

/**
 * Numbers with units. Deliberately generous about spelling ("30 deg", "30c",
 * "30 degrees") because a unit typed three ways is still one number.
 */
const QUANTITY = /(-?\d+(?:\.\d+)?)\s*(°?\s*c\b|deg(?:rees?)?\s*c?\b|celsius\b|k\b|rt\b|tons?\b|kw\/rt\b|kw\b|kpa\b|psi\b|%|percent\b|l\/s\b|lps\b|hours?\b|hrs?\b|hr\b|min(?:ute)?s?\b)/gi;

function normaliseUnit(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (/^°?c$|^deg(rees?)?c?$|^celsius$/.test(u)) return 'C';
  if (u === 'k') return 'K';
  if (u === 'rt' || u === 'ton' || u === 'tons') return 'RT';
  if (u === 'kw/rt') return 'kW/RT';
  if (u === 'kw') return 'kW';
  if (u === 'kpa') return 'kPa';
  if (u === 'psi') return 'psi';
  if (u === '%' || u === 'percent') return '%';
  if (u === 'l/s' || u === 'lps') return 'L/s';
  if (/^h(ou)?rs?$/.test(u)) return 'h';
  if (/^min(ute)?s?$/.test(u)) return 'min';
  return u;
}

/** The first balanced JSON object in a message, if it parses. */
function extractJsonObject(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        const parsed = JSON.parse(text.slice(start, i + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractEntities(text: string): ExtractedEntities {
  const quantities: ExtractedEntities['quantities'] = [];
  for (const match of text.matchAll(QUANTITY)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    quantities.push({ value, unit: normaliseUnit(match[2]), raw: match[0].trim() });
  }

  const equipment = new Set<string>();
  for (const [pattern, map] of EQUIPMENT_PATTERNS) {
    for (const m of text.matchAll(pattern)) equipment.add(map(m));
  }

  let durationMinutes: number | null = null;
  const dur = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|min(?:ute)?s?)\b/i);
  if (dur) {
    const n = Number(dur[1]);
    durationMinutes = /^h/i.test(dur[2]) ? Math.round(n * 60) : Math.round(n);
  }

  // Scenario ids are hyphenated ("night-low-load") and the aliases are written
  // with spaces, so compare against a normalised copy.
  const spaced = text.replace(/[-_]+/g, ' ');
  const json = extractJsonObject(text);
  const scenarioHint =
    (typeof json?.id === 'string' ? json.id : null) ??
    SCENARIO_HINTS.find(([, p]) => p.test(text) || p.test(spaced))?.[0] ??
    null;

  return {
    quantities,
    equipment: [...equipment],
    durationMinutes,
    scenarioHint,
    scenarioJson: json && (json.id || json.controls) ? json : null,
    asksDefinition:
      /\b(what\s+(?:is|are|does|do)\b|what'?s\b|define\b|meaning\s+of\b|stand\s+for\b|explain\s+(?:what|the\s+(?:concept|term))|tell\s+me\s+about\b)/i.test(text) &&
      !/\b(my|our|current|right\s+now|today|the\s+plant'?s)\b/i.test(text) &&
      // "what is limiting the plant" and "what is causing this" ask about a
      // situation, not a term. A present participle is the tell.
      !/\bwhat(?:'?s|\s+is|\s+are)\s+(?:the\s+)?\w+ing\b/i.test(text),
    asksWhy: /\b(why|what'?s?\s+causing|what\s+caus\w+|reason|root\s+cause|how\s+come|explain\s+why)\b/i.test(text),
    isHypothetical:
      /\b(what\s+if|what\s+happens?\s+if|suppose|if\s+(?:the\s+)?\w+\s+(?:were|was|becomes?|goes?|reaches?|rises?|increases?|drops?|falls?)|simulate|try\s+\w|scenario\s+at|hypothetical)\b/i.test(text),
  };
}

/* ─────────────────────────────────────────────────────── intent signals ── */

interface IntentRule {
  intent: Intent;
  /** Each pattern that matches adds its weight. */
  signals: Array<[RegExp, number]>;
  /** Adds weight when any of these topics is present. */
  topicBoost?: Partial<Record<Topic, number>>;
  /** Subtracts weight when any of these patterns matches. */
  penalties?: Array<[RegExp, number]>;
}

const RULES: IntentRule[] = [
  {
    intent: 'MPC_RUN',
    signals: [
      [/\b(run|start|execute|trigger|launch|perform|do)\s+(?:the\s+|an?\s+)?(mpc|optimi[sz]ation|optimi[sz]er|solver)\b/i, 6],
      [/\b(optimi[sz]e)\s+(?:the\s+)?(plant|it|now|this|everything|operation)\b/i, 5],
      [/\b(find|compute|calculate|get|give\s+me)\s+(?:the\s+)?(optimal|best|cheapest)\s+(setting|setpoint|control|operating\s*point|configuration)/i, 5],
      [/\bwhat\s+(?:is|are)\s+the\s+best\s+setting/i, 4],
      [/\b(re)?optimi[sz]e\b/i, 2],
      [/\brun\s+mpc\b/i, 6],
    ],
    penalties: [
      [/\b(compare|versus|\bvs\b|against\s+baseline)\b/i, 5],
      [/\b(why|explain|reason|how\s+does)\b/i, 4],
      [/\bhow\s+(?:to|do\s+i|can\s+i|should\s+i)\s+optimi[sz]e/i, 6],
    ],
  },
  {
    /*
     * "Apply the MPC result" is a WRITE, not a solve — but it is also not a
     * setpoint request, because the values come from a run rather than from the
     * sentence. It gets its own intent so the answer can re-solve, show the
     * whole control vector, and hand the operator one confirmation for all of
     * it instead of six separate ones.
     */
    intent: 'MPC_APPLY',
    signals: [
      [/\b(apply|commit|implement|accept|use|adopt|go\s+with|put\s+in\s+place)\b[^.?]{0,30}\b(mpc|optimum|optimal|optimi[sz]ed|recommend\w*|solver|suggestion)\b/i, 8],
      [/\b(mpc|optimum|optimal|optimi[sz]ed|recommend\w*)\b[^.?]{0,20}\b(apply|commit|implement)\b/i, 6],
      [/\bmove\s+the\s+plant\s+(?:onto|to)\b/i, 6],
      [/\bapply\s+(?:it|that|those|these)\b/i, 5],
    ],
    penalties: [[/\bwhy\b|\bexplain\b|\btrust\b/i, 5]],
  },
  {
    intent: 'MPC_COMPARE',
    signals: [
      [/\bcompare\b/i, 4],
      [/\bbaseline\s*(?:vs\.?|versus|and|to|with|against)\s*mpc\b/i, 7],
      [/\bmpc\s*(?:vs\.?|versus|against)\s*baseline\b/i, 7],
      [/\b(difference|delta)\s+between\s+.*\b(baseline|mpc)\b/i, 5],
      [/\bhow\s+much\s+(?:would|could|do)\s+(?:we|i|the\s+plant)\s+save\b/i, 4],
      [/\b(saving|savings)\s+(?:over|across|for)\s+(?:a\s+)?(day|hour|period|horizon)\b/i, 4],
      [/\bhorizon\s+(?:run|comparison|compare)\b/i, 5],
    ],
    topicBoost: { mpc: 2 },
  },
  {
    intent: 'MPC_TRUST',
    signals: [
      [/\b(trust|trustworth\w+|believ\w+|reliab\w+|credib\w+|safe|valid|real|genuine|honest)\b.*\b(mpc|result|saving|number|optimi[sz]ation)\b/i, 6],
      [/\b(mpc|result|saving)\b.*\b(trust|trustworth\w+|believ\w+|reliab\w+|valid|safe|questionable|suspicious)\b/i, 6],
      [/\bshould\s+i\s+(?:trust|believe)\b/i, 5],
      [/\bis\s+(?:this|that|the)\s+(?:mpc\s+)?(?:result|saving|number)\s+(?:safe|real|right|correct|trustworthy)\b/i, 6],
      [/\bhow\s+(?:accurate|confident|sure)\b/i, 3],
      [/\bcaveat|limitation|catch\b/i, 3],
    ],
    topicBoost: { calibration: 2, mpc: 1 },
  },
  {
    intent: 'MPC_EXPLAIN',
    signals: [
      [/\bwhy\b[^?]*\b(mpc|optimi[sz]er|solver|it)\b[^?]*\b(chose|choose|chosen|pick|picked|select|selected|decide|decided|increase|increased|raise|raised|reduce|reduced|lower|lowered|drop|dropped|remove|removed|start|started|stop|stopped|set)\b/i, 7],
      [/\b(mpc|optimi[sz]er|solver)\b[^?]*\b(why|reason|rationale|logic|thinking)\b/i, 5],
      [/\bexplain\s+(?:the\s+)?(mpc|optimi[sz]ation|optimi[sz]er|result|decision|recommendation)\b/i, 6],
      [/\bwhy\s+did\s+(?:it|mpc|the\s+optimi[sz]er)\b/i, 7],
      [/\bwhat\s+caused\s+the\s+(mpc\s+)?savings?\b/i, 6],
      [/\bwhy\s+(?:is|are)\s+(?:the\s+)?(?:cooling\s+tower|ct|pump|chwp|cwp)\s+speed\s+(?:higher|lower|different)\b/i, 4],
      [/\bmpc\s+(?:decision|choice|recommendation|output|answer)\b/i, 5],
    ],
    topicBoost: { mpc: 2 },
  },
  {
    intent: 'OPTIMIZATION_ADVICE',
    signals: [
      [/\bhow\s+(?:to|do\s+i|can\s+i|should\s+i|would\s+i)\s+optimi[sz]e\b/i, 8],
      [/\bwhat\s+should\s+i\s+(optimi[sz]e|change|adjust|do|tune|improve|look\s+at)\b/i, 8],
      [/\bhow\s+(?:can|do)\s+(?:i|we)\s+(save|reduce|cut|lower)\s+(energy|power|kw|consumption|cost)\b/i, 7],
      [/\b(where|what)\s+(?:is|are)\s+the\s+(biggest|main|largest|best)\s+(opportunit\w+|savings?|wins?|levers?)\b/i, 7],
      [/\b(recommend|suggestion|advice|advise|improve|improvement)\b/i, 3],
      [/\b(optimi[sz]ation|efficiency)\s+(opportunit\w+|potential|options?)\b/i, 5],
      [/\bhow\s+to\s+(save|reduce|improve)\b/i, 5],
      [/\bwhat\s+can\s+(?:i|we)\s+do\b/i, 4],
      [/\banything\s+(?:i|we)\s+(?:can|should)\s+(?:do|change|improve)\b/i, 5],
    ],
    penalties: [[/\brun\s+(?:the\s+)?(mpc|optimi[sz]ation)\b/i, 5]],
  },
  {
    intent: 'EFFICIENCY',
    signals: [
      [/\b(is|how)\s+(?:my|the|our)?\s*plant\s+(efficien\w+|performing|doing)\b/i, 6],
      [/\bwhy\s+(?:is|are)\s+.{0,25}(efficien\w+|kw\s*\/?\s*rt|cop)\b.{0,20}\b(low|bad|poor|high|worse|down|dropped)\b/i, 7],
      [/\bwhy\s+(?:is|are)\s+.{0,30}(power|kw|energy|consumption)\b.{0,20}\b(high|up|increased|rising|so\s+much|excessive)\b/i, 7],
      [/\b(energy|power)\s+(usage|use|consumption)\b/i, 4],
      [/\bwhat\s+(?:is|are)\s+(?:causing|driving)\b.{0,30}\b(power|kw|energy|consumption|inefficien\w+)\b/i, 6],
      [/\bkw\s*\/?\s*rt\b.{0,20}\b(bad|high|poor|low|good)\b/i, 6],
      [/\binefficien\w+\b/i, 5],
      [/\befficiency\b/i, 2],
      [/\bwhy\b[^?]{0,40}\b(inefficien\w+|not\s+efficient|poor\s+performance)\b/i, 6],
      [/\bplant\s+(?:kw|power)\b/i, 3],
      [/\bhow\s+much\s+(?:power|energy)\b/i, 4],
    ],
    topicBoost: { efficiency: 2, energy: 1 },
    penalties: [
      [/\bwhat\s+(?:is|does)\s+kw\s*\/?\s*rt\s*(?:mean|stand)?\s*\??$/i, 8],
    ],
  },
  {
    intent: 'PLANT_DIAGNOSTIC',
    signals: [
      [/\bwhy\s+(?:is|are|does|do|did)\b/i, 3],
      [/\b(too\s+)?(high|low|warm|cold|hot|elevated|rising|falling|off|wrong|abnormal|strange|odd)\b/i, 2],
      [/\bwhat\s+(?:is|are)\s+(?:causing|driving|behind)\b/i, 4],
      [/\bis\s+(?:the\s+)?\w+\s+(?:too\s+)?(high|low|normal|ok|okay|fine)\b/i, 4],
      [/\b(operating|running)\s+normal\w*\b/i, 4],
      [/\bwhat'?s\s+(?:wrong|going\s+on|happening)\b/i, 4],
      [/\bdiagnos\w+|troubleshoot\w*|investigate\b/i, 4],
    ],
    topicBoost: { chwrt: 2, chwst: 2, dp: 2, deltaT: 2, condenser: 2, tower: 1, flow: 1 },
    penalties: [
      [/\bwhat\s+(?:is|are|does)\s+(?:a|an|the)?\s*\w+\s*(?:mean|stand\s+for)?\s*\??$/i, 3],
      [/\b(mpc|optimi[sz]er|solver)\b/i, 3],
    ],
  },
  {
    intent: 'PLANT_STATUS',
    signals: [
      [/\b(summary|overview|status|report|briefing|snapshot|dashboard)\b/i, 5],
      [/\bhow\s+is\s+(?:the\s+)?plant\b/i, 5],
      [/\bwhat(?:'s|\s+is)\s+(?:happening|going\s+on)\s+(?:now|currently|right\s+now)?\b/i, 5],
      [/\bis\s+everything\s+(ok|okay|fine|alright|normal)\b/i, 6],
      [/\bgive\s+me\s+(?:a|the)\s+(?:plant\s+)?(status|summary|overview|update)\b/i, 6],
      [/\b(current|present)\s+(state|condition|operation)\b/i, 4],
      [/\bhow\s+(?:are\s+)?(?:we|things)\s+(doing|running)\b/i, 4],
    ],
  },
  {
    intent: 'ALARMS',
    signals: [
      [/\b(alarms?|alerts?)\b/i, 5],
      [/\b(any|active|current|outstanding)\s+(alarms?|alerts?|faults?|issues?|problems?)\b/i, 6],
      [/\banything\s+(?:wrong|to\s+worry|i\s+should\s+know)\b/i, 4],
      [/\b(faults?|trips?)\b/i, 3],
    ],
    topicBoost: { alarms: 2 },
  },
  {
    intent: 'EQUIPMENT',
    signals: [
      [/\bwhich\s+(chiller|pump|tower|machine|unit|equipment)\b/i, 6],
      [/\b(chiller|pump|tower)s?\s+(status|health|performance|condition)\b/i, 5],
      [/\bwhich\s+\w+\s+(?:is|are)\s+(?:the\s+)?(most|least|worst|best)\b/i, 5],
      [/\bare\s+(?:my|the)\s+(pumps?|chillers?|towers?|fans?)\s+(running|working|ok|efficient)\b/i, 6],
      [/\bhow\s+(?:many|much)\s+(chillers?|pumps?|towers?)\b/i, 5],
      [/\b(ch-?\d|chwp-?\d|cwp-?\d|ct-?\d)\b/i, 4],
      [/\bshould\s+(?:i|we)\s+(start|stop|stage)\b/i, 5],
    ],
    topicBoost: { chiller: 2, chwp: 1, cwp: 1, tower: 1, staging: 2 },
  },
  {
    intent: 'TRENDS',
    signals: [
      [/\b(trend\w*|history|historical|over\s+time|past\s+\w+|recently|earlier)\b/i, 5],
      [/\b(?:over|in|during)\s+the\s+last\s+(?:\d+\s*)?(?:minutes?|mins?|hours?|hrs?|hour)\b/i, 5],
      [/\b(has|have|did)\s+\w+\s+(changed|moved|risen|fallen|increased|decreased)\b/i, 5],
      [/\bcompared?\s+to\s+(?:earlier|before|this\s+morning|yesterday)\b/i, 5],
      [/\bchart|graph|plot\b/i, 3],
    ],
  },
  {
    intent: 'CONSTRAINTS',
    signals: [
      [/\bwhat\s+(?:is|are)\s+(?:the\s+)?(limit|limits|constraint|constraints|bound|bounds|maximum|minimum)\b/i, 6],
      [/\bwhat(?:'s|\s+is)\s+(?:limiting|constraining|holding\s+back|stopping)\b/i, 7],
      [/\b(binding|active)\s+constraints?\b/i, 6],
      [/\bhow\s+(?:high|low|far)\s+can\s+(?:i|we)\b/i, 5],
      [/\bam\s+i\s+allowed\b/i, 4],
    ],
    topicBoost: { constraints: 3 },
  },
  {
    intent: 'WHAT_IF',
    signals: [
      [/\bwhat\s+if\b/i, 7],
      [/\bwhat\s+happens?\s+(?:if|when)\b/i, 7],
      [/\b(simulate|model|test|try)\b/i, 4],
      [/\bif\s+.{0,30}\b(were|was|becomes?|goes?\s+(?:to|up|down)|reaches?|rises?\s+to|drops?\s+to|increases?|decreases?)\b/i, 5],
      [/\b(scenario|case)\s+(?:at|with|of)\b/i, 4],
      [/\bhow\s+much\s+would\s+.{0,30}\b(save|cost|change)\b/i, 5],
      [/\bsuppose\b/i, 4],
      [/\bwould\s+it\s+(help|save|be\s+better)\b/i, 4],
    ],
    penalties: [[/\brun\s+(?:the\s+)?(simulation|sim)\s+for\b/i, 5]],
  },
  {
    intent: 'SIMULATE_TIME',
    signals: [
      [/\b(run|advance|fast\s*-?\s*forward|step|progress)\s+(?:the\s+)?(simulation|sim|plant|clock|time)\b/i, 6],
      [/\brun\s+(?:this|it|the\s+simulation)\s+for\s+\d+/i, 7],
      [/\bfor\s+\d+\s*(minutes?|mins?|hours?|hrs?)\b/i, 3],
      [/\badvance\s+\d+/i, 5],
    ],
  },
  {
    intent: 'SCENARIO',
    signals: [
      [/\b(run|apply|load|switch\s+to|use|start)\s+(?:the\s+)?[\w\s-]{0,24}scenario\b/i, 7],
      [/\bscenario\b/i, 3],
      [/\b(peak\s*summer|night\s*(?:low\s*load|setback)|condenser\s*stress|humid\s*monsoon|part\s*load\s*tune|aggressive\s*chws)\b/i, 5],
      [/\bwhat\s+scenarios?\s+(?:are\s+)?(available|can\s+i)\b/i, 6],
    ],
  },
  {
    intent: 'CONTROL_WRITE',
    signals: [
      [/\b(set|change|adjust|move|put|make|raise|lower|increase|decrease|reduce|drop|bump)\b.{0,30}\b(to|by|at)\s+-?\d/i, 6],
      [/\b(set|change)\s+(?:the\s+)?(chws|chwst|chwr|chwrt|cws|cwr|dp|load|fan|pump|humidity|temp\w*)\b/i, 6],
      [/\b(start|stop|enable|disable|turn\s+(?:on|off))\s+(?:the\s+)?(ch-?\d|chiller|pump|tower|fan)\b/i, 6],
    ],
    penalties: [
      [/\bwhat\s+if\b/i, 6],
      [/\bwhat\s+happens?\s+if\b/i, 6],
      [/\bsimulate\b/i, 4],
      [/\bshould\s+i\b/i, 3],
      [/\bwhy\b/i, 3],
    ],
  },
  {
    intent: 'GENERAL_KNOWLEDGE',
    signals: [
      [/\bwhat\s+(?:is|are|does|do)\s+(?:a|an|the)?\s*[\w\s/]{2,30}\s*(?:mean|stand\s+for)?\s*\?*$/i, 5],
      [/\bwhat(?:'s|\s+is)\s+the\s+(difference|relationship)\s+between\b/i, 6],
      [/\bhow\s+does\s+.{2,40}\s+(affect|impact|influence|work|change)\b/i, 6],
      [/\bwhy\s+does\s+(?:increasing|raising|lowering|reducing|higher|lower|a|an|the)\b/i, 5],
      // Bare imperative form of the same question: "why increase CHWST".
      [/\bwhy\s+(?:increase|raise|lower|reduce|decrease|slow|speed\s+up)\b(?![^?]*\b(?:did|does|has|it|mpc|the\s+optimi)\b)/i, 5],
      [/\b(define|definition|meaning|explain\s+the\s+(?:concept|term|idea))\b/i, 5],
      [/\bin\s+general\b/i, 3],
      [/\bwhat\s+does\s+\w+\s+do\b/i, 4],
      [/\bwhy\s+is\s+\w+\s+important\b/i, 5],
    ],
    penalties: [
      [/\b(my|our|current|currently|right\s+now|today|this\s+plant|the\s+plant'?s)\b/i, 4],
      [/\bwhat(?:'?s|\s+is|\s+are)\s+(?:the\s+)?\w+ing\b/i, 5],
    ],
  },
  {
    intent: 'CAPABILITIES',
    signals: [
      [/\bwhat\s+can\s+you\s+do\b/i, 8],
      [/\bhow\s+(?:do\s+i\s+use|does\s+this\s+work)\b/i, 5],
      [/\b(help|commands?|capabilit\w+|features?)\s*\??$/i, 4],
      [/\bwho\s+are\s+you\b/i, 6],
    ],
  },
  {
    intent: 'SMALL_TALK',
    signals: [
      [/^\s*(hi|hello|hey|yo|good\s+(morning|afternoon|evening))\b/i, 8],
      [/^\s*(thanks?|thank\s+you|cheers|ok|okay|got\s+it|nice|great|cool)\b\s*[.!]?\s*$/i, 8],
      [/^\s*(bye|goodbye|see\s+you)\b/i, 8],
    ],
  },
  {
    intent: 'OUT_OF_DOMAIN',
    signals: [
      [/\b(air\s+quality|co2|carbon\s+dioxide|iaq|ventilation|occupancy|lighting|elevator|lift\s+lobby|fire\s+alarm|access\s+control)\b/i, 5],
      [/\b(lobby|meeting\s+room|office\s+floor|zone)\s+temperature\b/i, 4],
      [/\b(weather\s+forecast|stock|news|joke|recipe)\b/i, 6],
    ],
  },
];

/* ────────────────────────────────────────────────────────── classifier ──── */

const CONTEXT_TOPIC_WEIGHT = 0.6;

/**
 * Classify one message, optionally against the conversation so far.
 *
 * `history` should be the recent turns; only the assistant's recorded topics
 * are consulted, never the raw text, so a long conversation does not slowly
 * drag every question towards its opening subject.
 */
export function classify(message: string, history: ConversationTurn[] = []): Classification {
  const text = String(message ?? '').trim();
  const entities = extractEntities(text);
  const ownTopics = detectTopics(text);

  // A message with no subject of its own inherits the previous one's.
  let usedConversationContext = false;
  let topics = [...ownTopics];
  if (ownTopics.length === 0) {
    const previous = [...history].reverse().find((t) => t.role === 'assistant' && t.topics?.length);
    if (previous?.topics?.length) {
      topics = previous.topics as Topic[];
      usedConversationContext = true;
    }
  }

  const scores = new Map<Intent, number>();
  for (const rule of RULES) {
    let score = 0;
    for (const [pattern, weight] of rule.signals) {
      if (pattern.test(text)) score += weight;
    }
    if (score > 0 && rule.topicBoost) {
      for (const topic of topics) {
        const boost = rule.topicBoost[topic];
        if (boost) score += usedConversationContext ? boost * CONTEXT_TOPIC_WEIGHT : boost;
      }
    }
    for (const [pattern, weight] of rule.penalties ?? []) {
      if (pattern.test(text)) score -= weight;
    }
    if (score > 0) scores.set(rule.intent, score);
  }

  // A pasted scenario payload is unambiguous, whatever else the message says.
  if (entities.scenarioJson) scores.set('SCENARIO', (scores.get('SCENARIO') ?? 0) + 9);

  // A hypothetical with a quantity is a what-if however it was phrased.
  if (entities.isHypothetical && entities.quantities.length) {
    scores.set('WHAT_IF', (scores.get('WHAT_IF') ?? 0) + 3);
  }
  // A definition question about a term we hold should not be answered with
  // plant data; the question form is the whole signal.
  if (entities.asksDefinition && !/\b(my|our|current|now|today)\b/i.test(text)) {
    scores.set('GENERAL_KNOWLEDGE', (scores.get('GENERAL_KNOWLEDGE') ?? 0) + 3);
  }
  // "why is <plant thing> <adjective>" is a diagnosis, not a definition.
  if (entities.asksWhy && topics.length && !scores.has('MPC_EXPLAIN')) {
    scores.set('PLANT_DIAGNOSTIC', (scores.get('PLANT_DIAGNOSTIC') ?? 0) + 2);
  }

  const ranked = [...scores.entries()]
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const intent: Intent = top && top.score >= 3 ? top.intent : text ? 'UNKNOWN' : 'SMALL_TALK';
  const runnerUp = ranked[1]?.score ?? 0;
  const confidence = top ? Math.min(1, Math.max(0.15, (top.score - runnerUp * 0.55) / 8)) : 0;

  return {
    intent,
    confidence: Math.round(confidence * 100) / 100,
    alternatives: ranked.slice(1, 4),
    topics,
    entities,
    usedConversationContext,
  };
}

/** Every intent this router can produce, for documentation and tests. */
export const ALL_INTENTS: Intent[] = [
  'GENERAL_KNOWLEDGE', 'PLANT_STATUS', 'PLANT_DIAGNOSTIC', 'EFFICIENCY',
  'OPTIMIZATION_ADVICE', 'EQUIPMENT', 'ALARMS', 'TRENDS', 'CONSTRAINTS',
  'MPC_EXPLAIN', 'MPC_RUN', 'MPC_APPLY', 'MPC_COMPARE', 'MPC_TRUST', 'WHAT_IF',
  'SIMULATE_TIME', 'SCENARIO', 'CONTROL_WRITE', 'CAPABILITIES', 'SMALL_TALK',
  'OUT_OF_DOMAIN', 'UNKNOWN',
];
