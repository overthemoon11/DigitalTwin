/**
 * The tool allowlist.
 *
 * Nothing the assistant can do exists outside this table. A model that emits
 * `{"tool": "dropDatabase"}` gets an error string back, and a model that emits
 * a real tool with junk arguments gets a validation error back — in both cases
 * the turn continues and the user gets an answer that says the tool failed.
 * There is no path from generated text to an arbitrary function call.
 *
 * `write` tools are a special case: they run (they only ever build a preview)
 * but their result is turned into a pending `ProposedAction` by the service
 * rather than into a completed action. The only code that mutates the plant on
 * behalf of the assistant is `confirmAction`, and it is reachable only from an
 * explicit HTTP confirmation carrying a proposal id.
 */
import type { ToolDefinition, ToolResult } from '../types';
import { coerceArgs, describeArgs, ToolArgError } from './schema';
import { PLANT_TOOLS } from './plantTools';
import { MPC_TOOLS } from './mpcTools';
import { SIMULATION_TOOLS } from './simulationTools';
import { KNOWLEDGE_TOOLS } from './knowledgeTools';

const ALL: ToolDefinition[] = [
  ...PLANT_TOOLS,
  ...MPC_TOOLS,
  ...SIMULATION_TOOLS,
  ...KNOWLEDGE_TOOLS,
];

const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Case-insensitive lookup: models are inconsistent about casing. */
const BY_LOWER = new Map(ALL.map((t) => [t.name.toLowerCase(), t]));

export function listTools(): ToolDefinition[] {
  return ALL;
}

export function getTool(name: string): ToolDefinition | null {
  return BY_NAME.get(name) ?? BY_LOWER.get(String(name).toLowerCase()) ?? null;
}

export function toolNames(): string[] {
  return ALL.map((t) => t.name);
}

/** The tool catalogue as the planner prompt sees it. */
export function toolCatalogue(): string {
  return ALL.map(
    (t) => `- ${t.name}(${describeArgs(t.args)}) [${t.kind}] — ${t.description}`
  ).join('\n');
}

/** Public description of the allowlist, for `GET /api/assistant/tools`. */
export function toolManifest() {
  return ALL.map((t) => ({
    name: t.name,
    kind: t.kind,
    sourceType: t.sourceType,
    description: t.description,
    args: Object.fromEntries(
      Object.entries(t.args).map(([k, v]) => [
        k,
        { type: v.type, required: Boolean(v.required), enum: v.enum ?? null, min: v.min ?? null, max: v.max ?? null, description: v.description },
      ])
    ),
    typicalLatencyMs: t.costMs ?? null,
  }));
}

/**
 * Run one tool. Never throws: a failure is a `ToolResult` with `ok: false`, so
 * one bad call degrades the answer instead of losing the turn.
 */
export async function runTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  const started = Date.now();
  const tool = getTool(name);
  if (!tool) {
    return {
      tool: String(name),
      ok: false,
      sourceType: 'NONE',
      args: {},
      data: null,
      error: `"${name}" is not an available tool. Available: ${toolNames().join(', ')}`,
      latencyMs: Date.now() - started,
    };
  }

  let args: Record<string, unknown>;
  let notes: string[];
  try {
    ({ args, notes } = coerceArgs(tool.name, tool.args, rawArgs));
  } catch (err) {
    return {
      tool: tool.name,
      ok: false,
      sourceType: tool.sourceType,
      args: {},
      data: null,
      error: err instanceof ToolArgError ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }

  try {
    const data = await tool.run(args);
    return {
      tool: tool.name,
      ok: true,
      sourceType: tool.sourceType,
      args,
      data,
      warnings: notes.length ? notes : undefined,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[assistant] tool ${tool.name} failed:`, message);
    return {
      tool: tool.name,
      ok: false,
      sourceType: tool.sourceType,
      args,
      data: null,
      error: message,
      latencyMs: Date.now() - started,
    };
  }
}

/** Cheap liveness probe for the status endpoint. */
export async function toolServiceHealthy(): Promise<boolean> {
  const result = await runTool('getPlantState', {});
  return result.ok;
}
