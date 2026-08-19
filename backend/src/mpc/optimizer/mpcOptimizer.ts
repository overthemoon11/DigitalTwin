/**
 * MPC optimiser.
 *
 * `MpcOptimizer` is the abstraction the UI talks to. Everything above it —
 * panels, store, status display — depends only on this interface, so the search
 * strategy underneath can be swapped for a nonlinear solver, SciPy/CasADi over
 * the HTTP scoring API, Bayesian optimisation or a learned policy without any
 * UI change.
 *
 * The shipped strategy is `ConstrainedCoordinateSearch`: staging enumeration ×
 * cyclic coordinate descent over the five continuous axes, coarse pass then
 * local refinement. It is a genuine constrained search over the calibrated
 * plant model — every candidate is simulated and validated, and infeasible
 * candidates are rejected before they can win. It is NOT a heuristic that
 * applies a canned percentage reduction.
 *
 * Why coordinate descent: the objective is cheap (one steady-state engine
 * evaluation, sub-millisecond) but non-smooth — staging is integer, the tower
 * approach saturates at its physical floor, and the loop ΔT clamps. Gradients
 * are unreliable across those kinks; a grid-then-refine sweep is robust and
 * gives the operator an interpretable cycle-by-cycle trace.
 */
import type {
  ConstraintConfig,
  ControlState,
  MpcIteration,
  MpcProgress,
  MpcResult,
  SimulationInput,
  SimulationResult,
} from '../../../../shared/types/mpc';
import { simulateCandidate } from '../simulator/chillerPlantSimulator';
import { improves, objective, savings } from './objectiveFunction';
import { axisGrid, chillerIdsFor, continuousAxes, localGrid, stagingOptions } from './candidateGenerator';

export interface MpcContext {
  input: SimulationInput;
  constraints: ConstraintConfig;
  baselineControl: ControlState;
  baselineResult: SimulationResult;
  /** Hard ceiling on simulated candidates. */
  maxCycles: number;
  /** Dry-bulb the weather inversion starts from (the plant's current OAT). */
  dryBulbHintC: number;
}

export interface MpcHooks {
  /** Called after every simulated candidate; may await to let the UI paint. */
  onIteration?: (iteration: MpcIteration, progress: MpcProgress) => void | Promise<void>;
  /** Cooperative cancellation. */
  isCancelled?: () => boolean;
}

export interface MpcOptimizer {
  readonly name: string;
  optimize(ctx: MpcContext, hooks?: MpcHooks): Promise<MpcResult>;
}

/** Coarse grid resolution per axis, then the local refinement resolution. */
const COARSE_POINTS = 5;
const REFINE_POINTS = 3;

export const DEFAULT_MAX_CYCLES = 140;

function cloneControl(c: ControlState): ControlState {
  return { ...c, chillerIds: [...c.chillerIds] };
}

class ConstrainedCoordinateSearch implements MpcOptimizer {
  readonly name = 'Constrained coordinate search';

