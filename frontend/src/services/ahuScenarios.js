/** Preset AHU01 scenarios — BMS what-if demos. */

export const AHU_SCENARIOS = [
  {
    id: 'baseline',
    label: 'BMS baseline',
    description: 'Recirculation mode — RA 25.1°C/74.4%RH, high CHW valve, SA/RA fans on.',
    reset: true,
    advanceSec: 0,
  },
  {
    id: 'high-humidity',
    label: 'High room humidity',
    description: 'Elevated return RH — max cooling/dehumidification, CHW valve saturated.',
    controls: {
      'ahu-zone-load': 1.2,
      'ahu-ra-rh-sp': 52,
      'ahu-mode': 0,
    },
    advanceSec: 60,
  },
  {
    id: 'economizer',
    label: 'Economizer mode',
    description: 'Cool outdoor air when beneficial — reduced mechanical cooling.',
    controls: {
      'ahu-mode': 2,
      'ahu-oat': 22,
      'ahu-oarh': 55,
    },
    advanceSec: 60,
  },
  {
    id: 'dirty-filter',
    label: 'Loaded filters',
    description: 'High filter DP — fan power rises, airflow sags vs setpoint.',
    controls: {
      'ahu-filter-load': 75,
    },
    advanceSec: 60,
  },
  {
    id: 'heating-morning',
    label: 'Heating morning',
    description: 'Heating mode — HW coil active, minimal cooling.',
    controls: {
      'ahu-mode': 3,
      'ahu-oat': 12,
      'ahu-zone-load': 0.6,
    },
    advanceSec: 60,
  },
  {
    id: 'sa-overvent',
    label: 'SA over-ventilation',
    description: 'SA CFM above setpoint — static pressure and fan kW elevated.',
    controls: {
      'ahu-sa-cfm-sp': 2400,
      'ahu-sp-sp': 750,
    },
    advanceSec: 60,
  },
];

export function getAhuScenarioById(id) {
  return AHU_SCENARIOS.find((s) => s.id === id) ?? null;
}
