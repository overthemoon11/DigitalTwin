/**
 * Operator-control metadata for AHU01 — formulas and downstream effects.
 * Physics implementation: frontend/src/services/ahuPhysics.js
 * Full reference: docs/ahu-controls-and-physics.md
 */

/** @typedef {{ formula: string; affects: string[]; description: string }} AhuControlMeta */

/** @type {Record<string, AhuControlMeta>} */
export const AHU_CONTROL_META = {
  'ahu-mode': {
    formula: 'f_OA = mode table (5% recirc | 15% min OA | economizer f(T_RA−T_OA) | 12% heating)',
    affects: ['oaFraction', 'MAT', 'CHW valve %', 'HW valve %', 'OA/RA damper POS', 'OA/EA CFM'],
    description: 'Operating mode sets minimum outdoor-air fraction and heating/cooling strategy.',
  },
  'ahu-sat-sp': {
    formula: 'approach = (T_MAT − SAT_SP)×(1 − CHW_valve/110); SAT = T_MAT − approach',
    affects: ['SAT', 'coil approach', 'cooling kW', 'CHW valve demand'],
    description: 'Supply-air temperature setpoint. Lower SP drives CHW valve open and deeper coil approach.',
  },
  'ahu-ra-temp-sp': {
    formula: 'e_T = T_RA − T_RA,SP; coolingDemand ∝ 0.4·e_T + 0.03·e_RH',
    affects: ['CHW valve %', 'fan speed trim', 'zone lag target T_RA', 'cooling kW'],
    description: 'Return-air dry-bulb comfort setpoint. Higher room temp vs SP increases cooling demand.',
  },
  'ahu-ra-rh-sp': {
    formula: 'e_RH = RH_RA − RH_RA,SP; coolingDemand ∝ 0.4·e_T + 0.03·e_RH',
    affects: ['CHW valve %', 'dehumidification demand', 'zone lag target RH_RA'],
    description: 'Return-air humidity setpoint. High RH vs SP adds dehumid load and opens CHW valve.',
  },
  'ahu-sa-cfm-sp': {
    formula: 'SA_fan% = f(SA_CFM_SP/design, SP_SP, filterFactor, coolingDemand)',
    affects: ['SA CFM', 'SA fan SPD %', 'static pressure', 'cooling kW', 'fan kW'],
    description: 'Supply airflow setpoint. Higher SP raises SA fan speed and supply CFM.',
  },
  'ahu-ra-cfm-sp': {
    formula: 'RA_fan% = f(RA_CFM_SP/design, SA trim, filterFactor)',
    affects: ['RA CFM', 'RA fan SPD %', 'building pressurization (SA−RA)', 'EA CFM'],
    description: 'Return airflow setpoint. Sets RA fan speed relative to SA for pressurization balance.',
  },
  'ahu-sp-sp': {
    formula: 'ΔP_static ≈ SP_SP × (SA_fan%/100)^1.8',
    affects: ['static pressure Pa', 'SA fan speed %', 'duct velocity'],
    description: 'Duct static-pressure setpoint. Higher SP increases fan speed to maintain duct pressure.',
  },
  'ahu-chw-enter': {
    formula: 'T_CHW,leave = T_CHW,enter + Q / (ṁ_w·c_p)',
    affects: ['CHW leaving temp', 'coil capacity margin', 'SAT (indirect)'],
    description: 'Chilled-water entering temperature boundary. Colder CHW improves coil capacity.',
  },
  'ahu-hw-enter': {
    formula: 'T_HW,leave = T_HW,enter − (HW_valve/100)×8°C',
    affects: ['HW leaving temp', 'SAT in heating mode'],
    description: 'Hot-water entering temperature boundary for HW coil.',
  },
  'ahu-sa-fan': {
    formula: 'SA_CFM = 0 if OFF; else CFM_design × (SA_fan%/100)^0.85 × filterFactor',
    affects: ['SA CFM', 'OA CFM', 'cooling kW', 'static pressure', 'fan kW', 'all SA duct sensors'],
    description: 'Supply fan enable. OFF stops SA flow and coil duty.',
  },
  'ahu-ra-fan': {
    formula: 'RA_CFM = 0 if OFF; else CFM_design × (RA_fan%/100)^0.85 × filterFactor',
    affects: ['RA CFM', 'EA CFM', 'recirc fraction', 'RA duct sensors'],
    description: 'Return fan enable. OFF stops return path and shifts mass balance.',
  },
  'ahu-filter-load': {
    formula: 'filterFactor = 1 − 0.003×loading%; ΔP_filter = 50 + 4.5×loading%',
    affects: ['SA/RA CFM', 'fan speed %', 'filter DP Pa', 'filter alarm'],
    description: 'Filter loading (0=clean, 100=dirty). Increases ΔP and reduces effective airflow.',
  },
  'ahu-zone-load': {
    formula: 'T_RA,target = T_RA,SP + 1.2×load; RH_target = RH_RA,SP + 18×load; lag α=0.12/0.10',
    affects: ['RA temp/RH drift', 'coolingDemand multiplier', 'comfort KPIs'],
    description: 'Zone internal load index. >1 simulates higher occupancy/equipment heat and moisture.',
  },
  'ahu-oat': {
    formula: 'T_MAT = f_OA·T_OA + (1−f_OA)·T_RA; economizer f_OA ∝ (T_RA−T_OA)',
    affects: ['MAT', 'SAT', 'economizer OA fraction', 'HW valve trim'],
    description: 'Outdoor dry-bulb. Affects mixed-air temperature and economizer mode.',
  },
  'ahu-oarh': {
    formula: 'RH_MAT = f_OA·RH_OA + (1−f_OA)·RH_RA (linear blend)',
    affects: ['MAT RH', 'dehumid demand', 'ambient T&RH tag'],
    description: 'Outdoor relative humidity. Blends into mixed-air humidity.',
  },
};

