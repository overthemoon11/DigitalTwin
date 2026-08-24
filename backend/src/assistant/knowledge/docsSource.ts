/**
 * The project's own documentation as a knowledge source.
 *
 * `docs/` already contains the things an operator would otherwise have to ask a
 * person: how this plant's controls and physics work, how the BMS points map,
 * how the twin was calibrated, how the MPC is wired to it. Indexing it is what
 * separates "the assistant knows about chiller plants" from "the assistant
 * knows about THIS chiller plant".
 *
 * Documents are split at heading boundaries rather than by character count, so
 * a retrieved excerpt is a section with its own title instead of a window that
 * begins mid-sentence.
 *
 * This is also the template for the sources that are not here yet — equipment
 * manuals, control sequences, commissioning reports, site SOPs. Each is a
 * directory of text and one object like this one; nothing else in the assistant
 * changes when they arrive. Drop files into `docs/knowledge/` and they are
 * indexed automatically.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeDocument, KnowledgeSource } from './index';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const DOCS = join(REPO, 'docs');
/** Optional drop-box for manuals, SOPs and sequences. Absent by default. */
const EXTRA = join(DOCS, 'knowledge');

/** Which doc belongs to which category, for filtered retrieval. */
const CATEGORY: Record<string, string> = {
  'chiller-plant-controls-and-physics.md': 'controls',
  'physics-formulas-reference.md': 'controls',
  'mpc-digital-twin-integration.md': 'mpc',
  'virtual-plant-simulator.md': 'digital-twin',
  'architecture.md': 'digital-twin',
  'bms-data-mapping.md': 'bms',
  'ahu-controls-and-physics.md': 'controls',
  'ets-controls-and-physics.md': 'controls',
  'demo-script.md': 'operations',
};

/** Docs about the repository rather than the plant. Not useful to an operator. */
const SKIP = new Set(['blender-mcp-pipeline.md', 'ui-redesign-migration.md']);

/**
 * Relevance weight per document.
 *
 * The AHU and ETS documents describe other subsystems. They share vocabulary
 * with the chiller plant — CHWS, setpoint, approach — so they match well
 * lexically and answer badly. Down-weighting keeps them reachable for a
 * question that is genuinely about them without letting them win a chiller
 * question on a shared term.
 */
const WEIGHT: Record<string, number> = {
  'ahu-controls-and-physics.md': 0.45,
  'ets-controls-and-physics.md': 0.45,
  'demo-script.md': 0.6,
};

const MIN_SECTION_CHARS = 120;
const MAX_SECTION_CHARS = 3500;

interface Section {
  title: string;
  text: string;
}

/**
 * Split Markdown into sections at `##`/`###` headings.
 *
 * Runs of code fences are kept with their section but stripped of the fence
 * markers, and tables are kept verbatim — a BMS point table is often exactly
 * the answer.
 */
function splitSections(markdown: string, docTitle: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let title = docTitle;
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text.length >= MIN_SECTION_CHARS) {
      sections.push({ title, text: text.slice(0, MAX_SECTION_CHARS) });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#{1,3}\s+/.test(line)) {
      flush();
      title = `${docTitle} — ${line.replace(/^#+\s+/, '').trim()}`;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function titleOf(file: string): string {
  return file
    .replace(extname(file), '')
    .split('-')
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => ['.md', '.txt'].includes(extname(f).toLowerCase()))
      .filter((f) => statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
}

let cache: KnowledgeDocument[] | null = null;

function build(): KnowledgeDocument[] {
  const documents: KnowledgeDocument[] = [];

  const ingest = (dir: string, defaultCategory: string, sourceLabel: string) => {
    for (const file of listMarkdown(dir)) {
      if (SKIP.has(file)) continue;
      let raw: string;
      try {
        raw = readFileSync(join(dir, file), 'utf8');
      } catch {
        continue;
      }
      const docTitle = titleOf(file);
      const category = CATEGORY[file] ?? defaultCategory;
      splitSections(raw, docTitle).forEach((section, i) => {
        documents.push({
          id: `${sourceLabel}:${file}#${i}`,
          title: section.title,
          source: sourceLabel,
          category,
          text: section.text,
          tags: [category, docTitle.toLowerCase()],
          weight: WEIGHT[file] ?? 1,
          ref: `docs/${file}`,
        });
      });
    }
  };

  ingest(DOCS, 'digital-twin', 'Project documentation');
  ingest(EXTRA, 'operations', 'Site knowledge base');
  return documents;
}

export const projectDocsSource: KnowledgeSource = {
  name: 'Project documentation',
  kind: 'docs',
  available: () => existsSync(DOCS),
  documents(): KnowledgeDocument[] {
    if (!cache) cache = build();
    return cache;
  },
};

/** Test / dev hook: forget the parsed corpus. */
export function clearDocsCache(): void {
  cache = null;
}
