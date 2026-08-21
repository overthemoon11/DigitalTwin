/**
 * Why CHWST-SP is now optimised, and what keeps that honest.
 *
 * HISTORY, BECAUSE IT MATTERS TO THE ARGUMENT
 * This file used to assert the opposite. CHWST was deliberately left OUT of the
 * search, for a reason that was correct at the time: the engine's response to it
 * is monotone across the calibrated band, so there is no interior optimum, and —
 * more importantly — the saving was ONE-SIDED. The twin served a higher supply
 * temperature by floating the return up at constant flow and constant delta-T,
 * so the chiller got its reduced lift for free. Booking that as a saving would
 * have been booking a fabricated number.
 *
 * The old file said explicitly what would have to change for CHWST to be
 * promotable: a model that charges for the consequence. That is what happened.
 * There is still no coil or zone model — the twin cannot represent a drifting
 * zone — but there are now two costs the optimiser cannot avoid:
 *
 *   1. A RETURN LIMIT (`system.maxChwrC`), which is what a real operator
 *      actually enforces and is the operator's proxy for starved coils.
 *   2. FLOW THAT RESPONDS TO THE PUMP COMMAND. Holding the return down while
 *      the supply rises needs more water, and pump power is cubic in speed.
 *
 * So the tests below changed direction. The first three still pin the ENGINE's
 * behaviour, unchanged, because the argument depends on knowing exactly what the
 * engine does and does not charge for. The rest pin the constraints that turn
 * that into a bounded, two-sided decision — and the last one is the guard that
 * fails if the boundedness is ever lost.
 *
 * The band itself is not chosen here: CALIBRATION_BOUNDS['ctrl-chws-sp'] is
 * 7.4-7.7 degC because the December trend never left 7.55-7.60.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import { evaluatePlant } from '../src/digital-twin/chiller/index.ts';
import { CALIBRATION_BOUNDS } from '../src/digital-twin/chiller/calibration/calibrationEnvelope.ts';
import { designConstraints, simulateCandidate, chillerIdsFor, reconcileControl } from '../src/mpc/index.ts';
import { PLANT_MPC_PROVENANCE } from '../src/mpc/horizon/plantMpc.ts';

/** p5 / p50 / p95 cooling load from data/processed/t1_2025_12_15min.json. */
const LOADS = [2767, 3091, 3339];
/** Median measured CWS, so the condenser side is held at a real value. */
const CWS_C = 28.46;

const at = (loadRt, chwsC) =>
  evaluatePlant({
    'ctrl-building-load': loadRt,
    'ctrl-chws-sp': chwsC,
    'ctrl-cws-sp': CWS_C,
  });

const CFG = designConstraints();
const control = (patch) =>
  reconcileControl(
    {
      chwstSetpointC: 7.58,
      dpSetpointPsi: 15,
      runningChillers: 3,
      chillerIds: chillerIdsFor(CFG, 3),
      chwpSpeedPct: 70,
      cwpSpeedPct: 70,
      ctFanSpeedPct: 70,
      ...patch,
    },
    CFG
  );
const score = (loadRt, patch, cfg = CFG) =>
  simulateCandidate({ buildingLoadRt: loadRt, wetBulbC: 24.8 }, control(patch), cfg, {
    baseline: null,
    dryBulbHintC: 31,
  });

describe('what the engine does and does not charge for', () => {
  test('the calibrated band is the narrow one the December trend actually swept', () => {
    const b = CALIBRATION_BOUNDS['ctrl-chws-sp'];
    assert.ok(b, 'CHWS setpoint must declare a calibration envelope');
    assert.ok(
      b.max - b.min <= 0.5,
      `the CHWS band is ${b.max - b.min} K wide; a wide band would mean the ` +
        'site really did move CHWST and this whole argument needs revisiting'
    );
  });

  test('the engine response is monotone, so the OPTIMUM IS ALWAYS A BOUNDARY', () => {
    // This is why CHWST is bounded by a constraint rather than by an interior
    // turning point, and why the return limit does the real work.
    const b = CALIBRATION_BOUNDS['ctrl-chws-sp'];
    const steps = 7;
    for (const load of LOADS) {
      const kw = [];
      for (let i = 0; i < steps; i++) {
        kw.push(at(load, b.min + ((b.max - b.min) * i) / (steps - 1)).power.totalKw);
      }
      for (let i = 1; i < kw.length; i++) {
        assert.ok(kw[i] <= kw[i - 1] + 1e-9, `at ${load} RT the plant is not monotone in CHWS`);
      }
      assert.equal(Math.min(...kw), kw[kw.length - 1], 'the cheap end is the top of the band');
    }
  });

  test('the ENGINE alone still charges nothing for it — the return just floats', () => {
    // Unchanged from when this file argued the opposite. The engine has no coil
    // model, so at fixed pump speed a higher supply temperature produces a
    // higher return and nothing else. Everything that makes CHWST a real
    // decision is built on top of this, not inside it.
    const b = CALIBRATION_BOUNDS['ctrl-chws-sp'];
    const lo = at(3091, b.min);
    const hi = at(3091, b.max);

    assert.ok(hi.power.chillerKw < lo.power.chillerKw, 'less lift is real physics');
    assert.ok(
      Math.abs(hi.hydraulic.chwFlowM3h - lo.hydraulic.chwFlowM3h) < 1e-6,
      'the engine does not move water in response to CHWST'
    );
    assert.ok(Math.abs(hi.thermal.deltaT - lo.thermal.deltaT) < 1e-6, 'delta-T is clamped');
    assert.ok(Math.abs(hi.power.chwpKw - lo.power.chwpKw) < 1e-6, 'CHWP kW is unmoved');
    assert.ok(hi.thermal.chwr > lo.thermal.chwr, 'the return absorbs the whole change');
  });
});

