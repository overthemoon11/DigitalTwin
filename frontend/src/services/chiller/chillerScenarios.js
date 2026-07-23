/**
 * Preset operator scenarios for the T1 Chiller Plant — one-click what-if demos.
 * Loads are on the real T1 scale (5 × ~1250 RT chillers, ~3,200 RT design day).
 * Control IDs match controlEngine defaultControls().
 */

import { ROW86_SCENARIO_ID, ROW86_CONTROLS, ROW86_DUTY } from './t1Row86';

/** @typedef {{
 *   id: string;
 *   label: string;
 *   description: string;
 *   reset?: boolean;
 *   controls?: Record<string, number>;
 *   precise?: boolean;
 *   duty?: Record<string, number[]>;
 *   advanceSec?: number;
 * }} ChillerScenario */

/** @type {ChillerScenario[]} */
export const CHILLER_SCENARIOS = [
  {
    id: ROW86_SCENARIO_ID,
    label: 'Dataset row 86 (Dec-1 01:24)',
    description:
      'Replays the measured operator inputs of dataset row 86 — 3212.15 RT, CHWS 7.5°C, CW ΔT 4.43°C, measured riser shares — and lets the physics compute everything else. Open the BMS Points tab to compare every simulated point against the real readings (1936.09 kW · 0.6027 kW/RT).',
    controls: ROW86_CONTROLS,
    duty: ROW86_DUTY,
    precise: true,
    advanceSec: 0,
  },
  {
    id: 'baseline',
    label: 'Design baseline',
    description: 'Reference T1 day — 3,200 RT, 31°C OAT, 75% RH, CHWS 7.5°C, 3 of 5 chillers.',
    reset: true,
    advanceSec: 0,
  },
  {
    id: 'peak-summer',
    label: 'Peak summer afternoon',
    description: 'Near-capacity load on a hot humid afternoon — all chillers staged, tower and condenser stress.',
    controls: {
      'ctrl-building-load': 5500,
      'ctrl-ambient-temp': 38,
      'ctrl-humidity': 85,
      'ctrl-chws-sp': 7,
      'ctrl-dp-sp': 18,
    },
    advanceSec: 90,
  },
  {
    id: 'night-low-load',
    label: 'Night low load',
    description: 'Cool night, minimal cooling — single chiller, low pump speed.',
    controls: {
      'ctrl-building-load': 1200,
      'ctrl-ambient-temp': 26,
      'ctrl-humidity': 60,
      'ctrl-dp-sp': 12,
    },
    advanceSec: 60,
  },
  {
    id: 'aggressive-chws',
    label: 'Aggressive CHWS reset',
    description: '5.5°C supply setpoint — higher chiller kW and COP trade-off for tighter cold water.',
    controls: {
      'ctrl-building-load': 3200,
      'ctrl-chws-sp': 5.5,
      'ctrl-chwr-sp': 14,
    },
    advanceSec: 60,
  },
  {
    id: 'high-header-dp',
    label: 'High header DP',
    description: '28 psi DP setpoint — faster CHWPs, bypass may open, higher auxiliary kW/RT.',
    controls: {
      'ctrl-building-load': 3200,
      'ctrl-dp-sp': 28,
    },
    advanceSec: 60,
  },
  {
    id: 'humid-monsoon',
    label: 'Humid monsoon day',
    description: 'High latent load from 92% RH — weather factor boosts effective plant load.',
    controls: {
      'ctrl-building-load': 2800,
      'ctrl-ambient-temp': 33,
      'ctrl-humidity': 92,
    },
    advanceSec: 60,
  },
  {
    id: 'condenser-stress',
    label: 'Condenser loop stress',
    description: 'Hot day with warm CWS target — tower fans work harder, approach KPI widens.',
    controls: {
      'ctrl-building-load': 3600,
      'ctrl-ambient-temp': 39,
      'ctrl-humidity': 75,
      'ctrl-cws-sp': 32,
      'ctrl-cwr-sp': 36,
    },
    advanceSec: 90,
  },
  {
    id: 'part-load-tune',
    label: 'Part-load shoulder season',
    description: '~2,200 RT — two chillers, moderate pumps, good COP opportunity.',
    controls: {
      'ctrl-building-load': 2200,
      'ctrl-ambient-temp': 30,
      'ctrl-chws-sp': 7.5,
    },
    advanceSec: 60,
  },
];

export function getChillerScenarioById(id) {
  return CHILLER_SCENARIOS.find((s) => s.id === id) ?? null;
}
