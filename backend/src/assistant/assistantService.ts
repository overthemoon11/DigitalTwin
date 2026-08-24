/**
 * The Plant AI Assistant service — one turn, end to end.
 *
 *   classify  ->  plan  ->  run tools  ->  select context
 *             ->  compose a grounded draft
 *             ->  LLM rewrite (when a model is up)  ->  audit  ->  respond
 *
 * The shape to notice is that the answer exists before the model is called. The
 * model improves the prose; it is never the thing that decides what is true.
 * That is why the assistant keeps working when the VPN is down, why the tests
 * are deterministic, and why a hallucinated figure is detectable — there is a
 * correct version of the same answer to compare against.
 *
 * Nothing in this file touches the plant. Reads go through the tool registry;
 * the single mutating path is `confirmAction`, which requires a proposal id
 * that only a previous turn could have produced.
 */
import { getAiProvider, type AssistantStatus } from './providers/index';
import { classify } from './intent';
import { llmPlan, rulePlan, trimPlanForBudget, type Plan, type PlannedCall } from './planner';
import { runTool, toolManifest, toolNames } from './tools/registry';
import { buildContext } from './context';
import { compose } from './composer';
import { buildAnswerPrompt } from './prompt';
import { auditNumericClaims, claimsUnbackedSaving } from './guard';
import {
  appendTurn,
  getOrCreateConversation,
  history,
  rememberProposal,
  takeProposal,
  clearConversation,
} from './conversation';
import { knowledgeSources } from './knowledge/index';
import { updatePlantControl, stepPlantSimulation, applyChillerScenario } from '../digital-twin/chiller/index';
import { publishPlantState } from '../websocket/plantChannel';
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  ProposedAction,
  SourceType,
  SuggestedAction,
  ToolResult,
} from './types';
import { isNum, round, shortId } from './util';

/** Total tool time one turn may spend before the plan is trimmed. */
const TOOL_BUDGET_MS = 12_000;
/** Ceiling on generated prose. Long enough for an MPC explanation. */
const MAX_ANSWER_TOKENS = 900;

/* ────────────────────────────────────────────────────────── source type ── */

const SPECIFICITY: SourceType[] = [
  'LIVE_BMS', 'HISTORICAL_BMS', 'MPC_PREDICTION', 'WHAT_IF_SIMULATION', 'DIGITAL_TWIN',
  'KNOWLEDGE_BASE', 'GENERAL_KNOWLEDGE', 'NONE',
];

/**
 * One provenance label for the whole answer.
 *
 * A single kind of source wins outright; a mix says so rather than picking the
 * flattering one. An answer with no tools at all is general knowledge, which is
 * exactly what it should be labelled.
 */
function deriveSourceType(results: ToolResult[]): SourceType {
  const kinds = new Set(results.filter((r) => r.ok).map((r) => r.sourceType));
  kinds.delete('NONE');
  if (kinds.size === 0) return 'GENERAL_KNOWLEDGE';
  if (kinds.size === 1) return [...kinds][0];
  // Knowledge alongside plant data is still plant data with background.
  const withoutKnowledge = [...kinds].filter((k) => k !== 'KNOWLEDGE_BASE' && k !== 'GENERAL_KNOWLEDGE');
  if (withoutKnowledge.length === 1) return withoutKnowledge[0];
  return 'MIXED';
}

function sortBySpecificity(a: SourceType, b: SourceType): number {
  return SPECIFICITY.indexOf(a) - SPECIFICITY.indexOf(b);
}

/* ──────────────────────────────────────────────────── proposal handling ── */

/**
 * Turn a `proposeControlChange` result into a pending action.
 *
 * The proposal carries its own simulated preview, so the confirm step shows the
 * operator what the twin said would happen — not what the model said would
 * happen.
 */
function toProposedAction(data: any): ProposedAction | null {
  if (!data?.proposed || !Array.isArray(data.changes) || !data.changes.length) return null;
  return {
    id: shortId('act'),
    kind: 'control-change',
    label: data.changes.map((c: any) => `${c.label} → ${c.proposedValue} ${c.unit}`).join(', '),
    changes: data.changes,
    expectedEffect: data.expectedEffect ?? [],
    warnings: data.warnings ?? [],
    execute: {
      kind: 'control-change',
      controls: data.changes.map((c: any) => ({ controlId: c.controlId, value: Number(c.proposedValue) })),
    },
    createdAt: Date.now(),
  };
}

