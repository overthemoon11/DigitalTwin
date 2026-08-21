/**
 * The real-BMS data path: artifact contract, unit sanity, the cooling-load
 * identity, timestamps, holes, and the time-series splitting rules.
 *
 * These tests read the SHIPPED artifact rather than a fixture. That is
 * deliberate — the thing worth protecting is that the artifact the backend
 * actually loads says what the code believes it says. A fixture would pass
 * happily while the real file drifted.
 *
 * Regenerate the artifact with:
 *   python data/scripts/export_bms_records.py --refresh
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DATASET_ID,
  EXPECTED_ARTIFACT_VERSION,
  bmsAvailable,
  bmsDay,
  bmsDays,
  clearBmsCache,
  loadBmsHistory,
  loadBmsSummary,
} from '../src/data/bmsLoader.ts';
import {
  bounds,
  chronologicalSplit,
  daysOf,
  disturbanceProfile,
  expandingWindowFolds,
  fitMetrics,
  groupByDay,
  recordStats,
} from '../src/data/preprocessing.ts';
import { isFittable, stagingOf } from '../../shared/types/bms.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, '..', '..', 'data', 'processed', `${DATASET_ID}_15min.json`);
const skip = existsSync(ARTIFACT)
  ? false
  : 'BMS artifact absent — run python data/scripts/export_bms_records.py --refresh';

/** Water: 4.186 kJ/(L*K) over 3.517 kW/RT. */
const RT_PER_LS_PER_K = 4.186 / 3.517;

describe('BMS artifact contract', () => {
  test('loads, and refuses anything that is not the expected version', { skip }, () => {
    clearBmsCache();
    const records = loadBmsHistory({ stepMinutes: 15 });
    assert.ok(records.length > 2000, `expected a full month, got ${records.length}`);

    const raw = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
    assert.equal(raw.artifactVersion, EXPECTED_ARTIFACT_VERSION);
    assert.equal(raw.datasetId, DATASET_ID);
    assert.equal(raw.stepMinutes, 15);
  });

  test('every record carries the full positional fleet arrays', { skip }, () => {
    // Positional arrays are the whole reason index 0 can mean unit 1 anywhere
    // in the codebase. A short array would silently re-number the fleet.
    for (const r of loadBmsHistory()) {
      assert.equal(r.chillerStatus.length, 5, `${r.t} chiller status`);
      assert.equal(r.chillerKw.length, 5, `${r.t} chiller kW`);
      assert.equal(r.chwpStatus.length, 6, `${r.t} CHWP status`);
      assert.equal(r.cwpStatus.length, 6, `${r.t} CWP status`);
      assert.equal(r.ctStatus.length, 5, `${r.t} CT status`);
    }
  });

  test('a missing channel is null, never zero and never invented', { skip }, () => {
    // The contract that makes `not available` reportable. A 0 would read as a
    // measurement of nothing rather than as an absent measurement.
    for (const r of loadBmsHistory()) {
      for (const key of ['loadRt', 'wetBulbC', 'chwsC', 'chwrC', 'totalPlantKw']) {
        const v = r[key];
        assert.ok(v === null || Number.isFinite(v), `${r.t} ${key} is ${v}`);
      }
    }
  });

  test('units are the ones the field names claim', { skip }, () => {
    // Magnitude checks, because this workbook's own header units are wrong on
    // several columns — see data/scripts/bms_columns.py.
    const fit = loadBmsHistory({ fittableOnly: true });
    const b = (pick) => bounds(fit.map(pick));

    const chws = b((r) => r.chwsC);
    assert.ok(chws.min > 4 && chws.max < 12, `CHWS band ${chws.min}-${chws.max} is not degC`);
    const chwr = b((r) => r.chwrC);
    assert.ok(chwr.min > 8 && chwr.max < 20, `CHWR band ${chwr.min}-${chwr.max} is not degC`);
    const wb = b((r) => r.wetBulbC);
    assert.ok(wb.min > 15 && wb.max < 32, `wet bulb ${wb.min}-${wb.max} is not degC`);
    const flow = b((r) => r.riserFlowLs);
    assert.ok(flow.p50 > 200 && flow.p50 < 700, `riser flow median ${flow.p50} is not L/s`);
    const kw = b((r) => r.totalPlantKw);
    assert.ok(kw.p50 > 500 && kw.p50 < 5000, `plant power median ${kw.p50} is not kW`);
    const eff = b((r) => r.plantKwPerRt);
    assert.ok(eff.p50 > 0.3 && eff.p50 < 1.2, `efficiency median ${eff.p50} is not kW/RT`);
  });

  test('the condenser-tagged header flow really is condenser water', { skip }, () => {
    // The single most expensive misreading available in this dataset: using
    // `Header-hcwf` as chilled-water flow overstates cooling by ~85%.
    const fit = loadBmsHistory({ fittableOnly: true }).filter(
      (r) => r.cwHeaderFlowLs != null && r.cwFlowLs != null && r.riserFlowLs != null
    );
    assert.ok(fit.length > 1000);
    const meanAbs = (pick) => fit.reduce((s, r) => s + pick(r), 0) / fit.length;
    const vsCondenser = meanAbs((r) => Math.abs(r.cwHeaderFlowLs - r.cwFlowLs));
    const vsChilled = meanAbs((r) => Math.abs(r.cwHeaderFlowLs - r.riserFlowLs));
    assert.ok(
      vsCondenser < vsChilled / 10,
      `Header-hcwf is ${vsCondenser.toFixed(1)} L/s from the condenser total and ` +
        `${vsChilled.toFixed(1)} from the chilled-water total — it should track the condenser`
    );
  });
});

