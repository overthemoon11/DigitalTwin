/**
 * Guard against running the backend on unsupported Node.js versions.
 * foundry-local-sdk uses import attributes (`import ... with { type: "json" }`)
 * which require Node.js 20+.
 */

const MIN_MAJOR = 20;
const current = process.versions.node;
const major = Number.parseInt(current.split('.')[0], 10);

if (major < MIN_MAJOR) {
  console.error(`
HVAC Digital Twin backend requires Node.js ${MIN_MAJOR}+ (current: v${current}).

foundry-local-sdk uses import attributes ("import ... with { type: 'json' }")
that are not supported on Node.js 18 and earlier. Without Node ${MIN_MAJOR}+,
the server fails with: SyntaxError: Unexpected token 'with'

Fix:
  1. Install Node.js ${MIN_MAJOR} LTS or newer from https://nodejs.org/
  2. With nvm-windows: nvm install 20 && nvm use 20
  3. Restart the terminal, then run: npm start

See backend/package.json "engines" and the repo .nvmrc file.
`.trim());
  process.exit(1);
}
