/**
 * AHU01 air-side physics — plain ESM for tests + ahuEngine.ts.
 * Calibrated to BMS overview: RA 25.1°C/74.4%RH, SA 2555 CFM, CHW valve ~100%.
 *
 * Sensible: Q[Btu/h] = 1.08 × CFM × ΔT[°F]; metric Q[kW] ≈ 0.0167 × CFM × ΔT[°C]
 */

export const AHU01 = {
  DESIGN_SA_CFM: 2800,
  DESIGN_RA_CFM: 1600,
  DESIGN_SP_PA: 650,
  REF_SAT_C: 13.5,
  REF_CHW_ENTER_C: 7.0,
  REF_HW_ENTER_C: 45.0,
};

const MODES = ['recirculation', 'minimum_oa', 'economizer', 'heating'];

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Sensible cooling kW from CFM and ΔT (°C). */
export function coolingKwFromCfm(cfm, deltaTC) {
  return 0.0167 * cfm * Math.max(0, deltaTC);
}

/** Fan shaft kW from speed % (affinity P ∝ N³). */
export function fanKwFromSpeed(refKw, refPct, speedPct) {
  if (refPct <= 0 || speedPct <= 0) return 0;
  return refKw * (speedPct / refPct) ** 3;
}

function oaFractionForMode(modeIndex, oatC, ratC) {
  switch (modeIndex) {
    case 0: return 0.05;
    case 1: return 0.15;
    case 2: return clamp(0.1 + (ratC - oatC) / 40, 0.1, 0.55);
    case 3: return 0.12;
    default: return 0.05;
  }
}

/**
 * Steady-state AHU01 airside solve.
 * @param {object} inp
 */
