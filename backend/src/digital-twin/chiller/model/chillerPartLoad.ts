/**
 * Part-load shape correction for chiller power.
 *
 * THE PROBLEM
 * -----------
 * The engine prices a chiller with an affine curve in per-machine load percent,
 * least-squares fitted over the December month:
 *
 *     kW = -29.41 + 6.664 * loadPct
 *
 * Inside the band T1 actually ran — three machines, 68-93% each — that is an
 * excellent fit and it is what the whole 0.83% month-wide plant-kW calibration
 * rests on. Nothing here touches it there.
 *
 * Outside that band it is not merely inaccurate, it has the wrong SIGN of
 * curvature. The intercept is negative, so summed over n machines carrying a
 * fixed plant load L the model reads
 *
 *     total = -29.41 * n + 0.533 * L
 *
 * which falls without limit as machines are added. A staging optimiser given
 * that curve stages up to the last available chiller at every load, and books
 * the difference as a saving. It is not a saving; it is a straight line
 * extrapolated out of the region that produced it.
 *
 * THE CORRECTION
 * --------------
 * `gordonNgFit.ts` holds a Gordon-Ng model identified from the same trend at
 * the per-machine level. It is both a better fit (held-out MAE 5.2 kW against
 * the affine curve's 12.5 kW on identical points) and structurally right: as
 * duty falls it tends to a POSITIVE no-load loss, giving the U-shaped kW/RT
 * curve a real centrifugal has, with its minimum near 70-80% load.
 *
 * So the twin keeps the affine curve as its calibrated level and multiplies it
 * by the ratio of the two models' SHAPES, normalised at the observed median
 * load:
 *
 *     factor(plr) = [GN(plr) / GN(plr_ref)] / [affine(plr) / affine(plr_ref)]
 *
 * The normalisation is what makes this safe: `factor(plr_ref) === 1` exactly,
 * so every operating point inside the calibrated band is unchanged to the last
 * digit, and the correction only bites where the affine curve was never
 * entitled to speak. At 50% load it adds about 8%, at 30% about 35%.
 *
 * CALIBRATION STATUS: SITE-CALIBRATED SHAPE, from real per-machine BMS data —
 * but the machines were never observed below about 68% load in normal
 * operation, so the low-load end is a physically-shaped extrapolation of a
 * site-fitted model, not a measurement. `plrIsExtrapolated` is what says so.
 */
import {
  GORDON_NG_FIT,
  gordonNgChillerKw,
  plrIsExtrapolated,
} from '../calibration/gordonNgFit';
import { CH_KW_INTERCEPT, CH_KW_SLOPE_PER_PCT } from '../calibration/t1MonthCalibration';
import { CHILLER_CAPACITY_RT, clamp } from './plantPhysics';

export { plrIsExtrapolated };

/**
 * Load percent the correction is anchored at — the middle of the observed
 * band, so the factor is 1.0 where the affine curve is best evidenced.
 */
export const SHAPE_REFERENCE_PLR_PCT =
  (GORDON_NG_FIT.observedPlrPct.p1 + GORDON_NG_FIT.observedPlrPct.p99) / 2;

/**
 * Bounds on the correction. Below about 8% load the Gordon-Ng curve climbs
 * steeply and the affine curve has already gone negative, so the ratio is not
 * meaningful; the clamp keeps a pathological candidate finite rather than
 * letting it dominate an objective.
 */
export const SHAPE_FACTOR_BOUNDS = { min: 0.85, max: 3.0 } as const;

const affineKw = (plrPct: number) => CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT * plrPct;

const gnKwAtRefTemps = (plrPct: number) =>
  gordonNgChillerKw(
    (CHILLER_CAPACITY_RT * plrPct) / 100,
    GORDON_NG_FIT.tChsMedianC,
    GORDON_NG_FIT.tCdsMedianC
  );

const GN_REF = gnKwAtRefTemps(SHAPE_REFERENCE_PLR_PCT);
const AFFINE_REF = affineKw(SHAPE_REFERENCE_PLR_PCT);

/**
 * Multiplier on the engine's chiller power for a given per-machine load.
 * Exactly 1.0 at `SHAPE_REFERENCE_PLR_PCT`.
 */
export function partLoadShapeFactor(plrPct: number): number {
  if (!Number.isFinite(plrPct) || plrPct <= 0) return SHAPE_FACTOR_BOUNDS.max;
  const affine = affineKw(plrPct);
  // The affine curve crosses zero at 4.4% load. Past that the ratio flips sign
  // and stops meaning anything, so hand back the ceiling instead.
  if (affine <= 1) return SHAPE_FACTOR_BOUNDS.max;
  const raw = (gnKwAtRefTemps(plrPct) / GN_REF) / (affine / AFFINE_REF);
  if (!Number.isFinite(raw)) return 1;
  return clamp(raw, SHAPE_FACTOR_BOUNDS.min, SHAPE_FACTOR_BOUNDS.max);
}
