/**
 * Per-unit characterization of the real T1 plant, derived from the FIRST ROW of
 * T1_MVrawDataR2_2025_12_new.xlsx (2025-12-01 00:00). The RAW row-1 readings are
 * stored below and every trim / share / meter ratio / sensor offset is COMPUTED
 * from them at full float precision, so the sim's boot state reproduces the
 * dataset row exactly (to each point's displayed precision) — including the
 * dataset's own meter disagreements (HL heat-load meters read ~6% below the DPM
 * feeders, VSD readouts ~2% off, riser flow meters ~0.2% above the loop).
 *
 * Row-1 reference: 3151.04 RT · 1917.69 kW · 0.6086 kW/RT · ΔT 6.55 °C.
 */
import {
  REF_CWS_SP,
  REF_CHWP_FLOW,
  REF_AMBIENT_TEMP,
  REF_HUMIDITY_RH,
  RT_TO_KW,
  FLOW_COEFF,
  estimateWetBulbC,
} from './plantPhysics';

/* ---------------- RAW ROW-1 READINGS (dataset ground truth) --------------- */

export const ROW1_LOAD_RT = 3151.04; // rt column
/** Header-hcwst — the CHW header supply temp; used as the CHWS setpoint default. */
export const ROW1_CHWS_SP = 7.52;

const CH_CP1 = [0.64, 271.23, 269.82, 260.06, 0.68]; // DPM-CH-n-CP-1-kW
const CH_CP2 = [0.57, 274.17, 267.16, 268.72, 0.79]; // DPM-CH-n-CP-2-kW
const HL_CP1 = [0, 254, 249, 244, 0]; // HL_CH_n_CP1_Power (separate meter!)
const HL_CP2 = [0, 256, 252, 243, 0];
const CH_ON = [false, true, true, true, false];

const CHWP_KW = [0.05, 23.35, 24.46, 23.85, 0.04, -0.03]; // DPM-CHWP-n-kW
const CHWP_VSD = [0, 22.8, 23.8, 23.5, 0, 0]; // CHWP_n_VSDkW
const CWP_KW = [0.05, 57.82, 52.39, 51.88, 0.01, -0.02];
const CWP_VSD = [0, 57.3, 51.6, 52.2, 0, 0];
const PUMP_ON = [false, true, true, true, false, false];

const CT_KW = [16.2, 12.2, 0, 13.0, 28.6]; // CT_0n_DPM_kW
const CT_A = [7.63, 5.75, 0, 6.21, 14.22]; // CT_n_VSD_A_kW
const CT_B = [7.82, 5.79, 0, 6.78, 13.62];
const CT_ON = [true, true, false, true, true];
const CELL_CWST = [[28.99, 28.87], [29.04, 28.62], [30.24, 29.83], [29.0, 28.83], [29.05, 28.98]];
const CELL_CWRT = [[33.36, 33.38], [33.39, 33.5], [28.78, 28.88], [33.5, 33.4], [33.38, 33.4]];

const CH_CHWST = [10.13, 7.48, 7.49, 7.58, 17.33];
const CH_CHWRT = [15.43, 14.07, 14.09, 14.06, 18.49];
const CH_CWST = [22.88, 28.86, 28.82, 28.85, 25.08];
const CH_CWRT = [31.46, 33.28, 33.29, 33.24, 24.43];
const CH_CHWFLS_LS = [0, 135.2, 135.06, 133.93, 0]; // CH-n-ChwFls (L/s)
const CH_CWFLS_LS = [0, 232.27, 233.17, 230.91, 0]; // CH-n-CwFls (L/s)

const RISER_FLOW_LS = [118.86, 80.04, 131.42, 74.63]; // Finger, L1-3, MainBuilding, T1U
const RISER_CHWST = [7.57, 7.59, 7.61, 7.61];
const RISER_CHWRT = [15.12, 13.51, 12.42, 15.74];
const HCWF_LS = 696.35; // Header-hcwf — condenser header flow

const WST = [25.19, 25.51, 25.72, 25.83, 25.56]; // WST_1..5_WetBulbTemp

/* --------------------------- DERIVED (computed) --------------------------- */

/** Which units were running at row 1 (duty = first N of each order). */
export const DUTY_DEFAULTS = {
  chiller: [2, 3, 4, 1, 5],
  chwp: [2, 3, 4, 1, 5, 6],
  cwp: [2, 3, 4, 1, 5, 6],
  ct: [1, 2, 4, 5, 3],
} as const;

export type DutyCategory = keyof typeof DUTY_DEFAULTS;

