/**
 * Cooling-tower approach fit, validated against the measured December trend.
 *
 * This is the model that decides condenser water temperature, and condenser
 * temperature is expensive: about 2 K of approach error moved plant power by
 * roughly 5% and pushed every horizon step outside the twin's calibration
 * envelope. So the fit is scored here against the real data rather than
 * trusted, and the test reads the artifact directly instead of re-stating the
 * numbers the fit was built from.
 *
 * Regenerate the coefficients with:
 *   python calibration/scripts/fitTowerApproach.py
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOWER_APPROACH_FIT,
  OBSERVED_APPROACH_C,
  VALID_WET_BULB_C,
  fittedApproachC,
  approachIsExtrapolated,
} from '../src/digital-twin/chiller/calibration/towerApproachFit.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, '..', '..', 'data', 'processed', 't1_2025_12_15min.json');

const skip = existsSync(ARTIFACT)
  ? false
  : 'BMS artifact absent — run python data/scripts/export_bms_records.py --refresh';

function records() {
  const raw = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
  return raw.records.filter(
    (r) =>
      r.qualityFlags.length === 0 &&
      r.cwsC != null &&
      r.wetBulbC != null &&
      r.loadRt != null
  );
}

describe('tower approach fit', () => {
  test('reproduces the measured approach to better than 0.25 K', { skip }, () => {
    const recs = records();
    assert.ok(recs.length > 2000, `expected the full month, got ${recs.length}`);

    let sumAbs = 0;
    let sumSigned = 0;
    let worst = 0;
    for (const r of recs) {
      const measured = r.cwsC - r.wetBulbC;
      const err = fittedApproachC(r.wetBulbC, r.loadRt) - measured;
      sumAbs += Math.abs(err);
      sumSigned += err;
      worst = Math.max(worst, Math.abs(err));
    }
    const mae = sumAbs / recs.length;
    const bias = sumSigned / recs.length;

    assert.ok(mae < 0.25, `approach MAE ${mae.toFixed(3)} K is worse than the fit claimed`);
    assert.ok(Math.abs(bias) < 0.1, `approach bias ${bias.toFixed(3)} K — the fit has drifted`);
    assert.ok(worst < 1.5, `worst-case approach error ${worst.toFixed(2)} K`);
  });

  test('beats the fan-law inversion it replaced, by a wide margin', { skip }, () => {
    // At the 2025-12-14 conditions the old inversion returned ~2.7 K. That is
    // the number this fit had to beat; anything close to it is a regression.
    const recs = records();
    let fitErr = 0;
    let oldErr = 0;
    for (const r of recs) {
      const measured = r.cwsC - r.wetBulbC;
      fitErr += Math.abs(fittedApproachC(r.wetBulbC, r.loadRt) - measured);
      oldErr += Math.abs(2.7 - measured);
    }
    fitErr /= recs.length;
    oldErr /= recs.length;
    assert.ok(
      fitErr < oldErr / 3,
      `fit MAE ${fitErr.toFixed(3)} K vs old ${oldErr.toFixed(3)} K — expected a 3x improvement`
    );
  });

  test('signs are physical: warmer wet bulb narrows, heavier load widens', () => {
    assert.ok(TOWER_APPROACH_FIT.perWetBulbK < 0, 'approach must narrow as wet bulb rises');
    assert.ok(TOWER_APPROACH_FIT.perKiloRt > 0, 'approach must widen as load rises');

    // The load term is what lets the MPC see the condenser cost of staging.
    // If it ever reaches zero the tower goes inert and staging looks free.
    const light = fittedApproachC(25, 2000);
    const heavy = fittedApproachC(25, 3400);
    assert.ok(heavy > light, 'the tower must respond to load, or staging is free');
  });

  test('never returns an approach the plant was never observed to hold', () => {
    for (const wb of [15, 20, 23.17, 25, 27.18, 30, 35]) {
      for (const load of [500, 2000, 3094, 5000]) {
        const a = fittedApproachC(wb, load);
        assert.ok(
          a >= OBSERVED_APPROACH_C.min && a <= OBSERVED_APPROACH_C.max,
          `approach ${a} K at wb=${wb}, load=${load} escapes the observed range`
        );
        assert.ok(Number.isFinite(a));
      }
    }
  });

  test('extrapolation outside the fitted wet-bulb band is admitted, not hidden', () => {
    assert.equal(approachIsExtrapolated(25), false);
    assert.equal(approachIsExtrapolated(VALID_WET_BULB_C.min), false);
    assert.equal(approachIsExtrapolated(VALID_WET_BULB_C.max), false);
    // The twin's own design envelope reaches wet bulbs December never showed.
    assert.equal(approachIsExtrapolated(30), true, 'wb 30 is 3 K past the data');
    assert.equal(approachIsExtrapolated(22), true);

    // Past the band the raw line is nonsense and only the clamp saves it —
    // which is exactly why callers have to be told.
    const raw =
      TOWER_APPROACH_FIT.intercept +
      TOWER_APPROACH_FIT.perWetBulbK * 30 +
      TOWER_APPROACH_FIT.perKiloRt * 3.094;
    assert.ok(raw < 0, 'sanity: the unclamped model really does go negative at wb 30');
    assert.ok(fittedApproachC(30, 3094) > 0, 'but the clamp keeps it physical');
  });

  test('the held-out score is recorded, so accuracy claims are checkable', () => {
    const h = TOWER_APPROACH_FIT.heldOut;
    assert.ok(h.n > 400, 'held-out fold should be about a week of 15-min buckets');
    assert.ok(h.maeK < 0.2 && h.r2 > 0.8, 'recorded held-out quality looks wrong');
  });
});
