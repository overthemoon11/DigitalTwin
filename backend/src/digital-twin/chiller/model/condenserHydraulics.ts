/**
 * What condenser-water FLOW does to compressor lift.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The calibrated engine prices compressor power off the condenser-water SUPPLY
 * temperature (`condenserLiftFactor`). In its static mode the achieved CWS is
 * `max(setpoint, wet bulb + approach)` and nothing about the condenser pumps
 * enters that expression — so slowing the CWPs used to be free: the cubic pump
 * saving landed on the meter and the chiller never noticed.
 *
 * That is not how a condenser behaves. The compressor does not see the supply
 * temperature, it sees the refrigerant condensing temperature, which sits above
 * the water LEAVING the condenser by the tube-bundle approach:
 *
 *     T_condensing  ~=  CWS  +  dT_water  +  approach_bundle
 *
 * and BOTH of the last two terms grow when flow falls:
 *
 *     dT_water        = Q_rejected / (m_dot * cp)          proportional to 1/flow
 *     approach_bundle proportional to 1/h_water, and for turbulent tube-side
 *                     flow the Dittus-Boelter correlation gives h ~ v^0.8
 *
 * So this module returns the EQUIVALENT SUPPLY-TEMPERATURE SHIFT that the same
 * compressor would have felt, and the caller applies the engine's own
 * calibrated lift slope to it. The engine is not modified: the correction is
 * computed outside it, reported separately, and is exactly zero at the
 * reference pump speed, so every calibrated operating point is untouched.
 *
 * CALIBRATION STATUS: PHYSICS-BASED, NOT SITE-CALIBRATED.
 * T1 ran its condenser pumps at an essentially fixed operating point for all of
 * December (per-pump flow varies only a few percent p5->p95), so the dataset
 * pins the reference POINT precisely and says nothing at all about the
 * SENSITIVITY. The reference condenser dT (4.26 K at 696 L/s) is measured; the
 * bundle approach and the 0.8 exponent are engineering defaults. A deliberate
 * CWP speed step test is what would turn this into a fitted model.
 */
import { REF_CWP_SPEED, clamp, condenserLiftFactor } from './plantPhysics';

/**
 * Water-side heat-transfer exponent. Dittus-Boelter gives Nu ~ Re^0.8, and Re
 * is proportional to velocity, so the film coefficient — and therefore the
 * inverse of the bundle approach — scales as flow^0.8.
 */
export const COND_APPROACH_FLOW_EXPONENT = 0.8;

/**
 * Tube-bundle approach at the reference flow, K. A clean shell-and-tube
 * condenser on a large centrifugal machine typically runs 1-2 K; 1.5 K is the
 * middle of that band. ASSUMED — the site trends no refrigerant temperature,
 * so the bundle approach is not observable here at all.
 */
export const REF_COND_APPROACH_K = 1.5;

/** Guard rails on the correction, so a pathological speed cannot explode it. */
const MAX_LIFT_SHIFT_K = 12;
const MIN_LIFT_SHIFT_K = -6;

export interface CondenserLiftShift {
  /** Equivalent supply-temperature shift the compressor feels, K. */
  liftShiftK: number;
  /** Part of the shift from the water temperature rise across the condenser. */
  waterRiseShiftK: number;
  /** Part of the shift from the degraded tube-bundle approach. */
  bundleShiftK: number;
  /** Condenser water flow relative to the reference operating point. */
  flowRatio: number;
}

/**
 * The equivalent CWS shift caused by running the condenser pumps away from
 * their reference speed, given the condenser water rise the twin computed.
 *
 * Expressed against SPEED rather than absolute flow on purpose. Flow also falls
 * when a chiller (and therefore a pump) is shed, but that comes with a
 * proportional fall in rejected heat, so it is not a penalty and must not be
 * charged as one. Speed is the part of the flow the controller actually chose.
 *
 * Returns all zeros at `REF_CWP_SPEED`, which is what keeps every
 * site-calibrated operating point bit-identical to before this file existed.
 */
export function condenserLiftShift(
  cwpSpeedPct: number,
  cwDeltaTK: number
): CondenserLiftShift {
  const flowRatio = cwpSpeedPct > 0 ? cwpSpeedPct / REF_CWP_SPEED : 0;
  if (!Number.isFinite(flowRatio) || flowRatio <= 0) {
    return { liftShiftK: MAX_LIFT_SHIFT_K, waterRiseShiftK: MAX_LIFT_SHIFT_K, bundleShiftK: 0, flowRatio: 0 };
  }

  // dT_water is inversely proportional to flow at fixed rejected heat, and
  // `cwDeltaTK` is already the value AT this flow, so the reference-flow rise
  // is cwDeltaTK * flowRatio and the shift is the difference.
  const waterRiseShiftK = cwDeltaTK * (1 - flowRatio);
  const bundleShiftK =
    REF_COND_APPROACH_K * (Math.pow(1 / flowRatio, COND_APPROACH_FLOW_EXPONENT) - 1);

  const liftShiftK = clamp(waterRiseShiftK + bundleShiftK, MIN_LIFT_SHIFT_K, MAX_LIFT_SHIFT_K);
  return { liftShiftK, waterRiseShiftK, bundleShiftK, flowRatio };
}

/**
 * Multiplier to apply to chiller power for a given equivalent lift shift.
 *
 * Uses the engine's OWN calibrated lift slope (`condenserLiftFactor`, fitted
 * de-confounded within load bins over the December month) so the correction
 * inherits the site calibration rather than inventing a second slope. The ratio
 * form means the multiplier is exactly 1.0 when the shift is zero.
 */
export function condenserLiftMultiplier(cwsC: number, liftShiftK: number): number {
  if (!Number.isFinite(liftShiftK) || Math.abs(liftShiftK) < 1e-9) return 1;
  const base = condenserLiftFactor(cwsC);
  const shifted = condenserLiftFactor(cwsC + liftShiftK);
  if (!(base > 0)) return 1;
  return clamp(shifted / base, 0.8, 1.4);
}