/**
 * "Apply the MPC result" is also a write, and gets the same treatment.
 *
 * The proposal is built from the run the assistant already performed, so the
 * numbers on the confirmation are the numbers from that run rather than a
 * second solve that might land elsewhere.
 */
function mpcApplyProposal(run: any): ProposedAction | null {
  if (!run?.solved || !run.after || !run.changes?.length) return null;
  return {
    id: shortId('act'),
    kind: 'apply-mpc',
    label: 'Apply the MPC optimum to the Digital Twin',
    changes: run.changes.map((c: any) => ({
      controlId: c.control,
      label: c.label,
      currentValue: c.before,
      proposedValue: c.after,
      unit: c.unit,
    })),
    expectedEffect: [
      { label: 'Total plant power', before: `${round(run.before.totalPlantKw, 0)} kW`, after: `${round(run.after.totalPlantKw, 0)} kW`, delta: `−${run.savingPct}%` },
      { label: 'Plant efficiency', before: `${run.before.plantKwPerRt} kW/RT`, after: `${run.after.plantKwPerRt} kW/RT` },
      { label: 'CHW return', before: `${run.before.chwrC} °C`, after: `${run.after.chwrC} °C` },
    ],
    warnings: run.trust?.caveats ?? [],
    execute: { kind: 'apply-mpc' },
    createdAt: Date.now(),
  };
}

/* ──────────────────────────────────────────────────────────── the turn ── */

export interface ChatOptions {
  /** Called as each tool starts, for the streaming status line. */
  onStage?: (stage: { label: string; tool: string }) => void;
  /** Called with each generated token when streaming. */
  onDelta?: (text: string) => void;
  /** Skip the language model entirely. Used by tests and by the composer path. */
  forceComposer?: boolean;
}