const meanOf = (vals: number[], on: boolean[]) => {
  const run = vals.filter((_, i) => on[i]);
  return run.reduce((a, b) => a + b, 0) / run.length;
};

const CH_TOT = CH_CP1.map((v, i) => v + CH_CP2[i]);
const chMean = meanOf(CH_TOT, CH_ON); // 537.0533…

/** Per-unit kW trims (unit / mean of row-1 running set; standby units = 1). */
export const CH_TRIM = CH_TOT.map((v, i) => (CH_ON[i] ? v / chMean : 1));
export const CHWP_TRIM = CHWP_KW.map((v, i) => (PUMP_ON[i] ? v / meanOf(CHWP_KW, PUMP_ON) : 1));
export const CWP_TRIM = CWP_KW.map((v, i) => (PUMP_ON[i] ? v / meanOf(CWP_KW, PUMP_ON) : 1));
export const CT_TRIM = CT_KW.map((v, i) => (CT_ON[i] ? v / meanOf(CT_KW, CT_ON) : 1));

/** Compressor-1 share of each chiller's DPM total (standby units = 0.5). */
export const CH_CP1_SHARE = CH_TOT.map((v, i) => (CH_ON[i] ? CH_CP1[i] / v : 0.5));

/** HL heat-load meter ÷ DPM meter, per compressor — the HL meter reads ~6% low. */
export const HL_CP_RATIO = CH_TOT.map((_, i) =>
  CH_ON[i] ? [HL_CP1[i] / CH_CP1[i], HL_CP2[i] / CH_CP2[i]] : [0.93, 0.93]
);

/** VSD kW readout ÷ DPM feeder meter, per pump. */
export const CHWP_VSD_RATIO = CHWP_KW.map((v, i) => (PUMP_ON[i] ? CHWP_VSD[i] / v : 0.976));
export const CWP_VSD_RATIO = CWP_KW.map((v, i) => (PUMP_ON[i] ? CWP_VSD[i] / v : 0.99));

/** Parasitic standby draw of STOPPED units (controls/heaters, meter noise). */
export const CH_STANDBY_KW = CH_CP1.map((v, i) =>
  CH_ON[i] ? { cp1: 0.6, cp2: 0.6 } : { cp1: v, cp2: CH_CP2[i] }
);
export const CHWP_STANDBY_KW = CHWP_KW.map((v, i) => (PUMP_ON[i] ? 0 : v));
export const CWP_STANDBY_KW = CWP_KW.map((v, i) => (PUMP_ON[i] ? 0 : v));

/** Tower cell VSD kW as fractions of the tower's DPM meter (sum < 1 — the
 *  feeder reads ~2–5% above the two VSDs, as in the dataset). */
export const CT_CELL_KW_FRAC = CT_KW.map((v, i) =>
  CT_ON[i] ? [CT_A[i] / v, CT_B[i] / v] : [0.48, 0.48]
);

/* Boot-state anchors (mirror the engine's boot arithmetic). */
const Q_BOOT_KW = ROW1_LOAD_RT * RT_TO_KW;
const LOOP_FLOW_BOOT = 3 * REF_CHWP_FLOW; // 3 CHWP at reference speed 70%
const DELTA_T_BOOT = Q_BOOT_KW / (LOOP_FLOW_BOOT * FLOW_COEFF);
const CHWR_BOOT = ROW1_CHWS_SP + DELTA_T_BOOT;
const CH_RUN_TOTAL_KW = CH_TOT.filter((_, i) => CH_ON[i]).reduce((a, b) => a + b, 0);
const QCOND_BOOT_KW = Q_BOOT_KW + CH_RUN_TOTAL_KW;

/** CW ΔT setpoint that makes the CWP flow control reproduce the measured
 *  condenser header flow (Header-hcwf 696.35 L/s) exactly at boot. */
export const ROW1_CW_DT_SP = QCOND_BOOT_KW / (HCWF_LS * 3.6 * FLOW_COEFF);
const CWR_BOOT = REF_CWS_SP + ROW1_CW_DT_SP;

/** Sensor offsets of RUNNING chillers relative to the loop headers (°C). */
export const CH_SENSOR_OFFSET = {
  chwSt: CH_CHWST.map((v, i) => (CH_ON[i] ? v - ROW1_CHWS_SP : 0)),
  chwRt: CH_CHWRT.map((v, i) => (CH_ON[i] ? v - CHWR_BOOT : 0)),
  cwSt: CH_CWST.map((v, i) => (CH_ON[i] ? v - REF_CWS_SP : 0)),
  cwRt: CH_CWRT.map((v, i) => (CH_ON[i] ? v - CWR_BOOT : 0)),
};

