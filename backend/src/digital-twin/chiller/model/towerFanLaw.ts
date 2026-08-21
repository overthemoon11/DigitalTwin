/**
 * What cooling-tower FAN SPEED does to the approach.
 *
 * WHY THIS REPLACES THE PREVIOUS FAN TERM
 * ---------------------------------------
 * `chillerPlantSimulator` used to shape the approach with a term inverted out
 * of the engine's fitted CT_FAN_SPEED_COEFF law:
 *
 *     delta_K = (fan - 70) / (70 * -0.040031)   ->  -0.357 K per 1% of fan
 *
 * That slope is roughly an order of magnitude too steep. It puts the whole
 * observed approach band (1.51 - 5.18 K) inside a fan window of about 68% to
 * 79%, so the trade-off the MPC is supposed to weigh — tower kW against chiller
 * kW — saturates almost immediately and the optimiser is really choosing
 * between two clamps. The coefficient was never fitted against fan speed in the
 * first place: this site trends fan VSD POWER, never fan speed or frequency.
 *
 * WHAT THIS USES INSTEAD
 * ----------------------
 * The standard counterflow-tower result: at fixed water flow and fixed wet
 * bulb, approach falls with the air-to-water mass ratio roughly as a power law,
 *
 *     approach(fan) = approach_ref * (fan_ref / fan) ^ n,   n ~ 0.4 - 0.8
 *
 * with n around 0.5 for a film-fill induced-draught cell. Airflow is taken as
 * proportional to fan speed, which is what a VFD on a fixed-pitch fan gives.
 *
 * The LEVEL still comes from the site fit (`towerApproachFit.ts`, MAE 0.103 K
 * on held-out days), and the multiplier is exactly 1.0 at `REF_CT_FAN`, so a
 * run that does not command the fans reproduces the calibrated approach
 * unchanged. Only the SHAPE around that point comes from here.
 *
 * CALIBRATION STATUS: PHYSICS-BASED, NOT SITE-CALIBRATED. The exponent is an
 * engineering default; T1 trends no fan-speed channel to fit it against. It is
 * exported so a site that does trend fan speed can fit and replace it.
 *
 * SANITY CHECK AT THE T1 OPERATING POINT (3 chillers, wet bulb 24.8 C):
 *   fan  70% -> approach 4.64 K, tower ~56 kW      (the measured point)
 *   fan 100% -> approach 3.88 K, tower ~163 kW     (-0.76 K costs +107 kW)
 *   fan  50% -> approach 5.49 K, tower ~20 kW      (+0.85 K saves 36 kW)
 * With the chiller at ~1550 kW and 4.52 %/K of lift, 0.76 K is worth about
 * 53 kW of compressor — less than the 107 kW of fan it costs, and 0.85 K is
 * worth 60 kW — more than the 36 kW it saves. So the optimum is interior and
 * near the observed operating point, which is the behaviour a real plant shows.
 */
import { REF_CT_FAN, clamp } from './plantPhysics';

/**
 * Airflow exponent in `approach ~ (1/airflow)^n`. 0.5 is mid-range for an
 * induced-draught film-fill cell. ASSUMED, not fitted.
 */
export const CT_APPROACH_AIRFLOW_EXPONENT = 0.5;

/**
 * How far the fan-speed term is allowed to move the approach. Beyond these the
 * power law is well outside anything a tower does, and a runaway multiplier
 * would let the optimiser buy condenser temperature that does not exist.
 */
export const CT_APPROACH_MULTIPLIER_BOUNDS = { min: 0.6, max: 2.2 } as const;

/**
 * Multiplier on the site-fitted approach for a commanded fan speed.
 * Exactly 1.0 at `REF_CT_FAN`; below 1 for faster fans, above 1 for slower.
 */
export function towerApproachFanMultiplier(fanSpeedPct: number): number {
  if (!Number.isFinite(fanSpeedPct) || fanSpeedPct <= 0) {
    return CT_APPROACH_MULTIPLIER_BOUNDS.max;
  }
  const raw = Math.pow(REF_CT_FAN / fanSpeedPct, CT_APPROACH_AIRFLOW_EXPONENT);
  return clamp(raw, CT_APPROACH_MULTIPLIER_BOUNDS.min, CT_APPROACH_MULTIPLIER_BOUNDS.max);
}
