/**
 * Unit tests for AHU01 air-side physics (ahuPhysics.js).
 * Calibrated to BMS overview screenshot baseline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AHU01,
  solveAhu01Airside,
  coolingKwFromCfm,
  fanKwFromSpeed,
} from '../../../frontend/src/services/ahuPhysics.js';
import { buildAhuCascadeTrace } from '../../../frontend/src/services/ahuCascade.js';

const approx = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('cooling kW from CFM and delta-T is positive for cooling', () => {
  const q = coolingKwFromCfm(2000, 5);
  assert.ok(q > 0, `cooling ${q}`);
  // Sensible cooling: Q[kW] = 1.08·CFM·ΔT°F ÷ 3412 ≈ 0.00057·CFM·ΔT°C
  approx(q, 0.00057 * 2000 * 5, 0.1, 'cooling formula');
});

test('fan affinity law: power scales with speed cubed', () => {
  approx(fanKwFromSpeed(18, 100, 50), 18 * 0.125, 0.01, '50% speed');
  assert.equal(fanKwFromSpeed(18, 100, 0), 0);
});

test('BMS baseline — recirculation, high RA humidity drives CHW valve open', () => {
  const r = solveAhu01Airside({
    modeIndex: 0,
    oatC: 35.2,
    oaRhPct: 48.3,
    ratC: 25.1,
    raRhPct: 74.4,
    satSpC: 13.5,
    saCfmSp: 2555,
    raCfmSp: 1235,
    raTempSpC: 25.0,
    raRhSpPct: 75.0,
    spSpPa: 650,
    chwEnterC: 7.0,
    hwEnterC: 45.0,
    filterLoadingPct: 0,
    zoneLoadIdx: 1.0,
    saFanOn: true,
    raFanOn: true,
  });

  assert.equal(r.mode, 'recirculation');
  approx(r.ratC, 25.1, 0.1, 'RA temp');
  approx(r.raRhPct, 74.4, 0.1, 'RA RH');
  assert.ok(r.chwValvePct >= 85, `CHW valve should be high: ${r.chwValvePct}`);
  approx(r.saCfm, 2555, 50, 'SA CFM tracks BMS setpoint');
  approx(r.raCfm, 1235, 50, 'RA CFM tracks BMS setpoint');
  approx(r.satC, 13.5, 1.5, 'SAT near setpoint with CHW open');
  approx(r.staticPressurePa, 650, 80, 'static pressure at SP');
  assert.ok(r.saCfm > r.raCfm, 'positive building pressurization');
});

test('BMS baseline ACT vs setpoint KPIs are on-target', () => {
  const r = solveAhu01Airside({
    modeIndex: 0,
    ratC: 25.1,
    raRhPct: 74.4,
    satSpC: 13.5,
    saCfmSp: 2555,
    raCfmSp: 1235,
    raTempSpC: 25.0,
    raRhSpPct: 75.0,
    spSpPa: 650,
  });

  assert.ok(Math.abs(r.satC - r.satSpC) <= 1.5, `SAT deviation ${Math.abs(r.satC - r.satSpC)}`);
  assert.ok(r.ratC <= r.raTempSpC + 0.5, 'RA temp on SP');
  assert.ok(r.raRhPct <= r.raRhSpPct + 5, 'RA RH on SP');
  assert.ok(Math.abs(r.saCfm - r.saCfmSp) <= r.saCfmSp * 0.15, 'SA CFM on SP');
  assert.ok(Math.abs(r.raCfm - r.raCfmSp) <= r.raCfmSp * 0.12, 'RA CFM on SP');
  assert.ok(Math.abs(r.staticPressurePa - r.spSpPa) <= r.spSpPa * 0.12, 'static pressure on SP');
});

test('economizer mode increases OA fraction when OAT below RA', () => {
  const recirc = solveAhu01Airside({ modeIndex: 0, ratC: 26, oatC: 22 });
  const econ = solveAhu01Airside({ modeIndex: 2, ratC: 26, oatC: 22 });
  assert.ok(econ.oaFraction > recirc.oaFraction, 'economizer OA fraction');
});

test('dirty filter reduces effective airflow', () => {
  const clean = solveAhu01Airside({ filterLoadingPct: 0 });
  const dirty = solveAhu01Airside({ filterLoadingPct: 80 });
  assert.ok(dirty.saCfm < clean.saCfm, 'dirty filter lowers SA CFM');
  assert.ok(dirty.filterDpPa > clean.filterDpPa, 'dirty filter raises DP');
});

test('cascade trace includes key domino steps', () => {
  const r = solveAhu01Airside({ modeIndex: 0, ratC: 25.1, raRhPct: 74.4 });
  const trace = buildAhuCascadeTrace({
    trigger: 'Test',
    mode: r.mode,
    oatC: r.oatC,
    oaRhPct: r.oaRhPct,
    oaFraction: r.oaFraction,
    ratC: r.ratC,
    raRhPct: r.raRhPct,
    raTempSpC: r.raTempSpC,
    raRhSpPct: r.raRhSpPct,
    matC: r.matC,
    chwValvePct: r.chwValvePct,
    hwValvePct: r.hwValvePct,
    satC: r.satC,
    satSpC: r.satSpC,
    saFanSpeedPct: r.saFanSpeedPct,
    raFanSpeedPct: r.raFanSpeedPct,
    saCfm: r.saCfm,
    raCfm: r.raCfm,
    saCfmSp: r.saCfmSp,
    raCfmSp: r.raCfmSp,
    staticPressurePa: r.staticPressurePa,
    coolingKw: r.coolingKw,
    fanPowerKw: r.saFanKw + r.raFanKw,
    oaDamperPct: r.oaDamperPct,
    raDamperPct: r.raDamperPct,
    filterDpPa: r.filterDpPa,
    alertCount: 0,
  });
  assert.ok(trace.length >= 5, 'cascade steps');
  assert.ok(trace.some((s) => s.includes('CHW valve')), 'mentions CHW valve');
});
