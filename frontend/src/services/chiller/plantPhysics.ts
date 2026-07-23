/** Physical constants and deterministic plant calculations. */

/* Plant inventory + reference constants calibrated to the real T1 plant from
 * the Dec-2025 BMS trend (T1_MVrawDataR2), MONTH-WIDE (29,412 valid minutes;
 * RT reconstructed from riser flows × ΔT, verified to 0.13% against the
 * 133-row M&V window — the only rows where the RT column is populated):
 *   per-row kW/RT ≈ 0.588 (p10 0.577 / p90 0.600) · kW = −261 + 0.669·RT (3 chillers)
 *   ΔT ≈ 6.9–7.1 °C · condenser rise 4.43 °C · CWS 28.6 · wet-bulb 25.2 · approach 3.4
 *   per running unit: chiller ≈ 532 kW · CHWP ≈ 19.4 · CWP ≈ 54 · CT fan ≈ 14
 *   staging locked 3 chillers / 3 CHWP / 3 CWP across the band; CT count floats ~4.
 * (The M&V snapshot alone runs ~3% less efficient, 0.605 kW/RT — 2.2 h of the month.) */
export const CHILLER_CAPACITY_RT = 1250;
export const CHILLER_COUNT = 5;
export const CHWP_COUNT = 6;
export const CWP_COUNT = 6;
export const CT_COUNT = 5;

/** Baseline reference at CHWS setpoint 7.5°C */
export const REF_CHWS_SP = 7.5;
/* kW calibration target (operator's choice, 2026-07-14): the DATASET'S VISIBLE
 * VALUES — the first rows / M&V window where the rt, kw and kw/rt columns are
 * populated (boot reproduces row 1: 1917.7 kW, 0.609 kW/RT). The reconstructed
 * month-wide norm runs ~3.4% lower (0.588); replaying the whole month therefore
 * over-reads by about that margin. */
export const REF_CHILLER_LOAD = 85; // % chiller load at which REF_CHILLER_KW applies
/** @deprecated The engine now uses the AFFINE part-load curve CH_KW_INTERCEPT +
 *  CH_KW_SLOPE_PER_PCT × loadPct from t1Snapshot.ts (anchored through dataset
 *  rows 1 AND 86, so efficiency improves with load like the real plant).
 *  Kept as the single-point reference: kW/chiller at 85% load, M&V level. */
export const REF_CHILLER_KW = 543.59362;
/** Reference COP is the Q/P identity at the reference point. */
export const REF_CHILLER_COP = 6.87;

export const REF_DP_SP = 15;
export const REF_CHWP_SPEED = 70;
export const REF_CHWP_FLOW = 484.94; // m³/h per pump at 70% — 3 pumps ⇒ ΔT 6.55 at 3151 RT (row-1 deltaT)
export const REF_CHWP_KW = 23.8866667; // row-1 mean per running pump (month norm ≈ 19.4)

/** Condenser-water pump / cooling-tower fan reference kW (at REF speed 70%). */
export const REF_CWP_KW = 30.4197585; // ⇒ 54.03 kW mean at the row-1 operating speed (84.8%)
export const REF_CWP_FLOW = 690; // m³/h per pump at 70% — matches measured header CW flow ≈ 2507 m³/h
export const REF_CT_KW = 17.5; // row-1 mean per running tower (month norm ≈ 14.2)

export const REF_CWS_SP = 29;
export const REF_CHWR_SP = 14.5;
export const REF_CWR_SP = 33;
export const REF_CT_FAN = 70;

/** A tower cannot make water colder than wet-bulb + approach (measured approach ≈ 3.4 °C). */
export const MIN_CONDENSER_APPROACH_C = 2.5;

/** Reference outdoor conditions for load / condenser modifiers.
 *  RH 65 at 31 °C dry-bulb ⇒ Stull wet-bulb ≈ 25.5 °C, matching the measured 25.2. */
export const REF_AMBIENT_TEMP = 31;
export const REF_HUMIDITY_RH = 65;

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
 * CHWS setpoint effect relative to the 7.5 °C reference.
 * Lower setpoint raises compressor lift: ≈ +3% kW per °C of evaporator reset
 * (Carnot at ~280 K evaporator / 303 K condenser gives ~4.7%; real machines 2–3%).
 * COP is derived from Q/P in the engine, so kW and COP stay consistent by
 * construction; copFactor = 1/kwFactor is kept for any standalone callers.
 * The building load itself does not change with CHWS (loadFactor = 1).
 */
export function chwsSetpointModifiers(chwsSetpoint: number): {
  loadFactor: number;
  kwFactor: number;
  copFactor: number;
} {
  const delta = REF_CHWS_SP - chwsSetpoint;
  const kwFactor = clamp(1 + 0.03 * delta, 0.85, 1.25);
  return {
    loadFactor: 1,
    kwFactor,
    copFactor: 1 / kwFactor,
  };
}

/**
 * Condenser-lift effect on compressor power per °C of condenser water above /
 * below the 29 °C reference. Symmetric — warmer condenser water always costs
 * energy, colder always saves (until the wet-bulb floor).
 * 5.23 %/°C is FITTED from the Dec-2025 trend (44,410 3-chiller minutes,
 * joint regression of chiller kW on load AND achieved CWS 27.4–28.9 °C) —
 * roughly double the 2.5 %/°C literature value used previously. CWS and load
 * are weather-correlated (r = 0.68), so confirm with a CWS step test before
 * closed-loop use.
 */
export function condenserLiftFactor(cwsActualC: number): number {
  return clamp(1 + 0.0523 * (cwsActualC - REF_CWS_SP), 0.85, 1.2);
}

/** @deprecated COP is now derived from Q/P in the engine. Symmetric inverse of the lift factor. */
export function condenserCopBonus(_cwsSetpoint: number, cwsActual: number): number {
  return clamp(1 / condenserLiftFactor(cwsActual), 0.85, 1.15);
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
