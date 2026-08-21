/**
 * Every number the receding-horizon controller uses that is NOT a plant
 * constraint — search resolution and objective weights — in one place.
 *
 * Plant LIMITS live in `ConstraintConfig` (what the plant is allowed to do).
 * Everything here is about how hard to look and what to trade against what,
 * which is a controller-tuning question, not a plant question. Keeping them
 * apart means an operator widening a setpoint band never has to think about
 * beam width, and a tuner changing a penalty never touches a safety limit.
 *
 * The penalties are all expressed in kW-EQUIVALENT so the objective has one
 * unit throughout and `costBreakdownKw` can be read directly:
 *
 *     J = SUM over horizon of  [ plant kW
 *                              + unmet cooling      x unmetPenaltyKwPerRt
 *                              + loop warming       x carryPenaltyKwPerRt
 *                              + CHWR overshoot     x chwrPenaltyKwPerK
 *                              + chiller switches   x switchPenaltyKw
 *                              + setpoint movement  x move penalties ] x dt
 *
 * WHY THE MOVE PENALTIES EXIST. The rate limits in `ConstraintConfig` already
 * stop a control from jumping. They do not stop it from oscillating inside the
 * allowed step every cycle, which is how an MPC wears out actuators: the
 * objective is nearly flat near the optimum, so noise in the forecast is enough
 * to flip the choice. A small movement cost makes "stay where you are" win any
 * tie, which is the behaviour an operator expects from a stable controller.
 * They are TUNING, not physics, and are deliberately small enough that a real
 * saving always overcomes them.
 */
import { CHILLER_CONTROL_CONSTRAINTS } from '../../digital-twin/chiller/constraints/chillerConstraints';

export interface HorizonConfig {
  /* ---- horizon and search ---- */
  /** Steps planned ahead. 12 x 15 min = the 3-hour horizon of the reference paper. */
  horizonSteps: number;
  /** Trajectories kept per step after dominance pruning. */
  beamWidth: number;
  /** Candidate CHWST offsets per step, and how big each offset is. */
  chwstLevels: number;
  chwstStepC: number;
  /** Candidate DP-SP offsets per step, and how big each offset is. */
  dpLevels: number;
  dpStepPsi: number;
  /** Grid resolution for the inner CWP / CT-fan solve. */
  speedCoarsePoints: number;
  speedRefinePoints: number;
  /** Cache bucket sizes for the inner solve. Coarser = fewer solves, blunter. */
  speedCacheLoadRt: number;
  speedCacheWetBulbC: number;
  /**
   * Delivered-load bucket for the main score cache, RT. See `plantScorer`.
   *
   * 5 RT is where the trade-off sits: measured against a 0.5 RT reference the
   * answer moves by at most 0.04% over a 3-hour run, while 10 RT occasionally
   * flips a discrete decision and moves it by 0.7% — which is a fifth of the
   * saving being reported and therefore not an optimisation any more.
   */
  scoreLoadBucketRt: number;

  /* ---- objective weights, all kW-equivalent ---- */
  /** Cooling the staged machines physically cannot make. Deliberately huge. */
  unmetPenaltyKwPerRt: number;
  /** Cooling deferred into the loop — real, but recoverable, so much cheaper. */
  carryPenaltyKwPerRt: number;
  /** Per K of CHWR above the limit. */
  chwrPenaltyKwPerK: number;
  /** CHWR limit used by the controller. Defaults to the plant's own bound. */
  chwrLimitC: number;
  /** Extra margin required at the last horizon step, so the plan does not end
   *  on the limit and hand the next solve an impossible state. */
  terminalMarginK: number;
  /**
   * Weight on the loop energy the plan leaves behind, as a multiple of what it
   * would cost to remove.
   *
   * This is the term that stops the saving being an accounting trick. Without
   * it the controller can end every horizon with a warmer loop than it started,
   * bank the compressor energy it did not spend, and report a saving that is
   * really deferred load. Priced at 1.0 the deferred cooling costs exactly what
   * serving it would have cost, so shifting load in time is still allowed — it
   * just stops being free. Set it to 0 to see the unpenalised behaviour.
   */
  terminalStorageWeight: number;
  /** Per chiller start or stop. */
  switchPenaltyKw: number;
  /** Per K of CHWST movement, per psi of DP movement, per % of speed movement. */
  chwstMovePenaltyKwPerK: number;
  dpMovePenaltyKwPerPsi: number;
  speedMovePenaltyKwPerPct: number;
  /** Cost of a candidate that violates a hard constraint. Never chosen. */
  infeasiblePenaltyKw: number;

  /* ---- node de-duplication ---- */
  /** Two trajectories agreeing to this closely in CHWR are the same node. */
  dedupeChwrK: number;
  dedupeChwstC: number;
  dedupeDpPsi: number;
}

export const DEFAULT_HORIZON_CONFIG: HorizonConfig = {
  horizonSteps: 12,
  beamWidth: 16,
  chwstLevels: 3,
  chwstStepC: 0.3,
  dpLevels: 3,
  dpStepPsi: 1.5,
  speedCoarsePoints: 5,
  speedRefinePoints: 3,
  speedCacheLoadRt: 25,
  speedCacheWetBulbC: 0.25,
  scoreLoadBucketRt: 5,

  // 50 kW/RT is roughly 100x the marginal cost of making a ton, so a schedule
  // that cannot serve the load loses to any schedule that can.
  unmetPenaltyKwPerRt: 50,
  // Loop warming is priced far lower, because deferring cooling into the loop
  // is exactly the flexibility the MPC is supposed to exploit. It is not free:
  // the heat comes back, and the CHWR penalty catches it if it goes too far.
  carryPenaltyKwPerRt: 0.8,
  chwrPenaltyKwPerK: 800,
  chwrLimitC: CHILLER_CONTROL_CONSTRAINTS['ctrl-chwr-sp'].max,
  terminalMarginK: 0.3,
  terminalStorageWeight: 1,
  switchPenaltyKw: 120,
  chwstMovePenaltyKwPerK: 8,
  dpMovePenaltyKwPerPsi: 1.5,
  speedMovePenaltyKwPerPct: 0.15,
  infeasiblePenaltyKw: 10000,

  dedupeChwrK: 0.05,
  dedupeChwstC: 0.05,
  dedupeDpPsi: 0.2,
};

/** Merge a partial override over the defaults, ignoring unknown keys. */
export function resolveHorizonConfig(patch?: Partial<HorizonConfig>): HorizonConfig {
  if (!patch) return { ...DEFAULT_HORIZON_CONFIG };
  const out = { ...DEFAULT_HORIZON_CONFIG };
  for (const key of Object.keys(DEFAULT_HORIZON_CONFIG) as Array<keyof HorizonConfig>) {
    const v = patch[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (out[key] as number) = v;
    }
  }
  return out;
}
