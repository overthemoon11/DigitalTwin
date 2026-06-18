import { create } from 'zustand';
import {
  startPlantSimulator,
  updatePlantControl as setPlantControlValue,
  resetPlantControls,
  triggerPlantFault as setPlantFault,
  stepPlantSimulation,
  advancePlantSimulation,
  acknowledgePlantAlert as ackPlantAlert,
  getPlantControls,
} from '../services/plantSimulator';
import { analyzePlantQuery, buildPlantContextForCopilot } from '../services/copilotAnalysis';
import {
  parsePlantControlIntents,
  formatPlantControlConfirmation,
  buildPlantControlsSummary,
} from '../services/plantCopilotActions';

import {
  startDistrictCoolingSimulator,
  updateDistrictControl as setDistrictControlValue,
  resetDistrictCooling,
  stepDistrictCooling,
  advanceDistrictCooling,
} from '../services/districtCoolingSimulator';

const API_BASE = '/api';

export const useTwinStore = create((set, get) => ({
  twinState: null,
  plantState: null,
  districtCoolingState: null,
  activeAppTab: 'chiller_plant',
  activePlantScenario: 'chiller',
  selectedAsset: null,
  isConnected: false,
  ws: null,
  conversationHistory: [],
  modelStatus: null,
  _plantStop: null,
  _districtStop: null,

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),

  setActivePlantScenario: (scenario) => {
    set({ activePlantScenario: scenario, selectedAsset: null });
  },

  initPlantTelemetry: () => {
    const existingPlant = get()._plantStop;
    if (existingPlant) existingPlant();
    const existingDc = get()._districtStop;
    if (existingDc) existingDc();

    const plantStop = startPlantSimulator((plantState) => {
      set({ plantState });
      const twin = get().twinState;
      if (twin) {
        set({
          twinState: {
            ...twin,
            metadata: {
              ...twin.metadata,
              simulationTime: plantState.simulationTime,
            },
          },
        });
      }
    });

    const districtStop = startDistrictCoolingSimulator((districtCoolingState) => {
      set({ districtCoolingState });
    });

    set({ _plantStop: plantStop, _districtStop: districtStop });
    return () => {
      plantStop();
      districtStop();
    };
  },

  updateDistrictControl: (controlId, value) => {
    setDistrictControlValue(controlId, value);
    set({ districtCoolingState: stepDistrictCooling() });
  },

  advanceDistrictCooling: (seconds = 30) => {
    const steps = Math.max(1, Math.floor(seconds / 2));
    set({ districtCoolingState: advanceDistrictCooling(steps) });
  },

  resetDistrictCooling: () => {
    resetDistrictCooling();
    set({ districtCoolingState: stepDistrictCooling() });
  },

  updatePlantControl: (controlId, value) => {
    setPlantControlValue(controlId, value);
    set({ plantState: stepPlantSimulation() });
  },

  resetPlant: () => {
    resetPlantControls();
    set({ plantState: stepPlantSimulation() });
  },

  triggerPlantFault: (faultType) => {
    setPlantFault(faultType);
    set({ plantState: stepPlantSimulation() });
  },

  acknowledgePlantAlert: (alertId) => {
    ackPlantAlert(alertId);
    set({ plantState: stepPlantSimulation() });
  },

  /** Advance offline plant physics (seconds → 2s ticks). */
  advancePlantSimulation: (seconds = 60) => {
    const steps = Math.max(1, Math.floor(seconds / 2));
    set({ plantState: advancePlantSimulation(steps) });
  },

  loadTwinState: async () => {
    try {
      const response = await fetch(`${API_BASE}/twin`);
      const data = await response.json();
      set({ twinState: data, isConnected: true });

      // Setup WebSocket connection
      get().connectWebSocket();

      // Fetch initial model status
      get().fetchModelStatus();
    } catch (err) {
      console.error('Failed to load twin state:', err);
      set({ isConnected: false });
    }
  },

  fetchModelStatus: async () => {
    try {
      const response = await fetch(`${API_BASE}/model/status`);
      const data = await response.json();
      set({ modelStatus: data });
    } catch (err) {
      // Model status endpoint may not be available yet
    }
  },

  connectWebSocket: () => {
    const wsUrl = `ws://${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ isConnected: true, ws });
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'state' || message.type === 'update') {
        set({ twinState: message.data?.state || message.data });
      }
      if (message.type === 'model_status') {
        set({ modelStatus: message.data });
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ isConnected: false, ws: null });
      // Reconnect after delay
      setTimeout(() => get().connectWebSocket(), 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  },

  selectAsset: (assetId) => {
    set((state) => ({
      selectedAsset: assetId != null && assetId === state.selectedAsset ? null : assetId,
    }));
  },

  updateControl: async (controlId, value) => {
    try {
      const response = await fetch(`${API_BASE}/twin/controls/${controlId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const result = await response.json();

      // Reload state
      get().loadTwinState();
      return result;
    } catch (err) {
      console.error('Failed to update control:', err);
      throw err;
    }
  },

  runSimulation: async (timeStep = 60) => {
    try {
      const response = await fetch(`${API_BASE}/twin/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeStep }),
      });
      const result = await response.json();
      get().loadTwinState();
      return result;
    } catch (err) {
      console.error('Failed to run simulation:', err);
      throw err;
    }
  },

  resetTwin: async () => {
    try {
      const response = await fetch(`${API_BASE}/twin/reset`, {
        method: 'POST',
      });
      const result = await response.json();
      get().loadTwinState();
      return result;
    } catch (err) {
      console.error('Failed to reset twin:', err);
      throw err;
    }
  },

  applyFault: async (faultType, params) => {
    try {
      const response = await fetch(`${API_BASE}/twin/fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faultType, params }),
      });
      const result = await response.json();
      get().loadTwinState();
      return result;
    } catch (err) {
      console.error('Failed to apply fault:', err);
      throw err;
    }
  },

  acknowledgeAlert: async (alertId) => {
    try {
      const response = await fetch(`${API_BASE}/twin/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'operator' }),
      });
      const result = await response.json();
      get().loadTwinState();
      return result;
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
      throw err;
    }
  },

  sendCopilotMessage: async (message) => {
    const { conversationHistory, plantState, updatePlantControl } = get();
    const plantContext = buildPlantContextForCopilot(plantState);
    const controls = getPlantControls();
    const plantControls = buildPlantControlsSummary(controls);

    const { applied, errors } = parsePlantControlIntents(message, controls);
    for (const action of applied) {
      updatePlantControl(action.controlId, action.newValue);
    }

    const appliedControls = applied.map((a) => ({
      controlId: a.controlId,
      label: a.label,
      oldValue: a.oldValue,
      newValue: a.newValue,
      unit: a.unit,
    }));

    const prependConfirmation = (text) => {
      if (!applied.length) return text;
      const header = formatPlantControlConfirmation(applied);
      const errNote = errors.length ? `\n\n⚠️ ${errors.join(' ')}` : '';
      return text ? `${header}${errNote}\n\n${text}` : `${header}${errNote}`;
    };

    try {
      const response = await fetch(`${API_BASE}/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          plantContext,
          plantControls,
          appliedControls,
          conversationHistory,
        }),
      });
      if (!response.ok) throw new Error('Chatbot API error');
      const result = await response.json();

      const responseText = prependConfirmation(result.response);

      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: responseText },
        ],
      });

      return { ...result, response: responseText, controlsApplied: applied.length > 0 };
    } catch (err) {
      const local = analyzePlantQuery(message, get().plantState);
      const responseText = prependConfirmation(
        local ||
          '## Plant Chatbot (Local LLM)\n\nI could not reach the AI backend. Try asking about **COP**, **energy savings**, **chiller staging**, **CHWS temperature**, or **alarms**.\n\nYou can also adjust controls directly, e.g. **"Set building load to 1100 RT"** or **"Set outdoor temperature to 35°C"**.'
      );

      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: responseText },
        ],
      });

      return { response: responseText, source: 'local-analysis', controlsApplied: applied.length > 0 };
    }
  },

  clearConversation: () => {
    set({ conversationHistory: [] });
  },
}));