/** Stagnant sensor readings of STOPPED units (CH-1/5 raw; generic otherwise). */
export const CH_STAGNANT = CH_CHWST.map((v, i) =>
  CH_ON[i]
    ? { chwSt: 15.0, chwRt: 16.5, cwSt: 26.0, cwRt: 29.0 }
    : { chwSt: v, chwRt: CH_CHWRT[i], cwSt: CH_CWST[i], cwRt: CH_CWRT[i] }
);

/** Per-chiller flow-meter trims vs the even split of the loop/condenser flow. */
export const CH_EVAP_FLOW_TRIM = CH_CHWFLS_LS.map((v, i) =>
  CH_ON[i] ? v / (LOOP_FLOW_BOOT / 3 / 3.6) : 1
);
export const CH_COND_FLOW_TRIM = CH_CWFLS_LS.map((v, i) => (CH_ON[i] ? v / (HCWF_LS / 3) : 1));

/** Tower cell temp offsets vs the plant CWS/CWR headers ([A, B] per tower). */
export const CT_CELL_OFFSET = {
  cwst: CELL_CWST.map((c, i) => (CT_ON[i] ? [c[0] - REF_CWS_SP, c[1] - REF_CWS_SP] : [0, 0])),
  cwrt: CELL_CWRT.map((c, i) => (CT_ON[i] ? [c[0] - CWR_BOOT, c[1] - CWR_BOOT] : [0, 0])),
};

/** Stagnant cell readings for a stopped tower (row-1 CT-3). */
export const CT_STAGNANT = { cwst: CELL_CWST[2], cwrt: CELL_CWRT[2] };

/** Row-1 riser load split (% of building load) — control defaults. */
export const RISER_LOAD_SHARE_DEFAULT = [34.4, 18.2, 24.2, 23.2];

/** The four CHW risers: flow-meter fraction of loop flow and sensor offsets,
 *  all anchored so boot reproduces the row-1 riser points exactly. */
const RISER_META = [
  { id: 'riser-finger', name: 'Finger', controlId: 'ctrl-riser-finger' },
  { id: 'riser-l13', name: 'L1-3', controlId: 'ctrl-riser-l13' },
  { id: 'riser-main', name: 'MainBuilding', controlId: 'ctrl-riser-main' },
  { id: 'riser-t1u', name: 'T1U', controlId: 'ctrl-riser-t1u' },
];
export const RISERS = RISER_META.map((m, i) => {
  const flowM3h = RISER_FLOW_LS[i] * 3.6;
  const share = RISER_LOAD_SHARE_DEFAULT[i] / 100;
  const dtBoot = (share * Q_BOOT_KW) / (flowM3h * FLOW_COEFF);
  return {
    ...m,
    flowFrac: flowM3h / LOOP_FLOW_BOOT,
    stOff: RISER_CHWST[i] - ROW1_CHWS_SP,
    rtOff: RISER_CHWRT[i] - RISER_CHWST[i] - dtBoot,
  };
});

/** The five wet-bulb sensors' offsets vs the Stull estimate at default weather. */
export const WST_OFFSET = WST.map((v) => v - estimateWetBulbC(REF_AMBIENT_TEMP, REF_HUMIDITY_RH));

/* --------------------- Chiller part-load curve (affine) --------------------
 * Real chiller kW is AFFINE in load, not proportional: measured efficiency
 * improves as load rises. Constants are the LEAST-SQUARES fit of per-chiller
 * base kW (= running mean ÷ evaporator-reset factor; CWS held 29 °C so the
 * condenser-lift factor is 1) against per-chiller load %, over ALL 133 M&V
 * rows (2025-12-01 00:00–02:12, loadPct 82.9–87.2, kW/RT 0.5997–0.6106).
 * Residual scatter of the data around this line is ±0.29 % (max 1 %) — the
 * dataset's own minute-to-minute noise, so no row is exact but every row is
 * unbiased (rows 1 / 11 / 86 sit at +3.0 / +1.6 / −2.0 kW residuals).
 * OPERATOR DECISION 2026-07-17: best-fit across the window was chosen over
 * the previous rows-1&86-exact anchoring.
 * Regenerate via scratchpad gen_mv_rows.py (LSQ over the M&V window). */
export const CH_KW_SLOPE_PER_PCT = 6.884050406145565; // kW per % chiller load
export const CH_KW_INTERCEPT = -44.10764912166405; // kW per running chiller