describe('cooling load reconstruction', () => {
  test('RT = 1.19 x flow x deltaT reproduces the recorded load', { skip }, () => {
    // The identity every derived load in this project rests on. Scored against
    // the workbook's own RT column over the whole month.
    const recs = loadBmsHistory({ fittableOnly: true }).filter(
      (r) => r.riserFlowLs != null && r.chwDeltaT != null
    );
    const predicted = recs.map((r) => RT_PER_LS_PER_K * r.riserFlowLs * r.chwDeltaT);
    const m = fitMetrics(recs.map((r) => r.loadRt), predicted);

    assert.ok(m.n > 2000, `expected the month, scored ${m.n}`);
    assert.ok(m.mapePct < 0.5, `RT identity MAPE ${m.mapePct}% — the reconstruction has drifted`);
    assert.ok(m.r2 > 0.998, `RT identity R2 ${m.r2}`);
  });

  test('the summary reports the identity against the MEASURED rows, not just all rows', { skip }, () => {
    // Agreement over all rows mostly proves we recovered the workbook's own
    // constant. Only the 133 directly measured rows test the physics.
    const v = loadBmsSummary().rtValidation;
    assert.equal(v.vsMeasuredRows.workbookFactor.n, 133);
    assert.ok(v.vsMeasuredRows.workbookFactor.mapePct < 0.2);
    assert.ok(
      v.vsMeasuredRows.workbookFactor.mapePct < v.vsMeasuredRows.physicsFactor.mapePct,
      'the refitted workbook factor should beat the textbook one on the measured rows'
    );
  });

  test('measured and calculated load are both kept, neither overwrites the other', { skip }, () => {
    const v = loadBmsSummary().rtValidation;
    assert.ok(v.factorWorkbook > 1.18 && v.factorWorkbook < 1.19);
    assert.ok(Math.abs(v.factorPhysics - RT_PER_LS_PER_K) < 1e-6);
    assert.ok(Math.abs(v.factorRefitFromMeasuredRows - v.factorWorkbook) < 1e-5,
      'the refit should recover the workbook constant, which is how we know it IS the constant');
  });

  test('plant kW is the sum of its four blocks', { skip }, () => {
    for (const r of loadBmsHistory({ dropFlagged: true })) {
      if (r.totalPlantKw == null) continue;
      const parts = (r.totalChillerKw ?? 0) + (r.chwpKw ?? 0) + (r.cwpKw ?? 0) + (r.towerKw ?? 0);
      assert.ok(Math.abs(parts - r.totalPlantKw) < 0.01, `${r.t}: ${parts} vs ${r.totalPlantKw}`);
    }
  });
});

