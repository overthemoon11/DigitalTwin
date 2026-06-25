/**
 * Preset operator scenarios for ETS A-B03-01 — one-click what-if demos.
 * Control IDs match etsHeatExchangeEngine defaultControls().
 */

/** @typedef {{
 *   id: string;
 *   label: string;
 *   description: string;
 *   reset?: boolean;
 *   controls?: Record<string, number>;
 *   advanceSec?: number;
 * }} EtsScenario */

/** @type {EtsScenario[]} */
export const ETS_SCENARIOS = [
  {
    id: 'baseline',
    label: 'Design baseline',
    description: 'MBS reference day — 466 RT, both HX, 35.4°C OAT, occupied.',
    reset: true,
    advanceSec: 0,
  },
  {
    id: 'peak-summer',
    label: 'Peak summer afternoon',
    description: 'Near-capacity ASM load on a hot afternoon — approach, staging, and primary flow stress.',
    controls: {
      'ets-load': 950,
      'ets-occupied': 1,
      'ets-ambient': 38,
      'ets-hx-service': 2,
      'ets-chws-sp': 7.5,
      'ets-dp-sp': 120,
    },
    advanceSec: 90,
  },
  {
    id: 'night-setback',
    label: 'Night setback',
    description: 'Unoccupied low load — fewer pumps, min-flow bypass may open.',
    controls: {
      'ets-load': 220,
      'ets-occupied': 0,
      'ets-ambient': 28,
      'ets-hx-service': 2,
      'ets-dp-sp': 80,
    },
    advanceSec: 60,
  },
  {
    id: 'single-hx',
    label: 'Single HX in service',
    description: 'HX-A-B03-02 out — half capacity; approach widens at same building load.',
    controls: {
      'ets-load': 466,
      'ets-occupied': 1,
      'ets-hx-service': 1,
      'ets-ambient': 35.4,
    },
    advanceSec: 60,
  },
  {
    id: 'warm-dcs',
    label: 'Warm DCS supply',
    description: 'District plant returns warmer primary water — cold-end approach degrades.',
    controls: {
      'ets-load': 466,
      'ets-occupied': 1,
      'ets-dcs-temp': 7.5,
      'ets-hx-service': 2,
    },
    advanceSec: 60,
  },
  {
    id: 'high-header-dp',
    label: 'High header DP',
    description: 'Aggressive secondary DP setpoint — faster pumps, higher kW/RT.',
    controls: {
      'ets-load': 600,
      'ets-occupied': 1,
      'ets-dp-sp': 155,
      'ets-pump-min': 35,
      'ets-pump-max': 100,
    },
    advanceSec: 60,
  },
  {
    id: 'lt-bypass-tune',
    label: 'LT bypass tuning',
    description: 'Higher CHWRT bypass target — more return mixing and bypass valve stroke.',
    controls: {
      'ets-load': 400,
      'ets-occupied': 1,
      'ets-chwrt-sp': 16.5,
      'ets-chws-sp': 7.8,
    },
    advanceSec: 60,
  },
];

export function getEtsScenarioById(id) {
  return ETS_SCENARIOS.find((s) => s.id === id) ?? null;
}
