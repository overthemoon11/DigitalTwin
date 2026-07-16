/**
 * Actionable control recommendations for ETS A-B03-01 alerts.
 * Control IDs match etsHeatExchangeEngine defaultControls().
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

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForHxApproach(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  if (ctx.hxInService < 2) {
    adjustments.push({
      controlId: 'ets-hx-service',
      label: 'Heat Exchangers In Service',
      currentValue: ctx.hxInService,
      suggestedValue: 2,
    });
  }
  if (ctx.dcsTemp > 6.2) {
    adjustments.push({
      controlId: 'ets-dcs-temp',
      label: 'DCS Supply Temp',
      currentValue: ctx.dcsTemp,
      suggestedValue: 6.0,
      unit: '°C',
    });
  }
  if (ctx.chwsSp < 7.5) {
    adjustments.push({
      controlId: 'ets-chws-sp',
      label: 'CHWS Setpoint',
      currentValue: ctx.chwsSp,
      suggestedValue: 7.5,
      unit: '°C',
    });
  }
  if (ctx.baseLoadRt > ctx.capacityTons * 0.95) {
    adjustments.push({
      controlId: 'ets-load',
      label: 'Building Cooling Load',
      currentValue: Math.round(ctx.baseLoadRt),
      suggestedValue: Math.round(ctx.capacityTons * 0.9),
      unit: 'RT',
    });
  }

  const text = adjustments.length
    ? formatAdjustments(adjustments)
    : 'Verify HX isolation valves open and district primary supply temperature at design (≈6.0°C)';

  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForLowSecondaryDt(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  const suggestedChwrt = Math.max(12, round(ctx.chwrtSp - 1, 1));
  if (ctx.chwrtSp > 13.5) {
    adjustments.push({
      controlId: 'ets-chwrt-sp',
      label: 'LT Bypass CHWRT SP',
      currentValue: ctx.chwrtSp,
      suggestedValue: suggestedChwrt,
      unit: '°C',
    });
  }

  const suggestedDp = Math.max(60, Math.round(ctx.dpSp - 15));
  if (ctx.dpSp > 70) {
    adjustments.push({
      controlId: 'ets-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSp,
      suggestedValue: suggestedDp,
      unit: 'kPa',
    });
  }

  if (ctx.ltBypassPct > 45) {
    adjustments.push({
      controlId: 'ets-chwrt-sp',
      label: 'LT Bypass CHWRT SP',
      currentValue: ctx.chwrtSp,
      suggestedValue: Math.max(12, round(ctx.chwrC - ctx.secDeltaT * 0.5, 1)),
      unit: '°C',
    });
  }

  const text = adjustments.length
    ? `${formatAdjustments(adjustments)} — restores secondary ΔT and reduces bypass mixing`
    : 'Inspect building 2-way valves; close LT bypass if CHWR is over-mixed';

  return { adjustments: dedupeAdjustments(adjustments), text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForOverCapacity(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  const targetLoad = Math.max(80, Math.round(ctx.capacityTons * 0.92));
  adjustments.push({
    controlId: 'ets-load',
    label: 'Building Cooling Load',
    currentValue: Math.round(ctx.baseLoadRt),
    suggestedValue: targetLoad,
    unit: 'RT',
  });

  if (ctx.hxInService < 2) {
    adjustments.push({
      controlId: 'ets-hx-service',
      label: 'Heat Exchangers In Service',
      currentValue: ctx.hxInService,
      suggestedValue: 2,
    });
  }

  if (ctx.occupied) {
    adjustments.push({
      controlId: 'ets-occupied',
      label: 'Time Program',
      currentValue: 'Occupied',
      suggestedValue: 'Unoccupied',
    });
  }

  return {
    adjustments,
    text: `${formatAdjustments(adjustments)} — demand exceeds installed HX capacity (${ctx.capacityTons} RT)`,
  };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForHighPumpKwRt(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  const suggestedDp = Math.max(60, Math.round(ctx.dpSp - 20));
  if (ctx.dpSp > suggestedDp) {
    adjustments.push({
      controlId: 'ets-dp-sp',
      label: 'Header DP Setpoint',
      currentValue: ctx.dpSp,
      suggestedValue: suggestedDp,
      unit: 'kPa',
    });
  }

  if (ctx.pumpMax > 90) {
    adjustments.push({
      controlId: 'ets-pump-max',
      label: 'Pump Speed Max',
      currentValue: ctx.pumpMax,
      suggestedValue: 90,
      unit: '%',
    });
  }

  const text = adjustments.length
    ? `${formatAdjustments(adjustments)} — target pump efficiency ≤ 0.07 kW/RT`
    : 'Lower header DP setpoint if terminal valves are satisfied';

  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForHighLtBypass(ctx) {
  const suggestedChwrt = Math.max(12, round(ctx.chwrC - 1.5, 1));
  const adjustments = [{
    controlId: 'ets-chwrt-sp',
    label: 'LT Bypass CHWRT SP',
    currentValue: ctx.chwrtSp,
    suggestedValue: suggestedChwrt,
    unit: '°C',
  }];

  return {
    adjustments,
    text: `${formatAdjustments(adjustments)} — bypass at ${ctx.ltBypassPct.toFixed(0)}% is diluting return temperature`,
  };
}

function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** @param {AlertAdjustment[]} list */
function dedupeAdjustments(list) {
  const seen = new Set();
  return list.filter((a) => {
    const key = a.controlId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
