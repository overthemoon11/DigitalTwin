/**
 * Documents the offline virtual simulator causal chain.
 * Every displayed value is calculated — no live sensor ingestion.
 */
import { ba, changesHeader, buildCascadeRows } from '../shared/cascadeDelta.js';

/** Affected outputs tracked in the chiller-plant before→after domino table. */
export const CHILLER_CASCADE_SPEC = [
  { key: 'buildingDemandRt', label: 'Building demand', unit: 'RT', digits: 0 },
  { key: 'runningChillers', label: 'Chillers online', unit: '', digits: 0 },
  { key: 'loadPct', label: 'Chiller load', unit: '%', digits: 0 },
  { key: 'chKw', label: 'Chiller kW (each)', unit: 'kW', digits: 0 },
  { key: 'cop', label: 'Chiller COP', unit: '', digits: 2 },
  { key: 'runningChwp', label: 'CHWP online', unit: '', digits: 0 },
  { key: 'deltaT', label: 'CHW ΔT', unit: '°C' },
  { key: 'chwsActual', label: 'CHWS', unit: '°C' },
  { key: 'chwr', label: 'CHWR', unit: '°C' },
  { key: 'runningCwp', label: 'CWP online', unit: '', digits: 0 },
  { key: 'cwrActual', label: 'CWR', unit: '°C' },
  { key: 'totalPlantKw', label: 'Total plant kW', unit: 'kW', digits: 0 },
  { key: 'plantCop', label: 'Plant COP', unit: '', digits: 2 },
];

/** Build the chiller-plant before→after table rows. */
export function buildChillerCascadeRows(
  after: CascadeContext,
  before: Partial<CascadeContext> | null = null
) {
  return buildCascadeRows(after, before, CHILLER_CASCADE_SPEC);
}

export const CASCADE_ORDER = [
  'operator_inputs',
  'building_load',
  'chiller_staging',
  'chws_physics',
  'chwp_dp_pumps',
  'hydronic_balance',
  'condenser_tower',
  'cwp_staging',
  'makeup_water',
  'plant_power_kpis',
  'alarm_evaluation',
] as const;

export interface CascadeContext {
  chwsSp: number;
  chwrSp: number;
  cwsSp: number;
  cwrSp: number;
  dpSp: number;
  baseLoadRt?: number;
  ambientTemp?: number;
  humidityRh?: number;
  buildingDemandRt: number;
  runningChillers: number;
  runningChwp: number;
  runningCwp: number;
  loadPct: number;
  chKw: number;
  cop: number;
  chwsActual: number;
  chwr: number;
  cwrActual?: number;
  deltaT: number;
  totalPlantKw: number;
  plantCop: number;
  trigger?: string;
}

/**
 * Human-readable domino-effect trace for UI / copilot.
 *
 * When `before` (the prior tick's context) and `changes` (the operator edits
 * just applied) are supplied, each affected output is rendered as `before → after`.
 */
export function buildCascadeTrace(
  ctx: CascadeContext,
  before: Partial<CascadeContext> | null = null,
  changes:
    | Array<{ label: string; oldValue: number | string; newValue: number | string; unit?: string }>
    | null = null
): string[] {
  const b = before;
  const steps: string[] = [];

  const header = changesHeader(changes);
  if (header) steps.push(header);
  else if (ctx.trigger) steps.push(`▶ ${ctx.trigger}`);

  if (ctx.baseLoadRt != null && ctx.ambientTemp != null && ctx.humidityRh != null) {
    steps.push(
      `Weather: ${ba(b?.ambientTemp, ctx.ambientTemp, { unit: '°C', digits: 0 })} / ${ba(b?.humidityRh, ctx.humidityRh, { unit: '%RH', digits: 0 })} → effective load ${ba(b?.buildingDemandRt, ctx.buildingDemandRt, { unit: 'RT', digits: 0 })} (base ${ba(b?.baseLoadRt, ctx.baseLoadRt, { unit: 'RT', digits: 0 })})`
    );
  }
  steps.push(
    `Building demand: ${ba(b?.buildingDemandRt, ctx.buildingDemandRt, { unit: 'RT', digits: 0 })} → stage ${ba(b?.runningChillers, ctx.runningChillers, { digits: 0 })} chiller(s)`
  );
  steps.push(
    `CHWS ${ctx.chwsSp.toFixed(1)}°C / CHWR ${ctx.chwrSp.toFixed(1)}°C → load ${ba(b?.loadPct, ctx.loadPct, { unit: '%', digits: 0 })}, ${ba(b?.chKw, ctx.chKw, { unit: 'kW/ch', digits: 0 })}, COP ${ba(b?.cop, ctx.cop, { digits: 2 })}`
  );
  steps.push(
    `DP setpoint ${ctx.dpSp.toFixed(0)} psi → ${ba(b?.runningChwp, ctx.runningChwp, { digits: 0 })} CHWP(s); ΔT ${ba(b?.deltaT, ctx.deltaT, { unit: '°C' })} (CHWS ${ba(b?.chwsActual, ctx.chwsActual, { unit: '°C' })} / CHWR ${ba(b?.chwr, ctx.chwr, { unit: '°C' })})`
  );
  const cwrLine =
    ctx.cwrActual != null
      ? `CWS ${ctx.cwsSp.toFixed(1)}°C / CWR ${ctx.cwrSp.toFixed(1)}°C → ${ba(b?.runningCwp, ctx.runningCwp, { digits: 0 })} CWP(s), actual CWR ${ba(b?.cwrActual, ctx.cwrActual, { unit: '°C' })}`
      : `CWS ${ctx.cwsSp.toFixed(1)}°C / CWR ${ctx.cwrSp.toFixed(1)}°C → ${ba(b?.runningCwp, ctx.runningCwp, { digits: 0 })} CWP(s), tower fan drives condenser temp`;
  steps.push(cwrLine);
  const effBefore = b?.totalPlantKw != null && b?.buildingDemandRt != null ? b.totalPlantKw / Math.max(b.buildingDemandRt, 1) : null;
  const effAfter = ctx.totalPlantKw / Math.max(ctx.buildingDemandRt, 1);
  steps.push(
    `Plant totals: ${ba(b?.totalPlantKw, ctx.totalPlantKw, { unit: 'kW', digits: 0 })}, COP ${ba(b?.plantCop, ctx.plantCop, { digits: 2 })}, efficiency ${ba(effBefore, effAfter, { unit: 'kW/RT', digits: 3 })}`
  );
  steps.push('Alarms evaluated from calculated state (not field devices)');

  return steps;
}