export function solveAhu01Airside(inp) {
  const modeIndex = clamp(Math.round(inp.modeIndex ?? 0), 0, 3);
  const mode = MODES[modeIndex];
  const oatC = inp.oatC ?? 35.2;
  const oaRhPct = inp.oaRhPct ?? 48.3;
  const ratC = inp.ratC ?? 25.1;
  const raRhPct = inp.raRhPct ?? 74.4;
  const satSpC = inp.satSpC ?? AHU01.REF_SAT_C;
  const saCfmSp = inp.saCfmSp ?? 2555;
  const raCfmSp = inp.raCfmSp ?? 1235;
  const raTempSpC = inp.raTempSpC ?? 25.0;
  const raRhSpPct = inp.raRhSpPct ?? 75.0;
  const spSpPa = inp.spSpPa ?? AHU01.DESIGN_SP_PA;
  const chwEnterC = inp.chwEnterC ?? AHU01.REF_CHW_ENTER_C;
  const hwEnterC = inp.hwEnterC ?? AHU01.REF_HW_ENTER_C;
  const filterLoadingPct = clamp(inp.filterLoadingPct ?? 0, 0, 100);
  const zoneLoadIdx = clamp(inp.zoneLoadIdx ?? 1.0, 0.3, 1.5);
  const saFanOn = inp.saFanOn !== false;
  const raFanOn = inp.raFanOn !== false;

  const filterFactor = 1 - filterLoadingPct * 0.003;
  const oaFrac = oaFractionForMode(modeIndex, oatC, ratC);

  const tempError = ratC - raTempSpC;
  const rhError = raRhPct - raRhSpPct;

  const matC = oaFrac * oatC + (1 - oaFrac) * ratC;
  const matRh = oaFrac * oaRhPct + (1 - oaFrac) * raRhPct;

  // Coil load: SAT lift + absolute RA humidity (BMS: 74% RH drives CHW ~100% even when RA at RH SP)
  const coilLoad = clamp(
    zoneLoadIdx * (
      0.25 * (matC - satSpC) / 12
      + 0.75 * clamp((raRhPct - 52) / 22, 0, 1)
      + 0.1 * Math.max(0, tempError)
    ),
    0.35,
    1.35,
  );

  let chwValvePct = mode === 'heating' ? 0 : clamp(18 + coilLoad * 82, 0, 100);
  let hwValvePct = mode === 'heating' ? clamp(30 + Math.max(0, satSpC - matC) * 6, 0, 100) : clamp(5 + Math.max(0, 18 - oatC) * 0.5, 0, 40);

  const coilAuth = mode === 'heating' ? 0 : clamp(chwValvePct / 100, 0, 1);
  const heatAuth = mode === 'heating' ? clamp(hwValvePct / 100, 0, 1) : 0;
  const minCoilApproachC = 2.0;
  let satC;
  if (mode === 'heating') {
    satC = matC + heatAuth * Math.max(0, satSpC + 6 - matC);
  } else {
    const targetSatC = Math.max(satSpC, chwEnterC + minCoilApproachC);
    satC = matC - coilAuth * (matC - targetSatC);
  }

  // VFD tracks flow setpoints (inverse affinity); CFM matches SP at baseline
  const saFanSpeedPct = saFanOn
    ? clamp(100 * (saCfmSp / (AHU01.DESIGN_SA_CFM * filterFactor)) ** (1 / 0.85), 25, 100)
    : 0;
  const raFanSpeedPct = raFanOn
    ? clamp(100 * (raCfmSp / (AHU01.DESIGN_RA_CFM * filterFactor)) ** (1 / 0.85), 25, 100)
    : 0;

  const saCfm = saFanOn ? AHU01.DESIGN_SA_CFM * (saFanSpeedPct / 100) ** 0.85 * filterFactor : 0;
  const raCfm = raFanOn ? AHU01.DESIGN_RA_CFM * (raFanSpeedPct / 100) ** 0.85 * filterFactor : 0;
  const oaCfm = saCfm * oaFrac;
  const eaCfm = Math.max(0, saCfm - raCfm * (1 - oaFrac));

  // Static pressure tracks SP when SA flow is on setpoint
  const staticPressurePa = spSpPa * clamp((saCfm / Math.max(saCfmSp, 1)) ** 0.12, 0.75, 1.12);

  const saFanKw = fanKwFromSpeed(18, 100, saFanSpeedPct);
  const raFanKw = fanKwFromSpeed(12, 100, raFanSpeedPct);
  const coolingKw = coolingKwFromCfm(saCfm, matC - satC);
  const chwLeaveC = chwEnterC + coolingKw / Math.max(0.5, saCfm * 0.000471 * 4.186 * 1000);
  const hwLeaveC = hwEnterC - (hwValvePct / 100) * 8;

  const oaDamperPct = clamp(oaFrac * 100 + 5, 0, 100);
  const raDamperPct = clamp(100 - oaDamperPct + 10, 0, 100);

  return {
    mode,
    modeIndex,
    oatC: round(oatC, 1),
    oaRhPct: round(oaRhPct, 1),
    ratC: round(ratC, 1),
    raRhPct: round(raRhPct, 1),
    matC: round(matC, 1),
    matRhPct: round(matRh, 1),
    satC: round(satC, 1),
    satSpC,
    saCfm: round(saCfm, 1),
    raCfm: round(raCfm, 1),
    oaCfm: round(oaCfm, 1),
    eaCfm: round(eaCfm, 1),
    saCfmSp,
    raCfmSp,
    raTempSpC,
    raRhSpPct,
    oaFraction: round(oaFrac, 3),
    staticPressurePa: round(staticPressurePa, 0),
    spSpPa,
    chwValvePct: round(chwValvePct, 1),
    hwValvePct: round(hwValvePct, 1),
    chwEnterC,
    chwLeaveC: round(chwLeaveC, 1),
    hwEnterC,
    hwLeaveC: round(hwLeaveC, 1),
    saFanSpeedPct: round(saFanSpeedPct, 1),
    raFanSpeedPct: round(raFanSpeedPct, 1),
    saFanKw: round(saFanKw, 2),
    raFanKw: round(raFanKw, 2),
    fanPowerKw: round(saFanKw + raFanKw, 2),
    coolingKw: round(coolingKw, 1),
    kwPerCfm: saCfm > 0 ? round((saFanKw + raFanKw) / saCfm, 4) : 0,
    filterDpPa: round(50 + filterLoadingPct * 4.5, 0),
    oaDamperPct: round(oaDamperPct, 0),
    raDamperPct: round(raDamperPct, 0),
    tempError: round(tempError, 1),
    rhError: round(rhError, 1),
  };
}
