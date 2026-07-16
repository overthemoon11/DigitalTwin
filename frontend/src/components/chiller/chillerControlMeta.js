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
    formula: 'L_demand = L_base × f_temp(T_amb) × f_RH; f_temp = 1 + 0.03×(T−31°C) above ref',
    affects: ['buildingLoadRt', 'wet-bulb / CWS floor', 'condenser difficulty', 'tower fan demand'],
    description: 'Outdoor dry-bulb scales effective load and raises the wet-bulb, which floors the achievable condenser water temperature.',
  },
  'ctrl-humidity': {
    formula: 'f_RH = 1 + 0.0015×(RH−65%) above ref; wet-bulb (Stull) sets CWS floor = T_wb + 2.5°C',
    affects: ['buildingLoadRt', 'wet-bulb', 'CWS floor', 'latent load share'],
    description: 'Outdoor RH increases latent cooling demand and raises the wet-bulb, limiting how cold the towers can make condenser water.',
  },
  'ctrl-chws-sp': {
    formula: 'f_kW = 1 + 0.03×(7.5−SP); COP = Q_delivered / P (identity)',
    affects: ['CHWS header', 'chiller kW', 'COP', 'compressor lift', 'low-temp alarms'],
    description: 'Chilled-water supply setpoint. Lower SP raises compressor lift ≈3% kW per °C; COP falls to match (Q/P).',
  },
  'ctrl-chwr-sp': {
    formula: 'T_CHWR = T_CHWS + Q/(ṁ_actual×1.163) — an outcome of load and pumped flow',
    affects: ['CHWR alarm threshold'],
    description: 'Return-temperature reference used for alarming. CHWR itself is computed from the loop energy balance, not from this setpoint.',
  },
  'ctrl-cws-sp': {
    formula: 'T_CWS = max(SP, T_wb + 2.5°C); f_lift = 1 + 0.025×(T_CWS−29); fan += 10×(29−SP)',
    affects: ['CWS header', 'CT fan speed (auto)', 'chiller kW & COP', 'high CWS alarms'],
    description: 'Condenser supply setpoint. Colder CWS cuts chiller kW ~2.5%/°C but costs cubed tower-fan power, floored at wet-bulb + approach.',
  },
  'ctrl-cwr-sp': {
    formula: 'T_CWR = T_CWS + (Q_evap + P_comp)/(ṁ_CW×1.163) — heat-rejection energy balance',
    affects: ['CWR alarm threshold'],
    description: 'Condenser-return reference used for alarming. CWR itself is computed from the rejected heat over the actual condenser flow.',
  },
  'ctrl-dp-sp': {
    formula: 'N_CHWP = clamp(70 + 3×(DP_SP−15), 30, 100)%; ΔT = Q/(ṁ_actual×1.163); bypass if DP_meas > SP+3',
    affects: ['CHWP speed', 'loop flow', 'loop ΔT', 'header DP proxy', 'bypass valve %'],
    description: 'Differential-pressure setpoint for chilled-water pumps. Higher SP raises pump speed and flow, lowering loop ΔT; excess DP opens bypass.',
  },
  'ctrl-cw-dt-sp': {
    formula: 'ṁ_CW = (Q_evap + P_comp)/(ΔT_SP×1.163); N_CWP = 70×ṁ/ṁ_ref (clamped 30–100)',
    affects: ['CWP speed & kW', 'condenser flow', 'condenser ΔT'],
    description: 'Condenser ΔT setpoint. CWP VSDs modulate to hold it — a tighter ΔT needs more flow and cubed pump power.',
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
