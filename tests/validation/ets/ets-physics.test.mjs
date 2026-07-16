/**
 * Unit tests for the ETS heat-exchange physics core (etsPhysics.js).
 *
 * Verifies energy conservation, effectiveness-NTU / LMTD relations, pump
 * affinity laws, and that the calibrated baseline reproduces the Marina Bay
 * Sands A-B03-01 schematic. Run with:  node --test tests/validation/ets/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CP_WATER,
  RT_TO_KW,
  coolingKwFromFlow,
  flowM3hFromDuty,
  kwFromTons,
  tonsFromKw,
  capacityRateKwPerK,
  lmtdCounterflow,
  hxEffectiveness,
  effectivenessCounterflow,
  ntuFromEffectivenessCounterflow,
  pumpFlowFromSpeed,
  pumpPowerFromSpeed,
  pumpHeadFromSpeed,
  solveEtsThermoHydraulics,
} from '../../../frontend/src/services/ets/etsPhysics.js';
import { buildEtsCascadeTrace } from '../../../frontend/src/services/ets/etsCascade.js';

const approx = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('ton <-> kW conversion uses 3.517', () => {
  approx(kwFromTons(465.9), 1638.6, 0.2, 'kWfromTons');
  approx(tonsFromKw(1638.5), 465.9, 0.2, 'tonsFromKw');
  assert.equal(RT_TO_KW, 3.517);
});

test('sensible-heat duty: Q = flow * dT * 1.163 (round-trips)', () => {
  const q = coolingKwFromFlow(160, 8.8);
  const flow = flowM3hFromDuty(q, 8.8);
  approx(flow, 160, 1e-6, 'flow round-trip');
});

test('capacity rate C = m_dot * cp is consistent with FLOW_COEFF', () => {
  // C [kW/K] for 1 m3/h should equal 1.163 (== cp*rho/3600)
  approx(capacityRateKwPerK(1), 1.163, 1e-3, 'C per m3/h');
  approx(capacityRateKwPerK(3.6), CP_WATER, 1e-3, 'C for 1 L/s == cp');
});

test('LMTD counter-flow is between the two terminal differences', () => {
  const lm = lmtdCounterflow(9.1, 1.5);
  assert.ok(lm > 1.5 && lm < 9.1, `LMTD ${lm} not bracketed`);
  // equal terminals -> arithmetic mean
  approx(lmtdCounterflow(5, 5), 5, 1e-6, 'equal terminals');
});

test('effectiveness in [0,1] and NTU inverse round-trips', () => {
  const eps = effectivenessCounterflow(2.0, 0.8);
  assert.ok(eps > 0 && eps < 1, `eps ${eps}`);
  const ntu = ntuFromEffectivenessCounterflow(eps, 0.8);
  approx(ntu, 2.0, 1e-3, 'NTU inverse round-trip');
});

test('pump affinity laws: Q~N, H~N^2, P~N^3', () => {
  approx(pumpFlowFromSpeed(176, 100, 50), 88, 1e-9, 'flow ~ N');
  approx(pumpHeadFromSpeed(40, 100, 50), 10, 1e-9, 'head ~ N^2');
  approx(pumpPowerFromSpeed(110, 100, 50), 13.75, 1e-9, 'power ~ N^3');
});

test('HX energy balance: primary duty == secondary duty == load', () => {
  const s = solveEtsThermoHydraulics({ demandRt: 465.9 });
  const qPrimary = coolingKwFromFlow(s.priFlowM3h, s.priDeltaT);
  const qSecondary = coolingKwFromFlow(s.secFlowM3h, s.secDeltaT);
  approx(qPrimary, s.coolingKw, s.coolingKw * 0.02, 'primary duty');
  approx(qSecondary, s.coolingKw, s.coolingKw * 0.02, 'secondary duty');
});

test('baseline reproduces the MBS A-B03-01 schematic', () => {
  const s = solveEtsThermoHydraulics({ demandRt: 465.9 });
  approx(s.coolingKw, 1638.5, 1.0, 'thermal kW (meter 1638.5)');
  approx(s.chwsC, 7.5, 0.1, 'CHWS (7.5)');
  approx(s.chwrC, 15.1, 0.2, 'CHWR (15.1)');
  approx(s.dcsSupplyC, 6.0, 0.05, 'DCS supply (6.0)');
  approx(s.approachC, 1.5, 0.15, 'approach (1.5)');
  approx(s.priFlowM3h, 157.5, 6, 'primary flow (157.5 m3/h)');
  assert.equal(s.pumpsRunning, 2, '2 pumps running (Stage 2)');
  approx(s.pumpSpeedPct, 52.7, 3, 'pump speed (~52.7%)');
  assert.ok(s.effectiveness > 0.9 && s.effectiveness <= 1, `effectiveness ${s.effectiveness}`);
});

test('the cold-end approach never goes negative (2nd-law floor)', () => {
  for (let rt = 100; rt <= 1100; rt += 100) {
    const s = solveEtsThermoHydraulics({ demandRt: rt });
    assert.ok(s.chwsC >= s.dcsSupplyC - 1e-6, `CHWS<DCS at ${rt} RT`);
    assert.ok(s.dcrC <= s.chwrC + 1e-6, `DCR>CHWR at ${rt} RT`);
  }
});

test('higher load stages more pumps and widens approach', () => {
  const low = solveEtsThermoHydraulics({ demandRt: 200 });
  const high = solveEtsThermoHydraulics({ demandRt: 1000 });
  assert.ok(high.pumpsRunning >= low.pumpsRunning, 'more pumps at higher load');
  assert.ok(high.approachC >= low.approachC, 'wider approach at higher load');
  assert.ok(high.pumpPowerKwTotal > low.pumpPowerKwTotal, 'more pump power at higher load');
});

test('ETS cascade trace documents the causal chain', () => {
  const s = solveEtsThermoHydraulics({ demandRt: 466 });
  const trace = buildEtsCascadeTrace({
    trigger: 'Operator set Building Cooling Load: 400 → 466 RT',
    baseLoadRt: 466,
    ambient: 35.4,
    occupied: true,
    targetLoadRt: 466,
    demandRt: s.demandRt,
    coolingKw: s.coolingKw,
    chwsSp: 7.5,
    chwsC: s.chwsC,
    chwrC: s.chwrC,
    secDeltaT: s.secDeltaT,
    secFlowM3h: s.secFlowM3h,
    dpSp: 100,
    headerDpKpa: s.headerDpKpa,
    pumpsRunning: s.pumpsRunning,
    pumpSpeedPct: s.pumpSpeedPct,
    pumpPowerKwTotal: s.pumpPowerKwTotal,
    pumpKwPerRt: s.pumpKwPerRt,
    hxInService: 2,
    loadFrac: s.loadFrac,
    approachC: s.approachC,
    effectiveness: s.effectiveness,
    lmtdC: s.lmtdC,
    dcsSupplyC: s.dcsSupplyC,
    dcrC: s.dcrC,
    priDeltaT: s.priDeltaT,
    priFlowM3h: s.priFlowM3h,
    chwrtSp: 15,
    ltBypassPct: s.ltBypassPct,
    ltBypassFlowM3h: s.ltBypassFlowM3h,
    alertCount: 0,
  });
  assert.ok(trace.length >= 7, 'cascade has load → secondary → pumps → HX → primary steps');
  assert.ok(trace[0].startsWith('▶'), 'first step is the trigger');
  assert.ok(trace.some((l) => l.includes('FLOW-VSD')), 'includes pump staging');
  assert.ok(trace.some((l) => l.includes('Plate HX')), 'includes heat exchanger');
});
