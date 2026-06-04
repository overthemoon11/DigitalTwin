import { create } from 'zustand';
import {
  startPlantSimulator,
  updatePlantControl as setPlantControlValue,
  resetPlantControls,
  triggerPlantFault as setPlantFault,
  stepPlantSimulation,
  acknowledgePlantAlert as ackPlantAlert,
} from '../services/plantSimulator';
import { analyzePlantQuery, buildPlantContextForCopilot } from '../services/copilotAnalysis';

const API_BASE = '/api';

export const useTwinStore = create((set, get) => ({
  twinState: null,
  plantState: null,
  selectedAsset: null,
  isConnected: false,
  ws: null,
  conversationHistory: [],
  modelStatus: null, // { status, message, downloadProgress, modelAlias, ready }
  _plantStop: null,

  initPlantTelemetry: () => {
    const existing = get()._plantStop;
    if (existing) existing();
    const stop = startPlantSimulator((plantState) => {
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
    set({ _plantStop: stop });
    return stop;
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
    set({ selectedAsset: assetId });
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
    const { conversationHistory, plantState } = get();
    const plantContext = buildPlantContextForCopilot(plantState);
    const enrichedMessage = plantContext ? `${plantContext}\n\nOperator question: ${message}` : message;

    try {
      const response = await fetch(`${API_BASE}/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: enrichedMessage, conversationHistory }),
      });
      if (!response.ok) throw new Error('Copilot API error');
      const result = await response.json();

      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: result.response },
        ],
      });

      return result;
    } catch (err) {
      const local = analyzePlantQuery(message, plantState);
      const responseText =
        local ||
        '## Chiller Plant Copilot\n\nI could not reach the AI backend. Try asking about **COP**, **energy savings**, **chiller staging**, **CHWS temperature**, or **alarms**.';

      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: responseText },
        ],
      });

      return { response: responseText, source: 'local-analysis' };
    }
  },

  clearConversation: () => {
    set({ conversationHistory: [] });
  },
}));
