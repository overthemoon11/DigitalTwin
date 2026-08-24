/**
 * Knowledge retrieval for the assistant.
 *
 * A deliberately small, dependency-free RAG layer. The interface is the point:
 * a `KnowledgeSource` produces documents, the ranker scores them lexically, and
 * `searchKnowledgeBase` is all the rest of the assistant knows. Adding chiller
 * manuals, control sequences of operation, commissioning reports or site SOPs
 * later is `registerKnowledgeSource(...)` and nothing else — no call site moves,
 * and swapping the ranker for embeddings is one function.
 *
 * Two sources ship: a curated HVAC glossary (so "what is kW/RT" is answerable
 * with no model and no corpus) and the project's own `docs/` tree (so questions
 * about THIS plant's model, calibration and MPC are answered from what was
 * actually written about it, not from the model's memory of chiller plants in
 * general).
 *
 * Scoring is BM25-ish: term frequency saturating, inverse document frequency,
 * length normalisation, plus an explicit boost for a term appearing in a title
 * or tag. It is not a vector index and does not pretend to be — but it does
 * make "why increase chwst" find the CHWST reset entry, which is the job.
 */

export interface KnowledgeDocument {
  id: string;
  title: string;
  /** Which source produced it, for attribution in an answer. */
  source: string;
  /** glossary | mpc | digital-twin | controls | bms | operations | … */
  category: string;
  text: string;
  tags: string[];
  /** Where a human can read the whole thing. */
  ref?: string;
  /**
   * Score multiplier, default 1.
   *
   * Not all documents are equally worth returning for the same score. A
   * glossary entry was written to answer a question; a section of a document
   * about the ETS station that happens to mention CHWS was not. Without this,
   * "what is CHWST" returns a table from another subsystem, which is a correct
   * lexical match and a wrong answer.
   */
  weight?: number;
}

export interface KnowledgeSource {
  readonly name: string;
  readonly kind: string;
  /** False when the underlying corpus is not present on this machine. */
  available(): boolean;
  /** Cached by the source itself; the registry calls this on every search. */
  documents(): KnowledgeDocument[];
}

export interface KnowledgeHit {
  id: string;
  title: string;
  source: string;
  category: string;
  ref?: string;
  score: number;
  /** The part of the document that matched, trimmed for a prompt. */
  excerpt: string;
}

const sources: KnowledgeSource[] = [];

export function registerKnowledgeSource(source: KnowledgeSource): void {
  const existing = sources.findIndex((s) => s.name === source.name);
  if (existing >= 0) sources.splice(existing, 1, source);
  else sources.push(source);
  index = null;
}

export function knowledgeSources(): Array<{ name: string; kind: string; available: boolean; documents: number }> {
  return sources.map((s) => ({
    name: s.name,
    kind: s.kind,
    available: s.available(),
    documents: s.available() ? s.documents().length : 0,
  }));
}

/* ─────────────────────────────────────────────────────────────── ranking ── */

/** Words that carry no retrieval signal in an HVAC question. */
const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'my', 'our', 'it', 'this', 'that', 'what', 'why', 'how', 'do', 'does', 'did', 'can', 'should',
  'would', 'i', 'we', 'you', 'me', 'so', 'if', 'at', 'by', 'with', 'from', 'about', 'there', 'any',
  'not', 'no', 'yes', 'please', 'tell', 'explain', 'mean', 'means',
]);

/** Domain synonyms folded to one term, so wording does not decide retrieval. */
const SYNONYM: Record<string, string> = {
  chws: 'chwst', chwsp: 'chwst', 'chw-st': 'chwst', supplytemp: 'chwst',
  chwr: 'chwrt', 'chw-rt': 'chwrt', returntemp: 'chwrt',
  kwrt: 'kwperrt', 'kw/rt': 'kwperrt', kwperton: 'kwperrt', efficiency: 'kwperrt',
  wb: 'wetbulb', 'wet-bulb': 'wetbulb', wbt: 'wetbulb',
  db: 'drybulb', oat: 'drybulb', ambient: 'drybulb', outdoor: 'drybulb',
  dp: 'differentialpressure', deltap: 'differentialpressure',
  ct: 'coolingtower', tower: 'coolingtower',
  chwp: 'chilledwaterpump', cwp: 'condenserwaterpump',
  plr: 'partload', partloadratio: 'partload',
  mpc: 'mpc', optimiser: 'optimizer', optimisation: 'optimization', optimise: 'optimize',
  power: 'kw', consumption: 'kw', energy: 'kw',
  staging: 'staging', stage: 'staging', sequencing: 'staging',
};