describe('what makes CHWST a bounded, two-sided decision', () => {
  test('the return limit rejects a supply temperature that floats the loop too warm', () => {
    // The constraint that replaces the missing coil model. Without it the
    // optimiser takes CHWST to its band edge and books the difference.
    const legal = score(3094, { chwstSetpointC: 8.5 });
    const tooWarm = score(3094, { chwstSetpointC: 10 });

    assert.equal(legal.feasible, true, `8.5 degC should be legal: ${legal.violations.map((v) => v.code)}`);
    assert.ok(
      tooWarm.violations.some((v) => v.code === 'chwr-max'),
      `10 degC produced CHWR ${tooWarm.chwrC} and should have tripped the return limit`
    );
    assert.ok(tooWarm.chwrC > CFG.system.maxChwrC);
  });

  test('tightening the return limit tightens how far CHWST may go', () => {
    const tight = designConstraints();
    tight.system.maxChwrC = 15;
    const at85 = score(3094, { chwstSetpointC: 8.5 }, tight);
    assert.ok(
      !at85.feasible && at85.violations.some((v) => v.code === 'chwr-max'),
      'a 15 degC return limit must forbid what a 16 degC limit allowed'
    );
  });

  test('holding the return down while the supply rises costs pump power', () => {
    // The second cost, and the one that makes the trade-off genuinely two-sided
    // rather than merely capped: more flow is the only way to keep the return
    // down at a higher supply temperature, and pump power is cubic in speed.
    const warmSupplyLowFlow = score(3094, { chwstSetpointC: 8.5, dpSetpointPsi: 15 });
    const warmSupplyMoreFlow = score(3094, { chwstSetpointC: 8.5, dpSetpointPsi: 18 });

    assert.ok(
      warmSupplyMoreFlow.chwrC < warmSupplyLowFlow.chwrC,
      'more flow must bring the return temperature down'
    );
    assert.ok(
      warmSupplyMoreFlow.chwpKw > warmSupplyLowFlow.chwpKw * 1.2,
      `keeping the return down cost only ${(warmSupplyMoreFlow.chwpKw - warmSupplyLowFlow.chwpKw).toFixed(1)} kW — ` +
        'the pump law is not charging for it'
    );
  });

  test('the search does not get CHWST for free: it must pay somewhere', () => {
    // The summary guard. Raising CHWST always cuts the chiller, so if it ever
    // cuts TOTAL plant power without also either warming the return or
    // spending pump power, something has stopped charging for it.
    const base = score(3094, { chwstSetpointC: 7.58 });
    const warmer = score(3094, { chwstSetpointC: 8.5 });
    assert.ok(warmer.chillerKw < base.chillerKw, 'sanity: less lift is cheaper');
    assert.ok(
      warmer.chwrC > base.chwrC + 0.5 || warmer.pumpKw > base.pumpKw + 1,
      'CHWST reset produced a saving with no consequence at all — the cost model has regressed'
    );
  });

  test('and the MPC reports it as optimised, because now it is', () => {
    assert.equal(PLANT_MPC_PROVENANCE.chwstSetpointC, 'optimized');
    // Its partner in the same trade-off is searched too...
    assert.equal(PLANT_MPC_PROVENANCE.dpSetpointPsi, 'optimized');
    // ...and the pump speed that follows from it is DERIVED, not claimed as an
    // independent optimum, because the two cannot be executed separately.
    assert.equal(PLANT_MPC_PROVENANCE.chwpSpeedPct, 'derived');
  });
});
