/**
 * Scoring one operating point for the horizon search, and solving the two
 * controls that have no thermal memory.
 *
 * THE SPLIT, AND WHY IT IS WHERE IT IS
 * ------------------------------------
 * Six controls, but they do not all belong in the same solver.
 *
 *   Chiller staging   integer, and dwell timers tie each step to the last
 *   CHWST setpoint    changes the loop return temperature, which persists
 *   DP setpoint       changes flow, which changes the return temperature too
 *        -> all three carry state forward, so the BEAM SEARCH owns them
 *
 *   CWP speed         condenser side only; no thermal memory in this model
 *   CT fan speed      same
 *        -> their optimum depends only on the CURRENT operating point, so they
 *           are solved here, inside the score, by a small coordinate search
 *
 * That split is what makes the problem tractable. Putting all five continuous
 * axes into the beam would multiply the branching factor by about 25 for no
 * modelling benefit, because the condenser-side pair genuinely has no
 * inter-step coupling: nothing about running the tower fan at 62% this step
 * changes what is optimal next step.
 *
 * Both condenser-side controls DO have real interior optima — see the sweeps in
 * the run report. Faster CW pumps cut compressor lift but cost cubic pump
 * power; faster fans cut the tower approach but cost cubic fan power. Neither
 * saturates at a bound, so solving them properly is worth the evaluations.
 *
 * CACHING
 * -------
 * A plant evaluation is about 115 microseconds, and a 32-step run with a
 * 12-step horizon asks for hundreds of thousands of them. Two caches make that
 * affordable without approximating the answer that matters:
 *
 *   - the OUTER cache is keyed on the exact operating point (staging, load to
 *     1 RT, wet bulb to 0.05 K, CHWST, DP), so it never blurs a candidate the
 *     search is actually comparing;
 *   - the INNER cache, for the condenser-side solve, is keyed on coarse load
 *     and wet-bulb buckets. Those optima move smoothly and slowly with load, so
 *     a 25 RT bucket costs a fraction of a kW and saves an order of magnitude
 *     of work. The bucket sizes are in `horizonConfig`, not hidden here.
 */
import type {
  ConstraintConfig,
  ControlState,
  SimulationResult,
} from '../../../../shared/types/mpc';
import { simulateCandidate, reconcileControl } from '../simulator/chillerPlantSimulator';
import { chwpSpeedForDp } from '../../digital-twin/chiller/model/dpHydraulics';
import { chillerIdsFor } from '../optimizer/candidateGenerator';
import { clamp, round } from '../../digital-twin/chiller/model/plantPhysics';
import type { HorizonConfig } from './horizonConfig';

/** One point the search wants priced. */
export interface OperatingPoint {
  runningChillers: number;
  loadRt: number;
  wetBulbC: number;
  chwstSetpointC: number;
  dpSetpointPsi: number;
}

/**
 * How far the condenser-side speeds are allowed to move this cycle.
 *
 * Passed in rather than read from the constraint config, because a per-cycle
 * rate limit is relative to the control the plant is CURRENTLY holding, which
 * the scorer does not know. Without it the inner solve would freely jump the
 * tower fan from 70% to its floor in one step, and the rate limit would only
 * ever be discovered afterwards as a violation — a limit that shapes nothing
 * is not a constraint, it is a complaint.
 */
export interface SpeedBand {
  cwpMinPct: number;
  cwpMaxPct: number;
  ctMinPct: number;
  ctMaxPct: number;
}

export interface ScoredPoint {
  control: ControlState;
  result: SimulationResult;
}

/** Evenly spaced inclusive grid, deduplicated. */
function grid(min: number, max: number, points: number): number[] {
  if (!(max > min)) return [round(min, 1)];
  const n = Math.max(2, Math.floor(points));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(round(min + ((max - min) * i) / (n - 1), 1));
  return [...new Set(out)];
}

