/**
 * Foundry Local SDK Service
 * 
 * Manages the lifecycle of the Foundry Local model:
 * - SDK initialization
 * - Model discovery, download (with progress), and loading
 * - Chat completion via the native SDK client
 * - Status reporting for frontend notifications
 */

import { FoundryLocalManager } from 'foundry-local-sdk';

const MODEL_ALIAS = process.env.FOUNDRY_MODEL || 'phi-3.5-mini';

// Model lifecycle states
const ModelStatus = {
  NOT_INITIALIZED: 'not_initialized',
  INITIALIZING: 'initializing',
  DOWNLOADING: 'downloading',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

let manager = null;
let model = null;
let chatClient = null;
let currentStatus = ModelStatus.NOT_INITIALIZED;
let downloadProgress = 0;
let statusMessage = 'Foundry Local not initialized';
let statusListeners = [];

/**
 * Subscribe to status changes
 */
function onStatusChange(listener) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

/**
 * Notify all listeners of a status change
 */
function setStatus(status, message, progress = null) {
  currentStatus = status;
  statusMessage = message;
  if (progress !== null) downloadProgress = progress;

  const update = getStatus();
  for (const listener of statusListeners) {
    try { listener(update); } catch (_) { /* ignore */ }
  }
}

/**
 * Get current model status
 */
function getStatus() {
  return {
    status: currentStatus,
    message: statusMessage,
    downloadProgress,
    modelAlias: MODEL_ALIAS,
    provider: 'foundry',
    ready: currentStatus === ModelStatus.READY,
  };
}

/**
 * Initialize the Foundry Local SDK and load the model.
 * Returns immediately — callers can poll getStatus() or subscribe via onStatusChange().
 */
async function initialize() {
  if (currentStatus === ModelStatus.READY || currentStatus === ModelStatus.INITIALIZING) {
    return;
  }

  setStatus(ModelStatus.INITIALIZING, 'Initializing Foundry Local SDK…');

  try {
    manager = FoundryLocalManager.create({
      appName: 'hvac-digital-twin',
      logLevel: 'info',
    });
    console.log('[Foundry Local] SDK initialized');

    // Discover model
    model = await manager.catalog.getModel(MODEL_ALIAS);
    if (!model) {
      setStatus(ModelStatus.UNAVAILABLE, `Model "${MODEL_ALIAS}" not found in catalog`);
      console.warn(`[Foundry Local] Model "${MODEL_ALIAS}" not found in catalog`);
      return;
    }

    // Download with progress
    setStatus(ModelStatus.DOWNLOADING, `Downloading model ${MODEL_ALIAS}…`, 0);
    console.log(`[Foundry Local] Downloading model ${MODEL_ALIAS}…`);

    await model.download((progress) => {
      downloadProgress = progress;
      setStatus(ModelStatus.DOWNLOADING, `Downloading model ${MODEL_ALIAS}… ${progress.toFixed(1)}%`, progress);
    });
    console.log(`[Foundry Local] Model downloaded`);

    // Load
    setStatus(ModelStatus.LOADING, `Loading model ${MODEL_ALIAS}…`);
    console.log(`[Foundry Local] Loading model…`);
    await model.load();
    console.log(`[Foundry Local] Model loaded`);

    // Create chat client
    chatClient = model.createChatClient();
    setStatus(ModelStatus.READY, `Model ${MODEL_ALIAS} ready`);
    console.log(`[Foundry Local] Chat client ready`);
  } catch (err) {
    const msg = `Foundry Local initialization failed: ${err.message}`;
    console.error(`[Foundry Local] ${msg}`);
    setStatus(ModelStatus.ERROR, msg);
  }
}

/**
 * Perform a chat completion using the native SDK client.
 * Falls back to null if the model is not ready.
 */
async function chatCompletion(messages, options = {}) {
  if (!chatClient || currentStatus !== ModelStatus.READY) {
    return null;
  }

  try {
    const completion = await chatClient.completeChat(messages, {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 1024,
    });

    return completion.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[Foundry Local] Chat completion error:', err.message);
    return null;
  }
}

/**
 * Perform a streaming chat completion.
 * Calls onChunk(text) for each chunk received.
 */
async function chatCompletionStream(messages, onChunk, options = {}) {
  if (!chatClient || currentStatus !== ModelStatus.READY) {
    return null;
  }

  try {
    let fullContent = '';
    await chatClient.completeStreamingChat(
      messages,
      (chunk) => {
        const content = chunk.choices?.[0]?.message?.content;
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      },
      {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 1024,
      }
    );
    return fullContent;
  } catch (err) {
    console.error('[Foundry Local] Streaming error:', err.message);
    return null;
  }
}

/**
 * Gracefully shut down the model and manager
 */
async function shutdown() {
  try {
    if (model && currentStatus === ModelStatus.READY) {
      await model.unload();
      console.log('[Foundry Local] Model unloaded');
    }
  } catch (_) {
    /* best-effort */
  }
  currentStatus = ModelStatus.NOT_INITIALIZED;
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
