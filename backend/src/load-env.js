/**
 * Load backend/.env into process.env before other modules start.
 * Imported by index.js and llm-service.js; also used via node --import.
 * Does not override variables already set in the shell.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');

let envLoaded = false;
let loadedKeys = [];

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
      loadedKeys.push(key);
    }
  }

  envLoaded = true;
}

function getEnvSummary() {
  if (!envLoaded) {
    return { envLoaded: false, envPath, loadedKeys: [] };
  }
  return { envLoaded: true, envPath, loadedKeys };
}

function logEnvSummary() {
  if (!envLoaded) {
    console.warn(
      `[Env] No .env file at ${envPath} — LLM defaults to Foundry Local. `
      + 'Copy backend/.env.example to backend/.env for a remote LLM.'
    );
    return;
  }

  const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_BASE_URL ? 'openai' : 'foundry');
  console.log(`[Env] Loaded ${loadedKeys.length} variable(s) from ${envPath} (LLM_PROVIDER=${provider})`);
}

export { envLoaded, envPath, getEnvSummary, logEnvSummary };