export async function chat(
  request: AssistantChatRequest,
  options: ChatOptions = {}
): Promise<AssistantChatResponse> {
  const started = Date.now();
  const message = String(request.message ?? '').trim();
  const conversation = getOrCreateConversation(request.conversationId);
  const turns = history(conversation);

  if (!message) {
    return baseResponse(conversation.id, {
      message: 'Ask me anything about the plant — performance, an alarm, an MPC result, or a what-if condition.',
      intent: 'SMALL_TALK',
      latencyMs: Date.now() - started,
    });
  }

  /* 1 — classify against the conversation so far */
  const classification = classify(message, turns);

  /* 2 — plan: rules first, model only as an improvement on them */
  const provider = getAiProvider();
  const modelReady = !options.forceComposer && provider.status().ready;
  const baseline = rulePlan(message, classification, request.context);
  let plan: Plan = baseline;
  if (modelReady) {
    try {
      plan = await llmPlan(
        provider,
        message,
        classification,
        turns.map((t) => ({ role: t.role, content: t.content })),
        baseline
      );
    } catch {
      plan = baseline;
    }
  }
  plan = trimPlanForBudget(plan, TOOL_BUDGET_MS);

  /* 3 — run the tools */
  const results: ToolResult[] = [];
  for (const planned of plan.calls) {
    options.onStage?.({ label: planned.label, tool: planned.tool });
    results.push(await runTool(planned.tool, planned.args));
  }

  /* 4 — pending write proposals, which never execute here */
  const proposedActions: ProposedAction[] = [];
  for (const result of results) {
    if (!result.ok) continue;
    if (result.tool === 'proposeControlChange') {
      const action = toProposedAction(result.data);
      if (action) proposedActions.push(action);
    }
    if (result.tool === 'runMPC' && (classification.intent === 'MPC_APPLY' || wantsToApply(message))) {
      const action = mpcApplyProposal(result.data);
      if (action) proposedActions.push(action);
    }
  }
  for (const action of proposedActions) rememberProposal(conversation, action);

  /* 5 — select the context and write the grounded draft */
  const context = buildContext(
    message,
    results,
    classification,
    turns.map((t) => ({ role: t.role, content: t.content }))
  );
  const composed = compose(message, classification, results);

  /* 6 — let the model write the prose, if there is one */
  let answer = composed.markdown;
  let answeredBy: 'llm' | 'composer' = 'composer';
  let unverifiedFigures: string[] = [];

  /*
   * The audit corpus includes the composer's draft.
   *
   * The draft is written only from tool results, so every figure in it is
   * verified by construction — including the ones the composer DERIVED, like
   * "1.56 K of margin" from a 16 °C limit and a 14.44 °C reading. Without this
   * the model gets flagged for repeating a number the assistant itself
   * computed, which is the guard's most common false positive.
   */
  const auditCorpus = `${context.verifiableText}

${composed.markdown}`;

  if (modelReady) {
    const prompt = buildAnswerPrompt({
      message,
      classification,
      context,
      draft: composed.markdown,
      history: turns,
      page: request.context,
    });
    let generated: string | null = null;
    try {
      generated = options.onDelta && provider.stream
        ? await provider.stream(prompt, options.onDelta, { temperature: 0.25, maxTokens: MAX_ANSWER_TOKENS })
        : await provider.complete(prompt, { temperature: 0.25, maxTokens: MAX_ANSWER_TOKENS });
    } catch {
      generated = null;
    }
    if (generated && generated.trim().length > 24) {
      const audit = auditNumericClaims(generated, auditCorpus);
      const unbackedSaving = claimsUnbackedSaving(generated, auditCorpus);
      // A model that invented a saving figure has done the one thing this
      // assistant must not do. Fall back to the draft rather than publish it.
      if (unbackedSaving) {
        composed.warnings.push(
          'The language model produced an unsupported saving figure, so the verified answer is shown instead.'
        );
      } else {
        answer = generated.trim();
        answeredBy = 'llm';
        unverifiedFigures = audit.unverified;
      }
    }
  }

  /* 7 — assemble */
  const okResults = results.filter((r) => r.ok);
  const warnings = [...new Set(composed.warnings)];
  if (unverifiedFigures.length >= 2) {
    warnings.push(
      `${unverifiedFigures.length} figures in this answer (${unverifiedFigures.slice(0, 3).join(', ')}) are not in the retrieved plant data. Treat them as general context, not as readings.`
    );
  }
  for (const note of plan.notes) if (note.startsWith('skipped ')) warnings.push(note);

  const actions: SuggestedAction[] = [...composed.actions];
  for (const action of proposedActions) {
    actions.unshift({ id: `confirm:${action.id}`, label: 'Confirm and apply', prompt: '', tone: 'primary' });
  }

  const response = baseResponse(conversation.id, {
    message: answer,
    intent: classification.intent,
    latencyMs: Date.now() - started,
    sourceType: deriveSourceType(results),
    sources: okResults
      .map((r) => ({ tool: r.tool, sourceType: r.sourceType }))
      .sort((a, b) => sortBySpecificity(a.sourceType, b.sourceType)),
    toolsUsed: okResults.map((r) => r.tool),
    toolErrors: results.filter((r) => !r.ok).map((r) => ({ tool: r.tool, error: r.error ?? 'failed' })),
    blocks: composed.blocks,
    actions,
    proposedActions,
    warnings,
    answeredBy,
    unverifiedFigures,
  });

  /* 8 — remember the turn, with the topics a follow-up will need */
  appendTurn(conversation, { role: 'user', content: message, at: Date.now() });
  appendTurn(conversation, {
    role: 'assistant',
    content: answer,
    at: Date.now(),
    intent: classification.intent,
    topics: classification.topics,
    facts: summariseFactsForMemory(context.facts),
  });

  return response;
}

/** Did the operator ask for the optimum to be applied, not just computed? */
function wantsToApply(message: string): boolean {
  return /\b(apply|commit|use|put\s+it\s+on|move\s+the\s+plant|set\s+it|do\s+it|implement)\b/i.test(message);
}

/** Keep a handful of headline numbers per turn so a follow-up has an anchor. */
function summariseFactsForMemory(facts: Record<string, unknown>): Record<string, unknown> {
  const state = facts.getPlantState as any;
  const out: Record<string, unknown> = {};
  if (state) {
    for (const key of ['buildingLoadRt', 'totalPlantKw', 'plantKwPerRt', 'chwstC', 'chwrtC', 'wetBulbC']) {
      if (key in state) out[key] = state[key];
    }
  }
  if (facts.runMPC) out.lastMpcSavingPct = (facts.runMPC as any).savingPct;
  return out;
}

function baseResponse(
  conversationId: string,
  patch: Partial<AssistantChatResponse> & { message: string; intent: string; latencyMs: number }
): AssistantChatResponse {
  return {
    conversationId,
    sourceType: 'GENERAL_KNOWLEDGE',
    sources: [],
    toolsUsed: [],
    toolErrors: [],
    blocks: [],
    actions: [],
    proposedActions: [],
    warnings: [],
    answeredBy: 'composer',
    unverifiedFigures: [],
    ...patch,
  };
}

