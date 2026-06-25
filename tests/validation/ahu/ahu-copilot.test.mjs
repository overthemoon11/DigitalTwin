/**
 * Unit tests for AHU01 chatbot intent parsing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAhuCopilotIntents } from '../../../frontend/src/services/ahuCopilotActions.js';
import { getAhuControls, resetAhu, applyAhuScenarioPayload } from '../../../frontend/src/services/ahuEngine.ts';

const BASE_CONTROLS = () => {
  resetAhu();
  return getAhuControls();
};

test('parses preset scenario id from JSON', () => {
  const result = parseAhuCopilotIntents(
    '{"id":"high-humidity","controls":{"ahu-zone-load":1.35},"advanceSec":90}',
    BASE_CONTROLS(),
  );
  assert.equal(result.scenarioId, 'high-humidity');
  assert.equal(result.applied.length, 0);
});

test('parses custom scenario payload from JSON without known id', () => {
  const result = parseAhuCopilotIntents(
    '{"label":"Sticky humidity","controls":{"ahu-zone-load":1.35,"ahu-mode":0},"advanceSec":90}',
    BASE_CONTROLS(),
  );
  assert.ok(result.scenarioPayload);
  assert.equal(result.scenarioPayload.controls['ahu-zone-load'], 1.35);
  assert.equal(result.scenarioPayload.advanceSec, 90);
});

test('matches scenario by natural language', () => {
  const result = parseAhuCopilotIntents('run high humidity scenario', BASE_CONTROLS());
  assert.equal(result.scenarioId, 'high-humidity');
});

test('parses zone load control change', () => {
  const controls = BASE_CONTROLS();
  const result = parseAhuCopilotIntents('set zone load to 1.35', controls);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].controlId, 'ahu-zone-load');
  assert.equal(result.applied[0].newValue, 1.35);
});

test('parses control by id', () => {
  const result = parseAhuCopilotIntents('adjust ahu-filter-load to 75', BASE_CONTROLS());
  assert.equal(result.applied[0].controlId, 'ahu-filter-load');
  assert.equal(result.applied[0].newValue, 75);
});

test('apply scenario payload via engine updates zone load', () => {
  resetAhu();
  const state = applyAhuScenarioPayload({
    id: 'high-humidity',
    label: 'High room humidity',
    controls: { 'ahu-zone-load': 1.35, 'ahu-mode': 0 },
    advanceSec: 90,
  });
  const zone = state.controls.find((c) => c.id === 'ahu-zone-load');
  assert.equal(zone?.value, 1.35);
  assert.equal(state.simulation.scenarioId, 'high-humidity');
});
