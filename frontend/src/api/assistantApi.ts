/**
 * Client for the Plant AI Assistant.
 *
 * The assistant is a backend service; this file knows its wire format and
 * nothing about plants. No component may call these endpoints with `fetch`
 * directly — that is the same rule the rest of `api/` follows, and it is what
 * keeps the streaming protocol in one place.
 *
 * `streamChat` degrades on purpose: a caller that only implements `onFinal`
 * gets exactly the non-streaming response, and if the stream endpoint is
 * missing or the browser cannot read the body, `sendChat` is the fallback.
 */
import { get, post } from './client';

export type AssistantSourceType =
  | 'LIVE_BMS'
  | 'DIGITAL_TWIN'
  | 'MPC_PREDICTION'
  | 'WHAT_IF_SIMULATION'
  | 'HISTORICAL_BMS'
  | 'KNOWLEDGE_BASE'
  | 'GENERAL_KNOWLEDGE'
  | 'MIXED'
  | 'NONE';

export interface AssistantBlock {
  kind: 'metric' | 'comparison' | 'warning' | 'note';
  label?: string;
  value?: string;
  unit?: string;
  note?: string;
  before?: string;
  after?: string;
  delta?: string;
  text?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface AssistantAction {
  id: string;
  label: string;
  prompt: string;
  tone?: 'primary' | 'default';
}

export interface ProposedChange {
  controlId: string;
  label: string;
  currentValue: number | string;
  proposedValue: number | string;
  unit: string;
}

export interface ProposedAction {
  id: string;
  kind: 'control-change' | 'scenario' | 'apply-mpc';
  label: string;
  changes: ProposedChange[];
  expectedEffect: Array<{ label: string; before: string; after: string; delta?: string }>;
  warnings: string[];
}

export interface AssistantReply {
  conversationId: string;
  message: string;
  sourceType: AssistantSourceType;
  sources: Array<{ tool: string; sourceType: AssistantSourceType }>;
  toolsUsed: string[];
  toolErrors: Array<{ tool: string; error: string }>;
  blocks: AssistantBlock[];
  actions: AssistantAction[];
  proposedActions: ProposedAction[];
  warnings: string[];
  intent: string;
  answeredBy: 'llm' | 'composer';
  unverifiedFigures: string[];
  latencyMs: number;
}

export interface AssistantStatus {
  health: 'ready' | 'degraded' | 'connecting' | 'unavailable';
  label: string;
  detail: string;
  model: {
    ready: boolean;
    status: string;
    provider: string;
    model: string;
    message: string;
    downloadProgress?: number;
  };
  toolsAvailable: number;
  toolServiceOk: boolean;
}

export interface AssistantPageContext {
  page?: string;
  selectedEquipment?: string;
  system?: string;
  currentMpcRunId?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: AssistantPageContext;
}

export function sendChat(body: ChatRequest): Promise<AssistantReply> {
  return post<AssistantReply>('/assistant/chat', body);
}

export function fetchAssistantStatus(): Promise<AssistantStatus> {
  return get<AssistantStatus>('/assistant/status');
}

export function fetchAssistantTools(): Promise<{ tools: unknown[]; knowledgeSources: unknown[] }> {
  return get('/assistant/tools');
}

export function confirmAssistantAction(conversationId: string, actionId: string) {
  return post<{
    applied: boolean;
    message: string;
    outcome?: Array<{ label: string; before: string; after: string }>;
    error?: string;
  }>('/assistant/action/confirm', { conversationId, actionId });
}

export function clearAssistantConversation(conversationId: string) {
  return post<{ cleared: boolean }>('/assistant/conversation/clear', { conversationId });
}

export interface StreamHandlers {
  /** A tool has started. Drives the "Reading plant state…" line. */
  onStage?: (stage: { tool: string; label: string }) => void;
  /** A chunk of generated prose. */
  onDelta?: (text: string) => void;
  onFinal?: (reply: AssistantReply) => void;
}

/**
 * Stream one turn over Server-Sent Events.
 *
 * Parsed by hand rather than with `EventSource`, because `EventSource` cannot
 * POST and the turn needs a body. The frame format is the standard one:
 * `event:` then `data:` then a blank line.
 */
export async function streamChat(
  body: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<AssistantReply> {
  let response: Response;
  try {
    response = await fetch('/api/assistant/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    // The backend is down, or the request was aborted. Either way there is no
    // point trying the non-streaming endpoint against the same server.
    if ((cause as Error)?.name === 'AbortError') throw cause;
    throw new Error('cannot reach the assistant — is the backend running on :3007?');
  }

  if (!response.ok || !response.body) {
    // An older backend without the stream route still has the plain one.
    const reply = await sendChat(body);
    handlers.onFinal?.(reply);
    return reply;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: AssistantReply | null = null;
  let streamError: string | null = null;

  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let payload: any;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    if (event === 'stage') handlers.onStage?.(payload);
    else if (event === 'delta') handlers.onDelta?.(payload.text ?? '');
    else if (event === 'final') final = payload as AssistantReply;
    else if (event === 'error') streamError = payload.error ?? 'assistant failed';
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf('\n\n');
    while (split >= 0) {
      handleFrame(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  if (streamError) throw new Error(streamError);
  if (!final) throw new Error('the assistant stream ended without a reply');
  handlers.onFinal?.(final);
  return final;
}
