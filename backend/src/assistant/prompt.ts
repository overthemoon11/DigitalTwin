/**
 * Prompt construction.
 *
 * The model is given three things and no latitude about them: the facts a tool
 * returned, a draft answer the composer already wrote from those facts, and a
 * rule that it may not introduce a number that is not in the facts.
 *
 * Handing over a draft rather than raw JSON is the choice that matters. A model
 * asked to derive a conclusion from a state dump will reach for its priors when
 * the dump is thin; a model asked to rewrite a correct draft in better prose
 * has nothing to invent. The draft is also what ships when the model is down,
 * so the two paths cannot diverge in substance — only in phrasing.
 */
import type { AIMessage } from './providers/index';
import type { BuiltContext } from './context';
import type { Classification } from './intent';
import type { AssistantPageContext, ConversationTurn } from './types';

const IDENTITY = `You are the Plant AI Assistant for the T1 chilled-water plant: five 1250 RT water-cooled centrifugal chillers, six CHW pumps, six CW pumps, five cooling towers, with a calibrated Digital Twin and a whole-plant model-predictive controller behind you.

You speak to plant operators and engineers. Be direct and concrete. Lead with the answer.`;

const RULES = `RULES — these are not style preferences.

1. Every number you state about this plant must appear in FACTS. Never estimate, interpolate or recall a plant value. If FACTS does not contain it, say you do not have that measurement and name what would be needed.
2. General HVAC knowledge is welcome and needs no data — but keep it visibly separate from claims about this plant. "Raising CHWST typically reduces chiller power" is fine. "Raising CHWST will save this plant 8%" is only allowed if a tool produced that figure.
3. Never present a simulated or predicted value as measured. FACTS come from a Digital Twin and an MPC solver, not from field instruments.
4. Never claim to have changed anything. Setpoint changes are proposals awaiting operator confirmation.
5. If FACTS carry caveats — unequal cooling delivered, an operating point outside the calibration envelope, a solver fallback, unmet load — state them. Do not soften or omit them.
6. Do not print a menu of commands, and do not tell the operator to phrase things differently. Answer what was asked.

STYLE
- Short paragraphs or a tight list. No preamble, no "great question".
- Markdown: "## " for a section, "- **Label:** value" for a fact row, "> " for a caveat.
- Use the units in FACTS. Do not convert unless asked.
- Simple questions get short answers. Do not pad a one-line answer into a report.`;

export interface PromptInput {
  message: string;
  classification: Classification;
  context: BuiltContext;
  /** The composer's grounded answer, used as the draft. */
  draft: string;
  history: ConversationTurn[];
  page?: AssistantPageContext;
}

/** The prose-writing call. */
export function buildAnswerPrompt(input: PromptInput): AIMessage[] {
  const { message, classification, context, draft, history, page } = input;

  const situation: string[] = [];
  situation.push(`Question type: ${classification.intent}.`);
  if (classification.topics.length) situation.push(`Subject: ${classification.topics.join(', ')}.`);
  if (classification.usedConversationContext) {
    situation.push('This is a follow-up — the subject was carried over from the previous turn.');
  }
  if (page?.page) situation.push(`The operator is on the "${page.page}" workspace.`);
  if (page?.selectedEquipment) situation.push(`They have ${page.selectedEquipment} selected in the schematic.`);
  if (context.missing.length) {
    situation.push(
      `These tools failed and their data is NOT available: ${context.missing.map((m) => `${m.tool} (${m.error})`).join('; ')}. Say so rather than filling the gap.`
    );
  }

  const knowledge = context.knowledge.length
    ? `\n\nKNOWLEDGE BASE (general HVAC / this project's documentation — not measurements)\n${context.knowledge
        .map((k) => `[${k.title}]\n${k.excerpt}`)
        .join('\n\n')}`
    : '';

  const facts = context.factsText
    ? `\n\nFACTS (from the Digital Twin and the MPC solver — the ONLY source of plant numbers)\n${context.factsText}`
    : '\n\nFACTS\n(none — no plant data was retrieved for this turn)';

  const system = [IDENTITY, RULES].join('\n\n');
  const user = [
    situation.join(' '),
    facts,
    knowledge,
    `\n\nGROUNDED DRAFT (written from FACTS; correct but plain — rewrite it as your answer, keep every figure and every caveat, drop anything the operator did not ask for)\n${draft}`,
    `\n\nOPERATOR: ${message}`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    ...history
      .slice(-6)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }) as AIMessage),
    { role: 'user', content: user },
  ];
}

/** Rough token budget guard — vLLM will refuse an over-long context. */
export function promptSize(messages: AIMessage[]): number {
  return messages.reduce((a, m) => a + m.content.length, 0);
}
