/**
 * ETS A-B03-01 domino-effect trace — causal chain for the virtual simulator UI.
 * Mirrors the engine flow: inputs → load → secondary → pumps → HX → primary → meter → alarms.
 *
 * When `before` (a prior solved snapshot) and `changes` (the operator edits just
 * applied) are supplied, each affected output is rendered as `before → after`.
 */
import { ba, changesHeader, buildCascadeRows } from '../shared/cascadeDelta.js';

/** Affected outputs tracked in the ETS before→after domino table. */
export const ETS_CASCADE_SPEC = [
  { key: 'demandRt', label: 'Cooling demand', unit: 'RT', digits: 0 },
  { key: 'coolingKw', label: 'Thermal duty', unit: 'kW', digits: 0 },
  { key: 'chwsC', label: 'CHWS', unit: '°C' },
  { key: 'chwrC', label: 'CHWR', unit: '°C' },
  { key: 'secDeltaT', label: 'Secondary ΔT', unit: '°C' },
  { key: 'secFlowM3h', label: 'Secondary flow', unit: 'm³/h', digits: 0 },
  { key: 'headerDpKpa', label: 'Header DP', unit: 'kPa', digits: 0 },
  { key: 'pumpsRunning', label: 'Pumps online', unit: '', digits: 0 },
  { key: 'pumpSpeedPct', label: 'Pump speed', unit: '%', digits: 0 },
  { key: 'pumpPowerKwTotal', label: 'Pump power', unit: 'kW' },
  { key: 'pumpKwPerRt', label: 'Pump efficiency', unit: 'kW/RT', digits: 3 },
  { key: 'loadFrac', label: 'HX load', unit: '%', digits: 0, scale: 100 },
  { key: 'approachC', label: 'HX approach', unit: '°C' },
  { key: 'effectiveness', label: 'Effectiveness', unit: '%', digits: 0, scale: 100 },
  { key: 'lmtdC', label: 'LMTD', unit: '°C' },
  { key: 'dcsSupplyC', label: 'DCS supply', unit: '°C' },
  { key: 'dcrC', label: 'DCR return', unit: '°C' },
  { key: 'priDeltaT', label: 'Primary ΔT', unit: '°C' },
  { key: 'priFlowM3h', label: 'Primary flow', unit: 'm³/h', digits: 0 },
  { key: 'ltBypassPct', label: 'LT bypass', unit: '%', digits: 0 },
  { key: 'ltBypassFlowM3h', label: 'LT bypass flow', unit: 'm³/h' },
];

/**
 * Build the ETS before→after table rows.
 * @param {Record<string, any>} after
 * @param {Record<string, any>|null} [before]
 */
export function buildEtsCascadeRows(after, before = null) {
  return buildCascadeRows(after, before, ETS_CASCADE_SPEC);
}

/**
 * @param {Record<string, any>} ctx after-state context
 * @param {Record<string, any>|null} [before] before-state context (same keys)
 * @param {Array<{label:string, oldValue:any, newValue:any, unit?:string}>|null} [changes] applied operator edits
 * @returns {string[]}
 */
export function buildEtsCascadeTrace(ctx, before = null, changes = null) {
  const b = before;
  const steps = [];

  const header = changesHeader(changes);
  if (header) steps.push(header);
  else if (ctx.trigger) steps.push(`▶ ${ctx.trigger}`);

  const occLabel = ctx.occupied ? 'Occupied' : 'Unoccupied';
  steps.push(
    `Load shaping: ${ba(b?.baseLoadRt, ctx.baseLoadRt, { unit: 'RT', digits: 0 })} base · ${ba(b?.ambient, ctx.ambient, { unit: '°C' })} OAT · ${occLabel} → target ${ba(b?.targetLoadRt, ctx.targetLoadRt, { unit: 'RT', digits: 0 })} (lagged ${ba(b?.demandRt, ctx.demandRt, { unit: 'RT', digits: 0 })})`
  );

  steps.push(
    `Duty: ${ba(b?.demandRt, ctx.demandRt, { unit: 'RT', digits: 0 })} → ${ba(b?.coolingKw, ctx.coolingKw, { unit: 'kW', digits: 0 })} (Q = RT × 3.517)`
  );

  steps.push(
    `Secondary loop: CHWS SP ${ctx.chwsSp.toFixed(1)}°C → ${ba(b?.chwsC, ctx.chwsC, { unit: '°C' })} / ${ba(b?.chwrC, ctx.chwrC, { unit: '°C' })} · ΔT ${ba(b?.secDeltaT, ctx.secDeltaT, { unit: '°C' })} · flow ${ba(b?.secFlowM3h, ctx.secFlowM3h, { unit: 'm³/h', digits: 0 })}`
  );

  steps.push(
    `FLOW-VSD: DP SP ${ctx.dpSp.toFixed(0)} kPa → header ${ba(b?.headerDpKpa, ctx.headerDpKpa, { unit: 'kPa', digits: 0 })} · ${ba(b?.pumpsRunning, ctx.pumpsRunning, { digits: 0 })}/3 CHWP @ ${ba(b?.pumpSpeedPct, ctx.pumpSpeedPct, { unit: '%', digits: 0 })} · ${ba(b?.pumpPowerKwTotal, ctx.pumpPowerKwTotal, { unit: 'kW' })} (${ba(b?.pumpKwPerRt, ctx.pumpKwPerRt, { unit: 'kW/RT', digits: 3 })})`
  );

  const hxLabel = ctx.hxInService === 1 ? '1 HX online (600 RT)' : '2 HX online (1100 RT)';
  steps.push(
    `Plate HX: ${hxLabel} · load ${ba(b ? b.loadFrac * 100 : null, ctx.loadFrac * 100, { unit: '%', digits: 0 })} · approach ${ba(b?.approachC, ctx.approachC, { unit: '°C' })} · ε ${ba(b ? b.effectiveness * 100 : null, ctx.effectiveness * 100, { unit: '%', digits: 0 })} · LMTD ${ba(b?.lmtdC, ctx.lmtdC, { unit: '°C' })}`
  );

  steps.push(
    `Primary DCS: supply ${ba(b?.dcsSupplyC, ctx.dcsSupplyC, { unit: '°C' })} → DCR ${ba(b?.dcrC, ctx.dcrC, { unit: '°C' })} · ΔT ${ba(b?.priDeltaT, ctx.priDeltaT, { unit: '°C' })} · flow ${ba(b?.priFlowM3h, ctx.priFlowM3h, { unit: 'm³/h', digits: 0 })}`
  );

  if (ctx.ltBypassPct > 0.5 || (b && b.ltBypassPct > 0.5)) {
    steps.push(
      `LT bypass: CHWRT SP ${ctx.chwrtSp.toFixed(1)}°C → valve ${ba(b?.ltBypassPct, ctx.ltBypassPct, { unit: '%', digits: 0 })} · ${ba(b?.ltBypassFlowM3h, ctx.ltBypassFlowM3h, { unit: 'm³/h' })}`
    );
  }

  steps.push(
    `Energy meter: ${ba(b?.coolingKw, ctx.coolingKw, { unit: 'kW', digits: 0 })} · ${ba(b?.demandRt, ctx.demandRt, { unit: 'ton' })} · cumulative from physics tick`
  );

  if (ctx.alertCount > 0) {
    steps.push(`Alarms: ${ctx.alertCount} active from calculated state (approach, ΔT, capacity)`);
  } else {
    steps.push('Alarms: none — operating within design limits');
  }

  return steps;
}
