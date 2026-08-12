/**
 * The MPC objective.
 *
 * Minimise TOTAL PLANT kW = chiller + CHWP + CWP + cooling tower. There is no
 * target efficiency to hit — the optimiser finds the lowest feasible power for
 * whatever operating condition it is handed. kW/RT is reported alongside, and
 * is the same ranking whenever the building load is fixed (which it is inside a
 * single run, since load is a disturbance the MPC cannot move).
 *
 * Infeasible candidates score `Infinity`, so a violating candidate can never
 * beat a feasible one no matter how little power it draws.
 */
import type { SimulationResult } from '../../../types/mpc';

export function objective(result: SimulationResult): number {
  if (!result.feasible) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(result.totalPlantKw)) return Number.POSITIVE_INFINITY;
  return result.totalPlantKw;
}

/** True when `candidate` is a strict improvement on `incumbent`. */
export function improves(candidate: SimulationResult, incumbent: SimulationResult | null): boolean {
  const c = objective(candidate);
  if (!Number.isFinite(c)) return false;
  if (!incumbent) return true;
  return c < objective(incumbent) - 1e-6;
}

export function savings(baseline: SimulationResult, optimal: SimulationResult | null) {
  if (!optimal) return { savingKw: 0, savingPct: 0 };
  const savingKw = baseline.totalPlantKw - optimal.totalPlantKw;
  const savingPct = baseline.totalPlantKw > 0 ? (savingKw / baseline.totalPlantKw) * 100 : 0;
  return { savingKw: Math.round(savingKw * 10) / 10, savingPct: Math.round(savingPct * 10) / 10 };
}