  async optimize(ctx: MpcContext, hooks: MpcHooks = {}): Promise<MpcResult> {
    const { input, constraints, baselineControl, baselineResult } = ctx;
    const maxCycles = Math.max(1, Math.floor(ctx.maxCycles));

    const iterations: MpcIteration[] = [];
    const rejectionsByCode: Record<string, number> = {};
    let evaluated = 0;
    let feasibleCount = 0;
    let bestControl: ControlState | null = null;
    let bestResult: SimulationResult | null = null;
    let cancelled = false;

    // The baseline is a legitimate candidate: if nothing beats what the plant
    // is already doing, "do nothing" is the right answer, not a forced move.
    if (baselineResult.feasible) {
      bestControl = cloneControl(baselineControl);
      bestResult = baselineResult;
    }

    const evaluate = async (candidate: ControlState): Promise<SimulationResult | null> => {
      if (cancelled || evaluated >= maxCycles) return null;
      if (hooks.isCancelled?.()) {
        cancelled = true;
        return null;
      }

      const result = simulateCandidate(input, candidate, constraints, {
        baseline: baselineControl,
        dryBulbHintC: ctx.dryBulbHintC,
      });
      evaluated += 1;

      if (result.feasible) {
        feasibleCount += 1;
      } else {
        // Tally the FIRST violation per candidate so the rejection summary
        // counts candidates, not violations (one bad candidate can trip five).
        const code = result.violations[0]?.code ?? 'unknown';
        rejectionsByCode[code] = (rejectionsByCode[code] ?? 0) + 1;
      }

      const accepted = improves(result, bestResult);
      if (accepted) {
        bestControl = cloneControl(candidate);
        bestResult = result;
      }

      const iteration: MpcIteration = {
        cycle: evaluated,
        candidate: cloneControl(candidate),
        result,
        feasible: result.feasible,
        accepted,
      };
      iterations.push(iteration);

      await hooks.onIteration?.(iteration, {
        cycle: evaluated,
        totalCycles: maxCycles,
        candidate: iteration.candidate,
        result,
        bestTotalKw: bestResult ? bestResult.totalPlantKw : null,
        bestKwPerRt: bestResult ? bestResult.plantKwPerRt : null,
      });

      return result;
    };

    const axes = continuousAxes(constraints, baselineControl);
    const staging = stagingOptions(input, constraints, baselineControl);

    for (const count of staging) {
      if (cancelled || evaluated >= maxCycles) break;

      // Seed each staging branch from the baseline setpoints, so the branch is
      // scored on the staging change itself before the axes move.
      let incumbent: ControlState = {
        ...cloneControl(baselineControl),
        runningChillers: count,
        chillerIds: chillerIdsFor(constraints, count),
      };
      let incumbentResult = await evaluate(incumbent);
      let localBest = incumbentResult && incumbentResult.feasible ? incumbentResult : null;

      // Pass 1 — coarse sweep of each axis in turn, keeping improvements.
      for (const axis of axes) {
        if (cancelled || evaluated >= maxCycles) break;
        for (const value of axisGrid(axis, COARSE_POINTS)) {
          if (cancelled || evaluated >= maxCycles) break;
          if (value === incumbent[axis.key]) continue;
          const candidate: ControlState = { ...cloneControl(incumbent), [axis.key]: value };
          const result = await evaluate(candidate);
          if (result && result.feasible && (!localBest || objective(result) < objective(localBest))) {
            localBest = result;
            incumbent = candidate;
          }
        }
      }

      // Pass 2 — refine around the incumbent at half the coarse step.
      for (const axis of axes) {
        if (cancelled || evaluated >= maxCycles) break;
        const span = (axis.max - axis.min) / (COARSE_POINTS - 1) / 2;
        if (span <= 0) continue;
        for (const value of localGrid(axis, incumbent[axis.key], span, REFINE_POINTS)) {
          if (cancelled || evaluated >= maxCycles) break;
          if (value === incumbent[axis.key]) continue;
          const candidate: ControlState = { ...cloneControl(incumbent), [axis.key]: value };
          const result = await evaluate(candidate);
          if (result && result.feasible && (!localBest || objective(result) < objective(localBest))) {
            localBest = result;
            incumbent = candidate;
          }
        }
      }

      incumbentResult = localBest;
    }

    const { savingKw, savingPct } = savings(baselineResult, bestResult);

    return {
      input,
      baselineControl: cloneControl(baselineControl),
      baselineResult,
      optimalControl: bestControl,
      optimalResult: bestResult,
      iterations,
      evaluatedCandidates: evaluated,
      feasibleCandidates: feasibleCount,
      rejectedCandidates: evaluated - feasibleCount,
      rejectionsByCode,
      savingKw,
      savingPct,
      solved: bestResult != null,
    };
  }
}

/** The optimiser the app runs. Swap this to change strategy app-wide. */
export const defaultMpcOptimizer: MpcOptimizer = new ConstrainedCoordinateSearch();