describe('timestamps and holes', () => {
  test('every bucket is on the 15-minute grid, in order, with no duplicates', { skip }, () => {
    const records = loadBmsHistory();
    const seen = new Set();
    let previous = '';
    for (const r of records) {
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.t), `bad stamp ${r.t}`);
      assert.ok(r.t > previous, `out of order at ${r.t}`);
      assert.ok(!seen.has(r.t), `duplicate bucket ${r.t}`);
      assert.equal(Number(r.t.slice(14, 16)) % 15, 0, `off-grid bucket ${r.t}`);
      seen.add(r.t);
      previous = r.t;
    }
  });

  test('the raw duplicate and the raw gap are reported, not hidden', { skip }, () => {
    // The workbook has exactly one duplicated minute and one two-minute gap.
    // Both are counted in the summary; neither is patched.
    const tb = loadBmsSummary().timebase;
    assert.equal(tb.unparsedTimestamps, 0);
    assert.equal(tb.duplicateTimestamps, 1);
    assert.equal(tb.intervalSecondsMode, 60);
    assert.ok(tb.missingRowsVsExpected <= 1, `${tb.missingRowsVsExpected} missing rows`);
  });

  test('a short bucket says how many minutes it actually holds', { skip }, () => {
    // Exactly two buckets are not 15 minutes wide, and they are the two the
    // timebase report already names: one is 14 because a raw minute is missing,
    // the other 16 because a minute is duplicated. Reporting 15 for either
    // would claim coverage the average does not have.
    const odd = loadBmsHistory().filter((r) => r.minutes !== 15);
    assert.equal(odd.length, 2, 'expected exactly two irregular buckets in this month');
    assert.deepEqual(odd.map((r) => r.minutes).sort(), [14, 16]);

    const tb = loadBmsSummary().timebase;
    assert.equal(tb.duplicateTimestamps, 1, 'the 16-minute bucket is the duplicated minute');
    assert.equal(tb.missingRowsVsExpected, 1, 'the 14-minute bucket is the missing one');
  });

  test('known anomalies are flagged on the buckets they touch', { skip }, () => {
    const flagged = loadBmsHistory().filter((r) => r.qualityFlags.length > 0);
    assert.ok(flagged.length > 0, 'the CT-4 outage day must be flagged');
    const codes = new Set(flagged.flatMap((r) => r.qualityFlags));
    assert.ok(codes.has('CT4_POWER_GAP'));
    // A whole day of missing tower power: 96 buckets.
    const ct4 = flagged.filter((r) => r.qualityFlags.includes('CT4_POWER_GAP'));
    assert.equal(ct4.length, 96);
    assert.ok(ct4.every((r) => r.t.startsWith('2025-12-31')));
  });

  test('dropFlagged and fittableOnly actually remove those buckets', { skip }, () => {
    const all = loadBmsHistory();
    const clean = loadBmsHistory({ dropFlagged: true });
    const fit = loadBmsHistory({ fittableOnly: true });
    assert.ok(clean.length < all.length);
    assert.ok(clean.every((r) => r.qualityFlags.length === 0));
    assert.ok(fit.every(isFittable));
    assert.ok(fit.length <= clean.length, 'fittable is a stricter bar than unflagged');
  });

  test('day filters are inclusive on both ends', { skip }, () => {
    const days = bmsDays();
    const slice = loadBmsHistory({ fromDay: days[1], toDay: days[2] });
    assert.equal(new Set(slice.map((r) => r.t.slice(0, 10))).size, 2);
    assert.equal(bmsDay(days[0]).length, 96);
  });

  test('the loader is available and self-describing', { skip }, () => {
    assert.equal(bmsAvailable(), true);
    const s = loadBmsSummary();
    assert.equal(s.recordCount, loadBmsHistory().length);
    assert.deepEqual(s.days, bmsDays());
    // The missing-signal list is what lets the UI say "not available" honestly.
    for (const key of ['chw_dp_kpa', 'chwp_speed_pct', 'ct_fan_speed_pct', 'chwst_sp_c']) {
      assert.ok(s.missingSignals[key], `${key} must be declared missing`);
    }
  });
});

