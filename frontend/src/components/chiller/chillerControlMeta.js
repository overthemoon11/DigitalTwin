/**
 * Operator-control metadata for L29 Chiller Plant — formulas and downstream effects.
 * Physics: frontend/src/services/controlEngine.ts, plantPhysics.ts, stagingController.ts
 * Full reference: docs/chiller-plant-controls-and-physics.md
 */

/** @typedef {{ formula: string; affects: string[]; description: string }} ChillerControlMeta */

/** @type {Record<string, ChillerControlMeta>} */
export const CHILLER_CONTROL_META = {
  'ctrl-building-load': {
    formula: 'Q_demand = RT × 3.517 [kW]; ṁ = Q / (1.163 × ΔT_design)',
    affects: ['buildingLoadRt', 'running chillers', 'CHW flow', 'CHWP staging', 'plant kW', 'plant kW/RT'],
    description: 'Base cooling demand before weather modifiers. Drives chiller count, required flow, and total plant power (chiller COP is set by CHWS/condenser, not load).',
  },
  'ctrl-ambient-temp': {
    formula: 'L_demand = L_base × f_temp(T_amb) × f_RH; f_temp = 1 + 0.03×(T−32°C) above ref',
    affects: ['buildingLoadRt', 'CWS target offset', 'condenser difficulty', 'tower fan demand'],
    description: 'Outdoor dry-bulb scales effective load and raises condenser-water temperature via weather offset.',
  },
  'ctrl-humidity': {
    formula: 'f_RH = 1 + 0.0015×(RH−65%) above ref; CWS offset += 0.04×max(0, RH−70)',
    affects: ['buildingLoadRt', 'CWS lag target', 'latent load share'],
    description: 'Outdoor RH increases latent cooling demand and condenser rejection difficulty.',
  },
  'ctrl-chws-sp': {
    formula: 'T_CHWS → SP (lag τ=25s); f_load=1+0.08Δ; f_kW=1+0.10Δ; f_COP=1−0.05Δ (Δ=7−SP)',
    affects: ['CHWS header', 'chiller kW', 'COP', 'compressor lift', 'low-temp alarms'],
    description: 'Chilled-water supply setpoint. Lower SP increases compressor work and reduces COP.',
  },
  'ctrl-chwr-sp': {
    formula: 'ΔT_blend = 0.35×ΔT_physics + 0.65×(T_CHWR,SP − T_CHWS); T_CHWR = T_CHWS + ΔT',
    affects: ['CHWR header', 'loop ΔT', 'low-ΔT alarms'],
    description: 'Return temperature target blended with energy-balance ΔT.',
  },
  'ctrl-cws-sp': {
    formula: 'T_CWS,target = SP − 0.04×(N_fan−70) + ΔT_weather; COP_bonus from colder CWS',
    affects: ['CWS header', 'CT fan speed (auto)', 'chiller COP', 'high CWS alarms'],
    description: 'Condenser supply setpoint. Lower target drives tower fans harder and improves chiller COP.',
  },
  'ctrl-cwr-sp': {
    formula: 'T_CWR,target = max(SP, T_CWS + 2°C)',
    affects: ['CWR header', 'condenser ΔT range'],
    description: 'Condenser return floor. Sets minimum CWR relative to CWS plus tower range.',
  },
  'ctrl-dp-sp': {
    formula: 'N_CHWP = clamp(70 + 3×(DP_SP−15), 30, 100)%; bypass opens if DP_meas > SP+3',
    affects: ['CHWP speed', 'header DP proxy', 'bypass valve %', 'effective ΔT'],
    description: 'Differential-pressure setpoint for chilled-water pumps. Higher SP raises pump speed; excess DP opens bypass.',
  },
  'ctrl-ct-fan': {
    formula: 'N_fan = override if >0; else N += 8×(T_CWS,act − T_CWS,SP); P_CT ∝ N³',
    affects: ['CT fan %', 'CWS actual', 'condenser COP', 'CT kW'],
    description: 'Manual cooling-tower fan override (0 = auto PI on CWS error).',
  },
  'ctrl-pump-spd': {
    formula: 'N_CHWP = override if >0; else from DP_SP; Q∝N, P∝N³',
    affects: ['CHWP speed', 'CHWP kW', 'flow per pump', 'measured DP proxy'],
    description: 'Manual CHWP speed override (0 = auto from DP setpoint).',
  },
  'ctrl-ch-enable': {
    formula: 'N_chillers = f(L_demand) if enabled else 0',
    affects: ['CH-1…5 status', 'plant cooling capacity', 'CWP/CT staging'],
    description: 'Master chiller enable. Off stops all chillers regardless of load.',
  },
  'ctrl-opt-mode': {
    formula: '(reserved — not wired in physics engine yet)',
    affects: ['future optimization strategy'],
    description: 'Placeholder for plant optimization mode. Currently does not change calculations.',
  },
};

/** Live schematic outputs from simulation headers. */
export const CHILLER_DERIVED_LABELS = [
  { key: 'buildingLoadRt', label: 'Plant load', unit: 'RT' },
  { key: 'chws', label: 'CHWS', unit: '°C' },
  { key: 'chwr', label: 'CHWR', unit: '°C' },
  { key: 'cws', label: 'CWS', unit: '°C' },
  { key: 'cwr', label: 'CWR', unit: '°C' },
  { key: 'ambientTemp', label: 'Outdoor temp', unit: '°C' },
  { key: 'humidityRh', label: 'Outdoor RH', unit: '%' },
];

/** Core physics equations — validated & textbook (see docs/physics-formulas-reference.md). */
export const CHILLER_CORE_FORMULAS = [
  { name: 'Sensible duty (water)', eq: 'Q = V̇[m³/h]·ΔT·1.163 [kW] = ṁ·cₚ·ΔT' },
  { name: 'Refrigeration', eq: 'Q[kW] = RT × 3.517' },
  { name: 'CHW ΔT', eq: 'ΔT = T_CHWR − T_CHWS' },
  { name: 'Plant COP', eq: 'COP = Q_cooling / P_electrical' },
  { name: 'Plant efficiency', eq: 'kW/RT = P_plant / Q_RT' },
  { name: 'Pump affinity', eq: 'Q∝N, P∝N³' },
  { name: 'Thermal lag', eq: 'x ← x + (x*−x)(1−e^(−Δt/τ))' },
  { name: 'Tower approach', eq: 'T_CWS,leaving ≥ T_wetbulb + approach (3–5°C)' },
];

export const CHILLER_GROUP_ORDER = ['load', 'weather', 'chilled', 'condenser', 'pumps', 'overrides', 'plant'];
export const CHILLER_GROUP_LABELS = {
  load: 'Building load',
  weather: 'Weather',
  chilled: 'Chilled water (CHWS / CHWR)',
  condenser: 'Condenser water (CWS / CWR)',
  pumps: 'Pumping & DP',
  overrides: 'Manual overrides',
  plant: 'Plant enable',
};
