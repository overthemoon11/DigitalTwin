/**
 * Guard against running the backend on unsupported Node.js versions when using
 * Foundry Local. The foundry-local-sdk uses import attributes which require Node 20+.
 *
 * Skipped when LLM_PROVIDER=openai or OPENAI_BASE_URL is set (remote LLM only).
 */

import './load-env.js';

const MIN_MAJOR = 20;
const current = process.versions.node;
const major = Number.parseInt(current.split('.')[0], 10);

function usesFoundryLocal() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'openai') return false;
  if (explicit === 'foundry') return true;
  return !process.env.OPENAI_BASE_URL;
}

if (usesFoundryLocal() && major < MIN_MAJOR) {
  console.error(`
HVAC Digital Twin backend requires Node.js ${MIN_MAJOR}+ when using Foundry Local (current: v${current}).

foundry-local-sdk uses import attributes ("import ... with { type: 'json' }")
that are not supported on Node.js 18 and earlier.

Options:
  1. Upgrade to Node.js ${MIN_MAJOR}+ from https://nodejs.org/
  2. Use a remote LLM instead: set OPENAI_BASE_URL and LLM_PROVIDER=openai

See backend/.env.example and backend/package.json "engines".
`.trim());
  process.exit(1);
}
