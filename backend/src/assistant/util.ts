/**
 * Formatting and number helpers shared by the tools and the answer composer.
 *
 * Rounding lives here rather than at each call site so a figure quoted in an
 * answer is the same figure the tool returned — the numeric audit in
 * `guard.ts` compares the two, and a stray `toFixed` elsewhere would make a
 * real number look fabricated.
 */

export function round(value: unknown, dp = 2): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Thousands separators, fixed decimals, nothing else. */
export function fmt(value: unknown, dp = 0): string {
  const n = round(value, dp);
  if (n === null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pct(value: unknown, dp = 1): string {
  const n = round(value, dp);
  return n === null ? '—' : `${n > 0 ? '+' : ''}${n}%`;
}

/** `7.5 → 8.2 °C` with the arrow the panel already renders. */
export function arrow(before: unknown, after: unknown, unit = '', dp = 1): string {
  return `${fmt(before, dp)} → ${fmt(after, dp)}${unit ? ` ${unit}` : ''}`;
}

const PSI_PER_KPA = 6.894757;
export function psiToKpa(psi: unknown): number | null {
  return isNum(psi) ? round(psi * PSI_PER_KPA, 1) : null;
}
export function kpaToPsi(kpa: unknown): number | null {
  return isNum(kpa) ? round(kpa / PSI_PER_KPA, 2) : null;
}

/** Percentage change from `a` to `b`, positive meaning `b` is larger. */
export function deltaPct(a: unknown, b: unknown, dp = 1): number | null {
  if (!isNum(a) || !isNum(b) || a === 0) return null;
  return round(((b - a) / a) * 100, dp);
}

/** Short id that reads in a log. Not a UUID — nothing here needs one. */
let counter = 0;
export function shortId(prefix: string): string {
  counter = (counter + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
