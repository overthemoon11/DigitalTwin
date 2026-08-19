/**
 * MPC controller.
 *
 * The optimisation runs entirely here. The route handler passes a request in
 * and gets an `MpcResult` out; no candidate generation, constraint checking or
 * objective evaluation appears in the HTTP layer.
 *
 * Dependency direction, which is the point of the whole refactor:
 *
 *     API  →  MPC  →  Digital Twin  →  physics
 *
 * The MPC imports the twin. The twin knows nothing about the MPC.
 */
import {
  designConstraints,
  validateConstraintConfig,
  simulateCandidate,
  readBaselineControl,
  readSimulationInput,
  defaultMpcOptimizer,
  applyOptimalControl,
  restoreControlState,
  DEFAULT_MAX_CYCLES,
  VIOLATION_LABELS,
} from '../../mpc/index';
import { stepPlantSimulation } from '../../digital-twin/chiller/index';
import type { ConstraintConfig, ControlState, SimulationInput } from '../../../../shared/types/mpc';
import { ApiError } from './simulationController';
import { publishMpcProgress } from '../../websocket/plantChannel';

/** Deep-merge a partial constraint config over the design defaults, so a client
 *  may send only the fields it changed rather than the whole tree. */
function mergeConstraints(patch: unknown): ConstraintConfig {
  const base = designConstraints();
  if (patch == null) return base;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, '`constraints` must be an object');
  }
  const merge = (a: any, b: any): any => {
    if (b == null) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      return b.map((item, i) => (typeof item === 'object' && item ? merge(a[i] ?? {}, item) : item));
    }
    if (typeof a === 'object' && a && typeof b === 'object') {
      const out: any = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
      return out;
    }
    return b;
  };
  return merge(base, patch) as ConstraintConfig;
}

function coerceInput(raw: any, fallback: SimulationInput): SimulationInput {
  if (raw == null) return fallback;
  const load = Number(raw.buildingLoadRt ?? fallback.buildingLoadRt);
  const wb = Number(raw.wetBulbC ?? fallback.wetBulbC);
  if (!Number.isFinite(load) || load <= 0) {
    throw new ApiError(400, 'simulationInput.buildingLoadRt must be a positive number');
  }
  if (!Number.isFinite(wb)) {
    throw new ApiError(400, 'simulationInput.wetBulbC must be a number');
  }
  return { buildingLoadRt: load, wetBulbC: wb };
}

function coerceControl(raw: any, fallback: ControlState): ControlState {
  if (raw == null) return fallback;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    chwstSetpointC: num(raw.chwstSetpointC, fallback.chwstSetpointC),
    dpSetpointPsi: num(raw.dpSetpointPsi, fallback.dpSetpointPsi),
    runningChillers: Math.round(num(raw.runningChillers, fallback.runningChillers)),
    chillerIds: Array.isArray(raw.chillerIds) ? raw.chillerIds : fallback.chillerIds,
    chwpSpeedPct: num(raw.chwpSpeedPct, fallback.chwpSpeedPct),
    cwpSpeedPct: num(raw.cwpSpeedPct, fallback.cwpSpeedPct),
    ctFanSpeedPct: num(raw.ctFanSpeedPct, fallback.ctFanSpeedPct),
  };
}

/**
 * POST /api/mpc/optimize
 *
 * Body (all optional — anything omitted is taken from the live twin):
 *   { simulationInput?, currentControls?, constraints?, maxCycles?, apply? }
 *
 * `apply: true` commits the winning control state to the live twin, which is
 * what makes the schematic move to the optimised operating point.
 */
export async function optimize(body: any) {
  const plant = stepPlantSimulation();

  const input = coerceInput(body?.simulationInput, readSimulationInput(plant));
  const baselineControl = coerceControl(body?.currentControls, readBaselineControl(plant));
  const constraints = mergeConstraints(body?.constraints);

  const configErrors = validateConstraintConfig(constraints);
  if (configErrors.length) {
    return {
      status: 'INVALID_CONSTRAINTS' as const,
      constraintErrors: configErrors,
      result: null,
    };
  }

  const maxCycles = Number.isFinite(Number(body?.maxCycles))
    ? Math.max(1, Math.min(2000, Math.floor(Number(body.maxCycles))))
    : DEFAULT_MAX_CYCLES;

  const dryBulbHintC = plant.headers?.ambientTemp ?? 31;
  const baselineResult = simulateCandidate(input, baselineControl, constraints, {
    baseline: null,
    dryBulbHintC,
  });

  const result = await defaultMpcOptimizer.optimize(
    { input, constraints, baselineControl, baselineResult, maxCycles, dryBulbHintC },
    {
      // Stream the search so the operator watches it happen. Every third cycle
      // keeps the socket quiet without the counter looking like it stalls.
      onIteration: (_iteration, progress) => {
        if (progress.cycle % 3 === 0 || progress.cycle === maxCycles) {
          publishMpcProgress(progress);
        }
      },
    }
  );

  // Committing is opt-in: a client may want to preview an optimum without
  // moving the plant the rest of the operators are looking at.
  let plantState = null;
  if (body?.apply !== false && result.solved && result.optimalControl) {
    plantState = applyOptimalControl(input, result.optimalControl, {
      dryBulbHintC,
      constraints,
    });
  }

  return {
    status: result.solved ? ('COMPLETED' as const) : ('INFEASIBLE' as const),
    constraintErrors: [],
    result,
    violationLabels: VIOLATION_LABELS,
    plantState,
  };
}

/** POST /api/mpc/simulate — score a single candidate without optimising.
 *  Used by the UI to compute the BEFORE column and to preview a hand edit. */
export function simulate(body: any) {
  const plant = stepPlantSimulation();
  const input = coerceInput(body?.simulationInput, readSimulationInput(plant));
  const control = coerceControl(body?.control, readBaselineControl(plant));
  const constraints = mergeConstraints(body?.constraints);
  return {
    input,
    control,
    result: simulateCandidate(input, control, constraints, {
      baseline: null,
      dryBulbHintC: plant.headers?.ambientTemp ?? 31,
    }),
  };
}

/** POST /api/mpc/restore — put the twin back on a previously captured control
 *  state (the operator's "Restore Before"). */
export function restore(body: any) {
  const plant = stepPlantSimulation();
  const input = coerceInput(body?.simulationInput, readSimulationInput(plant));
  const control = coerceControl(body?.control, readBaselineControl(plant));
  const constraints = mergeConstraints(body?.constraints);
  const plantState = restoreControlState(input, control, {
    dryBulbHintC: plant.headers?.ambientTemp ?? 31,
    constraints,
  });
  return { plantState };
}

/**
 * GET /api/mpc/config — design constraint defaults plus the violation-code
 * labels, so the constraint form and the rejection tally render without the
 * frontend importing MPC code.
 */
export function getMpcConfig() {
  return {
    designConstraints: designConstraints(),
    violationLabels: VIOLATION_LABELS,
    defaultMaxCycles: DEFAULT_MAX_CYCLES,
    optimizer: defaultMpcOptimizer.name,
  };
}

/** GET /api/mpc/baseline — the live plant expressed as SimulationInput +
 *  ControlState, which is the frontend's BEFORE column. */
export function getBaseline() {
  const plant = stepPlantSimulation();
  return {
    input: readSimulationInput(plant),
    control: readBaselineControl(plant),
  };
}