/**
 * Dry bulb the weather inversion starts from.
 *
 * Derived from the point's OWN wet bulb rather than passed in per solve, which
 * matters for correctness and not just tidiness: if the hint varied with which
 * step happened to ask, the same operating point would score differently at
 * different times and the cache below would be returning answers to a question
 * nobody asked. Wet bulb + 6 K is a typical tropical spread and keeps the RH
 * bisection inside its bracket; the site trends no outdoor dry bulb at all.
 */
const dryBulbHintFor = (wetBulbC: number): number => wetBulbC + 6;

/** Cache discriminator for a speed band, rounded to 0.5%. */
const bandKey = (b: SpeedBand): string =>
  [b.cwpMinPct, b.cwpMaxPct, b.ctMinPct, b.ctMaxPct].map((v) => Math.round(v * 2)).join(':');

export class PlantScorer {
  private readonly outer = new Map<string, ScoredPoint>();
  private readonly inner = new Map<string, { cwpSpeedPct: number; ctFanSpeedPct: number }>();

  /** Evaluation counters, reported as solver diagnostics. */
  evaluations = 0;
  outerHits = 0;
  innerSolves = 0;

  /**
   * The cache lives for the whole RUN, not one solve. Consecutive horizons
   * overlap by all but one step, so roughly nine in ten points a solve asks for
   * were already priced by the previous solve. Persisting it turns a 2 s step
   * into a 0.1 s step and changes no answer, because the key is the complete
   * operating point.
   */
  constructor(
    private readonly constraints: ConstraintConfig,
    private readonly baseline: ControlState,
    private readonly cfg: HorizonConfig
  ) {}

  get stats() {
    return {
      evaluations: this.evaluations,
      outerCached: this.outer.size,
      outerHits: this.outerHits,
      innerSolves: this.innerSolves,
    };
  }

  /**
   * Cheapest legal operating point for this staging / setpoint combination,
   * with the condenser-side speeds solved.
   */
  score(point: OperatingPoint, band: SpeedBand): ScoredPoint {
    // Delivered cooling is bucketed, because it is the one part of the key that
    // is effectively continuous: every beam node reaches a slightly different
    // loop temperature and therefore a slightly different delivered load, so an
    // exact key would make the cache useless. Marginal plant power at the T1
    // operating point is about 0.5 kW/RT, so `scoreLoadBucketRt` of 5 costs at
    // most ~1.3 kW out of 1,800 — an order of magnitude below the differences
    // the search is actually deciding between.
    const key = [
      point.runningChillers,
      Math.round(point.loadRt / this.cfg.scoreLoadBucketRt),
      Math.round(point.wetBulbC * 20),
      Math.round(point.chwstSetpointC * 50),
      Math.round(point.dpSetpointPsi * 10),
      bandKey(band),
    ].join('|');
    const hit = this.outer.get(key);
    if (hit) {
      this.outerHits += 1;
      return hit;
    }

    const speeds = this.solveCondenserSide(point, band);
    const control = this.controlFor(point, speeds);
    const result = this.simulate(point, control);
    const scored = { control, result };
    this.outer.set(key, scored);
    return scored;
  }

  /** Price one fully specified control vector, bypassing the inner solve. */
  scoreControl(loadRt: number, wetBulbC: number, control: ControlState): SimulationResult {
    return this.simulate({ loadRt, wetBulbC }, control);
  }

  /**
   * The CHW pump speed a DP setpoint produces, without pricing anything.
   *
   * The loop model needs the flow BEFORE the operating point can be priced —
   * flow decides how much cooling is delivered, and delivered cooling is what
   * the plant is then charged for. Because pump speed is a pure function of the
   * DP setpoint (dpHydraulics.ts) it can be answered directly, which removes an
   * entire speculative plant evaluation per candidate.
   */
  chwpSpeedFor(dpSetpointPsi: number): number {
    return chwpSpeedForDp(
      dpSetpointPsi,
      this.constraints.chwp.minSpeedPct,
      this.constraints.chwp.maxSpeedPct
    );
  }

