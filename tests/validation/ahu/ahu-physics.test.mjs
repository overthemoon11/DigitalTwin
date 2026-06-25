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
  approx(q, 0.0167 * 2000 * 5, 0.1, 'cooling formula');
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
    saCfmSp: 1800,
    raCfmSp: 1500,
    raTempSpC: 24.0,
    raRhSpPct: 52.0,
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
  approx(r.saCfm, 2555, 150, 'SA CFM near BMS');
  approx(r.raCfm, 1235, 150, 'RA CFM near BMS');
  assert.ok(r.saCfm > r.raCfm, 'positive building pressurization');
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