/* ─────────────────────────────────────────────────── confirmed actions ── */

export interface ConfirmResult {
  applied: boolean;
  message: string;
  action?: ProposedAction;
  outcome?: Array<{ label: string; before: string; after: string }>;
  error?: string;
}

/**
 * Execute a previously proposed change. The ONLY mutating path in the
 * assistant, and it needs a proposal id that a prior turn issued and that has
 * not been used or expired.
 */
export async function confirmAction(conversationId: string, actionId: string): Promise<ConfirmResult> {
  const action = takeProposal(conversationId, actionId);
  if (!action) {
    return {
      applied: false,
      message: 'That proposed change is no longer available — it was already applied, cancelled, or it expired. Ask again and I will re-check the plant before proposing it.',
      error: 'proposal-not-found',
    };
  }

  const before = stepPlantSimulation();
  const kw = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-kw')?.value;
  const eff = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-eff')?.value;

  try {
    if (action.execute.kind === 'control-change') {
      for (const change of action.execute.controls ?? []) {
        if (!isNum(change.value)) continue;
        updatePlantControl(change.controlId, change.value);
      }
    } else if (action.execute.kind === 'scenario' && action.execute.scenarioId) {
      applyChillerScenario(action.execute.scenarioId);
    } else if (action.execute.kind === 'apply-mpc') {
      // Re-solve and commit through the MPC's own apply path, so the twin is
      // moved by the optimiser rather than by a hand-copied control vector.
      const { runMPC } = await import('./tools/mpcTools');
      const run = await runMPC({ apply: true });
      if (!run.solved) {
        return { applied: false, message: 'The optimiser found no feasible point when re-solving, so nothing was applied.', action, error: 'infeasible' };
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { applied: false, message: `The change could not be applied: ${detail}`, action, error: detail };
  }

  const after = stepPlantSimulation();
  publishPlantState();

  return {
    applied: true,
    message: `Applied to the Digital Twin: ${action.label}.`,
    action,
    outcome: [
      { label: 'Total plant power', before: `${round(kw(before), 1)} kW`, after: `${round(kw(after), 1)} kW` },
      { label: 'Plant efficiency', before: `${round(eff(before), 3)} kW/RT`, after: `${round(eff(after), 3)} kW/RT` },
      { label: 'CHWS / CHWR', before: `${round(before.headers.chws, 2)} / ${round(before.headers.chwr, 2)} °C`, after: `${round(after.headers.chws, 2)} / ${round(after.headers.chwr, 2)} °C` },
    ],
  };
}

export function forgetConversation(conversationId: string): boolean {
  return clearConversation(conversationId);
}

/* ──────────────────────────────────────────────────────────── status ──── */

/**
 * What the header dot means.
 *
 * The panel used to print "Local model ready" whatever was happening. This
 * separates the two things that can be up or down: the model writes prose, the
 * tools answer questions. Losing the model is a degradation; losing the tools
 * is an outage.
 */
export async function assistantStatus(): Promise<AssistantStatus> {
  const model = getAiProvider().status();
  const probe = await runTool('getPlantState', {});
  const toolServiceOk = probe.ok;

  let health: AssistantStatus['health'];
  let label: string;
  let detail: string;

  if (!toolServiceOk) {
    health = 'unavailable';
    label = 'Tool service unavailable';
    detail = `The plant tools are not responding: ${probe.error ?? 'unknown error'}. I cannot read plant state.`;
  } else if (model.ready) {
    health = 'ready';
    label = 'AI ready';
    detail = `${model.provider} · ${model.model}`;
  } else if (['initializing', 'loading', 'downloading', 'not_initialized'].includes(model.status)) {
    health = 'connecting';
    label = model.status === 'downloading'
      ? `Downloading model ${Math.round(model.downloadProgress ?? 0)}%`
      : 'Connecting to the model';
    detail = `${model.message} Plant questions are answered from the tools meanwhile.`;
  } else {
    health = 'degraded';
    label = 'Answering without the language model';
    detail = `${model.message || 'The language model is unreachable.'} Plant data, MPC and simulation all still work — replies are written from the verified data instead of generated.`;
  }

  return {
    health,
    label,
    detail,
    model,
    toolsAvailable: toolNames().length,
    toolServiceOk,
  };
}

/** Introspection for `GET /api/assistant/tools`. */
export function assistantCapabilities() {
  return {
    tools: toolManifest(),
    knowledgeSources: knowledgeSources(),
  };
}

export { toolManifest };
