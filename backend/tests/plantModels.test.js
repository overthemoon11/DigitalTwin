/**
 * The four model extensions that turn CHWST, DP, CWP speed and CT fan speed
 * from labels into decisions.
 *
 * Each of them exists because, without it, the twin priced one of the six
 * control variables at zero — and an optimiser handed a free variable will take
 * it to a bound and report the difference as a saving. So the tests here are
 * mostly about the SHAPE of each response and about one property that matters
 * more than accuracy: every correction must be exactly neutral at the operating
 * point the site was calibrated at, or the whole 0.83% month-wide plant-kW
 * calibration moves underneath it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  COND_APPROACH_FLOW_EXPONENT,
  REF_COND_APPROACH_K,
  condenserLiftMultiplier,
  condenserLiftShift,
} from '../src/digital-twin/chiller/model/condenserHydraulics.ts';
import {
  CT_APPROACH_AIRFLOW_EXPONENT,
  towerApproachFanMultiplier,
} from '../src/digital-twin/chiller/model/towerFanLaw.ts';
import {
  chwpSpeedForDp,
  chwpSpeedFromDpSetpoint,
  dpSetpointFromChwpSpeed,
  reachableDpBand,
} from '../src/digital-twin/chiller/model/dpHydraulics.ts';
import {
  SHAPE_REFERENCE_PLR_PCT,
  partLoadShapeFactor,
  plrIsExtrapolated,
} from '../src/digital-twin/chiller/model/chillerPartLoad.ts';
import {
  GORDON_NG_FIT,
  gordonNgChillerKw,
} from '../src/digital-twin/chiller/calibration/gordonNgFit.ts';
import {
  CH_KW_INTERCEPT,
  CH_KW_SLOPE_PER_PCT,
} from '../src/digital-twin/chiller/calibration/t1MonthCalibration.ts';
import { REF_CHWP_SPEED, REF_CT_FAN, REF_CWP_SPEED } from '../src/digital-twin/chiller/model/plantPhysics.ts';
import { approachFromConditions } from '../src/mpc/index.ts';
import { fittedApproachC } from '../src/digital-twin/chiller/calibration/towerApproachFit.ts';

const CHILLER_CAPACITY_RT = 1250;

describe('condenser hydraulics: what slow CW pumps really cost', () => {
  test('the correction is exactly zero at the reference speed', () => {
    // The property the whole calibration depends on. If this drifts, every
    // site-validated operating point moves with it.
    const s = condenserLiftShift(REF_CWP_SPEED, 4.26);
    assert.equal(s.liftShiftK, 0);
    assert.equal(s.waterRiseShiftK, 0);
    assert.equal(s.bundleShiftK, 0);
    assert.equal(s.flowRatio, 1);
    assert.equal(condenserLiftMultiplier(28.5, s.liftShiftK), 1);
  });

  test('slower pumps raise the equivalent lift, faster pumps lower it', () => {
    const slow = condenserLiftShift(50, 4.26 * (70 / 50));
    const fast = condenserLiftShift(90, 4.26 * (70 / 90));
    assert.ok(slow.liftShiftK > 0, 'halving the flow must cost lift');
    assert.ok(fast.liftShiftK < 0, 'more flow must buy lift back');
    assert.ok(slow.liftShiftK > -fast.liftShiftK, 'the penalty is convex, not symmetric');
  });

  test('both physical terms are present and pull the same way', () => {
    const s = condenserLiftShift(56, 4.26 * (70 / 56));
    assert.ok(s.waterRiseShiftK > 0, 'a smaller flow means a bigger water rise');
    assert.ok(s.bundleShiftK > 0, 'a smaller flow means a worse tube-bundle approach');
    // The two are the same order of magnitude at a 20% flow cut; if the bundle
    // term ever dominated, the assumed exponent would be doing all the work.
    assert.ok(s.bundleShiftK < s.waterRiseShiftK, 'the measured term should lead');
  });

  test('the water-rise term is the heat-balance identity, not a fitted curve', () => {
    // dT is inversely proportional to flow at fixed rejected heat, so the shift
    // against the reference must be exactly dT x (1 - speedRatio).
    const speed = 56;
    const dtAtSpeed = 4.26 * (REF_CWP_SPEED / speed);
    const s = condenserLiftShift(speed, dtAtSpeed);
    assert.ok(Math.abs(s.waterRiseShiftK - dtAtSpeed * (1 - speed / REF_CWP_SPEED)) < 1e-9);
  });

  test('a zero or nonsensical speed is bounded, not infinite', () => {
    for (const speed of [0, -10, NaN]) {
      const s = condenserLiftShift(speed, 4.26);
      assert.ok(Number.isFinite(s.liftShiftK));
      assert.ok(s.liftShiftK > 0);
    }
  });

  test('the multiplier applies the engine lift slope and stays bounded', () => {
    const oneK = condenserLiftMultiplier(28.5, 1);
    // The calibrated slope is 4.52 %/K, de-confounded within load bins.
    assert.ok(Math.abs(oneK - 1.046) < 0.01, `1 K of lift moved chiller kW by ${((oneK - 1) * 100).toFixed(2)}%`);
    assert.ok(condenserLiftMultiplier(28.5, 40) <= 1.4, 'the multiplier must be clamped');
    assert.ok(condenserLiftMultiplier(28.5, -40) >= 0.8);
  });

  test('the assumed constants are declared, not buried', () => {
    assert.equal(COND_APPROACH_FLOW_EXPONENT, 0.8, 'Dittus-Boelter');
    assert.ok(REF_COND_APPROACH_K > 0 && REF_COND_APPROACH_K < 4);
  });
});

describe('tower fan law: approach against airflow', () => {
  test('the multiplier is exactly 1 at the reference fan speed', () => {
    assert.equal(towerApproachFanMultiplier(REF_CT_FAN), 1);
    // ...so a run that does not command the fans gets the site fit unchanged.
    assert.ok(Math.abs(approachFromConditions(24.8, 3094, REF_CT_FAN) - fittedApproachC(24.8, 3094)) < 1e-9);
  });

  test('faster fans narrow the approach, slower fans widen it', () => {
    assert.ok(towerApproachFanMultiplier(100) < 1);
    assert.ok(towerApproachFanMultiplier(40) > 1);
    let previous = Infinity;
    for (const fan of [30, 40, 50, 60, 70, 80, 90, 100]) {
      const m = towerApproachFanMultiplier(fan);
      assert.ok(m < previous, `not monotone at ${fan}%`);
      previous = m;
    }
  });

  test('the response is gentle enough to leave an interior optimum', () => {
    // The law this replaced moved the approach 0.36 K per 1% of fan, which put
    // the entire observed approach band inside a 10-point fan window and left
    // the optimiser choosing between two clamps. This is the regression guard.
    const at70 = approachFromConditions(24.8, 3094, 70);
    const at80 = approachFromConditions(24.8, 3094, 80);
    const perPct = Math.abs(at80 - at70) / 10;
    assert.ok(perPct < 0.05, `${perPct.toFixed(3)} K per 1% of fan is far too steep`);
    assert.ok(perPct > 0.005, `${perPct.toFixed(4)} K per 1% of fan is too flat to trade against`);
  });

  test('the approach stays a physically possible temperature difference', () => {
    for (const fan of [1, 20, 50, 70, 100, 140]) {
      for (const wb of [18, 24.8, 30]) {
        const a = approachFromConditions(wb, 3094, fan);
        assert.ok(a >= 2.5 && a <= 12, `approach ${a} K at fan ${fan}, wb ${wb}`);
      }
    }
  });

  test('the assumed exponent is declared', () => {
    assert.ok(CT_APPROACH_AIRFLOW_EXPONENT > 0.3 && CT_APPROACH_AIRFLOW_EXPONENT < 0.9);
  });
});

describe('DP and CHW pump speed are one decision, not two', () => {
  test('the map round-trips exactly', () => {
    for (const dp of [10, 12.5, 15, 18, 21.5, 25]) {
      const speed = chwpSpeedFromDpSetpoint(dp);
      if (speed > 30 && speed < 100) {
        assert.ok(Math.abs(dpSetpointFromChwpSpeed(speed) - dp) < 1e-6, `round trip failed at ${dp} psi`);
      }
    }
    assert.equal(dpSetpointFromChwpSpeed(REF_CHWP_SPEED), 15, 'the reference pair must be 70% at 15 psi');
  });

  test('the reachable DP band excludes the flat regions at either clamp', () => {
    // Without this, 25 and 30 psi both mean 100% speed: two "different optima"
    // that are the same plant, and a search that wastes candidates on them.
    const band = reachableDpBand(10, 30, 40, 100);
    assert.ok(band.max <= 25.01, `DP above ${band.max} psi cannot move the pump any further`);
    assert.ok(band.min >= 5, 'the low end is bounded by the configured DP floor');
    assert.ok(band.max > band.min);
  });

  test('a narrower pump band narrows the reachable DP band', () => {
    const wide = reachableDpBand(10, 30, 40, 100);
    const narrow = reachableDpBand(10, 30, 60, 80);
    assert.ok(narrow.min > wide.min && narrow.max < wide.max,
      'tightening the pump limits must tighten what DP setpoints the search may propose');
  });

  test('a disjoint configuration collapses instead of inverting', () => {
    const band = reachableDpBand(28, 30, 40, 50);
    assert.ok(band.max >= band.min, 'an inverted range would break every grid builder downstream');
  });

  test('the derived speed always lands inside the configured pump band', () => {
    for (const dp of [-5, 0, 10, 15, 25, 40, 1000]) {
      const s = chwpSpeedForDp(dp, 45, 85);
      assert.ok(s >= 45 && s <= 85, `${dp} psi produced ${s}%`);
    }
  });
});

describe('Gordon-Ng part-load shape', () => {
  test('it is neutral where the affine curve is best evidenced', () => {
    assert.ok(Math.abs(partLoadShapeFactor(SHAPE_REFERENCE_PLR_PCT) - 1) < 1e-9);
    // ...and essentially neutral across the whole observed band, so no
    // site-calibrated operating point moves.
    for (const plr of [GORDON_NG_FIT.observedPlrPct.p1, 80, GORDON_NG_FIT.observedPlrPct.p99]) {
      assert.ok(Math.abs(partLoadShapeFactor(plr) - 1) < 0.02, `factor moved at ${plr}% load`);
    }
  });

  test('it makes low part-load expensive, which is what a chiller does', () => {
    // The defect it fixes: the affine curve has a NEGATIVE intercept, so summed
    // over n machines it says more chillers is always cheaper, without limit.
    assert.ok(partLoadShapeFactor(50) > 1.05);
    assert.ok(partLoadShapeFactor(30) > 1.25);
    assert.ok(partLoadShapeFactor(20) > partLoadShapeFactor(30));
  });

  test('the affine curve really does go non-physical, which is why this exists', () => {
    // Guard on the premise, not just the fix. If the engine curve is ever
    // refitted with a positive intercept, this test should fail and the shape
    // correction should be reconsidered.
    assert.ok(CH_KW_INTERCEPT < 0, 'the affine intercept is what makes staging look free');
    const perMachine = (plr) => CH_KW_INTERCEPT + CH_KW_SLOPE_PER_PCT * plr;
    const load = 3094;
    const three = 3 * perMachine((load / 3 / CHILLER_CAPACITY_RT) * 100);
    const five = 5 * perMachine((load / 5 / CHILLER_CAPACITY_RT) * 100);
    assert.ok(five < three, 'sanity: uncorrected, five machines are cheaper than three');
  });

  test('Gordon-Ng gives the U-shaped efficiency curve the affine one cannot', () => {
    const eff = (plr) =>
      gordonNgChillerKw((CHILLER_CAPACITY_RT * plr) / 100, GORDON_NG_FIT.tChsMedianC, GORDON_NG_FIT.tCdsMedianC) /
      ((CHILLER_CAPACITY_RT * plr) / 100);
    const curve = [20, 40, 60, 80, 100].map(eff);
    // Falls to a minimum, then rises again.
    assert.ok(curve[0] > curve[1] && curve[1] > curve[2]);
    assert.ok(curve[4] > curve[3], 'efficiency must degrade again at full load');
    // And it never goes below a physically possible kW/RT.
    assert.ok(Math.min(...curve) > 0.35, `best kW/RT ${Math.min(...curve)} is not a real chiller`);
  });

  test('Gordon-Ng has a positive no-load loss, unlike the affine curve', () => {
    const tiny = gordonNgChillerKw(1, GORDON_NG_FIT.tChsMedianC, GORDON_NG_FIT.tCdsMedianC);
    assert.ok(tiny > 50, `an idling machine draws ${tiny} kW — it should have real fixed losses`);
  });

  test('it responds to lift, since that is what a chiller model is for', () => {
    const cold = gordonNgChillerKw(1000, 7.5, 26);
    const warm = gordonNgChillerKw(1000, 7.5, 32);
    assert.ok(warm > cold, 'warmer condenser water must cost power');
    const lowChws = gordonNgChillerKw(1000, 6, 29);
    const highChws = gordonNgChillerKw(1000, 9, 29);
    assert.ok(lowChws > highChws, 'a colder evaporator must cost power');
  });

  test('the held-out score is recorded and beats the curve it corrects', () => {
    assert.ok(GORDON_NG_FIT.heldOut.n > 10000);
    assert.ok(GORDON_NG_FIT.heldOut.maeKw < GORDON_NG_FIT.affineHeldOut.maeKw / 2,
      'the shape correction has to be justified by beating what it corrects');
    assert.ok(GORDON_NG_FIT.heldOut.r2 > 0.85);
    assert.ok(GORDON_NG_FIT.testDays[0] > GORDON_NG_FIT.trainDays[1],
      'the test days must come after the training days — no shuffling');
  });

  test('extrapolation outside the observed load band is admitted', () => {
    assert.equal(plrIsExtrapolated(80), false);
    assert.equal(plrIsExtrapolated(30), true, 'the machines were never observed at 30% load');
    assert.equal(plrIsExtrapolated(99), true);
  });

  test('the correction is bounded, so a pathological candidate cannot dominate', () => {
    for (const plr of [0, 0.5, 2, 4.4, 5, 200, NaN]) {
      const f = partLoadShapeFactor(plr);
      assert.ok(Number.isFinite(f) && f > 0 && f <= 3, `factor ${f} at ${plr}% load`);
    }
  });
});
