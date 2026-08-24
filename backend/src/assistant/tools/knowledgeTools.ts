/**
 * Knowledge-base tool.
 *
 * The one place the retrieval layer is exposed to the agent. Registering the
 * shipped sources happens here, at import time, so the registry is populated
 * before any search runs and a new source only needs one line added.
 */
import { knowledgeSources, registerKnowledgeSource, searchKnowledgeBase } from '../knowledge/index';
import { glossarySource } from '../knowledge/hvacGlossary';
import { projectDocsSource } from '../knowledge/docsSource';
import type { ToolDefinition } from '../types';

registerKnowledgeSource(glossarySource);
registerKnowledgeSource(projectDocsSource);

export function searchKnowledge(args: { query: string; limit?: number; category?: string }) {
  const hits = searchKnowledgeBase(args.query, {
    limit: args.limit ?? 4,
    category: args.category,
  });
  return {
    query: args.query,
    hits,
    /** Saying "nothing matched" is a real answer and must not be padded. */
    found: hits.length,
    sources: knowledgeSources(),
  };
}

export const KNOWLEDGE_TOOLS: ToolDefinition[] = [
  {
    name: 'searchKnowledgeBase',
    kind: 'read',
    sourceType: 'KNOWLEDGE_BASE',
    description:
      'Search the HVAC glossary and this project\'s documentation (plant controls and physics, BMS point mapping, twin calibration, MPC integration). Use for concept questions and for anything specific to how THIS plant is modelled.',
    args: {
      query: { type: 'string', required: true, maxLength: 300, description: 'Natural-language query' },
      limit: { type: 'number', min: 1, max: 8, default: 4, description: 'Maximum documents' },
      category: {
        type: 'string',
        enum: ['glossary', 'controls', 'mpc', 'digital-twin', 'bms', 'operations'],
        description: 'Restrict to one category',
      },
    },
    costMs: 15,
    run: (a) => searchKnowledge(a as any),
  },
];
