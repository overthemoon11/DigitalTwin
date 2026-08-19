/** Physical constants and deterministic plant calculations. */
import {
  CONDENSER_LIFT_PER_DEGC,
  REF_CHWP_KW_MONTH,
  REF_CWP_KW_MONTH,
  REF_CT_KW_MONTH,
  REF_CHWP_FLOW_MONTH,
  REF_CWP_FLOW_MONTH,
  REF_CHILLER_KW_MONTH,
  DEFAULT_CWS,
  DEFAULT_CHWS_SP,
  DEFAULT_CW_DT_SP,
  DEFAULT_HUMIDITY_RH,
  MEDIAN_LOOP_DELTA_T,
} from '../calibration/t1MonthCalibration';

/* Plant inventory + reference constants calibrated to the real T1 plant from
 * the COMPLETE Dec-2025 BMS trend (T1_MVrawDataR2_..._completed.xlsx, 44,640
 * minutes). RT is measured for the first 133 rows and reconstructed from riser
 * flows × header ΔT thereafter (the workbook's own Calculation_Audit sheet puts
 * that reconstruction at 0.105% MAPE against the 133 measured rows).
 *
 * LIVE CHILLER-kW MODEL (the one the engine evaluates, controlEngine.ts):
 *   chKw = (CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT × loadPct)
 *          × kwFactor(CHWS) × condenserLiftFactor(CWS)
 * an AFFINE part-load curve in per-chiller load %, least-squares fit over all
 * 43,026 usable month rows (constants in t1MonthCalibration.ts). Efficiency
 * improves with load like the real plant.
 *
 * CALIBRATION BASIS CHANGED 2026-08-07 — every reference level below was
 * previously taken from dataset row 1 (Dec-1 00:00). That row is an outlier:
 * its CHWP and CT meters read ~22% above the month norm, which biased those
 * blocks by the same margin on every other row (+3.86% month-wide plant-kW
 * MAE). All levels are now month medians, taken from the current duty regime.
 * Month-wide fit after the change: 0.83% blocked-CV MAE, −0.07% bias.
 *
 * Descriptive band statistics (for reference, not used directly):
 *   per-row kW/RT ≈ 0.55–0.62 across the month (0.60–0.61 in the M&V window)
 *   ΔT ≈ 6.9 °C · condenser rise ≈ 4.3 °C · CWS ≈ 28.5 · wet-bulb ≈ 24.8
 *   staging: 3 chillers / 3 CHWP / 3 CWP for 99.6% of the month; CT floats 3–5. */
export const CHILLER_CAPACITY_RT = 1250;
export const CHILLER_COUNT = 5;
export const CHWP_COUNT = 6;
export const CWP_COUNT = 6;
export const CT_COUNT = 5;

/** Baseline reference at CHWS setpoint 7.5°C */
export const REF_CHWS_SP = 7.5;
/* kW calibration target (operator's decision, 2026-08-07): the WHOLE MONTH.
 * Previously the engine was pinned to the dataset's first visible rows so that
 * boot reproduced row 1 exactly (1917.7 kW, 0.609 kW/RT). That is no longer the
 * target — row 1 is unrepresentative, and matching it cost ~3.9% accuracy on
 * every other minute of the month. Boot now sits at the median operating point
 * and the month-wide replay is unbiased instead. */
export const REF_CHILLER_LOAD = 85; // % chiller load at which REF_CHILLER_KW applies
/** @deprecated The engine uses the AFFINE part-load curve CH_KW_INTERCEPT +
 *  CH_KW_SLOPE_PER_PCT × loadPct from t1MonthCalibration.ts. Kept as the
 *  single-point reference: median kW per running chiller over the month. */
export const REF_CHILLER_KW = REF_CHILLER_KW_MONTH;
/** Reference COP is the Q/P identity at the reference point. */
export const REF_CHILLER_COP = 6.87;

export const REF_DP_SP = 15;
export const REF_CHWP_SPEED = 70;
/** Median flow / kW per RUNNING pump over the current duty regime. The plant
 *  holds these pumps at essentially fixed speed (flow/pump varies only 3.3%
 *  p5→p95), so this reference is well determined even though the affinity
 *  exponent is not — see the identifiability note in t1MonthCalibration.ts. */
export const REF_CHWP_FLOW = REF_CHWP_FLOW_MONTH;
export const REF_CHWP_KW = REF_CHWP_KW_MONTH;

/** Condenser-water pump / cooling-tower fan reference kW (at REF speed 70%). */
export const REF_CWP_KW = REF_CWP_KW_MONTH;
export const REF_CWP_FLOW = REF_CWP_FLOW_MONTH;
export const REF_CT_KW = REF_CT_KW_MONTH;

/** Measured loop ΔT at the reference point — sizes CHWP staging flow. */
export const REF_LOOP_DELTA_T = MEDIAN_LOOP_DELTA_T;

/** Condenser-lift reference — the curve fit divides by liftFactor(CWS) about
 *  this point, so it must stay 29 °C to match t1MonthCalibration.ts. */
export const REF_CWS_SP = 29;
/** Header return temps implied by the calibrated operating point — CHWS/CWS at
 *  their month medians plus the month-median loop / condenser rise. */
export const REF_CHWR_SP = round(DEFAULT_CHWS_SP + MEDIAN_LOOP_DELTA_T, 2);
export const REF_CWR_SP = round(DEFAULT_CWS + DEFAULT_CW_DT_SP, 2);
export const REF_CT_FAN = 70;

/** A tower cannot make water colder than wet-bulb + approach (measured monthly
 *  mean approach ≈ 3.5 °C; the tightest sustained hour ≈ 2.9 °C). */
export const MIN_CONDENSER_APPROACH_C = 2.5;

/** Reference outdoor conditions for load / condenser modifiers. The dataset has
 *  no OAT/RH columns, so these parameterise the measured wet-bulb rather than
 *  measuring weather: RH 59.37 at 31 °C ⇒ Stull ≈ 24.8 °C, the plant's median
 *  measured wet-bulb. (The old 65 %RH implied 25.7 °C — ~0.9 °C too humid,
 *  which biased the tower approach and therefore fan power.) */
export const REF_AMBIENT_TEMP = 31;
export const REF_HUMIDITY_RH = DEFAULT_HUMIDITY_RH;

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
 *
 * CONDENSER_LIFT_PER_DEGC (4.52 %/°C) is DE-CONFOUNDED: load and CWS are
 * weather-correlated at r = +0.67, so a joint regression over the month
 * attributes load to CWS and returns 5.08 %/°C (the old constant was 5.23%).
 * The value used here is the pooled WITHIN-load-bin slope over 30 bins of 0.5%
 * load each, which holds load ~constant while CWS varies.
 *
 * It is still above the 1.5–3.0 %/°C literature range for centrifugal machines,
 * so residual confounding is likely — this remains observational. Confirm with
 * a deliberate CWS step test before using it to drive closed-loop setpoint
 * optimisation.
 */
export function condenserLiftFactor(cwsActualC: number): number {
  return clamp(1 + CONDENSER_LIFT_PER_DEGC * (cwsActualC - REF_CWS_SP), 0.85, 1.2);
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
