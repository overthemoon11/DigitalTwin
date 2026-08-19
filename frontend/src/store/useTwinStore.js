import { create } from 'zustand';
/**
 * The chiller plant no longer runs in this process. Every call below goes to
 * the backend, which owns the Digital Twin, the MPC and the 2s tick. The store
 * holds UI state and orchestrates requests — it computes no plant physics.
 */
import * as simulationApi from '../api/simulationApi';
import * as mpcApi from '../api/mpcApi';
import { connectTelemetry } from '../api/telemetryApi';
import { post } from '../api/client';

import {
  parseEtsCopilotIntents,
  formatEtsControlConfirmation,
  formatEtsScenarioConfirmation,
  formatEtsCustomScenarioConfirmation,
  buildEtsControlsSummary,
  buildEtsContextForCopilot,
  analyzeEtsQuery,
} from '../services/ets/etsCopilotActions';

import {
  parseAhuCopilotIntents,
  formatAhuControlConfirmation,
  formatAhuScenarioConfirmation,
  formatAhuCustomScenarioConfirmation,
  buildAhuControlsSummary,
  buildAhuContextForCopilot,
  analyzeAhuQuery,
} from '../services/ahu/ahuCopilotActions';

import {
  startDistrictCoolingSimulator,
  updateDistrictControl as setDistrictControlValue,
  resetDistrictCooling,
  stepDistrictCooling,
  advanceDistrictCooling,
} from '../services/district/districtCoolingSimulator';

import {
  startEtsSimulator,
  updateEtsControl as setEtsControlValue,
  resetEts as resetEtsEngine,
  stepEts,
  advanceEts as advanceEtsEngine,
  applyEtsChanges as applyEtsChangesEngine,
  applyEtsScenario as applyEtsScenarioEngine,
  applyEtsScenarioPayload as applyEtsScenarioPayloadEngine,
} from '../services/ets/etsHeatExchangeEngine';

import {
  startAhuSimulator,
  updateAhuControl as setAhuControlValue,
  resetAhu as resetAhuEngine,
  stepAhu,
  advanceAhu as advanceAhuEngine,
  applyAhuChanges as applyAhuChangesEngine,
  applyAhuScenario as applyAhuScenarioEngine,
  applyAhuScenarioPayload as applyAhuScenarioPayloadEngine,
} from '../services/ahu/ahuEngine';

const API_BASE = '/api';

/** Immutable set of a dotted path inside the constraint config. */
function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  const key = Array.isArray(obj) ? Number(head) : head;
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  next[key] = rest.length ? setPath(obj[key], rest.join('.'), value) : value;
  return next;
}

/**
 * Instant form feedback for the constraint editor: min must not exceed max.
 * This is presentation-level validation only — the authoritative check runs on
 * the backend when the optimisation is requested, and its errors replace these.
 */
function validateConstraints(cfg) {
  const errors = [];
  const pair = (section, minField, maxField, label) => {
    const a = cfg?.[section]?.[minField];
    const b = cfg?.[section]?.[maxField];
    if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
      errors.push({ section, field: minField, message: `${label} min must be ≤ max` });
    }
  };
  pair('chiller', 'minChwstC', 'maxChwstC', 'CHWST');
  pair('chwp', 'minSpeedPct', 'maxSpeedPct', 'CHWP speed');
  pair('chwp', 'minFlowLs', 'maxFlowLs', 'CHWP flow');
  pair('chwp', 'minDpPsi', 'maxDpPsi', 'DP');
  pair('cwp', 'minSpeedPct', 'maxSpeedPct', 'CWP speed');
  pair('cwp', 'minFlowLs', 'maxFlowLs', 'CWP flow');
  pair('tower', 'minFanSpeedPct', 'maxFanSpeedPct', 'CT fan speed');
  pair('system', 'minChwDpPsi', 'maxChwDpPsi', 'System DP');
  pair('system', 'minRunningChillers', 'maxRunningChillers', 'Running chillers');
  (cfg?.chiller?.units ?? []).forEach((u, i) => {
    const p2 = (mn, mx, label) => {
      if (Number.isFinite(u[mn]) && Number.isFinite(u[mx]) && u[mn] > u[mx]) {
        errors.push({ section: 'chiller', field: `units.${i}.${mn}`, message: `${label} min must be ≤ max` });
      }
    };
    p2('minLoadPct', 'maxLoadPct', `${u.name} load`);
    p2('minChwFlowLs', 'maxChwFlowLs', `${u.name} CHW flow`);
    p2('minCwFlowLs', 'maxCwFlowLs', `${u.name} CW flow`);
  });
  return errors;
}

