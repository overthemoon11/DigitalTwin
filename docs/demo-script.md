# Demo Script: HVAC Digital Twin (2-3 minutes)

## Overview
This script walks through a demonstration of the Smart Building HVAC Digital Twin, showcasing key features and the impact of control changes.

---

## Setup (before demo)
1. Ensure backend is running: `cd backend && npm start`
2. Ensure frontend is running: `cd frontend && npm run dev`
3. Open browser to `http://localhost:3002`
4. (Optional) Start Foundry Local for AI copilot

---

## Demo Flow

### 1. Introduction (30 seconds)

**Say:** "This is a digital twin of a 3-floor office building's HVAC system. The 3D view shows zones coloured by temperature - green is comfortable, blue is cool, red is warm."

**Show:**
- Point to the 3D view and explain the floor layout
- Click on different zones to show selection
- Point to the asset tree on the left showing the hierarchy

---

### 2. Current State Overview (30 seconds)

**Say:** "On the right panel, we can see real-time KPIs. Currently the building is using about 180 kW of HVAC power, with 95% comfort compliance. Notice there's one active alert."

**Show:**
- Click on the **KPIs** tab
- Scroll through energy, comfort, and IAQ metrics
- Click on the **Alerts** tab to show the CO₂ warning in Conference Room B

---

### 3. Scenario: High Occupancy Impact (45 seconds)

**Say:** "Let's simulate a meeting room filling up and see how the system responds."

**Actions:**
1. Click on **Controls** tab
2. Click the **"High Occupancy (Meeting A)"** test scenario button
3. Click **"Run Simulation Step"** 3-4 times
4. Watch:
   - Conference Room A CO₂ rises in the 3D view
   - A new CO₂ alert appears
   - IAQ compliance drops

**Say:** "The simulator calculates CO₂ buildup based on occupancy and ventilation. The system detected elevated CO₂ and generated an alert with a recommended action."

---

### 4. Control Response (30 seconds)

**Say:** "An operator could respond by adjusting setpoints. Let's ask the AI copilot for recommendations."

**Actions:**
1. Click the **Copilot** tab
2. Type: "What should I do about the CO₂ issue?"
3. Show the grounded response citing actual zone data
4. Alternatively, use a quick prompt like "Recommend actions to save energy"

**Say:** "The copilot analyses the actual twin state and provides specific, actionable recommendations grounded in the data."

---

### 5. Energy Optimisation (30 seconds)

**Say:** "Let's see the energy-comfort tradeoff by adjusting setpoints."

**Actions:**
1. Click on "Open Office - Floor 2" in the asset tree
2. In **Controls**, raise the cooling setpoint from 74°F to 76°F
3. Run simulation steps
4. Show:
   - Power KPI decreasing
   - Zone temperature adjusting
   - Comfort metrics changing

**Say:** "Raising setpoints reduces cooling load but affects comfort - a classic HVAC tradeoff that operators must balance."

---

### 6. Reset and Wrap-up (15 seconds)

**Say:** "At any time, we can reset to the baseline state."

**Actions:**
1. Click **"Reset to Baseline"** button
2. Show state restored

**Say:** "This digital twin provides operators with visibility into building performance, AI-assisted decision making, and a safe environment to simulate scenarios before implementing changes."

---

## Key Talking Points

- **Single Source of Truth**: All data flows from/to JSON state files
- **Deterministic Simulation**: Physics-based models, not magic numbers
- **Grounded AI**: Copilot only cites actual twin data
- **Real-time Visualisation**: 3D view responds to state changes
- **Offline Capable**: Works without cloud dependencies (with Foundry Local)

## Potential Questions

**Q: How accurate is the simulation?**
A: Uses simplified RC thermal models and ASHRAE guidelines for CO₂. Suitable for demonstrating concepts; real deployments would calibrate to actual building data.

**Q: Can it connect to real building systems?**
A: The architecture supports it - replace the simulator with a BACnet/Modbus connector to poll real sensors.

**Q: What LLM does it use?**
A: Foundry Local with Phi-3.5-mini by default, but supports any OpenAI-compatible endpoint.
