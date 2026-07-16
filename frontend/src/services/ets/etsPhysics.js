/**
 * Pure, dependency-free physics core for the Energy Transfer Station (ETS)
 * heat-exchange simulation — modelled on Marina Bay Sands station A-B03-01.
 *
 * This module is plain ESM JavaScript (no React, no DOM) so it can be imported
 * BOTH by the TypeScript engine (etsHeatExchangeEngine.ts) AND by the Node test
 * (tests/validation/ets/ets-physics.test.mjs) — one source of truth for the
 * formulas, which the test then verifies against the schematic baseline.
 *
 * Formula references: see docs/physics-formulas-reference.md §2.7.
 *   - Sensible heat / duty:   Q = ṁ·cₚ·ΔT            (ASHRAE Fundamentals Ch.1)
 *   - LMTD (counter-flow):    Q = U·A·ΔT_lm          (ASHRAE Fundamentals Ch.4)
 *   - Effectiveness-NTU:      ε = Q/Q_max            (Kays & London)
 *   - Pump affinity laws:     Q∝N, H∝N², P∝N³        (Hydraulic Institute)
 */

/** Specific heat of water, kJ/(kg·K). */
export const CP_WATER = 4.1868;
/** Density of water ≈ 1000 kg/m³ → 1 L/s = 1 kg/s, 1 m³/h = 0.2778 kg/s. */
export const RHO_WATER = 1000;
/** 1 ton of refrigeration = 3.51685 kW (AHRI/ASHRAE). */
export const RT_TO_KW = 3.517;
/** Q[kW] = Flow[m³/h] × ΔT[K] × 1.163  (== cₚ·ρ/3600). */
export const FLOW_COEFF = 1.163;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function round(v, d = 2) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Cooling duty in kW from volumetric flow (m³/h) and ΔT (K). */
export function coolingKwFromFlow(flowM3h, deltaT) {
  return flowM3h * deltaT * FLOW_COEFF;
}

/** Volumetric flow (m³/h) needed to carry a duty (kW) at a given ΔT (K). */
export function flowM3hFromDuty(kw, deltaT) {
  if (deltaT <= 0.05) return 0;
  return kw / (deltaT * FLOW_COEFF);
}

export function kwFromTons(tons) {
  return tons * RT_TO_KW;
}

export function tonsFromKw(kw) {
  return kw / RT_TO_KW;
}

/** Heat-capacity rate C = ṁ·cₚ in kW/K, from volumetric flow in m³/h. */
export function capacityRateKwPerK(flowM3h) {
  // m³/h → kg/s : ×1000/3600 = /3.6
  const massFlowKgS = (flowM3h * RHO_WATER) / 3600;
  return massFlowKgS * CP_WATER;
}

/**
 * Log-mean temperature difference for a counter-flow exchanger.
 * dt1, dt2 are the terminal temperature differences (K, both > 0).
 * Falls back to the arithmetic mean when the two are nearly equal.
 */
export function lmtdCounterflow(dt1, dt2) {
  const a = Math.max(dt1, 1e-6);
  const b = Math.max(dt2, 1e-6);
  if (Math.abs(a - b) < 1e-4) return (a + b) / 2;
  return (a - b) / Math.log(a / b);
}

/**
 * Heat-exchanger effectiveness ε = Q / Q_max.
 * Q_max = C_min × (T_hot,in − T_cold,in).
 */
export function hxEffectiveness(qKw, cMinKwPerK, tHotInC, tColdInC) {
  const qMax = cMinKwPerK * Math.max(0, tHotInC - tColdInC);
  if (qMax <= 1e-6) return 0;
  return clamp(qKw / qMax, 0, 1);
}

/**
 * Counter-flow NTU back-calculated from effectiveness and Cr = C_min/C_max.
 * (Kays & London inverse relation.)
 */
export function ntuFromEffectivenessCounterflow(eps, cr) {
  const e = clamp(eps, 0, 0.99999);
  if (cr <= 1e-6) return -Math.log(1 - e);
  if (cr >= 0.99999) return e / (1 - e);
  return (1 / (cr - 1)) * Math.log((e - 1) / (e * cr - 1));
}

/** Forward counter-flow effectiveness from NTU and Cr (for design checks). */
export function effectivenessCounterflow(ntu, cr) {
  if (cr <= 1e-6) return 1 - Math.exp(-ntu);
  if (cr >= 0.99999) return ntu / (1 + ntu);
  const k = Math.exp(-ntu * (1 - cr));
  return (1 - k) / (1 - cr * k);
}

/** Affinity law: flow ∝ speed. */
export function pumpFlowFromSpeed(refFlow, refSpeedPct, speedPct) {
  if (refSpeedPct <= 0) return 0;
  return refFlow * (speedPct / refSpeedPct);
}

/** Affinity law: power ∝ speed³. */
export function pumpPowerFromSpeed(refKw, refSpeedPct, speedPct) {
  if (refSpeedPct <= 0 || speedPct <= 0) return 0;
  return refKw * (speedPct / refSpeedPct) ** 3;
}

