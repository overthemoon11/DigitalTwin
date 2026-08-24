/**
 * Public surface of the Plant AI Assistant.
 *
 * The API layer imports from here and never from a file inside the module —
 * the same rule the Digital Twin and the MPC follow, for the same reason.
 * Everything below this barrel is free to move.
 *
 * Dependency direction:
 *
 *     API  ->  Assistant  ->  { MPC, Digital Twin, BMS data, knowledge }
 *
 * The assistant depends on the plant. Nothing in the plant depends on the
 * assistant, except the two MPC entry points that record their runs so the
 * assistant can explain them — and those write to a leaf module that imports
 * nothing back.
 */
export { chat, confirmAction, assistantStatus, assistantCapabilities, forgetConversation } from './assistantService';
export type { ChatOptions, ConfirmResult } from './assistantService';

export { classify, ALL_INTENTS } from './intent';
export type { Intent, Classification, Topic } from './intent';

export { listTools, toolManifest, toolNames, runTool } from './tools/registry';
export { searchKnowledgeBase, registerKnowledgeSource, knowledgeSources } from './knowledge/index';
export type { KnowledgeSource, KnowledgeDocument, KnowledgeHit } from './knowledge/index';

export { getAiProvider, setAiProvider, resetAiProvider } from './providers/index';
export type { AIProvider, AIProviderStatus, AIMessage, AssistantStatus } from './providers/index';

export { recordSteadyStateRun, recordHorizonRun, getLastMpcRun, clearMpcMemory } from './mpcMemory';
export { recordPlantSample, clearTrends } from './trends';
export { resetConversations } from './conversation';

export type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantPageContext,
  AnswerBlock,
  ProposedAction,
  SourceType,
  SuggestedAction,
  ToolDefinition,
  ToolResult,
} from './types';
