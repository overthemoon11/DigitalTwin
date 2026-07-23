/**
 * Dataset-replay scenario "Row 86" — Excel row 86 of T1_MVrawDataR2_2025_12
 * (2025-12-01 01:24, inside the M&V window so the rt / kw/rt columns are
 * populated). Only the OPERATOR INPUTS below are fed to the simulator; every
 * other point is left to the physics engine and compared against the measured
 * readings in ROW86_EXPECTED to validate the formulas.
 *
 * Row-86 reference: 3212.15 RT · 1936.09 kW · 0.6027 kW/RT · ΔT 6.68 °C.
 * Same running set as row 1 (CH-2/3/4, CHWP/CWP-2/3/4, CT-1/2/4/5).
 */
import { RT_TO_KW, FLOW_COEFF, REF_AMBIENT_TEMP, REF_HUMIDITY_RH, REF_CWS_SP } from './plantPhysics';
import { DUTY_DEFAULTS, type DutyCategory } from './t1Snapshot';

export const ROW86_SCENARIO_ID = 'row-86';

/* ------------------- Row-86 measured inputs (ground truth) ----------------- */

export const ROW86_LOAD_RT = 3212.1471551890813; // rt column
export const ROW86_CHWS_SP = 7.5; // Header-hcwst

const CH_RUN_KW = [272.94 + 274.95, 269.41 + 267.41, 266.96 + 278.94]; // CH-2/3/4 DPM totals
const HCWF_LS = 697.45; // Header-hcwf
const RISER_FLOW_LS = [118.78, 80.64, 130.97, 74.16]; // Finger, L1-3, MainBuilding, T1U
const RISER_CHWST = [7.49, 7.5, 7.5, 7.5];
const RISER_CHWRT = [14.82, 14.54, 12.46, 15.71];

/* --------------------------- Derived control inputs ------------------------ */

const CH_RUN_TOTAL_KW = CH_RUN_KW.reduce((a, b) => a + b, 0); // 1630.61
const Q_EVAP_KW = ROW86_LOAD_RT * RT_TO_KW;
const Q_COND_KW = Q_EVAP_KW + CH_RUN_TOTAL_KW;

/** CW ΔT setpoint implied by the measured heat rejection over the measured
 *  condenser header flow (same derivation as ROW1_CW_DT_SP). ≈ 4.4272 °C. */
export const ROW86_CW_DT_SP = Q_COND_KW / (HCWF_LS * 3.6 * FLOW_COEFF);

/** Riser load shares (%) from measured riser flow × ΔT energy balances. */
const riserQ = RISER_FLOW_LS.map((f, i) => f * (RISER_CHWRT[i] - RISER_CHWST[i]));
const riserQTotal = riserQ.reduce((a, b) => a + b, 0);
export const ROW86_RISER_SHARES = riserQ.map((q) => (100 * q) / riserQTotal);

/** Row-86 ran the same duty units as row 1. */
export const ROW86_DUTY: Record<DutyCategory, number[]> = {
  chiller: [...DUTY_DEFAULTS.chiller],
  chwp: [...DUTY_DEFAULTS.chwp],
  cwp: [...DUTY_DEFAULTS.cwp],
  ct: [...DUTY_DEFAULTS.ct],
};

/** Every operator input pinned to its row-86 value (weather stays at the
 *  reference — the dataset has no OAT/RH columns; its wet-bulb sensors read
 *  ≈ 25.5 °C ≈ Stull(31 °C, 65 %RH)). Applied with precise=true so values are
 *  NOT snapped to the UI step grid. */
