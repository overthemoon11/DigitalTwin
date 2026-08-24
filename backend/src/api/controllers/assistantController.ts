/**
 * HTTP surface of the Plant AI Assistant.
 *
 * Three jobs and no domain logic: coerce an untrusted body, call the assistant,
 * serialise the reply. Every decision about tools, context and grounding lives
 * behind `assistant/index.ts` — a route handler that knew which tool to call
 * would be the frontend's intent parser moved one layer down.
 *
 * The streaming endpoint is the exception to the thin-handler shape, because
 * SSE needs the raw response object. It still delegates the whole turn.
 */
import {
  assistantCapabilities,
  assistantStatus,
  chat,
  confirmAction,
  forgetConversation,
  type AssistantChatRequest,
  type AssistantPageContext,
} from '../../assistant/index';
import { ApiError } from './simulationController';

const MAX_MESSAGE_CHARS = 2000;
const PAGE_KEYS = ['page', 'selectedEquipment', 'system', 'currentMpcRunId'] as const;

/**
 * Only four context keys are accepted, each a short string.
 *
 * The frontend must not be able to push arbitrary application state into a
 * prompt: it is the largest, least reviewable input surface an assistant has,
 * and most of what a UI holds is irrelevant to the plant anyway.
 */
function coerceContext(raw: unknown): AssistantPageContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of PAGE_KEYS) {
    const value = src[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 64);
  }
  return Object.keys(out).length ? (out as AssistantPageContext) : undefined;
}

function coerceRequest(body: any): AssistantChatRequest {
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    throw new ApiError(400, '`message` is required');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new ApiError(400, `\`message\` is limited to ${MAX_MESSAGE_CHARS} characters`);
  }
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.slice(0, 64) : undefined;
  return { message: message.trim(), conversationId, context: coerceContext(body?.context) };
}

/** POST /api/assistant/chat */
export async function assistantChat(body: any) {
  return chat(coerceRequest(body));
}

/**
 * POST /api/assistant/chat/stream — Server-Sent Events.
 *
 * Four event types, in order: `stage` for each tool as it starts, `delta` for
 * generated text, `final` with the complete payload, `error` if the turn threw.
 * A client that ignores `delta` and waits for `final` gets exactly the
 * non-streaming response, which is what makes the fallback trivial.
 */
export async function assistantChatStream(req: any, res: any): Promise<void> {
  let request: AssistantChatRequest;
  try {
    request = coerceRequest(req.body ?? {});
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'bad request' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Without this an nginx in front of the app buffers the whole stream.
    'X-Accel-Buffering': 'no',
  });

  // Listen on the RESPONSE, not the request. In Node 16+ an IncomingMessage
  // emits 'close' as soon as its body has been read and the stream destroyed —
  // which `express.json()` does before this handler even runs — so a
  // `req.on('close')` guard suppresses every write and the client hangs until
  // it times out. `res` closes when the client actually goes away.
  let closed = false;
  res.on('close', () => { closed = true; });

  const send = (event: string, data: unknown) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Headers are only flushed with the first body write; an explicit flush
    // keeps a slow first tool from holding the whole stream in a buffer.
    res.flush?.();
  };

  // An immediate comment frame opens the stream, so the client knows it is
  // connected before the first tool has even started.
  res.write(': connected\n\n');

  try {
    const result = await chat(request, {
      onStage: (stage) => send('stage', stage),
      onDelta: (text) => send('delta', { text }),
    });
    send('final', result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assistant failed';
    console.error('[assistant] stream failed:', err);
    send('error', { error: message });
  } finally {
    if (!res.writableEnded) res.end();
  }
}

/** GET /api/assistant/status */
export async function getAssistantStatus() {
  return assistantStatus();
}

/** GET /api/assistant/tools — the allowlist, for inspection and documentation. */
export function getAssistantTools() {
  return assistantCapabilities();
}

/**
 * POST /api/assistant/action/confirm
 *
 * The only assistant route that can move the plant, and it moves it only onto a
 * control state a previous turn proposed and a human just approved.
 */
export async function postAssistantConfirm(body: any) {
  const conversationId = body?.conversationId;
  const actionId = body?.actionId;
  if (typeof conversationId !== 'string' || !conversationId) {
    throw new ApiError(400, '`conversationId` is required');
  }
  if (typeof actionId !== 'string' || !actionId) {
    throw new ApiError(400, '`actionId` is required');
  }
  return confirmAction(conversationId.slice(0, 64), actionId.slice(0, 64));
}

/** POST /api/assistant/conversation/clear */
export function postAssistantClear(body: any) {
  const conversationId = body?.conversationId;
  if (typeof conversationId !== 'string' || !conversationId) {
    throw new ApiError(400, '`conversationId` is required');
  }
  return { cleared: forgetConversation(conversationId.slice(0, 64)) };
}
