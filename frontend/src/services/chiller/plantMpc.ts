/**
 * Model-Predictive Control (MPC) for the L29 chiller plant.
 *
 * At each solve the controller predicts the plant's response to candidate
 * setpoint moves over a finite horizon (using the live physics engine as its
 * prediction model — see `predictPlant`) and returns the move that minimises
 * predicted **plant efficiency in kW/RT** (NOT COP). Only the first move is
 * returned; re-solving each tick realises receding-horizon closed-loop MPC.
 *
 * Gentleness is enforced the correct way for MPC — an *input rate limit* on the
 * applied move (`rateLimitFrac`), not an objective penalty. A penalty on
 * distance-from-current would bias the target and leave a permanent offset from
 * the true kW/RT optimum; a rate limit lets the controller ease toward the true
 * optimum over successive ticks with no steady-state offset.
 */
import type { PlantControl } from '../../types/plant';
import { predictPlant, getPlantControls } from './controlEngine';
import { round, clamp } from './plantPhysics';

export interface MpcConfig {
  /** Prediction horizon in 2-second ticks. */
  horizon: number;
  /** Setpoint controls the MPC is allowed to move. */
  controlVars: string[];
  /** Coordinate-descent passes over the control grids. */
  maxPasses: number;
  /** Penalty per predicted tick that trips a critical alarm (soft constraint). */
  criticalPenalty: number;
  /** Deadband on the objective: only accept a move that lowers predicted kW/RT
   *  by more than this, so rounding-level noise moves are ignored. */
  improvementEps: number;
  /** Input rate limit: max change of any setpoint per solve, as a fraction of
   *  that control's range. `null` = no limit (advisory shows the full optimum);
   *  closed-loop auto mode passes a value so it eases in over ticks. */
  rateLimitFrac: number | null;
}

export const DEFAULT_MPC_CONFIG: MpcConfig = {
  horizon: 20, // 20 × 2s = 40s look-ahead (≈ 1–1.5 lag time-constants)
  controlVars: ['ctrl-chws-sp', 'ctrl-cws-sp', 'ctrl-dp-sp'],
  maxPasses: 3,
  criticalPenalty: 5,
  improvementEps: 0.003, // kW/RT
  rateLimitFrac: null,
};

export interface MpcRecommendation {
  controlId: string;
  label: string;
  unit: string;
  currentValue: number;
  recommendedValue: number;
  changed: boolean;
}

export interface MpcResult {
  recommendations: MpcRecommendation[];
  horizonSec: number;
  /** Predicted mean kW/RT holding the current setpoints. */
  before: { kwPerRt: number; totalKw: number };
  /** Predicted mean kW/RT under the recommended move. */
  after: { kwPerRt: number; totalKw: number };
  savingsKw: number;
  savingsPct: number;
  buildingLoadRt: number;
  evaluations: number;
  feasible: boolean;
  /** True when the returned move was rate-limited short of the full optimum. */
  rateLimited: boolean;
}

interface CostResult {
  obj: number;
  kwPerRt: number;
  totalKw: number;
  buildingLoadRt: number;
  hasCritical: boolean;
}

/** MPC search resolution — decoupled from the UI input step (which may be as
 *  fine as 0.01): never more than ~21 candidates per control, so coordinate
 *  descent stays fast no matter how fine manual typing is allowed to be. */
function searchStep(c: PlantControl): number {
  const inputStep = c.step && c.step > 0 ? c.step : 1;
  return Math.max(inputStep, (c.max - c.min) / 20);
}

/** All grid values for a control from its own min/max at the search step. */
function gridValues(c: PlantControl): number[] {
  const out: number[] = [];
  const step = searchStep(c);
  for (let v = c.min; v <= c.max + 1e-9; v += step) out.push(round(v, 3));
  return out;
}

/** Snap a value to the control's search grid and clamp to its range. */
function snapToGrid(v: number, c: PlantControl): number {
  const step = searchStep(c);
  const snapped = Math.round((v - c.min) / step) * step + c.min;
  return round(clamp(snapped, c.min, c.max), 3);
}