/** Live schematic outputs derived from simulation state. */
export const AHU_DERIVED_LABELS = [
  { key: 'matC', label: 'Mixed air (MAT)', unit: '°C' },
  { key: 'satC', label: 'Supply air (SAT)', unit: '°C' },
  { key: 'oaFraction', label: 'OA fraction', unit: '', fmt: (v) => `${(v * 100).toFixed(0)} %` },
  { key: 'saCfm', label: 'SA CFM', unit: 'CFM' },
  { key: 'raCfm', label: 'RA CFM', unit: 'CFM' },
  { key: 'oaCfm', label: 'OA CFM', unit: 'CFM' },
  { key: 'eaCfm', label: 'EA CFM', unit: 'CFM' },
  { key: 'staticPressurePa', label: 'Static pressure', unit: 'Pa' },
  { key: 'coolingKw', label: 'Cooling duty', unit: 'kW' },
  { key: 'fanPowerKw', label: 'Fan power', unit: 'kW' },
];

/** Extra derived rows from coils, dampers, fans (not in headers). */
export const AHU_DERIVED_EXTRAS = [
  { id: 'chw-valve', label: 'CHW valve', get: (s) => s?.chwCoil?.valvePct, unit: '%' },
  { id: 'hw-valve', label: 'HW valve', get: (s) => s?.hwCoil?.valvePct, unit: '%' },
  { id: 'sa-fan-spd', label: 'SA fan speed', get: (s) => s?.saFan?.speedPct, unit: '%' },
  { id: 'ra-fan-spd', label: 'RA fan speed', get: (s) => s?.raFan?.speedPct, unit: '%' },
  { id: 'oa-damper', label: 'FA damper (OA)', get: (s) => s?.dampers?.find((d) => d.id === 'ahu01-fa-damper-02')?.positionPct, unit: '%' },
  { id: 'ra-damper', label: 'RA damper', get: (s) => s?.dampers?.find((d) => d.id === 'ahu01-ra-damper')?.positionPct, unit: '%' },
  { id: 'filter-dp', label: 'Filter ΔP', get: (s) => s?.filters?.[0]?.dpPa, unit: 'Pa' },
];

/** Core physics equations shown in the panel reference block. */
export const AHU_CORE_FORMULAS = [
  { name: 'Sensible cooling (Imperial)', eq: 'Q[Btu/h] = CFM × 1.08 × ΔT[°F]' },
  { name: 'Sensible cooling (metric)', eq: 'Q[kW] = 0.0167 × CFM × ΔT[°C]' },
  { name: 'Mixed air', eq: 'T_MAT = f_OA·T_OA + (1−f_OA)·T_RA' },
  { name: 'Fan affinity', eq: 'Q∝N, H∝N², P∝N³' },
  { name: 'Mass balance', eq: 'V_OA = V_SA·f_OA; V_EA = max(0, V_SA − V_RA·(1−f_OA))' },
  { name: 'CHW side balance', eq: 'Q = ṁ_w·c_p·ΔT_w' },
  { name: 'Zone lag', eq: 'x ← x + (x_target − x)·α  (α≈0.12 T, 0.10 RH)' },
];
