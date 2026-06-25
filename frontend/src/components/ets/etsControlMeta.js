/**
 * Operator-control metadata for ETS A-B03-01 — formulas and downstream effects.
 * Physics implementation: frontend/src/services/etsPhysics.js
 * Full reference: docs/ets-controls-and-physics.md
 */

/** @typedef {{ formula: string; affects: string[]; description: string }} EtsControlMeta */

/** @type {Record<string, EtsControlMeta>} */
export const ETS_CONTROL_META = {
  'ets-load': {
    formula: 'Q[kW] = RT × 3.517; ṁ_sec = Q / (1.163 × ΔT_sec)',
    affects: ['coolingKw', 'coolingDemandRt', 'secFlowM3h', 'priFlowM3h', 'pumpsRunning', 'pumpSpeedPct', 'approachC', 'headerDpKpa', 'meter kW'],
    description: 'Base building cooling demand. Higher load increases duty, flows, pump staging, and widens HX approach.',
  },
  'ets-occupied': {
    formula: 'L_eff = L_base × (1.0 occupied | 0.55 unoccupied)',
    affects: ['coolingDemandRt', 'all load-driven outputs'],
    description: 'Time program scales effective load. Unoccupied reduces demand ~45%.',
  },
  'ets-chws-sp': {
    formula: 'T_CHWS ≈ SP + 0.5×(T_approach − 1.5°C)',
    affects: ['chwsC', 'chwrC', 'secDeltaT', 'approachC (display)'],
    description: 'Secondary chilled-water supply setpoint. Shifts CHWS/CHWR while HX balances duty.',
  },
  'ets-dp-sp': {
    formula: 'DP_header ≈ DP_SP + 2×load_fraction',
    affects: ['headerDpKpa', 'supplyPressureBar', 'returnPressureBar'],
    description: 'Header differential-pressure setpoint between CHWS and CHWR headers.',
  },
  'ets-chwrt-sp': {
    formula: 'LT_bypass% = f(T_CHWR − SP_CHWRT, load)',
    affects: ['ltBypassValve %', 'ltBypassFlowM3h'],
    description: 'LT bypass valve target return temperature. Higher SP closes bypass as CHWR rises above target.',
  },
  'ets-dcs-temp': {
    formula: 'T_approach = T_CHWS − T_DCS; ΔT_pri = T_DCR − T_DCS',
    affects: ['dcsSupplyC', 'approachC', 'priDeltaT', 'priFlowM3h', 'effectiveness'],
    description: 'Primary district supply from DCS plant. Colder DCS tightens approach and primary ΔT.',
  },
  'ets-hx-service': {
    formula: 'Q_capacity = Σ(rated_RT in service); load_frac = demand / capacity',
    affects: ['capacityTons', 'loadFrac', 'approachC', 'HX valve status', 'alarms'],
    description: 'Number of plate HX online (600 + 500 RT). Fewer units raise load fraction and approach.',
  },
  'ets-pump-min': {
    formula: 'N_pump = clamp(flow/speed, N_min, N_max); P ∝ N³',
    affects: ['pumpSpeedPct', 'pumpPowerKw', 'pumpsRunning'],
    description: 'Minimum VSD speed (FLOW-VSD). Raises speed floor and may add a pump stage.',
  },
  'ets-pump-max': {
    formula: 'Q_pump,max = Q_ref × (N_max/100); staging = ⌈Q_sec/Q_pump,max⌉',
    affects: ['pumpsRunning', 'pumpSpeedPct', 'pumpPowerKw'],
    description: 'Maximum VSD speed. Lower cap forces more pumps online at high flow.',
  },
  'ets-ambient': {
    formula: 'f_weather = 1 + 0.012×(T_amb − 32°C); L_target = L_base × f_weather × f_occ',
    affects: ['coolingDemandRt', 'downstream thermal & hydraulic outputs'],
    description: 'Outdoor dry-bulb shapes cooling load. Hotter ambient increases effective demand.',
  },
  'ets-humidity': {
    formula: '(display only — not in physics core yet)',
    affects: ['ambientRhPct display'],
    description: 'Outdoor RH shown on schematic. Future: enthalpy-based load correction.',
  },
};

/** Live schematic outputs derived from simulation headers. */
export const ETS_DERIVED_LABELS = [
  { key: 'coolingDemandRt', label: 'Demand', unit: 'RT' },
  { key: 'coolingKw', label: 'Thermal duty', unit: 'kW' },
  { key: 'chwsC', label: 'CHWS', unit: '°C' },
  { key: 'chwrC', label: 'CHWR', unit: '°C' },
  { key: 'secondaryDeltaT', label: 'Secondary ΔT', unit: '°C' },
  { key: 'secondaryFlowM3h', label: 'Secondary flow', unit: 'm³/h' },
  { key: 'dcsSupplyC', label: 'DCS supply', unit: '°C' },
  { key: 'dcrReturnC', label: 'DCR return', unit: '°C' },
  { key: 'primaryDeltaT', label: 'Primary ΔT', unit: '°C' },
  { key: 'primaryFlowM3h', label: 'Primary flow', unit: 'm³/h' },
  { key: 'approachC', label: 'HX approach', unit: '°C' },
  { key: 'headerDpKpa', label: 'Header DP', unit: 'kPa' },
  { key: 'ltBypassFlowM3h', label: 'LT bypass flow', unit: 'm³/h' },
  { key: 'pumpPowerKw', label: 'Pump power', unit: 'kW' },
  { key: 'pumpKwPerRt', label: 'Pump efficiency', unit: 'kW/RT' },
];

/** Core physics equations shown in the panel reference block. */
export const ETS_CORE_FORMULAS = [
  { name: 'Sensible duty', eq: 'Q = ṁ·cₚ·ΔT = V̇[m³/h]·ΔT·1.163 [kW]' },
  { name: 'Refrigeration', eq: 'Q[kW] = RT × 3.517' },
  { name: 'HX approach', eq: 'T_approach = T_CHWS − T_DCS' },
  { name: 'LMTD (counter-flow)', eq: 'ΔT_lm = (ΔT₁−ΔT₂) / ln(ΔT₁/ΔT₂)' },
  { name: 'Effectiveness', eq: 'ε = Q / (C_min·(T_hot,in − T_cold,in))' },
  { name: 'Pump affinity', eq: 'Q∝N, H∝N², P∝N³' },
];
