/**
 * Documents the offline virtual simulator causal chain.
 * Every displayed value is calculated — no live sensor ingestion.
 */

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

/** Human-readable domino-effect trace for UI / copilot. */
export function buildCascadeTrace(ctx: CascadeContext): string[] {
  const steps: string[] = [];

  if (ctx.trigger) {
    steps.push(`▶ ${ctx.trigger}`);
  }

  if (ctx.baseLoadRt != null && ctx.ambientTemp != null && ctx.humidityRh != null) {
    steps.push(
      `Weather: ${ctx.ambientTemp.toFixed(0)}°C / ${ctx.humidityRh.toFixed(0)}%RH → effective load ${ctx.buildingDemandRt.toFixed(0)} RT (base ${ctx.baseLoadRt.toFixed(0)} RT)`
    );
  }
  steps.push(
    `Building demand: ${ctx.buildingDemandRt.toFixed(0)} RT → stage ${ctx.runningChillers} chiller(s)`
  );
  steps.push(
    `CHWS ${ctx.chwsSp.toFixed(1)}°C / CHWR ${ctx.chwrSp.toFixed(1)}°C → load ${ctx.loadPct.toFixed(0)}%, ${ctx.chKw.toFixed(0)} kW/ch, COP ${ctx.cop.toFixed(2)}`
  );
  steps.push(
    `DP setpoint ${ctx.dpSp.toFixed(0)} psi → ${ctx.runningChwp} CHWP(s); ΔT ${ctx.deltaT.toFixed(1)}°C (CHWS ${ctx.chwsActual.toFixed(1)} / CHWR ${ctx.chwr.toFixed(1)})`
  );
  const cwrLine =
    ctx.cwrActual != null
      ? `CWS ${ctx.cwsSp.toFixed(1)}°C / CWR ${ctx.cwrSp.toFixed(1)}°C → ${ctx.runningCwp} CWP(s), actual CWR ${ctx.cwrActual.toFixed(1)}°C`
      : `CWS ${ctx.cwsSp.toFixed(1)}°C / CWR ${ctx.cwrSp.toFixed(1)}°C → ${ctx.runningCwp} CWP(s), tower fan drives condenser temp`;
  steps.push(cwrLine);
  steps.push(
    `Plant totals: ${ctx.totalPlantKw.toFixed(0)} kW, COP ${ctx.plantCop.toFixed(2)}, efficiency ${(ctx.totalPlantKw / Math.max(ctx.buildingDemandRt, 1)).toFixed(3)} kW/RT`
  );
  steps.push('Alarms evaluated from calculated state (not field devices)');

  return steps;
}
