/**
 * Unit tests for ETS chatbot intent parsing and local query handlers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEtsCopilotIntents,
  analyzeEtsQuery,
  buildEtsChatSuggestions,
} from '../../../frontend/src/services/ets/etsCopilotActions.js';
import {
  resetEts,
  getEtsControls,
  applyEtsScenario,
  applyEtsScenarioPayload,
} from '../../../frontend/src/services/ets/etsHeatExchangeEngine.ts';

const controls = () => {
  resetEts();
  return getEtsControls();
};

test('parses peak summer and night setback scenarios', () => {
  const c = controls();
  assert.equal(parseEtsCopilotIntents('run peak summer scenario', c).scenarioId, 'peak-summer');
  assert.equal(parseEtsCopilotIntents('run night setback scenario', c).scenarioId, 'night-setback');
});

test('parses set building load to 950 RT', () => {
  const c = controls();
  const result = parseEtsCopilotIntents('set building load to 950 RT', c);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].controlId, 'ets-load');
  assert.equal(result.applied[0].newValue, 950);
});

test('analyzeEtsQuery answers chatbot button prompts locally', () => {
  resetEts();
  const state = applyEtsScenario('peak-summer');
  assert.ok(analyzeEtsQuery('show active alarms', state)?.includes('Active Alerts'));
  assert.ok(analyzeEtsQuery('what is the HX approach?', state)?.includes('HX Approach'));
  assert.ok(analyzeEtsQuery('give me an ETS status summary', state)?.includes('ETS Status Summary'));
  assert.ok(analyzeEtsQuery('what should I optimize on ETS?', state)?.includes('ETS Optimization'));
});

test('analyzeEtsQuery skips scenario/command messages', () => {
  resetEts();
  const state = applyEtsScenario('baseline');
  assert.equal(analyzeEtsQuery('run peak summer scenario', state), null);
  assert.equal(analyzeEtsQuery('set building load to 950 RT', state), null);
});

test('buildEtsChatSuggestions reflects active alerts after peak summer', () => {
  resetEts();
  const state = applyEtsScenario('peak-summer');
  const suggestions = buildEtsChatSuggestions(state);
  assert.ok(suggestions.some((s) => s.id === 'review_alerts'));
  assert.ok(suggestions.some((s) => s.prompt === 'give me an ETS status summary'));
});

test('apply scenario payload via engine', () => {
  resetEts();
  const state = applyEtsScenarioPayload({
    id: 'peak-summer',
    label: 'Peak summer afternoon',
    controls: { 'ets-load': 950, 'ets-ambient': 38 },
    advanceSec: 90,
  });
  const load = state.controls.find((c) => c.id === 'ets-load');
  assert.equal(load?.value, 950);
  assert.equal(state.simulation.scenarioId, 'peak-summer');
});
