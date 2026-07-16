export type ChillerControlConstraint = {
  min: number;
  max: number;
  step: number;
};

/**
 * Source-of-truth operator constraints for L29 Chiller Plant controls.
 * Edit min/max/step here to change slider, SCADA input, scenario, chatbot, and MPC bounds.
 */
export const CHILLER_CONTROL_CONSTRAINTS = {
  'ctrl-building-load': { min: 800, max: 6000, step: 100 },
  'ctrl-ambient-temp': { min: 22, max: 40, step: 1 },
  'ctrl-humidity': { min: 40, max: 95, step: 5 },
  'ctrl-chws-sp': { min: 5, max: 10, step: 0.5 },
  'ctrl-chwr-sp': { min: 9, max: 16, step: 0.5 },
  'ctrl-cws-sp': { min: 25, max: 35, step: 0.5 },
  'ctrl-cwr-sp': { min: 28, max: 38, step: 0.5 },
  'ctrl-cw-dt-sp': { min: 2, max: 8, step: 0.5 },
  'ctrl-dp-sp': { min: 10, max: 30, step: 1 },
  'ctrl-dp-sp-high': { min: 5, max: 30, step: 1 },
  'ctrl-ct-fan': { min: 0, max: 100, step: 5 },
  'ctrl-pump-spd': { min: 0, max: 100, step: 5 },
  'ctrl-cwp-spd': { min: 0, max: 100, step: 5 },
  'ctrl-ch-enable': { min: 0, max: 1, step: 1 },
  'ctrl-opt-mode': { min: 0, max: 1, step: 1 },
  'ctrl-riser-finger': { min: 0, max: 70, step: 0.5 },
  'ctrl-riser-l13': { min: 0, max: 70, step: 0.5 },
  'ctrl-riser-main': { min: 0, max: 70, step: 0.5 },
  'ctrl-riser-t1u': { min: 0, max: 70, step: 0.5 },
} as const satisfies Record<string, ChillerControlConstraint>;

export type ChillerControlId = keyof typeof CHILLER_CONTROL_CONSTRAINTS;
