/**
 * Argument validation for AI-selected tool calls.
 *
 * This is the trust boundary. Everything on the far side of it was written by a
 * language model reading a user's message, so nothing here may be permissive:
 * an unknown key is an error rather than an ignored field, a number outside its
 * declared range is clamped and reported rather than passed through, and a
 * string is length-capped before it can reach a log or a prompt.
 *
 * The clamping is deliberate. A model that asks for a 400-step horizon has made
 * a units mistake, not a request to melt the box, and refusing the whole call
 * would leave the user with no answer. Clamping keeps the answer and records
 * what was changed so the reply can say so.
 */
import type { ArgSpec } from '../types';

export class ToolArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgError';
  }
}

export interface CoercedArgs {
  args: Record<string, unknown>;
  /** Adjustments made to keep the call legal, in plain language. */
  notes: string[];
}

/**
 * Coerce and validate one tool's arguments against its spec.
 *
 * Accepts the string forms a language model tends to emit ("8.2", "true") so a
 * quoted number is not a failed answer, but never invents a value: a missing
 * required argument throws.
 */
export function coerceArgs(
  toolName: string,
  spec: Record<string, ArgSpec>,
  raw: unknown
): CoercedArgs {
  const notes: string[] = [];
  const out: Record<string, unknown> = {};

  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new ToolArgError(`${toolName}: arguments must be an object`);
  }
  const input = (raw ?? {}) as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!(key in spec)) {
      // Silently dropping it would let a hallucinated argument look accepted.
      notes.push(`ignored unknown argument "${key}"`);
    }
  }

  for (const [key, def] of Object.entries(spec)) {
    const present = key in input && input[key] !== null && input[key] !== undefined && input[key] !== '';
    if (!present) {
      if (def.required) throw new ToolArgError(`${toolName}: "${key}" is required (${def.description})`);
      if (def.default !== undefined) out[key] = def.default;
      continue;
    }
    const value = input[key];

    if (def.type === 'number') {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.+-]/g, ''));
      if (!Number.isFinite(n)) {
        throw new ToolArgError(`${toolName}: "${key}" must be a number (got ${JSON.stringify(value)})`);
      }
      let v = n;
      if (def.min !== undefined && v < def.min) {
        notes.push(`${key} ${n} raised to the minimum ${def.min}`);
        v = def.min;
      }
      if (def.max !== undefined && v > def.max) {
        notes.push(`${key} ${n} capped at the maximum ${def.max}`);
        v = def.max;
      }
      out[key] = v;
      continue;
    }

    if (def.type === 'boolean') {
      out[key] = typeof value === 'boolean' ? value : /^(true|yes|1)$/i.test(String(value));
      continue;
    }

    if (def.type === 'string[]') {
      const list = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
      out[key] = list
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, 32)
        .map((v) => v.slice(0, 64));
      continue;
    }

    const s = String(value).slice(0, def.maxLength ?? 400);
    if (def.enum && !def.enum.includes(s)) {
      throw new ToolArgError(
        `${toolName}: "${key}" must be one of ${def.enum.join(', ')} (got "${s}")`
      );
    }
    out[key] = s;
  }

  return { args: out, notes };
}

/** Render a tool's argument spec for the planner prompt. */
export function describeArgs(spec: Record<string, ArgSpec>): string {
  const entries = Object.entries(spec);
  if (!entries.length) return '{}';
  return `{ ${entries
    .map(([k, d]) => {
      const bits: string[] = [d.type];
      if (d.required) bits.push('required');
      if (d.enum) bits.push(d.enum.join('|'));
      if (d.min !== undefined || d.max !== undefined) bits.push(`${d.min ?? '-inf'}..${d.max ?? 'inf'}`);
      return `${k}: ${bits.join(', ')}`;
    })
    .join('; ')} }`;
}
