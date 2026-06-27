/**
 * AHU01 domino-effect trace for virtual simulator UI.
 *
 * When `before` (a prior solved snapshot) and `changes` (the operator edits just
 * applied) are supplied, each affected output is rendered as `before → after` so
 * the operator can see exactly what each parameter moved. During live ticks both
 * are omitted and the current value is shown on its own.
 */
import { ba, changesHeader, buildCascadeRows } from './cascadeDelta.js';

/** Affected outputs tracked in the AHU before→after domino table. */
export const AHU_CASCADE_SPEC = [
  { key: 'oaFraction', label: 'OA fraction', unit: '%', digits: 0, scale: 100 },
  { key: 'matC', label: 'Mixed air (MAT)', unit: '°C' },
  { key: 'ratC', label: 'Return air temp', unit: '°C' },
  { key: 'raRhPct', label: 'Return air RH', unit: '%', digits: 0 },
  { key: 'chwValvePct', label: 'CHW valve', unit: '%', digits: 0 },
  { key: 'hwValvePct', label: 'HW valve', unit: '%', digits: 0 },
  { key: 'satC', label: 'Supply air (SAT)', unit: '°C' },
  { key: 'saFanSpeedPct', label: 'SA fan speed', unit: '%', digits: 0 },
  { key: 'raFanSpeedPct', label: 'RA fan speed', unit: '%', digits: 0 },
  { key: 'saCfm', label: 'SA airflow', unit: 'CFM', digits: 0 },
  { key: 'raCfm', label: 'RA airflow', unit: 'CFM', digits: 0 },
  { key: 'staticPressurePa', label: 'Static pressure', unit: 'Pa', digits: 0 },
  { key: 'coolingKw', label: 'Cooling duty', unit: 'kW' },
  { key: 'fanPowerKw', label: 'Fan power', unit: 'kW', digits: 2 },
  { key: 'oaDamperPct', label: 'OA damper', unit: '%', digits: 0 },
  { key: 'raDamperPct', label: 'RA damper', unit: '%', digits: 0 },
  { key: 'filterDpPa', label: 'Filter ΔP', unit: 'Pa', digits: 0 },
];

/**
 * Build the AHU before→after table rows.
 * @param {Record<string, any>} after
 * @param {Record<string, any>|null} [before]
 */
export function buildAhuCascadeRows(after, before = null) {
  return buildCascadeRows(after, before, AHU_CASCADE_SPEC);
}

/**
 * @param {Record<string, any>} ctx after-state context
 * @param {Record<string, any>|null} [before] before-state context (same keys)
 * @param {Array<{label:string, oldValue:any, newValue:any, unit?:string}>|null} [changes] applied operator edits
 * @returns {string[]}
 */
export function buildAhuCascadeTrace(ctx, before = null, changes = null) {
  const b = before;
  const steps = [];

  const header = changesHeader(changes);
  if (header) steps.push(header);
  else if (ctx.trigger) steps.push(`▶ ${ctx.trigger}`);

  const oaFracPct = (v) => (v == null ? null : v * 100);

  steps.push(
    `Mode ${ctx.mode.toUpperCase()} · OAT ${ba(b?.oatC, ctx.oatC, { unit: '°C' })} / ${ctx.oaRhPct}%RH → OA fraction ${ba(oaFracPct(b?.oaFraction), ctx.oaFraction * 100, { unit: '%', digits: 0 })}`
  );
  steps.push(
    `Return air RA ${ba(b?.ratC, ctx.ratC, { unit: '°C' })} / ${ba(b?.raRhPct, ctx.raRhPct, { unit: '%', digits: 0 })}RH (SP ${ctx.raTempSpC}°C / ${ctx.raRhSpPct}%RH) → mixed MAT ${ba(b?.matC, ctx.matC, { unit: '°C' })}`
  );
  steps.push(
    `Coils: CHW valve ${ba(b?.chwValvePct, ctx.chwValvePct, { unit: '%', digits: 0 })} · HW valve ${ba(b?.hwValvePct, ctx.hwValvePct, { unit: '%', digits: 0 })} → SAT ${ba(b?.satC, ctx.satC, { unit: '°C' })} (SP ${ctx.satSpC}°C)`
  );
  steps.push(
    `SA fan ${ba(b?.saFanSpeedPct, ctx.saFanSpeedPct, { unit: '%', digits: 0 })} · RA fan ${ba(b?.raFanSpeedPct, ctx.raFanSpeedPct, { unit: '%', digits: 0 })} → ${ba(b?.saCfm, ctx.saCfm, { unit: 'CFM', digits: 0 })} supply / ${ba(b?.raCfm, ctx.raCfm, { unit: 'CFM', digits: 0 })} return (SP ${ctx.saCfmSp}/${ctx.raCfmSp} CFM)`
  );
  steps.push(
    `Static ${ba(b?.staticPressurePa, ctx.staticPressurePa, { unit: 'Pa', digits: 0 })} · cooling ${ba(b?.coolingKw, ctx.coolingKw, { unit: 'kW' })} · fan power ${ba(b?.fanPowerKw, ctx.fanPowerKw, { unit: 'kW', digits: 2 })}`
  );
  steps.push(
    `Dampers OA ${ba(b?.oaDamperPct, ctx.oaDamperPct, { unit: '%', digits: 0 })} / RA ${ba(b?.raDamperPct, ctx.raDamperPct, { unit: '%', digits: 0 })} · filter DP ${ba(b?.filterDpPa, ctx.filterDpPa, { unit: 'Pa', digits: 0 })}`
  );
  if (ctx.alertCount > 0) {
    steps.push(`Alarms: ${ctx.alertCount} active from calculated state`);
  } else {
    steps.push('Alarms: none — operating within setpoint bands');
  }
  return steps;
}
