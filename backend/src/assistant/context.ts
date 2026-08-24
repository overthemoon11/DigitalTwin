/**
 * Context selection.
 *
 * The twin's state object is large, and a "why is CHWR high?" question needs
 * about a dozen of its fields. Sending all of it would cost tokens, bury the
 * relevant numbers among irrelevant ones, and — the part that actually matters
 * — invite the model to reach for whatever it finds. A model handed the air
 * side of a building will mention the air side of a building.
 *
 * So each tool result is pruned against the classified topics before it becomes
 * prompt text. Four fields are always kept — time, load, plant kW and kW/RT —
 * because every plant answer is relative to them.
 *
 * The same function produces the corpus the numeric guard checks the model's
 * answer against, which keeps "what the model was told" and "what the model is
 * allowed to quote" as one thing rather than two that can drift apart.
 */
import type { Classification, Topic } from './intent';
import type { ToolResult } from './types';

/** Always present in a plant-state payload, whatever the question. */
const CORE_FIELDS = [
  'timestamp', 'dataSource', 'buildingLoadRt', 'totalPlantKw', 'plantKwPerRt', 'plantCop',
];

/** getPlantState fields worth sending, per topic. */
const TOPIC_FIELDS: Partial<Record<Topic, string[]>> = {
  chwst: ['chwstC', 'chwrtC', 'chwDeltaTC', 'chwFlowLs', 'runningChillers', 'activeChillers', 'chillerLoadPct', 'chillerKw'],
  chwrt: ['chwrtC', 'chwstC', 'chwDeltaTC', 'chwFlowLs', 'runningChillers', 'activeChillers', 'chillerLoadPct', 'chwpSpeedPct', 'dpPsi', 'dpKpa'],
  deltaT: ['chwDeltaTC', 'chwstC', 'chwrtC', 'chwFlowLs', 'chwpSpeedPct', 'dpPsi'],
  flow: ['chwFlowLs', 'chwDeltaTC', 'chwpSpeedPct', 'dpPsi', 'runningChwp'],
  dp: ['dpPsi', 'dpKpa', 'chwpSpeedPct', 'chwpKw', 'chwFlowLs', 'chwDeltaTC', 'runningChwp'],
  chwp: ['chwpKw', 'chwpSpeedPct', 'runningChwp', 'dpPsi', 'dpKpa', 'chwFlowLs'],
  cwp: ['cwpKw', 'cwpSpeedPct', 'runningCwp', 'cwsC', 'cwrC', 'condDeltaTC'],
  tower: ['towerKw', 'ctFanSpeedPct', 'towerApproachC', 'wetBulbC', 'cwsC', 'runningTowers'],
  condenser: ['cwsC', 'cwrC', 'condDeltaTC', 'towerApproachC', 'wetBulbC', 'cwpSpeedPct', 'chillerKw'],
  chiller: ['activeChillers', 'runningChillers', 'chillerKw', 'chillerKwPerRt', 'chillerLoadPct', 'chwstC', 'cwsC'],
  staging: ['activeChillers', 'runningChillers', 'chillerLoadPct', 'buildingLoadRt', 'runningChwp', 'runningCwp'],
  weather: ['wetBulbC', 'ambientTempC', 'humidityRh', 'towerApproachC', 'cwsC'],
  load: ['buildingLoadRt', 'chwDeltaTC', 'chwFlowLs', 'runningChillers', 'chillerLoadPct'],
  energy: ['chillerKw', 'chwpKw', 'cwpKw', 'towerKw', 'totalPlantKw', 'plantKwPerRt'],
  efficiency: ['plantKwPerRt', 'chillerKwPerRt', 'plantCop', 'chillerKw', 'chwpKw', 'cwpKw', 'towerKw', 'wetBulbC', 'chillerLoadPct'],
  alarms: ['alarms'],
  constraints: ['constraintStatus', 'calibration'],
  calibration: ['calibration', 'constraintStatus'],
  mpc: ['constraintStatus', 'calibration', 'chwstC', 'dpPsi', 'runningChillers'],
};

/** Intents that always want the full alarm list rather than just a count. */
const WANTS_ALARMS = new Set(['ALARMS', 'PLANT_STATUS', 'PLANT_DIAGNOSTIC', 'OPTIMIZATION_ADVICE']);

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/**
 * Prune one tool's payload to what the question needs.
 *
 * Only `getPlantState` is aggressively pruned — the other tools were already
 * written to answer one question each, so their payloads are relevant by
 * construction. Trend series are thinned instead, because a chart's worth of
 * points is exactly the kind of bulk that crowds out the answer.
 */