  private simulate(point: { loadRt: number; wetBulbC: number }, control: ControlState): SimulationResult {
    this.evaluations += 1;
    return simulateCandidate(
      { buildingLoadRt: Math.max(1, point.loadRt), wetBulbC: point.wetBulbC },
      control,
      this.constraints,
      // No `baseline` here: move limits are enforced by the search, which knows
      // the PREVIOUS applied control. Passing the run's opening baseline would
      // instead forbid every step from drifting away from where the day
      // started, which is not a rate limit, it is a leash.
      { baseline: null, dryBulbHintC: dryBulbHintFor(point.wetBulbC) }
    );
  }

  private controlFor(
    point: OperatingPoint,
    speeds: { cwpSpeedPct: number; ctFanSpeedPct: number }
  ): ControlState {
    const cfg = this.constraints;
    return reconcileControl(
      {
        ...this.baseline,
        runningChillers: point.runningChillers,
        chillerIds: chillerIdsFor(cfg, point.runningChillers),
        chwstSetpointC: point.chwstSetpointC,
        dpSetpointPsi: point.dpSetpointPsi,
        cwpSpeedPct: speeds.cwpSpeedPct,
        ctFanSpeedPct: speeds.ctFanSpeedPct,
      },
      cfg
    );
  }

  /**
   * Coordinate search over CWP speed and CT fan speed at one operating point.
   *
   * Coarse sweep of each axis in turn, then a refinement pass at half the
   * coarse step around the incumbent. Two axes, two passes — cheap, and robust
   * to the kinks a gradient method would trip over (the tower approach clamps,
   * the condenser flow constraint binds, the load band saturates).
   *
   * Infeasible points are not discarded, they are ranked below every feasible
   * one. If NOTHING is feasible the search must still return its least-bad
   * point, because the caller needs a number to attach a violation to; silently
   * returning the baseline would hide the fact that no legal speed exists.
   */
  private solveCondenserSide(
    point: OperatingPoint,
    band: SpeedBand
  ): { cwpSpeedPct: number; ctFanSpeedPct: number } {
    const cfg = this.cfg;
    const key = [
      point.runningChillers,
      Math.round(point.loadRt / cfg.speedCacheLoadRt),
      Math.round(point.wetBulbC / cfg.speedCacheWetBulbC),
      bandKey(band),
    ].join('|');
    const hit = this.inner.get(key);
    if (hit) return hit;

    this.innerSolves += 1;
    const axes = [
      { key: 'cwpSpeedPct' as const, min: band.cwpMinPct, max: band.cwpMaxPct },
      { key: 'ctFanSpeedPct' as const, min: band.ctMinPct, max: band.ctMaxPct },
    ];

    let best = {
      cwpSpeedPct: clamp(this.baseline.cwpSpeedPct, band.cwpMinPct, band.cwpMaxPct),
      ctFanSpeedPct: clamp(this.baseline.ctFanSpeedPct, band.ctMinPct, band.ctMaxPct),
    };
    let bestCost = this.condenserCost(point, best);

    for (const pass of [0, 1]) {
      for (const axis of axes) {
        const span = (axis.max - axis.min) / (cfg.speedCoarsePoints - 1) / 2;
        const values =
          pass === 0
            ? grid(axis.min, axis.max, cfg.speedCoarsePoints)
            : grid(
                clamp(best[axis.key] - span, axis.min, axis.max),
                clamp(best[axis.key] + span, axis.min, axis.max),
                cfg.speedRefinePoints
              );
        for (const value of values) {
          if (value === best[axis.key]) continue;
          const trial = { ...best, [axis.key]: value };
          const cost = this.condenserCost(point, trial);
          if (cost < bestCost - 1e-9) {
            bestCost = cost;
            best = trial;
          }
        }
      }
    }

    this.inner.set(key, best);
    return best;
  }

  /**
   * Ranking cost for the inner solve: plant power, plus a flat surcharge for
   * an infeasible point so feasibility always wins before power does.
   */
  private condenserCost(
    point: OperatingPoint,
    speeds: { cwpSpeedPct: number; ctFanSpeedPct: number }
  ): number {
    const result = this.simulate(point, this.controlFor(point, speeds));
    return result.totalPlantKw + (result.feasible ? 0 : this.cfg.infeasiblePenaltyKw);
  }
}
