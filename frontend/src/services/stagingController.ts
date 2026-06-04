import { CHILLER_CAPACITY_RT, CHWP_COUNT, clamp } from './plantPhysics';

/** Stage chillers from total cooling load (RT). */
export function stageChillers(totalLoadRt: number, chillerEnabled: boolean): number {
  if (!chillerEnabled || totalLoadRt <= 0) return 0;
  if (totalLoadRt < 400) return 1;
  if (totalLoadRt <= 900) return 2;
  return 3;
}

/** Distribute RT equally among running chillers. */
export function balanceChillerLoad(totalLoadRt: number, runningCount: number): number {
  if (runningCount <= 0) return 0;
  return totalLoadRt / runningCount;
}

/** Load % per chiller based on 500 RT capacity. */
export function chillerLoadPercent(rtPerChiller: number): number {
  return clamp((rtPerChiller / CHILLER_CAPACITY_RT) * 100, 0, 100);
}

/** Stage CHWP pumps from total chilled-water flow (m³/h). */
export function stageChwp(totalFlowM3h: number): number {
  if (totalFlowM3h < 800) return 1;
  if (totalFlowM3h <= 1500) return 2;
  if (totalFlowM3h <= 2500) return 3;
  return CHWP_COUNT;
}

/** CWP count follows operating chillers (standby available). */
export function stageCwp(runningChillers: number): number {
  return clamp(runningChillers, 0, 4);
}

/** Stage cooling towers — match running chillers, min 1 if plant on. */
export function stageCoolingTowers(runningChillers: number): number {
  if (runningChillers <= 0) return 0;
  return Math.min(runningChillers, 3);
}

/** CHWP speed from DP setpoint: 70% at 15 psi, +3% per psi above reference. */
export function chwpSpeedFromDpSetpoint(dpSetpoint: number): number {
  return clamp(70 + (dpSetpoint - 15) * 3, 30, 100);
}

/** CT fan speed PI-ish adjustment from condenser error (°C). */
export function ctFanAdjust(currentFan: number, cwsActual: number, cwsSetpoint: number): number {
  const error = cwsActual - cwsSetpoint;
  const adjust = error * 8;
  return clamp(currentFan + adjust, 30, 100);
}
