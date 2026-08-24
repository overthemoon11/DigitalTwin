/**
 * Conversation memory.
 *
 * "What if I increase CHWP speed?" is only answerable because the turn before
 * it established what we were talking about. This holds that — the transcript
 * for the model, plus the classified topics and the headline facts of each
 * assistant turn so the router can resolve a subject-less follow-up without
 * re-reading the prose.
 *
 * In memory and capped, because that is what a conversation is. Nothing here is
 * durable and nothing here is a record: a restart forgets, which is correct for
 * chat state and would be wrong for anything else.
 */
import type { ConversationTurn, ProposedAction } from './types';
import { shortId } from './util';

/** Turns kept per conversation. Six exchanges is more than any follow-up needs. */
const MAX_TURNS = 24;
/** Conversations kept in memory at once. */
const MAX_CONVERSATIONS = 200;
/** Idle lifetime. */
const TTL_MS = 6 * 60 * 60 * 1000;
/** How long a proposed control change stays confirmable. */
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

interface Conversation {
  id: string;
  turns: ConversationTurn[];
  /** Control changes awaiting confirmation, by id. */
  proposals: Map<string, ProposedAction>;
  createdAt: number;
  updatedAt: number;
}

const store = new Map<string, Conversation>();

function evictStale(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, c] of store) {
    if (c.updatedAt < cutoff) store.delete(id);
  }
  if (store.size > MAX_CONVERSATIONS) {
    const oldest = [...store.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    for (const c of oldest.slice(0, store.size - MAX_CONVERSATIONS)) store.delete(c.id);
  }
}

export function getOrCreateConversation(id?: string): Conversation {
  evictStale();
  if (id && store.has(id)) {
    const existing = store.get(id)!;
    existing.updatedAt = Date.now();
    return existing;
  }
  const conversation: Conversation = {
    id: id && /^[\w-]{1,64}$/.test(id) ? id : shortId('conv'),
    turns: [],
    proposals: new Map(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(conversation.id, conversation);
  return conversation;
}

export function appendTurn(conversation: Conversation, turn: ConversationTurn): void {
  conversation.turns.push(turn);
  if (conversation.turns.length > MAX_TURNS) {
    conversation.turns.splice(0, conversation.turns.length - MAX_TURNS);
  }
  conversation.updatedAt = Date.now();
}

export function history(conversation: Conversation): ConversationTurn[] {
  return conversation.turns;
}

export function rememberProposal(conversation: Conversation, action: ProposedAction): void {
  // One pending proposal per control set is plenty; drop anything expired.
  const cutoff = Date.now() - PROPOSAL_TTL_MS;
  for (const [id, p] of conversation.proposals) {
    if (p.createdAt < cutoff) conversation.proposals.delete(id);
  }
  conversation.proposals.set(action.id, action);
  conversation.updatedAt = Date.now();
}

export function takeProposal(conversationId: string, actionId: string): ProposedAction | null {
  const conversation = store.get(conversationId);
  if (!conversation) return null;
  const action = conversation.proposals.get(actionId);
  if (!action) return null;
  if (Date.now() - action.createdAt > PROPOSAL_TTL_MS) {
    conversation.proposals.delete(actionId);
    return null;
  }
  // Single use: a confirmation must not be replayable.
  conversation.proposals.delete(actionId);
  return action;
}

export function pendingProposals(conversation: Conversation): ProposedAction[] {
  return [...conversation.proposals.values()];
}

export function clearConversation(id: string): boolean {
  return store.delete(id);
}

/** Test hook. */
export function resetConversations(): void {
  store.clear();
}

export function conversationCount(): number {
  return store.size;
}

export type { Conversation };
