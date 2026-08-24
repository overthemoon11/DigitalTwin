/**
 * Numeric guard.
 *
 * Every plant figure in an answer must have come from a tool. This checks that
 * after the fact: it pulls figures carrying a plant unit out of the generated
 * text and looks for each one in the corpus the model was given.
 *
 * It is a detector, not a filter. Deleting a sentence from a model's answer
 * usually produces a worse answer than the original, and silently rewriting
 * output is its own kind of dishonesty. What this does instead is report — the
 * response carries `unverifiedFigures`, the panel can show a caveat, and a
 * pattern of them is a signal that the prompt or the facts payload is wrong.
 *
 * Textbook figures are excluded deliberately. "Typically 1.5–3% per Kelvin" is
 * general HVAC knowledge, and the hedging words in front of it are the
 * distinguishing feature — a claim about this plant does not say "roughly, in
 * general".
 */

/** Units that make a figure a claim about a plant rather than a number. */
const PLANT_UNIT = String.raw`(?:kW\/RT|kW\s*per\s*RT|kWh|kW|RT|tons?|°\s*C|degC|deg\s*C|\bC\b|\bK\b|psi|kPa|L\/s|%)`;
// Thousands separators are part of the number. Without this, "1,815 kW" is
// read as the figure "815 kW", which is not in the facts and is then reported
// as a fabrication — the guard's own false positive.
const FIGURE = new RegExp(String.raw`(-?\d[\d,]*(?:\.\d+)?)\s*(${PLANT_UNIT})`, 'gi');

/** A figure inside one of these clauses is general knowledge, not a reading. */
const HEDGE = /\b(typical\w*|generally|usually|commonly|roughly|approximately|about|around|rule of thumb|in general|order of|on the order|often|tends? to|can be|might be|for example|e\.g\.)\b/i;

/** Numbers that carry no plant meaning on their own. */
const TRIVIAL = new Set([0, 1, 2, 3, 100]);

function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text).matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Rounding-tolerant membership: 1806.3 covers "1806", "1,806" and "1810". */
function isPresent(value: number, corpus: number[]): boolean {
  const tolerance = Math.max(0.05, Math.abs(value) * 0.006);
  for (const c of corpus) {
    if (Math.abs(c - value) <= tolerance) return true;
    // A rounded quote of a longer number is still that number.
    for (const dp of [0, 1, 2, 3]) {
      const f = 10 ** dp;
      if (Math.round(c * f) / f === value) return true;
    }
    // Thousands quoted in kW as "1.8" of a "1806" — reject; too loose to allow.
  }
  return false;
}

export interface AuditResult {
  /** Figures with a plant unit that are not in the corpus. */
  unverified: string[];
  /** Total plant-unit figures examined. */
  checked: number;
}

/**
 * Audit generated prose against the facts it was given.
 *
 * `corpus` should be `BuiltContext.verifiableText` — the pruned tool payloads,
 * the knowledge excerpts, the operator's message and the recent transcript.
 */
export function auditNumericClaims(answer: string, corpus: string): AuditResult {
  const text = String(answer ?? '');
  if (!text.trim()) return { unverified: [], checked: 0 };
  const corpusNumbers = numbersIn(corpus);
  const sentences = text.split(/(?<=[.!?;:\n])\s+/);

  const unverified: string[] = [];
  let checked = 0;

  for (const sentence of sentences) {
    const hedged = HEDGE.test(sentence);
    for (const m of sentence.matchAll(FIGURE)) {
      const value = Number(m[1].replace(/,/g, ''));
      if (!Number.isFinite(value)) continue;
      const unit = m[2].replace(/\s+/g, '');
      // A bare "3 C" style integer is as likely to be a count as a reading.
      if (TRIVIAL.has(Math.abs(value)) && unit !== 'kW' && unit !== 'RT') continue;
      checked++;
      if (hedged) continue;
      if (isPresent(value, corpusNumbers)) continue;
      const label = `${m[1]} ${m[2].trim()}`;
      if (!unverified.includes(label)) unverified.push(label);
    }
  }

  return { unverified: unverified.slice(0, 8), checked };
}

/**
 * Quantified saving and cost claims about this plant.
 *
 * These are the sentences the brief singles out — "Increasing CHWST to 8.5 °C
 * will save this plant 8%" — and they are the most damaging thing an assistant
 * can get wrong, because they are exactly what someone will act on.
 *
 * The test is not "did a saving tool run"; a saving tool running does not make
 * an arbitrary percentage true. It is "is this specific figure one a tool
 * produced". Anything else is refused and the verified answer is published
 * instead.
 */
const SAVING_CLAIM = /\b(?:will|would|can|could|should)\s+(?:save|reduce|cut)\b[^.]{0,60}?(-?\d[\d,]*(?:\.\d+)?)\s*(%|percent|kW|kWh)/gi;
const CURRENCY = /[$£€]\s?(-?\d[\d,]*(?:\.\d+)?)/g;

/**
 * True when the answer quantifies a saving or a cost this plant's tools never
 * produced. `corpus` is the same verifiable text the numeric audit uses.
 */
export function claimsUnbackedSaving(answer: string, corpus: string): boolean {
  const text = String(answer ?? '');
  const corpusNumbers = numbersIn(corpus);

  for (const m of text.matchAll(SAVING_CLAIM)) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && !isPresent(value, corpusNumbers)) return true;
  }
  // Money never comes out of this stack at all, so any currency figure is
  // fabricated by construction unless the operator supplied it.
  for (const m of text.matchAll(CURRENCY)) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && !isPresent(value, corpusNumbers)) return true;
  }
  return false;
}