describe('staging inference', () => {
  test('a running machine draws power and a stopped one does not', { skip }, () => {
    // Status is inferred from kW — this site trends no run flags — so the
    // inference has to be checked against the power it was inferred from.
    //
    // The bar is deliberately two-tier. A bucket that straddles a start or a
    // stop legitimately averages to something in between: the majority vote
    // says stopped while the mean kW is halfway up. Those buckets must not fail
    // the test, but they must also be RARE, or the vote is mis-set.
    let clean = 0;
    let total = 0;
    for (const r of loadBmsHistory({ dropFlagged: true })) {
      r.chillerStatus.forEach((on, i) => {
        const kw = r.chillerKw[i];
        if (kw == null) return;
        total += 1;
        // Nothing may be wildly on the wrong side.
        if (on) assert.ok(kw > 20, `${r.t} CH-${i + 1} marked running at ${kw} kW`);
        else assert.ok(kw < 400, `${r.t} CH-${i + 1} marked stopped at ${kw} kW`);
        if (on ? kw > 50 : kw < 5) clean += 1;
      });
    }
    assert.ok(
      clean / total > 0.99,
      `only ${((clean / total) * 100).toFixed(2)}% of unit-buckets separate cleanly — ` +
        'the run threshold or the majority vote is mis-set'
    );
  });

  test('T1 ran three chillers for essentially the whole month', { skip }, () => {
    const counts = loadBmsHistory({ dropFlagged: true }).map((r) => stagingOf(r).chillers);
    const three = counts.filter((c) => c === 3).length;
    assert.ok(three / counts.length > 0.95, `only ${((three / counts.length) * 100).toFixed(1)}% ran three`);
  });

  test('pumps track chillers one for one', { skip }, () => {
    // The assumption the MPC pins its auxiliary staging on. If it stops being
    // true, `stagingFor` in the plant simulator is wrong.
    const recs = loadBmsHistory({ dropFlagged: true });
    const matched = recs.filter((r) => {
      const s = stagingOf(r);
      return s.chwp === s.chillers && s.cwp === s.chillers;
    });
    assert.ok(
      matched.length / recs.length > 0.95,
      `pumps matched chillers in only ${((matched.length / recs.length) * 100).toFixed(1)}% of buckets`
    );
  });
});

describe('preprocessing: splitting a time series without leaking', () => {
  const fake = (t, loadRt = 1000) => ({
    t,
    minutes: 15,
    loadRt,
    wetBulbC: 25,
    chwsC: 7.5,
    chwrC: 14,
    chwDeltaT: 6.5,
    chwFlowLs: 300,
    riserFlowLs: 300,
    cwsC: 28,
    cwrC: 32,
    cwFlowLs: 600,
    cwHeaderFlowLs: 600,
    chillerStatus: [0, 0, 1, 1, 1],
    chwpStatus: [0, 0, 1, 1, 1, 0],
    cwpStatus: [0, 0, 1, 1, 1, 0],
    ctStatus: [1, 1, 1, 1, 0],
    chillerKw: [1, 1, 500, 500, 500],
    totalChillerKw: 1500,
    chwpKw: 60,
    cwpKw: 160,
    towerKw: 60,
    totalPlantKw: 1780,
    plantKwPerRt: 0.6,
    qualityFlags: [],
  });

  const series = [];
  for (let d = 1; d <= 8; d++) {
    for (let h = 0; h < 4; h++) {
      series.push(fake(`2025-12-0${d}T0${h}:00:00`, 1000 + d * 10 + h));
    }
  }

  test('the split cuts on a whole-day boundary, so no day is in both halves', () => {
    const s = chronologicalSplit(series, 0.25);
    assert.ok(s.train.length > 0 && s.test.length > 0);
    const overlap = s.trainDays.filter((d) => s.testDays.includes(d));
    assert.deepEqual(overlap, [], 'a day appearing in both halves is leakage');
    assert.ok(s.trainDays.every((d) => d < s.testDays[0]), 'training data must precede the test set');
    assert.equal(s.boundary, s.test[0].t);
  });

  test('the test set is the LAST slice, never a random one', () => {
    const s = chronologicalSplit(series, 0.25);
    const lastTrain = s.train[s.train.length - 1].t;
    assert.ok(s.test.every((r) => r.t > lastTrain));
  });

  test('row-level splitting is available but still chronological', () => {
    const s = chronologicalSplit(series, 0.25, { byDay: false });
    assert.equal(s.train.length + s.test.length, series.length);
    assert.ok(s.test.every((r) => r.t > s.train[s.train.length - 1].t));
  });

  test('expanding-window folds only ever train on the past', () => {
    const folds = expandingWindowFolds(series, 4);
    assert.ok(folds.length >= 1);
    for (const f of folds) {
      const lastTrain = f.train[f.train.length - 1].t;
      assert.ok(f.validate.every((r) => r.t > lastTrain), 'a fold validated on data it trained on');
    }
    // Each fold trains on strictly more than the last.
    for (let i = 1; i < folds.length; i++) {
      assert.ok(folds[i].train.length > folds[i - 1].train.length);
    }
  });

  test('grouping and day listing are stable and sorted', () => {
    assert.deepEqual(daysOf(series), [...new Set(series.map((r) => r.t.slice(0, 10)))].sort());
    const g = groupByDay(series);
    assert.equal(g.size, 8);
    for (const rows of g.values()) {
      assert.ok(rows.every((r, i) => i === 0 || r.t > rows[i - 1].t));
    }
  });
});

