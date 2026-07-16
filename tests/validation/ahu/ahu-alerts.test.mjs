/**
 * Unit tests for AHU01 alert recommendations.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendForChwSaturated,
  recommendForFilterLoading,
  recommendForSaCfmLow,
} from '../../../frontend/src/services/ahu/ahuAlertRecommendations.js';
import { resetAhu, applyAhuScenario } from '../../../frontend/src/services/ahu/ahuEngine.ts';

test('CHW saturation recommendation includes control adjustments', () => {
  const rec = recommendForChwSaturated({
    chwEnter: 7,
    satSp: 13.5,
    zoneLoad: 1,
    chwValvePct: 100,
  });
  assert.ok(rec.adjustments.length >= 2, 'multiple adjustments');
  assert.ok(rec.adjustments.some((a) => a.controlId === 'ahu-chw-enter'));
  assert.ok(rec.text.includes('CHW Entering Temp'));
});

test('filter alert recommends reset filter loading after maintenance', () => {
  const rec = recommendForFilterLoading({ filterLoad: 75, saCfm: 2170, saCfmSp: 2555 });
  const filterAdj = rec.adjustments.find((a) => a.controlId === 'ahu-filter-load');
  assert.equal(filterAdj?.suggestedValue, 0);
  assert.ok(rec.text.includes('Replace SA/RA filters'));
});

test('low SA CFM recommends filter reset and setpoint trim', () => {
  const rec = recommendForSaCfmLow({ filterLoad: 75, saCfm: 2170, saCfmSp: 2555, spSp: 650 });
  assert.ok(rec.adjustments.some((a) => a.controlId === 'ahu-filter-load' && a.suggestedValue === 0));
});

test('baseline scenario emits CHW saturation alert with structured adjustments', () => {
  resetAhu();
  const state = applyAhuScenario('baseline');
  const chwAlert = state.alerts.find((a) => a.id === 'ahu-alert-chw-sat');
  assert.ok(chwAlert, 'CHW saturation alert present at baseline');
  assert.ok(chwAlert.recommendedAdjustments?.length, 'structured adjustments');
});

test('dirty filter scenario emits filter alert with reset recommendation', () => {
  resetAhu();
  const state = applyAhuScenario('dirty-filter');
  const filterAlert = state.alerts.find((a) => a.id === 'ahu-alert-filter');
  assert.ok(filterAlert, 'filter alert');
  assert.equal(
    filterAlert.recommendedAdjustments?.find((a) => a.controlId === 'ahu-filter-load')?.suggestedValue,
    0,
  );
});