export const ROW86_CONTROLS: Record<string, number> = {
  'ctrl-building-load': ROW86_LOAD_RT,
  'ctrl-chws-sp': ROW86_CHWS_SP,
  'ctrl-cw-dt-sp': ROW86_CW_DT_SP,
  'ctrl-riser-finger': ROW86_RISER_SHARES[0],
  'ctrl-riser-l13': ROW86_RISER_SHARES[1],
  'ctrl-riser-main': ROW86_RISER_SHARES[2],
  'ctrl-riser-t1u': ROW86_RISER_SHARES[3],
  'ctrl-ambient-temp': REF_AMBIENT_TEMP,
  'ctrl-humidity': REF_HUMIDITY_RH,
  'ctrl-cws-sp': REF_CWS_SP,
  'ctrl-dp-sp': 15,
  'ctrl-dp-sp-high': 12,
  'ctrl-ct-fan': 0,
  'ctrl-pump-spd': 0,
  'ctrl-cwp-spd': 0,
  'ctrl-ch-enable': 1,
};

/* -------------------- Row-86 measured readings (expected) ------------------ */

/** Every dataset BMS point at row 86, keyed by the display name used in the
 *  BMS points list. The points tab shows sim vs dataset deltas when the
 *  row-86 scenario is active. */
export const ROW86_EXPECTED: Record<string, number> = {
  // Plant totals
  'kw': 1936.09,
  'kw/rt': 0.602740131899727,
  'rt': 3212.1471551890813,
  'deltaT': 6.68,
  // Chiller compressor kW (DPM)
  'DPM-CH-1-CP-1-kW': 0.64,
  'DPM-CH-1-CP-2-kW': 0.57,
  'DPM-CH-2-CP-1-kW': 272.94,
  'DPM-CH-2-CP-2-kW': 274.95,
  'DPM-CH-3-CP-1-kW': 269.41,
  'DPM-CH-3-CP-2-kW': 267.41,
  'DPM_CH-4-CP-1-kW': 266.96,
  'DPM-CH-4-CP-2-kW': 278.94,
  'DPM-CH-5-CP-1-kW': 0.8,
  'DPM-CH-5-CP-2-kW': 0.8,
  // Chiller heat-load meters
  'HL_CH_1_CP1_Power': 0,
  'HL_CH_1_CP2_Power': 0,
  'HL_CH_2_CP1_Power': 257,
  'HL_CH_2_CP2_Power': 256,
  'HL_CH_3_CP1_Power': 254,
  'HL_CH_3_CP2_Power': 252,
  'HL_CH_4_CP1_Power': 268,
  'HL_CH_4_CP2_Power': 259,
  'HL_CH_5_CP1_Power': 0,
  'HL_CH_5_CP2_Power': 0,
  // Chiller temperatures
  'CH-1-ChwSt': 10.13,
  'CH-1-ChwRt': 15.44,
  'CH-1-CwSt': 22.89,
  'CH-1-CwRt': 31.43,
  'CH-2-ChwSt': 7.5,
  'CH-2-ChwRt': 14.17,
  'CH-2-CwSt': 28.81,
  'CH-2-CwRt': 33.21,
  'CH-3-ChwSt': 7.53,
  'CH-3-ChwRt': 14.17,
  'CH-3-CwSt': 28.82,
  'CH-3-CwRt': 33.25,
  'CH-4-ChwSt': 7.46,
  'CH-4-ChwRt': 14.18,
  'CH-4-CwSt': 28.8,
  'CH-4-CwRt': 33.31,
  'CH-5-ChwSt': 17.35,
  'CH-5-ChwRt': 18.51,
  'CH-5-CwSt': 25.09,
  'CH-5-CwRt': 24.43,
  // Chiller flows (L/s)
  'CH-1-ChwFls': 0,
  'CH-1-CwFls': 0,
  'CH-2-ChwFls': 134.85,
  'CH-2-CwFls': 233.13,
  'CH-3-ChwFls': 135.26,
  'CH-3-CwFls': 232.53,
  'CH-4-ChwFls': 133.9,
  'CH-4-CwFls': 231.79,
  'CH-5-ChwFls': 0,
  'CH-5-CwFls': 0,
  // CHWP kW (DPM / VSD)
  'DPM-CHWP-1-kW': 0.05,
  'DPM-CHWP-2-kW': 23.37,
  'DPM-CHWP-3-kW': 24.48,
  'DPM-CHWP-4-kW': 23.91,
  'DPM-CHWP-5-kW': 0.04,
  'DPM-CHWP-6-kW': 0,
  'CHWP_1_VSDkW': 0,
  'CHWP_2_VSDkW': 22.7,
  'CHWP_3_VSDkW': 23.9,
  'CHWP_4_VSDkW': 23.5,
  'CHWP_5_VSDkW': 0,
  'CHWP_6_VSDkW': 0,
  // CWP kW (DPM / VSD)
  'DPM-CWP-1-kW': 0.05,
  'DPM-CWP-2-kW': 57.87,
  'DPM-CWP-3-kW': 52.28,
  'DPM-CWP-4-kW': 51.87,
  'DPM-CWP-5-kW': 0.05,
  'DPM-CWP-6-kW': 0,
  'CWP_1_VSDkW': 0,
  'CWP_2_VSDkW': 57.5,
  'CWP_3_VSDkW': 51.9,
  'CWP_4_VSDkW': 52.3,
  'CWP_5_VSDkW': 0,
  'CWP_6_VSDkW': 0,
  // Cooling towers (fans + cells)
  'CT_01_DPM_kW': 15.7,
  'CT_02_DPM_kW': 12.1,
  'CT_03_DPM_kW': 0.1,
  'DPM_CT_04_kW': 13.1,
  'CT_05_DPM_kW': 27.7,
  'CT_1_VSD_A_kW': 7.33,
  'CT_1_VSD_B_kW': 7.48,
  'CT_2_VSD_A_kW': 5.79,
  'CT_2_VSD_B_kW': 5.9,
  'CT_3_VSD_A_kW': 0,
  'CT_3_VSD_B_kW': 0,
  'CT_4_VSD_135_kW': 6.18,
  'CT_4_VSD_246_kW': 6.1,
  'CT_5_VSD_A_kW': 12.61,
  'CT_5_VSD_B_kW': 13.07,
  'CT_1A_CWST': 29,
  'CT_1B_CWST': 28.85,
  'CT_2A_CWST': 28.94,
  'CT_2B_CWST': 28.6,
  'CT_3A_CWST': 30.24,
  'CT_3B_CWST': 29.8,
  'CT_4A_CWST': 28.97,
  'CT_4B_CWST': 28.79,
  'CT_5A_CWST': 28.94,
  'CT_5B_CWST': 29.02,
  'CT_1A_CWRT': 33.29,
  'CT_1B_CWRT': 33.33,
  'CT_2A_CWRT': 33.31,
  'CT_2B_CWRT': 33.37,
  'CT_3A_CWRT': 28.67,
  'CT_3B_CWRT': 28.76,
  'CT_4A_CWRT': 33.39,
  'CT_4B_CWRT': 33.35,
  'CT_5A_CWRT': 33.36,
  'CT_5B_CWRT': 33.4,
  // CHW risers
  'CHW-Riser-Finger-ChwFls': 118.78,
  'CHW-Riser-Finger-ChwSt': 7.49,
  'CHW-Riser-Finger-ChwRt': 14.82,
  'CHW-Riser-L1-3-ChwFls': 80.64,
  'CHW-Riser-L1-3-ChwSt': 7.5,
  'CHW-Riser-L1-3-ChwRt': 14.54,
  'CHW-Riser-MainBuilding-ChwFls': 130.97,
  'CHW-Riser-MainBuilding-ChwSt': 7.5,
  'CHW-Riser-MainBuilding-ChwRt': 12.46,
  'CHW-Riser-T1U-ChwFls': 74.16,
  'CHW-Riser-T1U-ChwSt': 7.5,
  'CHW-Riser-T1U-ChwRt': 15.71,
  // Headers
  'Header-hcwf': 697.45,
  'Header-hcwst': 7.5,
  'Header-hcwrt': 14.18,
  // Wet-bulb sensors
  'WST_1_WetBulbTemp': 25.17,
  'WST_2_WetBulbTemp': 25.48,
  'WST_3_WetBulbTemp': 25.72,
  'WST_4_WetBulbTemp': 25.83,
  'WST_5_WetBulbTemp': 25.54,
};
