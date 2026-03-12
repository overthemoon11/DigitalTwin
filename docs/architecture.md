# Architecture Documentation

## System Overview

The HVAC Digital Twin follows a layered architecture with clear separation of concerns:

```mermaid
graph TD
    subgraph Presentation["PRESENTATION<br/>React + Three.js Web Application"]
        Scene["3D Scene<br/>Viewer"]
        Tree["Asset Tree<br/>Navigator"]
        Ctrl["Controls<br/>KPIs"]
        Chat["Copilot Chat<br/>(Foundry Local)"]
    end

    subgraph API["API LAYER<br/>Express.js Server (Node.js)"]
        Routes["Routes: /api/twin, /api/copilot<br/>WebSocket: Real-time state updates"]
    end

    subgraph Domain["DOMAIN LAYER"]
        Sim["HVAC Simulator<br/>- Thermal models<br/>- CO₂ mass balance<br/>- Fan power curves<br/>- Fault detection"]
        FL["Foundry Local SDK Service<br/>- System prompt building<br/>- Grounded responses<br/>- Fallback rule-based"]
    end

    subgraph Data["DATA LAYER<br/>JSON Files (twin/*.json)"]
        Schema["twin.schema<br/>(Structure)"]
        Baseline["twin.baseline<br/>(Reset state)"]
        State["twin.state<br/>(Live state)"]
    end

    Presentation -- "REST API + WebSocket" --> API
    API --> Domain
    Domain --> Data
```

## Data Flow

### 1. State Loading
```mermaid
sequenceDiagram
    Frontend->>Backend: GET /api/twin
    Backend->>twin.state.json: Read
    twin.state.json-->>Backend: JSON state
    Backend-->>Frontend: Response
```

### 2. Control Change
```mermaid
sequenceDiagram
    actor User
    User->>Frontend: Adjust slider
    Frontend->>Backend: PUT /api/twin/controls/:id
    Backend->>Backend: Apply to state
    Backend->>Simulator: simulator.step()
    Simulator-->>Backend: Updated telemetry, KPIs, alerts
    Backend->>twin.state.json: Save state
    Backend->>Frontend: WebSocket broadcast
    Frontend->>User: All clients update
```

### 3. Copilot Query
```mermaid
sequenceDiagram
    actor User
    User->>Frontend: Send message
    Frontend->>Backend: POST /api/copilot/chat
    Backend->>Backend: Build system prompt with current state
    Backend->>Foundry Local: Chat completion
    Foundry Local-->>Backend: Response grounded in twin data
    Backend-->>Frontend: Return to frontend
```

## Component Details

### Twin State (JSON)

The twin state follows a structure inspired by Azure Digital Twins and RealEstateCore:

```json
{
  "metadata": { "id", "name", "version", "simulationTime" },
  "assets": [{ "id", "type", "name", "parentId", "properties", "meshId" }],
  "relationships": [{ "sourceId", "targetId", "relType" }],
  "telemetry": [{ "id", "assetId", "pointType", "value", "unit", "history" }],
  "controls": [{ "id", "assetId", "controlType", "value", "min", "max" }],
  "kpis": [{ "id", "name", "value", "formula", "inputs", "status" }],
  "alerts": [{ "id", "severity", "assetId", "message", "ruleId" }],
  "faultRules": [{ "id", "condition", "severity", "recommendedAction" }],
  "simulatorState": { "outdoorTemp", "solarLoad", "timeOfDay" }
}
```

### Simulator Engine

The HVAC simulator implements deterministic physics models:

**Zone Thermal Model:**
- 1R1C lumped parameter model
- Heat gains: occupancy, equipment, solar
- Heat removal: supply air cooling
- Temperature change: dT = Q_net × dt / C_thermal

**CO₂ Model:**
- Generation: 0.0084 CFM CO₂/person (ASHRAE)
- Removal: ventilation × (zone_CO₂ - outdoor_CO₂)
- Volume-based accumulation

**Fan Power:**
- Affinity laws: P ∝ (speed)³
- Filter loading factor increases power requirement

**Chiller:**
- Part-load efficiency curve
- COP varies with load and condenser temp

### Fault Detection

Rules evaluate against current state:
```javascript
if (zone.co2 > 800) → warning alert
if (filter.loading > 0.7) → warning alert
if (abs(zone.temp - setpoint) > 3) → warning alert
```

Each alert includes:
- Severity level
- Root cause explanation
- Recommended action
- Reference to triggering rule

### Copilot Grounding

The system prompt includes:
1. Role definition as HVAC Operations Copilot
2. Current KPI values and statuses
3. Active alerts with details
4. Zone conditions (temp, CO₂, occupancy)
5. Available controls and ranges
6. Instructions to only cite provided data

If Foundry Local is unavailable, falls back to keyword-based responses using actual state values.

## Security Considerations

- No authentication in demo (add for production)
- JSON state files should be protected
- Foundry Local runs locally (no cloud dependency)
- WebSocket has no auth (add token validation for production)

## Scaling Considerations

For production deployment:
- Replace JSON files with database (PostgreSQL, MongoDB)
- Add Redis for real-time state caching
- Use message queue for simulation events
- Deploy behind load balancer
- Add proper logging and monitoring