/** Predicted horizon cost for a candidate move: mean kW/RT + critical penalty. */
function horizonCost(candidate: Record<string, number>, cfg: MpcConfig): CostResult {
  const stages = predictPlant(candidate, cfg.horizon);
  let sumKwPerRt = 0;
  let criticalTicks = 0;
  for (const s of stages) {
    sumKwPerRt += s.kwPerRt;
    if (s.hasCritical) criticalTicks++;
  }
  const meanKwPerRt = sumKwPerRt / stages.length;
  const last = stages[stages.length - 1];
  return {
    obj: meanKwPerRt + cfg.criticalPenalty * (criticalTicks / stages.length),
    kwPerRt: round(meanKwPerRt, 3),
    totalKw: last.totalKw,
    buildingLoadRt: last.buildingLoadRt,
    hasCritical: criticalTicks > 0,
  };
}

/**
 * Compute the MPC control move for the current plant state.
 * Minimises predicted kW/RT over the horizon; returns the first move only.
 */
export function computeMpcMove(config: Partial<MpcConfig> = {}): MpcResult {
  const cfg = { ...DEFAULT_MPC_CONFIG, ...config };
  const controls = getPlantControls();
  const vars = cfg.controlVars
    .map((id) => controls.find((c) => c.id === id))
    .filter((c): c is PlantControl => !!c);

  const current: Record<string, number> = {};
  for (const c of vars) current[c.id] = typeof c.value === 'number' ? c.value : c.min;

  let evaluations = 0;
  const evalCost = (cand: Record<string, number>): CostResult => {
    evaluations++;
    return horizonCost(cand, cfg);
  };

  const baseline = evalCost({ ...current });
  let best = { ...current };
  let bestCost = baseline.obj;

  // Cyclic coordinate descent over each control's grid. The kW/RT objective is
  // separable in this model, so this reaches the discrete optimum in 1–2 passes.
  // The deadband (improvementEps) rejects rounding-noise moves.
  for (let pass = 0; pass < cfg.maxPasses; pass++) {
    let improved = false;
    for (const c of vars) {
      for (const v of gridValues(c)) {
        if (v === best[c.id]) continue;
        const m = evalCost({ ...best, [c.id]: v });
        if (m.obj < bestCost - cfg.improvementEps) {
          bestCost = m.obj;
          best = { ...best, [c.id]: v };
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // Receding-horizon first move: optionally rate-limit toward the optimum.
  let rateLimited = false;
  const move = { ...best };
  if (cfg.rateLimitFrac != null) {
    for (const c of vars) {
      const maxDelta = cfg.rateLimitFrac * (c.max - c.min);
      const stepped = snapToGrid(current[c.id] + clamp(best[c.id] - current[c.id], -maxDelta, maxDelta), c);
      if (stepped !== best[c.id]) rateLimited = true;
      move[c.id] = stepped;
    }
  }

  const moveMetrics = shallowEqual(move, best) ? evalCost(best) : evalCost(move);

  const recommendations: MpcRecommendation[] = vars.map((c) => ({
    controlId: c.id,
    label: c.label,
    unit: c.unit ?? '',
    currentValue: current[c.id],
    recommendedValue: move[c.id],
    changed: move[c.id] !== current[c.id],
  }));

  const savingsKw = round(baseline.totalKw - moveMetrics.totalKw, 1);
  const savingsPct =
    baseline.kwPerRt > 0
      ? round(((baseline.kwPerRt - moveMetrics.kwPerRt) / baseline.kwPerRt) * 100, 1)
      : 0;

  return {
    recommendations,
    horizonSec: cfg.horizon * 2,
    before: { kwPerRt: baseline.kwPerRt, totalKw: round(baseline.totalKw, 1) },
    after: { kwPerRt: moveMetrics.kwPerRt, totalKw: round(moveMetrics.totalKw, 1) },
    savingsKw,
    savingsPct,
    buildingLoadRt: moveMetrics.buildingLoadRt,
    evaluations,
    feasible: !moveMetrics.hasCritical,
    rateLimited,
  };
}

function shallowEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}