/** Affinity law: head ∝ speed². */
export function pumpHeadFromSpeed(refHead, refSpeedPct, speedPct) {
  if (refSpeedPct <= 0) return 0;
  return refHead * (speedPct / refSpeedPct) ** 2;
}

/**
 * Design constants calibrated to the Marina Bay Sands A-B03-01 screenshot.
 * Baseline reads: 465.9 ton / 1638.5 kW thermal · DCS 6.0 °C · CHWS 7.5 °C ·
 * CHWR/DCR ≈ 15.1 °C · CHWR primary flow ≈ 157.5 m³/h · 2 of 3 pumps @ ~52.7 %.
 */
export const MBS = {
  HX_COUNT: 2,
  /** Per-exchanger rated capacity (RT): HX-A-B03-01 = 600, HX-A-B03-02 = 500. */
  HX_RATED_TONS: [600, 500],
  PUMP_COUNT: 3,
  /** Per-pump volumetric flow at 100 % speed (m³/h). */
  PUMP_REF_FLOW_M3H: 176,
  /** Per-pump shaft power at 100 % speed (kW). */
  PUMP_REF_KW: 110,
  PUMP_REF_SPEED_PCT: 100,
  PUMP_MIN_SPEED_PCT: 25,
  PUMP_MAX_SPEED_PCT: 100,
  /** Design secondary loop ΔT (CHWR − CHWS), K. */
  DESIGN_SEC_DELTA_T: 7.6,
  /** Design cold-end approach (CHWS − DCS) at the reference load, K. */
  DESIGN_APPROACH_C: 1.5,
  /** Design hot-end pinch (CHWR − DCR) at the reference load, K. */
  DESIGN_HOT_PINCH_C: 0.3,
  /** Primary district supply temperature from the DCS plant, °C. */
  DCS_SUPPLY_C: 6.0,
  /** Secondary chilled-water supply setpoint, °C. */
  CHWS_SETPOINT_C: 7.5,
  /** Header differential-pressure setpoint, kPa. */
  DP_SETPOINT_KPA: 100,
  /** Reference building load used to anchor the approach correlation, RT. */
  REF_LOAD_RT: 466,
  /** Cumulative thermal energy on the screenshot meter, kWh. */
  METER_BASELINE_KWH: 49243020,
};

/**
 * Solve the steady-state thermo-hydraulic state of the ETS for a given
 * building cooling load and setpoints. Pure function — no time/state.
 *
 * @param {object} inp
 * @param {number} inp.demandRt        building cooling load (RT)
 * @param {number} [inp.dcsSupplyC]    primary supply temp from DCS (°C)
 * @param {number} [inp.chwsSpC]       secondary CHWS setpoint (°C)
 * @param {number} [inp.dpSpKpa]       header DP setpoint (kPa)
 * @param {number} [inp.chwrtSpC]      LT-bypass CHWR target (°C)
 * @param {number} [inp.hxInService]   number of heat exchangers in service
 * @param {number} [inp.pumpMinPct]    min VSD speed
 * @param {number} [inp.pumpMaxPct]    max VSD speed
 */