describe('preprocessing: disturbance profiles and metrics', () => {
  const hole = (t, loadRt, wetBulbC) => ({
    t, minutes: 15, loadRt, wetBulbC,
    chwsC: 7.5, chwrC: 14, chwDeltaT: 6.5, chwFlowLs: 300, riserFlowLs: 300,
    cwsC: 28, cwrC: 32, cwFlowLs: 600, cwHeaderFlowLs: 600,
    chillerStatus: [0, 0, 1, 1, 1], chwpStatus: [0, 0, 1, 1, 1, 0],
    cwpStatus: [0, 0, 1, 1, 1, 0], ctStatus: [1, 1, 1, 1, 0],
    chillerKw: [1, 1, 500, 500, 500], totalChillerKw: 1500,
    chwpKw: 60, cwpKw: 160, towerKw: 60, totalPlantKw: 1780,
    plantKwPerRt: 0.6, qualityFlags: [],
  });

  test('a hole is carried forward AND counted', () => {
    const p = disturbanceProfile([
      hole('2025-12-01T00:00:00', 1000, 25),
      hole('2025-12-01T00:15:00', null, null),
      hole('2025-12-01T00:30:00', 1200, 26),
    ]);
    assert.deepEqual(p.loadRt, [1000, 1000, 1200]);
    assert.deepEqual(p.wetBulbC, [25, 25, 26]);
    assert.equal(p.gapSteps, 1, 'the substitution must be counted, not silently made');
  });

  test('a leading hole is filled backwards, so the loop always has a number', () => {
    const p = disturbanceProfile([
      hole('2025-12-01T00:00:00', null, null),
      hole('2025-12-01T00:15:00', 900, 24),
    ]);
    assert.deepEqual(p.loadRt, [900, 900]);
    assert.equal(p.gapSteps, 1);
  });

  test('quality flags travel with the profile', () => {
    const r = hole('2025-12-01T00:00:00', 1000, 25);
    r.qualityFlags = ['CT4_POWER_GAP'];
    assert.deepEqual(disturbanceProfile([r]).qualityFlags, ['CT4_POWER_GAP']);
  });

  test('fitMetrics is exact on a known case and drops non-finite pairs', () => {
    const m = fitMetrics([1, 2, 3, 4], [2, 3, 4, 5]);
    assert.equal(m.n, 4);
    assert.equal(m.mae, 1);
    assert.equal(m.bias, 1);
    assert.equal(m.rmse, 1);

    const withHole = fitMetrics([1, NaN, 3], [2, 5, 4]);
    assert.equal(withHole.n, 2, 'a non-finite pair must be dropped, not treated as zero');
  });

  test('MAPE is withheld where it would be meaningless', () => {
    assert.equal(fitMetrics([0, 1, 2], [0, 1, 2]).mapePct, null, 'MAPE across zero is not a number');
    assert.ok(fitMetrics([10, 20], [11, 22]).mapePct > 0);
  });

  test('recordStats summarises the real month', { skip }, () => {
    const s = recordStats(loadBmsHistory());
    assert.equal(s.n, loadBmsHistory().length);
    assert.equal(s.days, bmsDays().length);
    assert.ok(s.nFittable > 2000 && s.nFittable <= s.n);
    assert.ok(s.nFlagged >= 96, 'the CT-4 day alone is 96 buckets');
    assert.ok(s.meanStaging.chillers > 2.9 && s.meanStaging.chillers < 3.2);
  });
});