export function pruneToolData(result: ToolResult, c: Classification): unknown {
  if (!result.ok || result.data == null) return result.data;
  const data = result.data as Record<string, any>;

  if (result.tool === 'getPlantState') {
    const keys = new Set(CORE_FIELDS);
    for (const topic of c.topics) for (const f of TOPIC_FIELDS[topic] ?? []) keys.add(f);
    // No topic at all means a general question; send the operating point.
    if (!c.topics.length) {
      ['chwstC', 'chwrtC', 'chwDeltaTC', 'wetBulbC', 'activeChillers', 'runningChillers',
        'chillerKw', 'chwpKw', 'cwpKw', 'towerKw', 'dpPsi'].forEach((f) => keys.add(f));
    }
    keys.add('constraintStatus');
    keys.add('calibration');
    const pruned = pick(data, [...keys]);
    // An alarm the operator did not ask about is still worth one line when it
    // exists; the full list only when the question is about alarms.
    if (Array.isArray(data.alarms)) {
      pruned.activeAlarmCount = data.alarms.length;
      if (WANTS_ALARMS.has(c.intent) || c.topics.includes('alarms')) pruned.alarms = data.alarms;
      else delete pruned.alarms;
    }
    return pruned;
  }

  if (result.tool === 'getPlantTrends' && Array.isArray(data.series)) {
    return {
      ...data,
      series: data.series
        .filter((s: any) => s.samples > 0)
        .map((s: any) => ({
          channel: s.channel,
          samples: s.samples,
          first: s.first,
          last: s.last,
          min: s.min,
          max: s.max,
          direction: s.direction,
          changeOverWindow: s.changeOverWindow,
        })),
    };
  }

  if (result.tool === 'searchKnowledgeBase' && Array.isArray(data.hits)) {
    return {
      found: data.found,
      hits: data.hits.map((h: any) => ({ title: h.title, source: h.source, ref: h.ref, excerpt: h.excerpt })),
    };
  }

  if (result.tool === 'getEquipmentStatus' && data.chillers) {
    // The everything-at-once shape is too big for a prompt; keep the summaries.
    return {
      timestamp: data.timestamp,
      chillers: data.chillers?.chillers ?? null,
      chillerSummary: {
        running: data.chillers?.running,
        leastEfficientRunning: data.chillers?.leastEfficientRunning,
        lightestLoadedRunning: data.chillers?.lightestLoadedRunning,
      },
      pumps: { totals: data.pumps?.totals, commandedSpeedPct: data.pumps?.commandedSpeedPct, dpSetpointPsi: data.pumps?.dpSetpointPsi },
      towers: { running: data.towers?.running, approachC: data.towers?.approachC, wetBulbC: data.towers?.wetBulbC, totalTowerKw: data.towers?.totalTowerKw },
    };
  }

  return data;
}

export interface BuiltContext {
  /** Pruned tool payloads, keyed by tool name. */
  facts: Record<string, unknown>;
  /** The same, serialised for a prompt. */
  factsText: string;
  /** Everything the model is permitted to quote figures from. */
  verifiableText: string;
  /** Knowledge-base excerpts, kept separate so they can be cited. */
  knowledge: Array<{ title: string; source: string; ref?: string; excerpt: string }>;
  /** Tools that failed, so the prompt can say what is missing. */
  missing: Array<{ tool: string; error: string }>;
}

const MAX_FACTS_CHARS = 9000;

export function buildContext(
  message: string,
  results: ToolResult[],
  c: Classification,
  history: Array<{ role: string; content: string }> = []
): BuiltContext {
  const facts: Record<string, unknown> = {};
  const knowledge: BuiltContext['knowledge'] = [];
  const missing: BuiltContext['missing'] = [];

  for (const result of results) {
    if (!result.ok) {
      missing.push({ tool: result.tool, error: result.error ?? 'failed' });
      continue;
    }
    const pruned = pruneToolData(result, c) as any;
    if (result.tool === 'searchKnowledgeBase' && pruned?.hits) {
      knowledge.push(...pruned.hits);
      continue;
    }
    facts[result.tool] = pruned;
  }

  let factsText = Object.keys(facts).length
    ? Object.entries(facts)
        .map(([tool, data]) => `### ${tool}\n${JSON.stringify(data, null, 1)}`)
        .join('\n\n')
    : '';
  if (factsText.length > MAX_FACTS_CHARS) {
    factsText = `${factsText.slice(0, MAX_FACTS_CHARS)}\n… (truncated)`;
  }

  const knowledgeText = knowledge.length
    ? knowledge.map((k) => `### ${k.title} (${k.source})\n${k.excerpt}`).join('\n\n')
    : '';

  // The audit corpus deliberately includes the operator's own message and the
  // recent transcript: a figure the operator supplied, or one this assistant
  // already reported, is not a hallucination when it comes back.
  const verifiableText = [
    factsText,
    knowledgeText,
    message,
    history.slice(-4).map((h) => h.content).join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return { facts, factsText, verifiableText, knowledge, missing };
}
