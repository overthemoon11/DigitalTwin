import { create } from 'zustand';
import {
  startPlantSimulator,
  updatePlantControl as setPlantControlValue,
  resetPlantControls,
  triggerPlantFault as setPlantFault,
  stepPlantSimulation,
  advancePlantSimulation,
  applyPlantChanges as applyPlantChangesEngine,
  applyChillerScenario as applyChillerScenarioEngine,
  applyChillerScenarioPayload as applyChillerScenarioPayloadEngine,
  acknowledgePlantAlert as ackPlantAlert,
  getPlantControls,
  togglePlantDutyUnit as togglePlantDutyUnitEngine,
} from '../services/chiller/plantSimulator';
import { computeMpcMove as computeMpcMoveEngine } from '../services/chiller/plantMpc';
import {
  designConstraints,
  validateConstraintConfig,
  simulateCandidate,
  readBaselineControl,
  readSimulationInput,
  defaultMpcOptimizer,
  DEFAULT_MAX_CYCLES,
  applyOptimalControl,
  restoreControlState,
} from '../services/chiller/mpc';
import {
  parseChillerCopilotIntents,
  formatChillerControlConfirmation,
  formatChillerScenarioConfirmation,
  formatChillerCustomScenarioConfirmation,
  buildChillerControlsSummary,
  buildChillerContextForCopilot,
  analyzeChillerQuery,
} from '../services/chiller/chillerCopilotActions';

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

