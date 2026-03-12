# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-03-12

### Added

- **Foundry Local SDK integration**: replaced raw HTTP calls with the `foundry-local-sdk` npm package for on-device AI model lifecycle management.
- **Model status banner**: new `ModelStatusBanner` component in the frontend that shows download progress, loading state, and error notifications.
- **Model status API**: `GET /api/model/status` endpoint and WebSocket `model_status` messages for real-time model state updates.
- **Foundry Local service**: new `backend/src/services/foundry-local-service.js` encapsulating model discovery, download, loading, chat completion (synchronous and streaming), and graceful shutdown.
- **AGENTS.md**: Copilot agent configuration document for GitHub Copilot and compatible coding agents.
- **Foundry Local SKILL.md**: comprehensive SDK reference at `.github/skills/foundry-local/SKILL.md`.
- **CHANGELOG.md**: this file.

### Changed

- **ES Modules**: all backend code converted from CommonJS (`require`/`module.exports`) to ES Modules (`import`/`export`). Backend `package.json` now includes `"type": "module"`.
- **Node.js 20+**: minimum Node.js version raised from 18 to 20.
- **Copilot service**: `copilot-service.js` now uses the SDK's `chatCompletion()` instead of raw `fetch()`. Fallback responses are model-status-aware.
- **Backend entry point**: `index.js` initialises the Foundry Local SDK on startup, broadcasts model status via WebSocket, and performs graceful shutdown on `SIGINT`.
- **Zustand store**: `useTwinStore.js` tracks `modelStatus` and handles `model_status` WebSocket messages.
- **CONTRIBUTING.md**: updated prerequisites (Node.js 20+, SDK installation), coding standards (ES Modules, SDK usage), and file structure.
- **README.md**: updated architecture diagram, prerequisites, Foundry Local setup instructions, API reference, and project structure.
- **blogpost.md**: updated Foundry Local integration section to describe SDK usage instead of raw HTTP calls.
- **Documentation**: all Markdown files converted to British English spelling and grammar; em dashes removed throughout.

### Removed

- `FOUNDRY_LOCAL_URL` environment variable and raw HTTP connector. The SDK manages the connection internally.

## [1.0.0] - 2026-01-26

### Added

- Initial release with React + Three.js frontend, Node.js/Express backend, and HVAC simulator.
- JSON-based digital twin state (schema, baseline, live state).
- AI copilot with Foundry Local (raw HTTP chat completions).
- 3D building visualisation with GLB model and procedural fallback.
- Fault injection (20+ scenarios) and alert management.
- KPI dashboard (energy, comfort, IAQ, operational).
- WebSocket real-time updates.
- Comprehensive test suite (API, WebSocket, E2E, schema validation, health checks).
- PowerShell and batch startup scripts.
- Blender MCP asset pipeline documentation.
