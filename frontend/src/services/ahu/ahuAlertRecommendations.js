/**
 * Actionable control recommendations for AHU01 alerts.
 * Control IDs match ahuEngine defaultControls().
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

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForRaTempHigh(ctx) {
  const chwSuggested = Math.max(4, round(ctx.chwEnter - 0.5, 1));
  const satSuggested = Math.max(10, round(ctx.satSp - 0.5, 1));
  const adjustments = [
    {
      controlId: 'ahu-chw-enter',
      label: 'CHW Entering Temp',
      currentValue: ctx.chwEnter,
      suggestedValue: chwSuggested,
      unit: '°C',
    },
    {
      controlId: 'ahu-sat-sp',
      label: 'SAT Setpoint',
      currentValue: ctx.satSp,
      suggestedValue: satSuggested,
      unit: '°C',
    },
  ];
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForRaRhHigh(ctx) {
  const satSuggested = Math.max(10, round(ctx.satSp - 1, 1));
  const adjustments = [
    {
      controlId: 'ahu-sat-sp',
      label: 'SAT Setpoint',
      currentValue: ctx.satSp,
      suggestedValue: satSuggested,
      unit: '°C',
    },
  ];
  if (ctx.zoneLoad > 1.0) {
    adjustments.push({
      controlId: 'ahu-zone-load',
      label: 'Zone Load Index',
      currentValue: ctx.zoneLoad,
      suggestedValue: round(Math.max(0.8, ctx.zoneLoad - 0.15), 2),
    });
  }
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForSatOffSp(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];
  const satHigh = ctx.satC > ctx.satSp;

  if (satHigh) {
    const chwSuggested = Math.max(4, round(ctx.chwEnter - 0.5, 1));
    adjustments.push({
      controlId: 'ahu-chw-enter',
      label: 'CHW Entering Temp',
      currentValue: ctx.chwEnter,
      suggestedValue: chwSuggested,
      unit: '°C',
    });
    if (ctx.chwValvePct >= 95) {
      adjustments.push({
        controlId: 'ahu-sat-sp',
        label: 'SAT Setpoint',
        currentValue: ctx.satSp,
        suggestedValue: round(ctx.satSp + 0.5, 1),
        unit: '°C',
      });
    } else {
      adjustments.push({
        controlId: 'ahu-sat-sp',
        label: 'SAT Setpoint',
        currentValue: ctx.satSp,
        suggestedValue: Math.max(10, round(ctx.satSp - 0.5, 1)),
        unit: '°C',
      });
    }
  } else {
    adjustments.push({
      controlId: 'ahu-sat-sp',
      label: 'SAT Setpoint',
      currentValue: ctx.satSp,
      suggestedValue: round(ctx.satSp + 0.5, 1),
      unit: '°C',
    });
  }

  const text = adjustments.length
    ? formatAdjustments(adjustments)
    : 'Verify CHW coil valve stroke and entering water temperature at design';
  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForChwSaturated(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  if (ctx.chwEnter > 4.5) {
    adjustments.push({
      controlId: 'ahu-chw-enter',
      label: 'CHW Entering Temp',
      currentValue: ctx.chwEnter,
      suggestedValue: Math.max(4, round(ctx.chwEnter - 0.5, 1)),
      unit: '°C',
    });
  }
  if (ctx.satSp < 14) {
    adjustments.push({
      controlId: 'ahu-sat-sp',
      label: 'SAT Setpoint',
      currentValue: ctx.satSp,
      suggestedValue: round(ctx.satSp + 0.5, 1),
      unit: '°C',
    });
  }
  if (ctx.zoneLoad > 1.05) {
    adjustments.push({
      controlId: 'ahu-zone-load',
      label: 'Zone Load Index',
      currentValue: ctx.zoneLoad,
      suggestedValue: round(ctx.zoneLoad - 0.1, 2),
    });
  }

  const text = adjustments.length
    ? formatAdjustments(adjustments)
    : 'CHW valve at limit — verify district CHW supply and coil capacity';
  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForSaCfmHigh(ctx) {
  const spSuggested = Math.max(400, Math.round(ctx.spSp - 50));
  const adjustments = [
    {
      controlId: 'ahu-sp-sp',
      label: 'Static Pressure SP',
      currentValue: ctx.spSp,
      suggestedValue: spSuggested,
      unit: 'Pa',
    },
  ];
  if (ctx.saCfmSp > 800) {
    adjustments.push({
      controlId: 'ahu-sa-cfm-sp',
      label: 'SA Airflow Setpoint',
      currentValue: ctx.saCfmSp,
      suggestedValue: Math.round(ctx.saCfmSp * 0.95),
      unit: 'CFM',
    });
  }
  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForSaCfmLow(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [];

  if (ctx.filterLoad > 0) {
    adjustments.push({
      controlId: 'ahu-filter-load',
      label: 'Filter Loading',
      currentValue: ctx.filterLoad,
      suggestedValue: 0,
      unit: '%',
    });
  }
  if (ctx.filterLoad > 50) {
    adjustments.push({
      controlId: 'ahu-sa-cfm-sp',
      label: 'SA Airflow Setpoint',
      currentValue: ctx.saCfmSp,
      suggestedValue: Math.round(ctx.saCfm * 0.98),
      unit: 'CFM',
    });
  } else if (ctx.spSp < 850) {
    adjustments.push({
      controlId: 'ahu-sp-sp',
      label: 'Static Pressure SP',
      currentValue: ctx.spSp,
      suggestedValue: Math.min(900, ctx.spSp + 50),
      unit: 'Pa',
    });
  }

  const text = adjustments.length
    ? formatAdjustments(adjustments)
    : 'Inspect SA fan VFD, duct static, and filter bank — restore design airflow';
  return { adjustments, text };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForStaticPressureOffSp(ctx) {
  const spHigh = ctx.staticPressurePa > ctx.spSp;
  const spSuggested = spHigh
    ? Math.max(400, Math.round(ctx.spSp - 50))
    : Math.min(900, Math.round(ctx.spSp + 50));

  const adjustments = [
    {
      controlId: 'ahu-sp-sp',
      label: 'Static Pressure SP',
      currentValue: ctx.spSp,
      suggestedValue: spSuggested,
      unit: 'Pa',
    },
  ];

  if (!spHigh && ctx.filterLoad > 40) {
    adjustments.push({
      controlId: 'ahu-filter-load',
      label: 'Filter Loading',
      currentValue: ctx.filterLoad,
      suggestedValue: 0,
      unit: '%',
    });
  }

  return { adjustments, text: formatAdjustments(adjustments) };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForSaFanSaturation(ctx) {
  /** @type {AlertAdjustment[]} */
  const adjustments = [
    {
      controlId: 'ahu-sp-sp',
      label: 'Static Pressure SP',
      currentValue: ctx.spSp,
      suggestedValue: Math.max(400, Math.round(ctx.spSp - 75)),
      unit: 'Pa',
    },
  ];

  if (ctx.filterLoad > 30) {
    adjustments.push({
      controlId: 'ahu-filter-load',
      label: 'Filter Loading',
      currentValue: ctx.filterLoad,
      suggestedValue: 0,
      unit: '%',
    });
  }
  if (ctx.saCfmSp > ctx.saCfm * 1.05) {
    adjustments.push({
      controlId: 'ahu-sa-cfm-sp',
      label: 'SA Airflow Setpoint',
      currentValue: ctx.saCfmSp,
      suggestedValue: Math.round(ctx.saCfm),
      unit: 'CFM',
    });
  }

  return {
    adjustments,
    text: formatAdjustments(adjustments),
  };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForFilterLoading(ctx) {
  const adjustments = [
    {
      controlId: 'ahu-filter-load',
      label: 'Filter Loading',
      currentValue: ctx.filterLoad,
      suggestedValue: 0,
      unit: '%',
    },
  ];
  if (ctx.saCfm < ctx.saCfmSp * 0.9) {
    adjustments.push({
      controlId: 'ahu-sa-cfm-sp',
      label: 'SA Airflow Setpoint',
      currentValue: ctx.saCfmSp,
      suggestedValue: Math.round(ctx.saCfm),
      unit: 'CFM',
    });
  }
  return {
    adjustments,
    text: `Replace SA/RA filters, then ${formatAdjustments(adjustments)}`,
  };
}

/**
 * @param {object} ctx
 * @returns {{ adjustments: AlertAdjustment[]; text: string }}
 */
export function recommendForLowPressurization(ctx) {
  const raSuggested = Math.min(2500, Math.round(ctx.raCfmSp + 100));
  const adjustments = [
    {
      controlId: 'ahu-ra-cfm-sp',
      label: 'RA Airflow Setpoint',
      currentValue: ctx.raCfmSp,
      suggestedValue: raSuggested,
      unit: 'CFM',
    },
  ];
  if (ctx.saCfmSp > ctx.saCfm * 1.02) {
    adjustments.push({
      controlId: 'ahu-sa-cfm-sp',
      label: 'SA Airflow Setpoint',
      currentValue: ctx.saCfmSp,
      suggestedValue: Math.round(ctx.saCfm),
      unit: 'CFM',
    });
  }
  return { adjustments, text: formatAdjustments(adjustments) };
}
