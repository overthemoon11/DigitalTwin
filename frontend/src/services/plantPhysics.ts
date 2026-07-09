/** Physical constants and deterministic plant calculations. */

/* Plant inventory + reference constants calibrated to the real T1 plant from
 * the Dec-2025 BMS trend (T1_MVrawDataR2), validated at the operating point
 * (RT 3150–3250, 3 of 5 chillers running, n=108 rows):
 *   total ≈ 1,938 kW · kW/RT ≈ 0.605 · ΔT ≈ 6.85°C
 *   chillers 545 kW ea (0.510 kW/RT) · CHWP 24 · CWP 54 · CT 17 kW ea
 *   CHWS 7.5 / CHWR 14.5 / CWS 29 / CWR 33, wet-bulb ≈ 25.
 * (kW/RT is the per-row operating ratio, not mean-kW/mean-RT which idle rows skew low.) */
export const CHILLER_CAPACITY_RT = 1250;
export const CHILLER_COUNT = 5;
export const CHWP_COUNT = 6;
export const CWP_COUNT = 6;
export const CT_COUNT = 5;

/** Baseline reference at CHWS setpoint 7.5°C */
export const REF_CHWS_SP = 7.5;
export const REF_CHILLER_LOAD = 85; // % chiller load at which REF_CHILLER_KW applies
export const REF_CHILLER_KW = 543; // 545 kW/chiller at ~85% load (0.510 kW/RT)
export const REF_CHILLER_COP = 6.9;

export const REF_DP_SP = 15;
export const REF_CHWP_SPEED = 70;
export const REF_CHWP_FLOW = 520;
export const REF_CHWP_KW = 24;

/** Condenser-water pump / cooling-tower fan reference kW (at REF speed 70%). */
export const REF_CWP_KW = 30;
export const REF_CWP_FLOW = 520;
export const REF_CT_KW = 14;

export const REF_CWS_SP = 29;
export const REF_CHWR_SP = 14.5;
export const REF_CWR_SP = 33;
export const REF_CT_FAN = 70;

/** Reference outdoor conditions for load / condenser modifiers */
export const REF_AMBIENT_TEMP = 31;
export const REF_HUMIDITY_RH = 75;

export const FLOW_COEFF = 1.163;
export const RT_TO_KW = 3.517;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Q (kW) = Flow (m³/h) × ΔT (°C) × 1.163 */
export function coolingKwFromFlow(flowM3h: number, deltaT: number): number {
  return flowM3h * deltaT * FLOW_COEFF;
}

/** RT = Q / 3.517 */
export function kwToRt(kw: number): number {
  return kw / RT_TO_KW;
}

export function rtToKw(rt: number): number {
  return rt * RT_TO_KW;
}

/** Flow from load and delta-T */
export function flowFromLoad(loadRt: number, deltaT: number): number {
  if (deltaT <= 0.1) return 0;
  const qKw = rtToKw(loadRt);
  return qKw / (deltaT * FLOW_COEFF);
}

/** Pump affinity: power ∝ speed³, flow ∝ speed */
export function pumpPowerFromSpeed(
  refKw: number,
  refSpeed: number,
  speed: number
): number {
  if (refSpeed <= 0 || speed <= 0) return 0;
  const ratio = speed / refSpeed;
  return refKw * ratio ** 3;
}

export function pumpFlowFromSpeed(
  refFlow: number,
  refSpeed: number,
  speed: number
): number {
  if (refSpeed <= 0 || speed <= 0) return 0;
  return refFlow * (speed / refSpeed);
}

/** Hz ≈ 0.5 × speed% for VFD pumps/fans */
export function speedToHz(speedPercent: number): number {
  return round(speedPercent * 0.5, 0);
}

/**
 * CHWS setpoint effect relative to 7°C reference.
 * Lower setpoint → +load, +kW, -COP per °C.
 */
export function chwsSetpointModifiers(chwsSetpoint: number): {
  loadFactor: number;
  kwFactor: number;
  copFactor: number;
} {
  const delta = REF_CHWS_SP - chwsSetpoint;
  return {
    loadFactor: 1 + 0.08 * delta,
    kwFactor: 1 + 0.1 * delta,
    copFactor: clamp(1 - 0.05 * delta, 0.5, 1.5),
  };
}

/** Condenser setpoint improves COP when lowered (more tower fan). */
export function condenserCopBonus(cwsSetpoint: number, cwsActual: number): number {
  const targetDrop = REF_CWS_SP - cwsSetpoint;
  const actualDrop = REF_CWS_SP - cwsActual;
  if (targetDrop <= 0) return 1;
  return clamp(1 + (actualDrop / Math.max(targetDrop, 0.1)) * 0.127, 0.85, 1.15);
}

export function plantCop(coolingKw: number, totalPlantKw: number): number {
  if (totalPlantKw <= 0) return 0;
  return round(coolingKw / totalPlantKw, 2);
}

export function plantEfficiencyKwPerRt(totalKw: number, totalRt: number): number {
  if (totalRt <= 0) return 0;
  return round(totalKw / totalRt, 3);
}

/** First-order lag toward target (2s timestep, tau in seconds). */
export function lag(current: number, target: number, tauSec: number, dtSec = 2): number {
  const alpha = 1 - Math.exp(-dtSec / tauSec);
  return current + (target - current) * alpha;
}

/** Outdoor dry-bulb effect on building cooling demand (1.0 at reference). */
export function weatherLoadFactor(ambientTempC: number): number {
  if (ambientTempC >= REF_AMBIENT_TEMP) {
    return 1 + (ambientTempC - REF_AMBIENT_TEMP) * 0.03;
  }
  return clamp(1 + (ambientTempC - REF_AMBIENT_TEMP) * 0.02, 0.85, 1.5);
}

/** Outdoor humidity effect on latent cooling demand (1.0 at reference). */
export function humidityLoadFactor(humidityRh: number): number {
  const delta = humidityRh - REF_HUMIDITY_RH;
  if (delta >= 0) return 1 + delta * 0.0015;
  return clamp(1 + delta * 0.001, 0.92, 1.2);
}

/** Hot/humid ambient raises condenser water temperature target (°C offset). */
export function weatherCondenserOffset(ambientTempC: number, humidityRh: number): number {
  const tempOffset = (ambientTempC - REF_AMBIENT_TEMP) * 0.25;
  const humidOffset = Math.max(0, humidityRh - 70) * 0.04;
  return tempOffset + humidOffset;
}

/** Stull (2011) wet-bulb estimate from dry-bulb (°C) and RH (%). */
export function estimateWetBulbC(dryBulbC: number, rhPercent: number): number {
  const rh = clamp(rhPercent, 1, 100);
  const twb =
    dryBulbC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(dryBulbC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
    4.686035;
  return round(twb, 1);
}