export const useTwinStore = create((set, get) => ({
  twinState: null,
  plantState: null,
  districtCoolingState: null,
  etsState: null,
  ahuState: null,
  activeAppTab: 'chiller_plant',
  activePlantScenario: 'chiller',
  mpcAuto: false,

  /* MPC optimisation simulator slice */
  mpcInput: null,
  mpcConstraints: null,
  mpcConstraintErrors: [],
  mpcViolationLabels: {},
  /** BEFORE control state, derived server-side and delivered with each tick. */
  mpcBaselineControl: null,
  mpcMaxCycles: 140,
  plantConfig: null,
  plantError: null,
  mpcResult: null,
  mpcStatus: 'IDLE',
  mpcProgress: null,
  mpcError: null,
  mpcApplied: false,
  mpcCancelled: false,

  selectedAsset: null,
  isConnected: false,
  ws: null,
  conversationHistory: [],
  modelStatus: null,
  _plantStop: null,
  _districtStop: null,
  _etsStop: null,
  _ahuStop: null,

  setActiveAppTab: (tab) => set({ activeAppTab: tab }),

  setActivePlantScenario: (scenario) => {
    set({ activePlantScenario: scenario, selectedAsset: null });
  },

  initPlantTelemetry: () => {
    const existingPlant = get()._plantStop;
    if (existingPlant) existingPlant();
    const existingDc = get()._districtStop;
    if (existingDc) existingDc();
    const existingEts = get()._etsStop;
    if (existingEts) existingEts();
    const existingAhu = get()._ahuStop;
    if (existingAhu) existingAhu();

    // Live plant state arrives from the backend over /ws. Previously this was
    // a setInterval running the physics locally.
    const plantStop = connectTelemetry({
      onPlantState: (plantState, baseline) => {
        set({ plantState, ...(baseline ? { mpcBaselineControl: baseline.control } : {}) });
        const twin = get().twinState;
        if (twin) {
          set({
            twinState: {
              ...twin,
              metadata: { ...twin.metadata, simulationTime: plantState.simulationTime },
            },
          });
        }
      },
      // The optimiser runs server-side in one request, so it streams its cycle
      // trace here rather than the store driving the loop.
      onMpcProgress: (progress) => set({ mpcProgress: progress }),
      onOpen: () => set({ isConnected: true }),
      onClose: () => set({ isConnected: false }),
    });

    // Static config (control bounds, inventory, scenarios) and the MPC design
    // defaults, fetched once instead of imported from the model.
    simulationApi
      .fetchConfig()
      .then((plantConfig) => set({ plantConfig }))
      .catch((err) => console.error('plant config unavailable:', err.message));
    mpcApi
      .fetchMpcConfig()
      .then((cfg) =>
        set({
          mpcConstraints: cfg.designConstraints,
          mpcViolationLabels: cfg.violationLabels,
          mpcMaxCycles: cfg.defaultMaxCycles,
        })
      )
      .catch((err) => console.error('mpc config unavailable:', err.message));

    const districtStop = startDistrictCoolingSimulator((districtCoolingState) => {
      set({ districtCoolingState });
    });

    const etsStop = startEtsSimulator((etsState) => {
      set({ etsState });
    });

    const ahuStop = startAhuSimulator((ahuState) => {
      set({ ahuState });
    });

    set({ _plantStop: plantStop, _districtStop: districtStop, _etsStop: etsStop, _ahuStop: ahuStop });
    return () => {
      plantStop();
      districtStop();
      etsStop();
      ahuStop();
    };
  },

  updateEtsControl: (controlId, value) => {
    setEtsControlValue(controlId, value);
    set({ etsState: stepEts() });
  },

  advanceEts: (seconds = 30) => {
    const steps = Math.max(1, Math.floor(seconds / 2));
    set({ etsState: advanceEtsEngine(steps) });
  },

  /** Commit a batch of staged ETS control edits and fast-forward (before→after cascade). */
  applyEtsChanges: (changes = []) => {
    set({ etsState: applyEtsChangesEngine(changes, 30) });
  },

  applyEtsScenario: (scenarioId) => {
    set({ etsState: applyEtsScenarioEngine(scenarioId) });
  },

  resetEts: () => {
    resetEtsEngine();
    set({ etsState: stepEts() });
  },

  updateAhuControl: (controlId, value) => {
    setAhuControlValue(controlId, value);
    set({ ahuState: stepAhu() });
  },

  advanceAhu: (seconds = 30) => {
    const steps = Math.max(1, Math.floor(seconds / 2));
    set({ ahuState: advanceAhuEngine(steps) });
  },

  /** Commit a batch of staged control edits and fast-forward (before→after cascade). */
  applyAhuChanges: (changes = []) => {
    set({ ahuState: applyAhuChangesEngine(changes, 30) });
  },

  applyAhuScenario: (scenarioId) => {
    set({ ahuState: applyAhuScenarioEngine(scenarioId) });
  },

  resetAhu: () => {
    resetAhuEngine();
    set({ ahuState: stepAhu() });
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

  /* --------------------------------------------------------------------- */
  /* Plant mutations. Each one is a request to the backend, which owns the   */
  /* twin; the response is the authoritative new state. The backend also     */
  /* broadcasts it over /ws, so other open clients stay in step.             */
  /* --------------------------------------------------------------------- */

  updatePlantControl: async (controlId, value) => {
    try {
      set({ plantState: await simulationApi.setControl(controlId, value) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  resetPlant: async () => {
    try {
      set({ plantState: await simulationApi.resetPlant() });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  triggerPlantFault: async (faultType) => {
    try {
      set({ plantState: await simulationApi.triggerFault(faultType) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  acknowledgePlantAlert: async (alertId) => {
    try {
      set({ plantState: await simulationApi.acknowledgeAlert(alertId) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  advancePlantSimulation: async (seconds = 60) => {
    try {
      set({ plantState: await simulationApi.advance(seconds) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  /** Commit a batch of staged edits and fast-forward (before→after cascade). */
  applyPlantChanges: async (changes = []) => {
    try {
      set({ plantState: await simulationApi.applyChanges(changes, 60) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  /** Toggle a unit between duty and standby (real-plant rotation). */
  togglePlantDuty: async (category, unit) => {
    try {
      set({ plantState: await simulationApi.toggleDuty(category, unit) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  applyChillerScenario: async (scenarioId) => {
    try {
      set({ plantState: await simulationApi.applyScenarioId(scenarioId) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  /** Replay an ad-hoc scenario payload (e.g. a dataset-row replay). */
  applyChillerScenarioPayload: async (payload) => {
    try {
      set({ plantState: await simulationApi.applyScenarioPayload(payload) });
    } catch (err) {
      set({ plantError: err.message });
    }
  },

  /* ---------------------------------------------------------------------- */
  /* MPC optimisation simulator                                             */
  /*                                                                        */
  /* `mpcBaseline` is captured the moment RUN is pressed and is never        */
  /* mutated by the search — that immutability is what makes the left        */
  /* sidebar's before/after honest. The optimised state is applied to the    */
  /* live engine so the schematic and KPI tiles move through the normal      */
  /* path; nothing renders from a parallel copy of the plant.                */
  /* ---------------------------------------------------------------------- */

  /** Seed the MPC disturbance input from the live twin, once. The BEFORE control
   *  state is deliberately NOT cached here — it is read fresh from the plant the
   *  moment RUN is pressed, so it can never go stale against manual edits. */
  initMpcFromPlant: async (force = false) => {
    const { mpcInput, mpcStatus } = get();
    if (mpcStatus === 'RUNNING') return;
    if (mpcInput && !force) return;
    try {
      const { input } = await mpcApi.fetchBaseline();
      set({ mpcInput: input });
    } catch (err) {
      console.error('mpc baseline unavailable:', err.message);
    }
  },

  setMpcInput: (patch) =>
    set((s) => ({
      mpcInput: { ...(s.mpcInput ?? { buildingLoadRt: 3100, wetBulbC: 24.8 }), ...patch },
    })),

  setMpcConstraint: (path, value) =>
    set((s) => {
      const next = setPath(s.mpcConstraints, path, value);
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraints(next) };
    }),

  /** Apply one field to every chiller at once. The data model stays per-unit —
   *  this is only the compact "common configuration" editor the sidebar shows. */
  setMpcChillerFleet: (field, value) =>
    set((s) => {
      const next = {
        ...s.mpcConstraints,
        chiller: {
          ...s.mpcConstraints.chiller,
          units: s.mpcConstraints.chiller.units.map((u) => ({ ...u, [field]: value })),
        },
      };
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraints(next) };
    }),

  /** First N machines available for staging, the rest out of service. */
  setMpcAvailableChillers: (count) =>
    set((s) => {
      const n = Math.max(0, Math.round(count));
      const next = {
        ...s.mpcConstraints,
        chiller: {
          ...s.mpcConstraints.chiller,
          units: s.mpcConstraints.chiller.units.map((u, i) => ({ ...u, available: i < n })),
        },
      };
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraints(next) };
    }),

  /** Restore the plant's design defaults, re-fetched from the backend so the
   *  frontend never carries a second copy of them. */
  resetMpcConstraints: async () => {
    try {
      const cfg = await mpcApi.fetchMpcConfig();
      set({ mpcConstraints: cfg.designConstraints, mpcConstraintErrors: [] });
    } catch (err) {
      set({ mpcError: err.message });
    }
  },

  cancelMpc: () => set({ mpcCancelled: true }),

  /** Put the twin back on the control state that was captured as BEFORE. */
  restoreMpcBaseline: async () => {
    const { mpcInput, mpcResult, mpcConstraints } = get();
    const control = mpcResult?.baselineControl;
    if (!mpcInput || !control) return;
    try {
      const { plantState } = await mpcApi.restoreControl({
        simulationInput: mpcInput,
        control,
        constraints: mpcConstraints,
      });
      set({ plantState, mpcApplied: false });
    } catch (err) {
      set({ mpcError: err.message });
    }
  },

  /** Re-apply the optimum found by the last completed run. */
  reapplyMpcOptimum: async () => {
    const { mpcInput, mpcResult, mpcConstraints } = get();
    const control = mpcResult?.optimalControl;
    if (!mpcInput || !control) return;
    try {
      const { plantState } = await mpcApi.restoreControl({
        simulationInput: mpcInput,
        control,
        constraints: mpcConstraints,
      });
      set({ plantState, mpcApplied: true });
    } catch (err) {
      set({ mpcError: err.message });
    }
  },

  /**
   * Full RUN MPC SIMULATION workflow: validate → snapshot baseline → search →
   * apply the best feasible candidate to the twin.
   */
  /**
   * RUN MPC SIMULATION.
   *
   * One POST. The backend validates the constraints, snapshots the baseline,
   * runs the search over the Digital Twin and commits the winner — the browser
   * no longer performs any of that. Live cycle progress arrives separately on
   * the WebSocket (`mpc_progress`), which is what keeps the status panel's
   * cycle trace working now that the loop is server-side.
   */
  runMpcSimulation: async () => {
    const state = get();
    if (state.mpcStatus === 'RUNNING') return;

    set({
      mpcStatus: 'RUNNING',
      mpcError: null,
      mpcProgress: null,
      mpcCancelled: false,
      mpcConstraintErrors: [],
    });

    try {
      const response = await mpcApi.runMpc({
        simulationInput: state.mpcInput ?? undefined,
        constraints: state.mpcConstraints,
        apply: true,
      });

      if (response.status === 'INVALID_CONSTRAINTS') {
        set({
          mpcConstraintErrors: response.constraintErrors,
          mpcStatus: 'ERROR',
          mpcError: 'Constraint configuration is invalid.',
          mpcProgress: null,
        });
        return;
      }

      const patch = {
        mpcResult: response.result,
        mpcProgress: null,
        mpcStatus: response.status === 'COMPLETED' ? 'COMPLETED' : 'INFEASIBLE',
        mpcApplied: response.status === 'COMPLETED',
      };
      if (response.plantState) patch.plantState = response.plantState;
      set(patch);
    } catch (err) {
      set({ mpcStatus: 'ERROR', mpcError: err.message, mpcProgress: null });
    }
  },

  loadTwinState: async () => {
    try {
      const response = await fetch(`${API_BASE}/twin`);
      const data = await response.json();
      set({ twinState: data, isConnected: true });


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
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
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
    const {
      conversationHistory,
      plantState,
      etsState,
      ahuState,
      activePlantScenario,
      updatePlantControl,
      updateEtsControl,
      updateAhuControl,
    } = get();
    const isEts = activePlantScenario === 'ets';
    const isAhu = activePlantScenario === 'ahu';

    let prependHeader = '';
    let parseErrors = [];
    let controlsApplied = false;
    let plantContext = '';
    let plantControls = [];
    let appliedControls = [];
    // Locally-derived answer returned by the backend copilot endpoint.
    let chillerAnalysis = '';

    if (isEts) {
      const controls = etsState?.controls ?? [];
      const parsed = parseEtsCopilotIntents(message, controls);
      parseErrors = parsed.errors;

      if (parsed.scenarioId) {
        set({ etsState: applyEtsScenarioEngine(parsed.scenarioId) });
        prependHeader = formatEtsScenarioConfirmation(parsed.scenarioId);
        controlsApplied = true;
      } else if (parsed.scenarioPayload) {
        set({ etsState: applyEtsScenarioPayloadEngine(parsed.scenarioPayload) });
        prependHeader = formatEtsCustomScenarioConfirmation(parsed.scenarioPayload);
        controlsApplied = true;
      } else if (parsed.applied.length) {
        for (const action of parsed.applied) {
          updateEtsControl(action.controlId, action.newValue);
        }
        prependHeader = formatEtsControlConfirmation(parsed.applied);
        controlsApplied = true;
        appliedControls = parsed.applied.map((a) => ({
          controlId: a.controlId,
          label: a.label,
          oldValue: a.oldValue,
          newValue: a.newValue,
          unit: a.unit,
        }));
      }

      plantContext = buildEtsContextForCopilot(get().etsState);
      plantControls = buildEtsControlsSummary(get().etsState?.controls ?? []);
    } else if (isAhu) {
      const controls = ahuState?.controls ?? [];
      const parsed = parseAhuCopilotIntents(message, controls);
      parseErrors = parsed.errors;

      if (parsed.scenarioId) {
        set({ ahuState: applyAhuScenarioEngine(parsed.scenarioId) });
        prependHeader = formatAhuScenarioConfirmation(parsed.scenarioId);
        controlsApplied = true;
      } else if (parsed.scenarioPayload) {
        set({ ahuState: applyAhuScenarioPayloadEngine(parsed.scenarioPayload) });
        prependHeader = formatAhuCustomScenarioConfirmation(parsed.scenarioPayload);
        controlsApplied = true;
      } else if (parsed.applied.length) {
        for (const action of parsed.applied) {
          updateAhuControl(action.controlId, action.newValue);
        }
        prependHeader = formatAhuControlConfirmation(parsed.applied);
        controlsApplied = true;
        appliedControls = parsed.applied.map((a) => ({
          controlId: a.controlId,
          label: a.label,
          oldValue: a.oldValue,
          newValue: a.newValue,
          unit: a.unit,
        }));
      }

      plantContext = buildAhuContextForCopilot(get().ahuState);
      plantControls = buildAhuControlsSummary(get().ahuState?.controls ?? []);
    } else {
      // Chiller intent parsing runs on the backend now: resolving "set building
      // load to 3200" against the live control set and applying it is plant
      // business logic, and the plant no longer lives in this process.
      try {
        const res = await post('/copilot/chiller', { message });
        parseErrors = res.errors ?? [];
        prependHeader = res.header ?? '';
        controlsApplied = res.controlsApplied;
        appliedControls = res.appliedControls ?? [];
        chillerAnalysis = res.analysis ?? '';
        plantContext = res.plantContext;
        plantControls = res.plantControls;
        if (res.plantState) set({ plantState: res.plantState });
      } catch (err) {
        parseErrors = [err.message];
      }
    }

    const prependConfirmation = (text) => {
      const errNote = parseErrors.length ? `\n\n⚠️ ${parseErrors.join(' ')}` : '';
      if (!prependHeader) return text ? `${text}${errNote}` : errNote.trim();
      return text ? `${prependHeader}${errNote}\n\n${text}` : `${prependHeader}${errNote}`;
    };

    // Scenario / control commands — apply in simulator first, respond locally (no backend wait)
    if (controlsApplied && prependHeader) {
      const local = isEts
        ? analyzeEtsQuery(message, get().etsState)
        : isAhu
          ? analyzeAhuQuery(message, get().ahuState)
          : chillerAnalysis;
      const responseText = prependConfirmation(local || '');
      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: responseText },
        ],
      });
      return { response: responseText, controlsApplied, source: 'local-action' };
    }

    // Scenario / query buttons — answer locally without backend round-trip
    if (isAhu || isEts || (!isEts && !isAhu)) {
      const localQuery = isAhu
        ? analyzeAhuQuery(message, get().ahuState)
        : isEts
          ? analyzeEtsQuery(message, get().etsState)
          : chillerAnalysis;
      if (localQuery) {
        const responseText = prependConfirmation(localQuery);
        set({
          conversationHistory: [
            ...conversationHistory,
            { role: 'user', content: message },
            { role: 'assistant', content: responseText },
          ],
        });
        return { response: responseText, controlsApplied: false, source: 'local-analysis' };
      }
    }

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
          simulatorMode: isEts ? 'ets' : isAhu ? 'ahu' : 'chiller_plant',
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

      return { ...result, response: responseText, controlsApplied };
    } catch (err) {
      const local = isEts
        ? analyzeEtsQuery(message, get().etsState)
        : isAhu
          ? analyzeAhuQuery(message, get().ahuState)
          : chillerAnalysis;
      const fallback = local ||
        (isEts
          ? '## ETS Chatbot\n\nTry **"run peak summer scenario"**, paste scenario JSON, or **"set building load to 950 RT"**.'
          : isAhu
            ? '## AHU01 Chatbot\n\nTry **"run high humidity scenario"**, paste scenario JSON, or **"set zone load to 1.35"**.'
            : '## Chiller Plant Chatbot\n\nTry **"run peak summer scenario"**, paste scenario JSON, or **"set building load to 1300 RT"**.');
      const responseText = prependConfirmation(fallback);

      set({
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: responseText },
        ],
      });

      return { response: responseText, source: 'local-analysis', controlsApplied };
    }
  },

  clearConversation: () => {
    set({ conversationHistory: [] });
  },
}));
