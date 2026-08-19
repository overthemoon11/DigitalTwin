import {
  CHILLER_CAPACITY_RT,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  CT_COUNT,
  clamp,
} from './plantPhysics';
import { STAGE_RT_PER_CHILLER, STAGE_FLOW_PER_CHWP } from '../calibration/t1MonthCalibration';

/**
 * Stage chillers from total cooling load (RT).
 *
 * STAGE_RT_PER_CHILLER is CALIBRATED, not assumed: it is the 99.9th percentile
 * of the per-chiller load T1 actually sustained on three machines over
 * Dec-2025. The previous rule (90% of nameplate = 1125 RT) started a fourth
 * chiller several hundred RT before the real plant does, which showed up in
 * replay as the twin running 4 units on rows where the plant ran 3.
 */
export function stageChillers(totalLoadRt: number, chillerEnabled: boolean): number {
  if (!chillerEnabled || totalLoadRt <= 0) return 0;
  return clamp(Math.ceil(totalLoadRt / STAGE_RT_PER_CHILLER), 1, CHILLER_COUNT);
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

/** Stage CHWP pumps from total chilled-water flow (m³/h). Like the chiller
 *  threshold, STAGE_FLOW_PER_CHWP is the highest per-pump delivery the plant
 *  sustained on three pumps over Dec-2025, not a nominal-capacity guess. */
export function stageChwp(totalFlowM3h: number): number {
  if (totalFlowM3h <= 0) return 0;
  return clamp(Math.ceil(totalFlowM3h / STAGE_FLOW_PER_CHWP), 1, CHWP_COUNT);
}

/** CWP count follows operating chillers (standby available). */
export function stageCwp(runningChillers: number): number {
  return clamp(runningChillers, 0, CWP_COUNT);
}

/** Stage cooling towers — one more than running chillers for a lower approach,
 *  capped at the installed count (T1: 5). */
export function stageCoolingTowers(runningChillers: number): number {
  if (runningChillers <= 0) return 0;
  return clamp(runningChillers + 1, 1, CT_COUNT);
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