export function solveEtsThermoHydraulics(inp) {
  const dcsSupplyC = inp.dcsSupplyC ?? MBS.DCS_SUPPLY_C;
  const chwsSpC = inp.chwsSpC ?? MBS.CHWS_SETPOINT_C;
  const dpSpKpa = inp.dpSpKpa ?? MBS.DP_SETPOINT_KPA;
  const chwrtSpC = inp.chwrtSpC ?? 15.0;
  const hxInService = inp.hxInService ?? MBS.HX_COUNT;
  const pumpMinPct = inp.pumpMinPct ?? MBS.PUMP_MIN_SPEED_PCT;
  const pumpMaxPct = inp.pumpMaxPct ?? MBS.PUMP_MAX_SPEED_PCT;

  const demandRt = Math.max(0, inp.demandRt);
  const coolingKw = kwFromTons(demandRt);

  // Installed capacity = sum of in-service exchanger ratings (HX1=600, HX2=500).
  const ratings = MBS.HX_RATED_TONS;
  const inSvcCount = clamp(Math.round(hxInService), 0, ratings.length);
  let capacityTons = 0;
  for (let i = 0; i < inSvcCount; i++) capacityTons += ratings[i] || 0;
  capacityTons = Math.max(1, capacityTons);
  const totalCapacity = ratings.reduce((a, b) => a + b, 0);
  const loadFrac = clamp(demandRt / capacityTons, 0, 1.1);
  const refFrac = MBS.REF_LOAD_RT / totalCapacity;

  // --- Heat-exchanger thermal performance -------------------------------
  // Cold-end approach widens with load (less NTU per unit heat-capacity rate).
  // Calibrated so approach == DESIGN_APPROACH_C at the reference load fraction.
  const approachC = clamp(
    MBS.DESIGN_APPROACH_C * (loadFrac / Math.max(refFrac, 1e-3)),
    0.6,
    5.0
  );
  const hotPinchC = clamp(
    MBS.DESIGN_HOT_PINCH_C * (loadFrac / Math.max(refFrac, 1e-3)),
    0.1,
    2.0
  );

  // Secondary side (building loop): supply held near setpoint + approach.
  const chwsC = chwsSpC + (approachC - MBS.DESIGN_APPROACH_C) * 0.5;
  const secDeltaT = clamp(MBS.DESIGN_SEC_DELTA_T * (0.85 + 0.15 * (loadFrac / Math.max(refFrac, 1e-3))), 4.0, 9.0);
  const chwrC = chwsC + secDeltaT;
  const secFlowM3h = flowM3hFromDuty(coolingKw, secDeltaT);

  // Primary side (DCS loop): bounded by secondary inlet (cannot exceed it).
  const dcrC = Math.min(chwrC - hotPinchC, chwrC - 0.05);
  const priDeltaT = Math.max(0.5, dcrC - dcsSupplyC);
  const priFlowM3h = flowM3hFromDuty(coolingKw, priDeltaT);

  // Rigorous HX descriptors (reported as KPIs, exercised by the test).
  const cSec = capacityRateKwPerK(secFlowM3h); // hot stream (building return)
  const cPri = capacityRateKwPerK(priFlowM3h); // cold stream (district supply)
  const cMin = Math.min(cSec, cPri);
  const cMax = Math.max(cSec, cPri);
  const cr = cMax > 1e-6 ? cMin / cMax : 0;
  const effectiveness = hxEffectiveness(coolingKw, cMin, chwrC, dcsSupplyC);
  const ntu = ntuFromEffectivenessCounterflow(effectiveness, cr);
  const lmtdC = lmtdCounterflow(chwrC - dcrC, chwsC - dcsSupplyC);
  const uaKwPerK = lmtdC > 1e-6 ? coolingKw / lmtdC : 0;

  // --- Secondary pump staging & VSD speed (FLOW-VSD) --------------------
  // Stage just enough pumps to carry the flow within the speed band.
  const maxFlowPerPump = MBS.PUMP_REF_FLOW_M3H * (pumpMaxPct / 100);
  let pumpsRunning = clamp(Math.ceil(secFlowM3h / Math.max(maxFlowPerPump, 1e-3)), demandRt > 0 ? 1 : 0, MBS.PUMP_COUNT);
  const flowPerPump = pumpsRunning > 0 ? secFlowM3h / pumpsRunning : 0;
  // Speed from affinity (flow ∝ speed) + a DP-driven floor.
  const dpFloorPct = clamp((dpSpKpa / MBS.DP_SETPOINT_KPA) * 0, 0, 0); // DP held at SP; no extra floor
  let pumpSpeedPct = pumpsRunning > 0
    ? clamp((flowPerPump / MBS.PUMP_REF_FLOW_M3H) * 100 + dpFloorPct, pumpMinPct, pumpMaxPct)
    : 0;
  const pumpPowerEachKw = pumpPowerFromSpeed(MBS.PUMP_REF_KW, MBS.PUMP_REF_SPEED_PCT, pumpSpeedPct);
  const pumpPowerKwTotal = pumpsRunning * pumpPowerEachKw;
  const headerDpKpa = dpSpKpa + loadFrac * 2; // gentle rise with load

  // --- LT bypass valve (holds CHWR / min-flow) -------------------------
  const ltBypassPct = clamp(40 - (chwrC - chwrtSpC) * 8 - (loadFrac - refFrac) * 30, 0, 100);
  const ltBypassFlowM3h = secFlowM3h * (ltBypassPct / 100) * 0.18;

  // --- Efficiency & energy ---------------------------------------------
  const pumpKwPerRt = demandRt > 0 ? pumpPowerKwTotal / demandRt : 0;

  return {
    demandRt: round(demandRt, 1),
    coolingKw: round(coolingKw, 1),
    capacityTons,
    loadFrac: round(loadFrac, 3),
    // temperatures
    dcsSupplyC: round(dcsSupplyC, 1),
    dcrC: round(dcrC, 1),
    chwsC: round(chwsC, 1),
    chwrC: round(chwrC, 1),
    approachC: round(approachC, 2),
    hotPinchC: round(hotPinchC, 2),
    priDeltaT: round(priDeltaT, 1),
    secDeltaT: round(secDeltaT, 1),
    // flows
    priFlowM3h: round(priFlowM3h, 1),
    secFlowM3h: round(secFlowM3h, 1),
    ltBypassPct: round(ltBypassPct, 1),
    ltBypassFlowM3h: round(ltBypassFlowM3h, 1),
    // HX descriptors
    effectiveness: round(effectiveness, 3),
    ntu: round(ntu, 2),
    lmtdC: round(lmtdC, 2),
    uaKwPerK: round(uaKwPerK, 0),
    cr: round(cr, 3),
    // pumps / hydraulics
    pumpsRunning,
    pumpSpeedPct: round(pumpSpeedPct, 1),
    pumpPowerEachKw: round(pumpPowerEachKw, 1),
    pumpPowerKwTotal: round(pumpPowerKwTotal, 1),
    headerDpKpa: round(headerDpKpa, 0),
    pumpKwPerRt: round(pumpKwPerRt, 3),
  };
}
