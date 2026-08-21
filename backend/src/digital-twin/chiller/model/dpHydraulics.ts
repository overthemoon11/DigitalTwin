/**
 * The differential-pressure setpoint and the chilled-water pump speed, as one
 * invertible pair.
 *
 * WHY THEY ARE MODELLED TOGETHER
 * ------------------------------
 * In a real plant these are not two independent handles. The operator programs
 * a DP setpoint; a PID loop then runs the CHW pumps at whatever speed holds it.
 * Publishing an "optimised DP-SP" and a separately "optimised CHWP speed" that
 * disagree with each other would be two numbers no BMS could ever execute at
 * the same time.
 *
 * So the MPC searches ONE variable — DP-SP, the thing an operator can actually
 * enter — and the pump speed follows through the map below. That makes DP-SP
 * `optimized` and CHWP speed `derived`: genuinely responsive, genuinely part of
 * the energy result, but not an independent degree of freedom.
 *
 * The map itself is the engine's own `chwpSpeedFromDpSetpoint`, reused rather
 * than re-stated, so the MPC and the twin cannot drift apart.
 *
 * CALIBRATION STATUS: DEFAULT MODEL. This site trends NO differential pressure
 * of any kind — no DP measurement, no DP setpoint (see `missingSignals` in the
 * dataset summary). The 70% at 15 psi, +3 %/psi relation is a plausible default
 * that came with the twin, and the corresponding pump speeds are what the
 * measured pump kW was calibrated at, but the SLOPE is not observable here.
 * Everything downstream of it is labelled accordingly, and the run report says
 * so in plain language rather than presenting a DP optimum as site-validated.
 *
 * A note on the engine's second DP relation: `runControlStep` also derives a
 * "measured DP" proxy as `15 + (speed - 70) * 0.35`, which is the inverse of
 * this map to within about 0.25 psi across the working band (0.35 vs 1/3). The
 * two are close enough that the bypass logic behaves, but they are not the same
 * line, and this module is the one the optimiser is entitled to invert.
 */
import { REF_CHWP_SPEED, REF_DP_SP, clamp, round } from './plantPhysics';
import { chwpSpeedFromDpSetpoint } from './stagingController';

/** Percent of pump speed per psi of DP setpoint, from the engine's own map. */
export const CHWP_SPEED_PER_PSI = 3;

/** Pump speed the DP loop settles at for a commanded setpoint. */
export { chwpSpeedFromDpSetpoint };

/**
 * The DP setpoint that produces a given pump speed — the exact inverse of
 * `chwpSpeedFromDpSetpoint` before its 30-100% clamp.
 *
 * Used to express the plant's OBSERVED pump operating point as a DP setpoint,
 * because this site records the pumps but not the setpoint that drove them.
 */
export function dpSetpointFromChwpSpeed(chwpSpeedPct: number): number {
  return round(REF_DP_SP + (chwpSpeedPct - REF_CHWP_SPEED) / CHWP_SPEED_PER_PSI, 2);
}

/**
 * The DP setpoint band that is reachable given BOTH the DP limits and the pump
 * speed limits.
 *
 * Without this the optimiser can propose 30 psi and 10 psi and get the same
 * pump speed, because the map saturates at 100% and 30%: a flat region in the
 * search space that wastes candidates and makes the reported optimum arbitrary
 * (two different DP setpoints, one identical plant). Intersecting the two
 * bands removes the flat region entirely.
 */
export function reachableDpBand(
  dpMinPsi: number,
  dpMaxPsi: number,
  speedMinPct: number,
  speedMaxPct: number
): { min: number; max: number } {
  const fromSpeedMin = dpSetpointFromChwpSpeed(speedMinPct);
  const fromSpeedMax = dpSetpointFromChwpSpeed(speedMaxPct);
  const min = Math.max(dpMinPsi, Math.min(fromSpeedMin, fromSpeedMax));
  const max = Math.min(dpMaxPsi, Math.max(fromSpeedMin, fromSpeedMax));
  // A configuration can make the two bands disjoint; collapse to a point
  // rather than returning an inverted range the grid builder cannot use.
  return max >= min ? { min: round(min, 2), max: round(max, 2) } : { min: round(min, 2), max: round(min, 2) };
}

/** Pump speed for a DP setpoint, additionally clipped to the configured band. */
export function chwpSpeedForDp(
  dpSetpointPsi: number,
  speedMinPct: number,
  speedMaxPct: number
): number {
  return round(clamp(chwpSpeedFromDpSetpoint(dpSetpointPsi), speedMinPct, speedMaxPct), 1);
}