export function tokenize(text: string): string[] {
  const raw = String(text)
    .toLowerCase()
    // Keep kW/RT and °C-ish tokens meaningful before punctuation is stripped.
    .replace(/kw\s*\/\s*rt/g, ' kwperrt ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const out: string[] = [];
  for (const word of raw) {
    if (STOP.has(word) || word.length < 2) continue;
    const folded = SYNONYM[word] ?? word;
    out.push(folded);
    // A crude singular fold beats a stemmer's dependency for this vocabulary.
    if (folded.endsWith('s') && folded.length > 3) out.push(folded.slice(0, -1));
  }
  return out;
}

interface IndexedDoc {
  doc: KnowledgeDocument;
  terms: Map<string, number>;
  titleTerms: Set<string>;
  /**
   * The subject of the title — everything before the em dash.
   *
   * "CHWST" and "CHWST reset" both match the query "what is CHWST", and both
   * are correct matches. The one whose subject IS the query is the answer; the
   * other is the follow-up. Comparing the query against this set, rather than
   * against the whole title, is what tells them apart.
   */
  headTerms: string[];
  length: number;
}

let index: { docs: IndexedDoc[]; df: Map<string, number>; avgLen: number } | null = null;

function buildIndex() {
  const docs: IndexedDoc[] = [];
  for (const source of sources) {
    if (!source.available()) continue;
    for (const doc of source.documents()) {
      const bodyTerms = tokenize(doc.text);
      const titleTerms = tokenize(`${doc.title} ${doc.tags.join(' ')}`);
      const headTerms = tokenize(doc.title.split(/\s+[—–-]\s+/)[0] ?? doc.title);
      const terms = new Map<string, number>();
      for (const t of bodyTerms) terms.set(t, (terms.get(t) ?? 0) + 1);
      // Title and tag terms count extra rather than being a separate field.
      for (const t of titleTerms) terms.set(t, (terms.get(t) ?? 0) + 3);
      docs.push({
        doc,
        terms,
        titleTerms: new Set(titleTerms),
        headTerms: [...new Set(headTerms)],
        length: bodyTerms.length || 1,
      });
    }
  }
  const df = new Map<string, number>();
  for (const d of docs) for (const term of d.terms.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const avgLen = docs.length ? docs.reduce((a, d) => a + d.length, 0) / docs.length : 1;
  index = { docs, df, avgLen };
  return index;
}

/** Drop the index so the next search rebuilds it. Used after registration. */
export function invalidateKnowledgeIndex(): void {
  index = null;
}

const K1 = 1.4;
const B = 0.7;

function excerptFor(doc: KnowledgeDocument, queryTerms: Set<string>, maxChars: number): string {
  const paragraphs = doc.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return doc.text.slice(0, maxChars);
  const scored = paragraphs.map((p) => {
    const terms = new Set(tokenize(p));
    let hits = 0;
    for (const t of queryTerms) if (terms.has(t)) hits++;
    return { p, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const out: string[] = [];
  let used = 0;
  for (const { p, hits } of scored) {
    if (hits === 0 && out.length) break;
    if (used + p.length > maxChars && out.length) break;
    out.push(p);
    used += p.length;
  }
  return (out.length ? out.join('\n\n') : paragraphs[0]).slice(0, maxChars);
}

export interface SearchOptions {
  limit?: number;
  category?: string;
  /** Characters of excerpt per hit. Keep small — this goes into a prompt. */
  excerptChars?: number;
  /** Below this, a hit is noise and is dropped rather than padded in. */
  minScore?: number;
}

/**
 * Rank the knowledge base against a natural-language query.
 *
 * Returns `[]` rather than a weak guess when nothing scores — an answer built
 * on an irrelevant document is worse than an answer built on none.
 */
export function searchKnowledgeBase(query: string, options: SearchOptions = {}): KnowledgeHit[] {
  const idx = index ?? buildIndex();
  const limit = options.limit ?? 4;
  const excerptChars = options.excerptChars ?? 700;
  const minScore = options.minScore ?? 1.2;

  const queryTerms = tokenize(query);
  if (!queryTerms.length || !idx.docs.length) return [];
  const unique = [...new Set(queryTerms)];
  const querySet = new Set(unique);

  const N = idx.docs.length;
  /*
   * A multi-term query must match on more than one term.
   *
   * "quarterly revenue forecast for the sales team" shares exactly one word
   * with the MPC documentation, and BM25 will happily rank that document. One
   * incidental term is a coincidence, not a match, and returning it would put
   * an irrelevant excerpt into the prompt as though it were relevant.
   */
  const minTerms = unique.length >= 3 ? 2 : 1;
  const scored = idx.docs.map((d) => {
    let score = 0;
    let matchedTerms = 0;
    for (const term of unique) {
      const tf = d.terms.get(term);
      if (!tf) continue;
      matchedTerms++;
      const df = idx.df.get(term) ?? 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (d.length / idx.avgLen)));
      score += idf * norm;
      if (d.titleTerms.has(term)) score += idf * 0.6;
    }
    // Subject match: full marks when the title's subject is exactly what was
    // asked about, tapering as the subject carries extra words the query did
    // not mention. Keeps "what is CHWST" on the CHWST entry rather than on the
    // CHWST-reset entry, which mentions the term more often.
    if (d.headTerms.length) {
      const matched = d.headTerms.filter((t) => querySet.has(t)).length;
      if (matched) score += (2.2 * matched) / (1 + d.headTerms.length - matched);
    }
    if (matchedTerms < minTerms) return { d, score: 0 };
    return { d, score: score * (d.doc.weight ?? 1) };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .filter((s) => !options.category || s.d.doc.category === options.category)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({
      id: d.doc.id,
      title: d.doc.title,
      source: d.doc.source,
      category: d.doc.category,
      ref: d.doc.ref,
      score: Math.round(score * 100) / 100,
      excerpt: excerptFor(d.doc, querySet, excerptChars),
    }));
}

/** Exact-ish lookup by id or title, for "define X" style routing. */
export function getKnowledgeDocument(id: string): KnowledgeDocument | null {
  const idx = index ?? buildIndex();
  const key = id.toLowerCase();
  return (
    idx.docs.find((d) => d.doc.id.toLowerCase() === key)?.doc ??
    idx.docs.find((d) => d.doc.title.toLowerCase() === key)?.doc ??
    null
  );
}
