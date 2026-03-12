# Contributing to HVAC Digital Twin

Thank you for your interest in contributing to the HVAC Digital Twin project! This document provides guidelines and best practices for contributing.

## Code of Conduct

This project adheres to the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Issues

- Use the GitHub issue tracker
- Check if the issue already exists before creating a new one
- Provide a clear title and description
- Include steps to reproduce for bugs
- Include relevant logs, screenshots, or error messages

### Suggesting Features

- Open an issue with the "feature request" label
- Describe the use case and expected behaviour
- Explain why this feature would be useful

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: 
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
3. **Make your changes** following the coding standards below
4. **Test your changes** thoroughly
5. **Update documentation** if needed
6. **Submit a pull request** with a clear description

## Development Setup

### Prerequisites

- Node.js 20+ 
- npm 9+
- Foundry Local (optional, for AI copilot features): [install instructions](https://foundrylocal.ai)
- Blender 4.0+ (optional, for 3D asset generation)

### Running Locally

```bash
# Backend
cd backend
npm install
npm start

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Integration tests
cd tests
npm test
```

## Coding Standards

### JavaScript/JSX

- **ES Modules only**: use `import`/`export`, not `require()`/`module.exports`
- Use ES2022+ features
- Use meaningful variable and function names
- Add JSDoc comments for public functions
- Keep functions small and focused
- Use async/await for asynchronous code

### Foundry Local SDK

- Use the `foundry-local-sdk` npm package for all AI model interactions
- Never call Foundry Local HTTP endpoints directly. Use the SDK's `FoundryLocalManager`, `model.download()`, `model.load()`, `model.createChatClient()` APIs
- On Windows, install with: `npm install --foreground-scripts --winml foundry-local-sdk`

### File Structure

```
backend/
  src/
    index.js                          # Express server + WebSocket + routes
    routes/                           # API route handlers
    services/
      copilot-service.js              # Intent detection + grounded responses
      foundry-local-service.js        # Foundry Local SDK lifecycle
    simulator/
      hvac-simulator.js               # Deterministic HVAC physics engine
frontend/
  src/
    App.jsx                           # Main layout
    components/
      ModelStatusBanner.jsx           # AI model download/loading status
      BuildingScene.jsx               # Three.js 3D scene
      CopilotChat.jsx                 # AI copilot chat panel
      ...                             # Other UI components
    hooks/
      useTwinStore.js                 # Zustand global state
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add chiller compressor failure simulation
fix: correct CO2 calculation in zone thermal model
docs: update API documentation for fault endpoints
```

## Architecture Guidelines

### Simulator

The HVAC simulator uses physics-based models. When adding new fault scenarios:

1. Add the fault type to `FAULT_CATALOG` in `hvac-simulator.js`
2. Implement the fault logic in the `applyFault()` method
3. Ensure the fault creates appropriate alerts
4. Update the copilot service to recognise the new fault

### API

- REST endpoints follow `/api/resource/action` pattern
- Use proper HTTP status codes
- Return consistent JSON response format

### Frontend

- Components should be functional with hooks
- Use the Zustand store for global state
- Keep components focused and reusable

## Testing Guidelines

### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Aim for coverage of critical paths

### Integration Tests

- Test API endpoints end-to-end
- Test WebSocket communication
- Test fault injection scenarios

## Documentation

- Update README.md for user-facing changes
- Update docs/ for technical documentation
- Add JSDoc comments for new functions

## Questions?

Feel free to:
- Open an issue with the "question" label
- Start a discussion in GitHub Discussions
- Reach out to the maintainers

Thank you for contributing!
