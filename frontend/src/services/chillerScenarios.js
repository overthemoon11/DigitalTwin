/**
 * Preset operator scenarios for L29 Chiller Plant — one-click what-if demos.
 * Control IDs match controlEngine defaultControls().
 */

/** @typedef {{
 *   id: string;
 *   label: string;
 *   description: string;
 *   reset?: boolean;
 *   controls?: Record<string, number>;
 *   advanceSec?: number;
 * }} ChillerScenario */

/** @type {ChillerScenario[]} */
export const CHILLER_SCENARIOS = [
  {
    id: 'baseline',
    label: 'Design baseline',
    description: 'Reference L29 day — 900 RT, 32°C OAT, 70% RH, CHWS 7°C.',
    reset: true,
    advanceSec: 0,
  },
  {
    id: 'peak-summer',
    label: 'Peak summer afternoon',
    description: 'Near-capacity load on a hot humid afternoon — all chillers staged, tower and condenser stress.',
    controls: {
      'ctrl-building-load': 1300,
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
      'ctrl-building-load': 350,
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
      'ctrl-building-load': 900,
      'ctrl-chws-sp': 5.5,
      'ctrl-chwr-sp': 12,
    },
    advanceSec: 60,
  },
  {
    id: 'high-header-dp',
    label: 'High header DP',
    description: '28 psi DP setpoint — faster CHWPs, bypass may open, higher auxiliary kW/RT.',
    controls: {
      'ctrl-building-load': 1000,
      'ctrl-dp-sp': 28,
    },
    advanceSec: 60,
  },
  {
    id: 'humid-monsoon',
    label: 'Humid monsoon day',
    description: 'High latent load from 92% RH — weather factor boosts effective plant load.',
    controls: {
      'ctrl-building-load': 800,
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
      'ctrl-building-load': 1100,
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
    description: '~650 RT — two chillers, moderate pumps, good COP opportunity.',
    controls: {
      'ctrl-building-load': 650,
      'ctrl-ambient-temp': 30,
      'ctrl-chws-sp': 7.5,
    },
    advanceSec: 60,
  },
];

export function getChillerScenarioById(id) {
  return CHILLER_SCENARIOS.find((s) => s.id === id) ?? null;
}
