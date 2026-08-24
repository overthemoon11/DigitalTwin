/**
 * AI provider abstraction.
 *
 * Everything above this file depends on `AIProvider` and never on an SDK. The
 * shipped adapter wraps the existing `services/llm-service.js` router, which
 * already chooses between the company vLLM endpoint and Foundry Local — so
 * swapping in another provider means writing one object with three methods and
 * calling `setAiProvider`, not editing the assistant.
 *
 * `setAiProvider` is also how the tests run the LLM path without a model: they
 * install a scripted provider and assert on what the assistant asked it.
 */
import type { SourceType } from '../types';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Health of the model behind a provider.
 *
 * `ready` is the only field the UI is allowed to turn into a green dot. The
 * panel used to print "Local model ready" unconditionally; it now prints this.
 */
export interface AIProviderStatus {
  ready: boolean;
  /** not_initialized | initializing | downloading | loading | ready | error | unavailable */
  status: string;
  provider: string;
  model: string;
  message: string;
  downloadProgress?: number;
}

export interface AIProvider {
  readonly name: string;
  status(): AIProviderStatus;
  /** Returns null when the model is unreachable — never throws for that. */
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<string | null>;
  /** Optional. When absent the service falls back to `complete`. */
  stream?(
    messages: AIMessage[],
    onDelta: (text: string) => void,
    options?: AICompletionOptions
  ): Promise<string | null>;
}

/* ─────────────────────────────────────────────────── the shipped adapter ── */

/**
 * Adapter over the repo's existing LLM router. Loaded lazily so importing the
 * assistant does not pull in the Foundry SDK or open a socket — a test that
 * only exercises tools should not need a model at all.
 */
class LlmServiceProvider implements AIProvider {
  readonly name = 'llm-service';
  private mod: any = null;
  private loading: Promise<any> | null = null;

  constructor() {
    // Start the import immediately rather than on the first question. The
    // module is what knows whether the model is up, so until it is in, every
    // status call has to answer "still starting" — which would make the header
    // say "connecting" for the whole first poll after every boot.
    void this.load();
  }

  private load(): Promise<any> {
    if (this.mod) return Promise.resolve(this.mod);
    if (!this.loading) {
      this.loading = import('../../services/llm-service.js').then((m) => {
        this.mod = m;
        return m;
      });
    }
    return this.loading;
  }

  /** Synchronous by contract: report "not initialised" until the module is in. */
  status(): AIProviderStatus {
    if (!this.mod) {
      void this.load();
      return {
        ready: false,
        status: 'not_initialized',
        provider: 'unknown',
        model: '',
        message: 'AI provider is still starting.',
      };
    }
    const s = this.mod.getStatus();
    return {
      ready: Boolean(s.ready),
      status: String(s.status ?? 'unknown'),
      provider: String(s.provider ?? 'unknown'),
      model: String(s.modelAlias ?? ''),
      message: String(s.message ?? ''),
      downloadProgress: typeof s.downloadProgress === 'number' ? s.downloadProgress : undefined,
    };
  }

  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<string | null> {
    const mod = await this.load();
    try {
      return await mod.chatCompletion(messages, options);
    } catch {
      return null;
    }
  }

  async stream(
    messages: AIMessage[],
    onDelta: (text: string) => void,
    options: AICompletionOptions = {}
  ): Promise<string | null> {
    const mod = await this.load();
    try {
      return await mod.chatCompletionStream(messages, onDelta, options);
    } catch {
      return null;
    }
  }
}

let provider: AIProvider = new LlmServiceProvider();

export function getAiProvider(): AIProvider {
  return provider;
}

/** Install another provider. Used by tests and by anyone swapping vendors. */
export function setAiProvider(next: AIProvider): void {
  provider = next;
}

/** Restore the shipped adapter. */
export function resetAiProvider(): void {
  provider = new LlmServiceProvider();
}

/**
 * Assistant-level health, which is NOT the same thing as model health.
 *
 * The tools are the part that answers plant questions, and they work with no
 * model at all. So the assistant is `degraded`, not `unavailable`, when the LLM
 * is down: it can still read the plant, run the MPC and explain a result — it
 * just writes the prose from templates instead of generating it.
 */
export type AssistantHealth = 'ready' | 'degraded' | 'connecting' | 'unavailable';

export interface AssistantStatus {
  health: AssistantHealth;
  label: string;
  detail: string;
  model: AIProviderStatus;
  toolsAvailable: number;
  /** True when plant tools answered their last self-check. */
  toolServiceOk: boolean;
}
