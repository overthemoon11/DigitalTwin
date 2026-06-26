/**
 * Actionable control recommendations for L29 Chiller Plant alerts.
 * Control IDs match controlEngine defaultControls().
 */

/**
 * @typedef {{
 *   controlId: string;
 *   label: string;
 *   currentValue: number | string;
 *   suggestedValue: number | string;
 *   unit?: string;
 * }} AlertAdjustment
 */

/**
 * @param {AlertAdjustment[]} adjustments
 * @returns {string}
 */
export function formatAdjustments(adjustments) {
  if (!adjustments.length) return '';
  return `Adjust: ${adjustments.map((a) => {
    const u = a.unit ? ` ${a.unit}` : '';
    return `${a.label} → ${a.suggestedValue}${u} (now ${a.currentValue}${u})`;
  }).join('; ')}`;
}

function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForChwsHigh(ctx) {
  const relaxedSp = round(Math.min(ctx.headers.chws - 0.5, ctx.chwsSetpoint + 1.5), 1);
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.88, 200, ctx.baseLoadRt));
  const adjustments = [
    {
      controlId: 'ctrl-chws-sp',
      label: 'CHWS Setpoint',
      currentValue: ctx.chwsSetpoint,
      suggestedValue: relaxedSp,
      unit: '°C',
    },
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
  ];
  if (!ctx.chillerEnabled) {
    adjustments.push({
      controlId: 'ctrl-ch-enable',
      label: 'Chiller Enable',
      currentValue: 0,
      suggestedValue: 1,
    });
  }
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForChwrHigh(ctx) {
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.9, 200, ctx.baseLoadRt));
  const tighterChws = round(Math.max(5, ctx.chwsSetpoint - 0.5), 1);
  const adjustments = [
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
    {
      controlId: 'ctrl-chws-sp',
      label: 'CHWS Setpoint',
      currentValue: ctx.chwsSetpoint,
      suggestedValue: tighterChws,
      unit: '°C',
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForCwsHigh(ctx) {
  const suggestedCws = round(Math.max(25, ctx.cwsSetpoint - 1), 1);
  const fanTarget = ctx.ctFanSpeed > 0 ? 100 : 100;
  const adjustments = [
    {
      controlId: 'ctrl-ct-fan',
      label: 'Cooling Tower Fan Override',
      currentValue: ctx.ctFanSpeed || 'Auto',
      suggestedValue: fanTarget,
      unit: '%',
    },
    {
      controlId: 'ctrl-cws-sp',
      label: 'CWS Setpoint',
      currentValue: ctx.cwsSetpoint,
      suggestedValue: suggestedCws,
      unit: '°C',
    },
  ];
  if (ctx.headers.ambientTemp > 34) {
    adjustments.push({
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: Math.round(ctx.baseLoadRt * 0.92),
      unit: 'RT',
    });
  }
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForLowDeltaT(ctx) {
  const suggestedDp = Math.max(10, round(ctx.dpSetpoint - 5, 0));
  const pumpTarget = ctx.pumpOverride > 0 ? Math.max(50, round(ctx.pumpOverride - 10, 0)) : 0;
  const adjustments = [
    {
      controlId: 'ctrl-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSetpoint,
      suggestedValue: suggestedDp,
      unit: 'psi',
    },
    {
      controlId: 'ctrl-pump-spd',
      label: 'Pump Speed Override',
      currentValue: ctx.pumpOverride || 'Auto',
      suggestedValue: pumpTarget || 'Auto (0)',
      unit: '%',
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForBypassHigh(ctx) {
  const suggestedDp = Math.max(10, round(ctx.dpSetpoint - 4, 0));
  const pumpTarget = ctx.pumpOverride > 0 ? Math.max(45, round(ctx.pumpOverride - 15, 0)) : 0;
  const adjustments = [
    {
      controlId: 'ctrl-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSetpoint,
      suggestedValue: suggestedDp,
      unit: 'psi',
    },
    {
      controlId: 'ctrl-pump-spd',
      label: 'Pump Speed Override',
      currentValue: ctx.pumpOverride || 'Auto',
      suggestedValue: pumpTarget || 'Auto (0)',
      unit: '%',
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForDpHigh(ctx) {
  const suggestedDp = Math.max(10, round(ctx.dpSetpoint - 3, 0));
  const adjustments = [
    {
      controlId: 'ctrl-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSetpoint,
      suggestedValue: suggestedDp,
      unit: 'psi',
    },
    {
      controlId: 'ctrl-pump-spd',
      label: 'Pump Speed Override',
      currentValue: ctx.pumpOverride || 'Auto',
      suggestedValue: 'Auto (0)',
      unit: '%',
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @param {string} pumpId
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForPumpTrip(ctx, pumpId) {
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.85, 200, ctx.baseLoadRt));
  const suggestedDp = Math.max(10, round(ctx.dpSetpoint - 5, 0));
  const adjustments = [
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
    {
      controlId: 'ctrl-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSetpoint,
      suggestedValue: suggestedDp,
      unit: 'psi',
    },
    {
      controlId: 'ctrl-pump-spd',
      label: 'Pump Speed Override',
      currentValue: ctx.pumpOverride || 'Auto',
      suggestedValue: 0,
      unit: '%',
    },
  ];
  const text = `${formatAdjustments(adjustments)}; field: reset ${pumpId} and verify lead/lag`;
  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForChillerOverload(ctx) {
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.85, 200, ctx.baseLoadRt));
  const relaxedChws = round(Math.min(10, ctx.chwsSetpoint + 0.5), 1);
  const adjustments = [
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
    {
      controlId: 'ctrl-chws-sp',
      label: 'CHWS Setpoint',
      currentValue: ctx.chwsSetpoint,
      suggestedValue: relaxedChws,
      unit: '°C',
    },
    {
      controlId: 'ctrl-ch-enable',
      label: 'Chiller Enable',
      currentValue: ctx.chillerEnabled ? 1 : 0,
      suggestedValue: 1,
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForMakeupLow() {
  return {
    adjustments: [],
    text: 'Field: confirm CWMUP lead pump running, makeup valve open, and tank level trend; reset makeup pump fault if tripped',
  };
}

/**
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForMakeupHigh() {
  return {
    adjustments: [],
    text: 'Field: stop makeup pump if running, verify high-level float and overflow drain',
  };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForChillerFault(ctx) {
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.8, 200, ctx.baseLoadRt));
  const relaxedChws = round(Math.min(10, ctx.chwsSetpoint + 1), 1);
  const adjustments = [
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
    {
      controlId: 'ctrl-chws-sp',
      label: 'CHWS Setpoint',
      currentValue: ctx.chwsSetpoint,
      suggestedValue: relaxedChws,
      unit: '°C',
    },
    {
      controlId: 'ctrl-ch-enable',
      label: 'Chiller Enable',
      currentValue: ctx.chillerEnabled ? 1 : 0,
      suggestedValue: 1,
    },
  ];
  const text = `${formatAdjustments(adjustments)}; field: inspect tripped chiller safeties and compressor`;
  return { adjustments, text };
}

/**
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForMakeupFail() {
  return {
    adjustments: [],
    text: 'Field: transfer lead to standby CWMUP-2, verify makeup header pressure; use Reset to Baseline after repair',
  };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForCtFanFault(ctx) {
  const reducedLoad = Math.round(clamp(ctx.baseLoadRt * 0.9, 200, ctx.baseLoadRt));
  const relaxedCws = round(Math.min(35, ctx.cwsSetpoint + 1), 1);
  const adjustments = [
    {
      controlId: 'ctrl-ct-fan',
      label: 'Cooling Tower Fan Override',
      currentValue: ctx.ctFanSpeed || 'Auto',
      suggestedValue: 100,
      unit: '%',
    },
    {
      controlId: 'ctrl-building-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: reducedLoad,
      unit: 'RT',
    },
    {
      controlId: 'ctrl-cws-sp',
      label: 'CWS Setpoint',
      currentValue: ctx.cwsSetpoint,
      suggestedValue: relaxedCws,
      unit: '°C',
    },
  ];
  const text = `${formatAdjustments(adjustments)}; field: inspect VFD and fan motor on faulted tower`;
  return { adjustments, text };
}