/** Yield to the browser so the MPC status panel repaints mid-search. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  mpcConstraints: designConstraints(),
  mpcConstraintErrors: [],
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
      // Closed-loop MPC: each tick, apply the first move of the kW/RT-optimal
      // plan. Move-suppression keeps per-tick moves gentle; re-solving every
      // tick is the receding horizon. Applied setpoints take effect next tick.
      if (get().mpcAuto) {
        const res = computeMpcMoveEngine({ horizon: 12, maxPasses: 2, rateLimitFrac: 0.34 });
        for (const r of res.recommendations) {
          if (r.changed) setPlantControlValue(r.controlId, r.recommendedValue);
        }
      }
    });

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

  /** Commit a batch of staged chiller-plant edits and fast-forward (before→after cascade). */
  applyPlantChanges: (changes = []) => {
    set({ plantState: applyPlantChangesEngine(changes, 60) });
  },

  /** Toggle a unit between duty and standby (real-plant rotation). */
  togglePlantDuty: (category, unit) => {
    togglePlantDutyUnitEngine(category, unit);
    set({ plantState: stepPlantSimulation() });
  },

  applyChillerScenario: (scenarioId) => {
    set({ plantState: applyChillerScenarioEngine(scenarioId) });
  },

  /** Replay an ad-hoc scenario payload (e.g. a dataset-row replay). */
  applyChillerScenarioPayload: (payload) => {
    set({ plantState: applyChillerScenarioPayloadEngine(payload) });
  },

  /** Compute the MPC control move (minimising predicted kW/RT) for the current
   *  plant state. Pure read — does not commit; the panel stages the first move
   *  as pending drafts for the operator to Apply. */
  computeMpcMove: () => computeMpcMoveEngine(),

  /** Toggle closed-loop MPC auto mode (applies the first move each tick). */
  setMpcAuto: (on) => set({ mpcAuto: !!on }),

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
  initMpcFromPlant: (force = false) => {
    const { plantState, mpcInput, mpcStatus } = get();
    if (!plantState || mpcStatus === 'RUNNING') return;
    if (mpcInput && !force) return;
    set({ mpcInput: readSimulationInput(plantState) });
  },

  setMpcInput: (patch) =>
    set((s) => ({
      mpcInput: { ...(s.mpcInput ?? { buildingLoadRt: 3100, wetBulbC: 24.8 }), ...patch },
    })),

  setMpcConstraint: (path, value) =>
    set((s) => {
      const next = setPath(s.mpcConstraints, path, value);
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraintConfig(next) };
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
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraintConfig(next) };
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
      return { mpcConstraints: next, mpcConstraintErrors: validateConstraintConfig(next) };
    }),

  resetMpcConstraints: () => {
    const next = designConstraints();
    set({ mpcConstraints: next, mpcConstraintErrors: validateConstraintConfig(next) });
  },

  cancelMpc: () => set({ mpcCancelled: true }),

  /** Put the twin back on the control state that was captured as BEFORE. */
  restoreMpcBaseline: () => {
    const { mpcInput, mpcResult, mpcConstraints, plantState } = get();
    const control = mpcResult?.baselineControl;
    if (!mpcInput || !control) return;
    const next = restoreControlState(mpcInput, control, {
      dryBulbHintC: plantState?.headers?.ambientTemp ?? 31,
      constraints: mpcConstraints,
    });
    set({ plantState: next, mpcApplied: false });
  },

  /** Re-apply the optimum found by the last completed run. */
  reapplyMpcOptimum: () => {
    const { mpcInput, mpcResult, mpcConstraints, plantState } = get();
    const control = mpcResult?.optimalControl;
    if (!mpcInput || !control) return;
    const next = applyOptimalControl(mpcInput, control, {
      dryBulbHintC: plantState?.headers?.ambientTemp ?? 31,
      constraints: mpcConstraints,
    });
    set({ plantState: next, mpcApplied: true });
  },

  /**
   * Full RUN MPC SIMULATION workflow: validate → snapshot baseline → search →
   * apply the best feasible candidate to the twin.
   */
  runMpcSimulation: async () => {
    const state = get();
    if (state.mpcStatus === 'RUNNING') return;

    const plantState = state.plantState;
    if (!plantState) {
      set({ mpcStatus: 'ERROR', mpcError: 'Plant simulator has not started yet.' });
      return;
    }

    set({ mpcStatus: 'VALIDATING', mpcError: null, mpcProgress: null, mpcCancelled: false });

    const constraints = state.mpcConstraints;
    const errors = validateConstraintConfig(constraints);
    if (errors.length) {
      set({ mpcConstraintErrors: errors, mpcStatus: 'ERROR', mpcError: 'Constraint configuration is invalid.' });
      return;
    }
    set({ mpcConstraintErrors: [] });

    const input = state.mpcInput ?? readSimulationInput(plantState);
    const dryBulbHintC = plantState.headers?.ambientTemp ?? 31;

    // BEFORE = whatever the plant is doing right now, frozen for this run and
    // never mutated by the search. Read fresh so manual edits are picked up.
    const baselineControl = readBaselineControl(plantState);
    let baselineResult;
    try {
      baselineResult = simulateCandidate(input, baselineControl, constraints, {
        baseline: null,
        dryBulbHintC,
      });
    } catch (err) {
      set({ mpcStatus: 'ERROR', mpcError: `Baseline simulation failed: ${err?.message ?? err}` });
      return;
    }

    set({ mpcStatus: 'RUNNING', mpcInput: input });

    try {
      const result = await defaultMpcOptimizer.optimize(
        {
          input,
          constraints,
          baselineControl,
          baselineResult,
          maxCycles: DEFAULT_MAX_CYCLES,
          dryBulbHintC,
        },
        {
          isCancelled: () => get().mpcCancelled === true,
          onIteration: async (_iteration, progress) => {
            set({ mpcProgress: progress });
            // Repaint every few candidates — often enough to read as a live
            // search, rare enough not to dominate the run with renders.
            if (progress.cycle % 3 === 0) await nextFrame();
          },
        }
      );

      if (!result.solved || !result.optimalControl) {
        set({ mpcResult: result, mpcStatus: 'INFEASIBLE', mpcProgress: null, mpcApplied: false });
        return;
      }

      const nextPlant = applyOptimalControl(input, result.optimalControl, {
        dryBulbHintC,
        constraints,
      });
      set({
        mpcResult: result,
        mpcStatus: 'COMPLETED',
        mpcProgress: null,
        mpcApplied: true,
        plantState: nextPlant,
      });
    } catch (err) {
      set({ mpcStatus: 'ERROR', mpcError: err?.message ?? String(err), mpcProgress: null });
    }
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
      const controls = plantState?.controls ?? getPlantControls();
      const parsed = parseChillerCopilotIntents(message, controls);
      parseErrors = parsed.errors;

      if (parsed.scenarioId) {
        set({ plantState: applyChillerScenarioEngine(parsed.scenarioId) });
        prependHeader = formatChillerScenarioConfirmation(parsed.scenarioId);
        controlsApplied = true;
      } else if (parsed.scenarioPayload) {
        set({ plantState: applyChillerScenarioPayloadEngine(parsed.scenarioPayload) });
        prependHeader = formatChillerCustomScenarioConfirmation(parsed.scenarioPayload);
        controlsApplied = true;
      } else if (parsed.applied.length) {
        for (const action of parsed.applied) {
          updatePlantControl(action.controlId, action.newValue);
        }
        prependHeader = formatChillerControlConfirmation(parsed.applied);
        controlsApplied = true;
        appliedControls = parsed.applied.map((a) => ({
          controlId: a.controlId,
          label: a.label,
          oldValue: a.oldValue,
          newValue: a.newValue,
          unit: a.unit,
        }));
      }

      plantContext = buildChillerContextForCopilot(get().plantState);
      plantControls = buildChillerControlsSummary(get().plantState?.controls ?? controls);
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
          : analyzeChillerQuery(message, get().plantState);
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
          : analyzeChillerQuery(message, get().plantState);
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
          : analyzeChillerQuery(message, get().plantState);
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
