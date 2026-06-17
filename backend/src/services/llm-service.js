/**
 * LLM provider router for the HVAC copilot.
 *
 * Provider selection (first match wins):
 *   1. LLM_PROVIDER=openai  → OpenAI-compatible HTTP API (vLLM, etc.)
 *   2. LLM_PROVIDER=foundry → Foundry Local SDK (on-device)
 *   3. OPENAI_BASE_URL set  → openai (default for company VPN LLM)
 *   4. otherwise            → foundry
 */

import '../load-env.js';
import * as openaiService from './openai-compatible-service.js';

function resolveProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'openai' || explicit === 'foundry') {
    return explicit;
  }
  if (process.env.OPENAI_BASE_URL) {
    return 'openai';
  }
  return 'foundry';
}

let foundryModule = null;
const pendingStatusListeners = [];
let foundryReady = null;

function ensureFoundryLoading() {
  if (!foundryReady) {
    foundryReady = import('./foundry-local-service.js').then((mod) => {
      foundryModule = mod;
      for (const listener of pendingStatusListeners.splice(0)) {
        mod.onStatusChange(listener);
      }
      return mod;
    });
  }
  return foundryReady;
}

async function getFoundryModule() {
  if (!foundryModule) {
    foundryModule = await ensureFoundryLoading();
  }
  return foundryModule;
}

function getProviderName() {
  return resolveProvider();
}

async function initialize() {
  if (resolveProvider() === 'openai') {
    return openaiService.initialize();
  }
  const mod = await getFoundryModule();
  return mod.initialize();
}

function getStatus() {
  if (resolveProvider() === 'openai') {
    return openaiService.getStatus();
  }
  if (foundryModule) {
    return { ...foundryModule.getStatus(), provider: 'foundry' };
  }
  return {
    status: 'not_initialized',
    message: 'Foundry Local not initialized',
    downloadProgress: 0,
    modelAlias: process.env.FOUNDRY_MODEL || 'phi-3.5-mini',
    provider: 'foundry',
    ready: false,
  };
}

async function chatCompletion(messages, options = {}) {
  if (resolveProvider() === 'openai') {
    return openaiService.chatCompletion(messages, options);
  }
  const mod = await getFoundryModule();
  return mod.chatCompletion(messages, options);
}

async function chatCompletionStream(messages, onChunk, options = {}) {
  if (resolveProvider() === 'openai') {
    return openaiService.chatCompletionStream(messages, onChunk, options);
  }
  const mod = await getFoundryModule();
  return mod.chatCompletionStream(messages, onChunk, options);
}

function onStatusChange(listener) {
  if (resolveProvider() === 'openai') {
    return openaiService.onStatusChange(listener);
  }
  if (foundryModule) {
    return foundryModule.onStatusChange(listener);
  }
  pendingStatusListeners.push(listener);
  ensureFoundryLoading()?.then((mod) => {
    const idx = pendingStatusListeners.indexOf(listener);
    if (idx >= 0) {
      pendingStatusListeners.splice(idx, 1);
      mod.onStatusChange(listener);
    }
  });
  return () => {
    const idx = pendingStatusListeners.indexOf(listener);
    if (idx >= 0) pendingStatusListeners.splice(idx, 1);
  };
}

async function shutdown() {
  if (resolveProvider() === 'openai') {
    return openaiService.shutdown();
  }
  const mod = await getFoundryModule();
  return mod.shutdown();
}

export {
  initialize,
  chatCompletion,
  chatCompletionStream,
  getStatus,
  onStatusChange,
  shutdown,
  getProviderName,
};
