/**
 * OpenAI-compatible remote LLM service (vLLM, Ollama, etc.)
 *
 * Configure via environment variables (backend/.env or shell):
 *   OPENAI_BASE_URL  e.g. http://10.211.9.95:8001/v1
 *   OPENAI_MODEL     e.g. unsloth/Qwen3.6-35B-A3B-NVFP4
 *   OPENAI_API_KEY   optional (many vLLM deployments accept any bearer token)
 */

function getConfig() {
  return {
    baseUrl: (process.env.OPENAI_BASE_URL || 'http://127.0.0.1:8001/v1').replace(/\/$/, ''),
    model: process.env.OPENAI_MODEL || 'unsloth/Qwen3.6-35B-A3B-NVFP4',
    apiKey: process.env.OPENAI_API_KEY || '',
    connectTimeoutMs: Number(process.env.OPENAI_CONNECT_TIMEOUT_MS || 15000),
    chatTimeoutMs: Number(process.env.OPENAI_CHAT_TIMEOUT_MS || 120000),
  };
}

const ModelStatus = {
  NOT_INITIALIZED: 'not_initialized',
  INITIALIZING: 'initializing',
  DOWNLOADING: 'downloading',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

let currentStatus = ModelStatus.NOT_INITIALIZED;
let downloadProgress = 0;
let statusMessage = 'Remote LLM not initialized';
let statusListeners = [];

function onStatusChange(listener) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

function setStatus(status, message, progress = null) {
  currentStatus = status;
  statusMessage = message;
  if (progress !== null) downloadProgress = progress;

  const update = getStatus();
  for (const listener of statusListeners) {
    try {
      listener(update);
    } catch {
      /* ignore */
    }
  }
}

function getStatus() {
  const { baseUrl, model } = getConfig();
  return {
    status: currentStatus,
    message: statusMessage,
    downloadProgress,
    modelAlias: model,
    provider: 'openai',
    baseUrl,
    ready: currentStatus === ModelStatus.READY,
  };
}

function apiHeaders() {
  const { apiKey } = getConfig();
  const headers = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const { connectTimeoutMs } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? connectTimeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify connectivity and model availability via GET /v1/models.
 */
async function initialize() {
  if (currentStatus === ModelStatus.READY || currentStatus === ModelStatus.INITIALIZING) {
    return;
  }

  const { baseUrl, model } = getConfig();
  setStatus(ModelStatus.INITIALIZING, `Connecting to remote LLM at ${baseUrl}…`);
  console.log(`[LLM] OpenAI-compatible endpoint: ${baseUrl}`);
  console.log(`[LLM] Model: ${model}`);

  try {
    const res = await fetchWithTimeout(`${baseUrl}/models`, {
      headers: apiHeaders(),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const modelIds = (data.data || []).map((entry) => entry.id);

    if (modelIds.length > 0 && !modelIds.includes(model)) {
      console.warn(
        `[LLM] Model "${model}" not listed by server. Available: ${modelIds.join(', ')}`
      );
    }

    setStatus(ModelStatus.READY, `Remote model ${model} ready`);
    console.log('[LLM] Remote model ready');
  } catch (err) {
    const hint = err.name === 'AbortError'
      ? 'Connection timed out — check OpenVPN and that the LLM server is running.'
      : err.message;
    const msg = `Cannot reach LLM at ${baseUrl}: ${hint}`;
    console.error(`[LLM] ${msg}`);
    setStatus(ModelStatus.ERROR, msg);
  }
}

async function chatCompletion(messages, options = {}) {
  if (currentStatus !== ModelStatus.READY) {
    return null;
  }

  const { baseUrl, model, chatTimeoutMs } = getConfig();

  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiHeaders(),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          stream: false,
        }),
      },
      chatTimeoutMs
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[LLM] Chat completion error:', err.message);
    return null;
  }
}

async function chatCompletionStream(messages, onChunk, options = {}) {
  if (currentStatus !== ModelStatus.READY) {
    return null;
  }

  const { baseUrl, model, chatTimeoutMs } = getConfig();

  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiHeaders(),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          stream: true,
        }),
      },
      chatTimeoutMs
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    let fullContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {
          /* ignore malformed SSE chunks */
        }
      }
    }

    return fullContent;
  } catch (err) {
    console.error('[LLM] Streaming error:', err.message);
    return null;
  }
}

async function shutdown() {
  currentStatus = ModelStatus.NOT_INITIALIZED;
  statusMessage = 'Remote LLM disconnected';
}

export {
  initialize,
  chatCompletion,
  chatCompletionStream,
  getStatus,
  onStatusChange,
  shutdown,
  ModelStatus,
};
