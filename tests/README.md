# Digital Twin Test Suite

This folder contains comprehensive tests for the Smart Building HVAC Digital Twin application.

## Test Structure

```
tests/
├── README.md                    # This file
├── run-all-tests.ps1           # PowerShell test runner
├── run-all-tests.bat           # Batch test runner
├── backend/
│   ├── api.test.js             # REST API endpoint tests
│   ├── websocket.test.js       # WebSocket connectivity tests
│   └── simulator.test.js       # HVAC simulator unit tests
├── integration/
│   ├── e2e.test.js             # End-to-end workflow tests
│   └── data-flow.test.js       # Data flow validation tests
└── validation/
    ├── twin-schema.test.js     # JSON schema validation
    └── health-check.test.js    # System health check tests
```

## Running Tests

### Quick Start

```bash
# From the project root
cd tests
.\run-all-tests.ps1    # PowerShell
# or
run-all-tests.bat      # Command Prompt
```

### Run Individual Test Files

```bash
# Backend tests
cd backend
node --test api.test.js

# Integration tests
cd tests/integration
node --test e2e.test.js

# Validation tests
cd tests/validation
node --test health-check.test.js
```

### Using npm

```bash
# Run all tests from project root
npm test

# Run backend tests only
cd backend
npm test
```

## Test Categories

### 1. Backend API Tests (`backend/api.test.js`)
- Tests all REST API endpoints
- Validates response formats
- Tests error handling
- Verifies control updates

### 2. WebSocket Tests (`backend/websocket.test.js`)
- Tests WebSocket connection
- Validates real-time updates
- Tests message broadcasting

### 3. Simulator Tests (`backend/simulator.test.js`)
- Physics model validation
- Control response testing
- Fault scenario testing

### 4. End-to-End Tests (`integration/e2e.test.js`)
- Full workflow testing
- User interaction simulation
- Cross-component validation

### 5. Schema Validation (`validation/twin-schema.test.js`)
- JSON schema compliance
- Data structure validation
- Type checking

### 6. Health Checks (`validation/health-check.test.js`)
- System startup validation
- Component availability
- Dependency checks

## Prerequisites

- Node.js 20+
- Backend server running on port 3001 (for integration tests)
- Frontend server running on port 3000 (for E2E tests)

## Writing New Tests

Tests use Node.js built-in test runner. Example:

```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('My Test Suite', () => {
  test('should do something', async () => {
    const result = await someFunction();
    assert.strictEqual(result, expectedValue);
  });
});
```

## Coverage Goals

- API Endpoints: 100% coverage
- Simulator Logic: >90% coverage
- Error Paths: >80% coverage
- Integration Flows: Key user journeys
