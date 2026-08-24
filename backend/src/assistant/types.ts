/**
 * Contracts for the Plant AI Assistant.
 *
 * The assistant is an agent over the existing Digital Twin, MPC and simulation
 * services. It owns no plant physics and no optimisation: every number it
 * reports comes back from a tool that calls the same module the UI calls.
 *
 *   user text
 *      -> intent + entities            (routing/intent.ts, deterministic)
 *      -> tool plan                    (planner: LLM when up, rules otherwise)
 *      -> tool results                 (tools/registry.ts, allowlisted)
 *      -> selected context + facts     (context.ts — never the whole twin)
 *      -> answer                       (LLM synthesis, or deterministic composer)
 *
 * The two rules that shape every type below:
 *
 *   1. A number the assistant did not receive from a tool must never appear in
 *      an answer. `SourceType` exists so a reader can always tell where a claim
 *      came from, and `unverifiedFigures` exists so we can detect when a model
 *      broke that rule.
 *   2. Anything that writes to the plant is a PROPOSAL until a human confirms
 *      it. `ProposedAction` is that proposal; nothing else may mutate.
 */

/**
 * Where a claim came from. Never blurred: a `DIGITAL_TWIN` number is a
 * simulation output, an `MPC_PREDICTION` is what the solver expects to happen,
 * and `GENERAL_KNOWLEDGE` is textbook HVAC that says nothing about this plant.
 */
export type SourceType =
  | 'LIVE_BMS'
  | 'DIGITAL_TWIN'
  | 'MPC_PREDICTION'
  | 'WHAT_IF_SIMULATION'
  | 'HISTORICAL_BMS'
  | 'KNOWLEDGE_BASE'
  | 'GENERAL_KNOWLEDGE'
  | 'MIXED'
  | 'NONE';

/** Read / simulate / write. The registry refuses to run a `write` tool
 *  directly — those become a `ProposedAction` and wait for a confirmation. */
export type ToolKind = 'read' | 'simulate' | 'write';

/**
 * A minimal argument schema. Deliberately not JSON Schema: the whole point is
 * that argument validation is small enough to read in one screen, because it is
 * the boundary between LLM-generated text and code that moves a plant.
 */
export interface ArgSpec {
  type: 'number' | 'string' | 'boolean' | 'string[]';
  required?: boolean;
  min?: number;
  max?: number;
  /** Allowed values for `string`. */
  enum?: string[];
  maxLength?: number;
  default?: unknown;
  description: string;
}

export interface ToolDefinition {
  name: string;
  kind: ToolKind;
  /** What the result is, for the planner prompt. One line. */
  description: string;
  /** Where this tool's numbers come from. Propagates to the answer. */
  sourceType: SourceType;
  args: Record<string, ArgSpec>;
  /** Roughly how long a call takes, so the planner can avoid stacking two
   *  multi-second tools into one turn. */
  costMs?: number;
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  sourceType: SourceType;
  args: Record<string, unknown>;
  data: unknown;
  error?: string;
  warnings?: string[];
  latencyMs: number;
}

/**
 * A control write the assistant wants to make, held until a human confirms.
 *
 * `expectedEffect` is produced by SIMULATING the proposal on the twin, not by
 * the language model guessing — that is the difference between a preview and a
 * sentence that sounds like one.
 */
export interface ProposedAction {
  id: string;
  kind: 'control-change' | 'scenario' | 'apply-mpc';
  label: string;
  /** Human-readable before/after rows. */
  changes: Array<{
    controlId: string;
    label: string;
    currentValue: number | string;
    proposedValue: number | string;
    unit: string;
  }>;
  expectedEffect: Array<{ label: string; before: string; after: string; delta?: string }>;
  warnings: string[];
  /** What the confirm endpoint will execute. Server-side only interpretation. */
  execute: {
    kind: 'control-change' | 'scenario' | 'apply-mpc';
    controls?: Array<{ controlId: string; value: number }>;
    scenarioId?: string;
  };
  createdAt: number;
}

/** A button the panel may offer under an answer. Clicking one sends its
 *  `prompt` through exactly the same chat path — never a second code path. */
export interface SuggestedAction {
  id: string;
  label: string;
  prompt: string;
  tone?: 'primary' | 'default';
}

/** One rendered block of a rich answer. The panel already knows how to draw
 *  Markdown; these are the shapes Markdown cannot carry honestly. */
export type AnswerBlock =
  | { kind: 'metric'; label: string; value: string; unit?: string; note?: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }
  | { kind: 'comparison'; label: string; before: string; after: string; delta?: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }
  | { kind: 'warning'; text: string }
  | { kind: 'note'; text: string };

export interface AssistantPageContext {
  /** Workspace the operator is looking at: plant | simulation | optimization | … */
  page?: string;
  /** Equipment id currently selected in the schematic, e.g. `ch-3`. */
  selectedEquipment?: string;
  system?: string;
  currentMpcRunId?: string;
}

export interface AssistantChatRequest {
  message: string;
  conversationId?: string;
  context?: AssistantPageContext;
}

export interface AssistantChatResponse {
  conversationId: string;
  message: string;
  /** Overall provenance of the answer. `MIXED` when tools of different kinds
   *  contributed — the per-tool source list is in `sources`. */
  sourceType: SourceType;
  sources: Array<{ tool: string; sourceType: SourceType }>;
  toolsUsed: string[];
  /** Tool calls that failed, so the UI can say so rather than pretend. */
  toolErrors: Array<{ tool: string; error: string }>;
  blocks: AnswerBlock[];
  actions: SuggestedAction[];
  /** Control writes awaiting an explicit confirmation. */
  proposedActions: ProposedAction[];
  warnings: string[];
  intent: string;
  /** Whether the language model wrote the prose, or the deterministic composer
   *  did. The panel says which, so "AI answer" never over-claims. */
  answeredBy: 'llm' | 'composer';
  /** Plant-unit figures in an LLM answer that are not in the tool results.
   *  Always empty for composer answers, which can only quote real numbers. */
  unverifiedFigures: string[];
  latencyMs: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  /** Compact record of what the previous turn established, so a follow-up like
   *  "what if I raise the pump speed?" resolves against the same subject. */
  intent?: string;
  topics?: string[];
  facts?: Record<string, unknown>;
}
