/**
 * ETS A-B03-01 domino-effect trace — causal chain for the virtual simulator UI.
 * Mirrors the engine flow: inputs → load → secondary → pumps → HX → primary → meter → alarms.
 */

/**
 * @param {object} ctx
 * @returns {string[]}
 */
export function buildEtsCascadeTrace(ctx) {
  const steps = [];

  if (ctx.trigger) {
    steps.push(`▶ ${ctx.trigger}`);
  }

  const occLabel = ctx.occupied ? 'Occupied' : 'Unoccupied';
  steps.push(
    `Load shaping: ${ctx.baseLoadRt.toFixed(0)} RT base · ${ctx.ambient.toFixed(1)}°C OAT · ${occLabel} → target ${ctx.targetLoadRt.toFixed(0)} RT (lagged ${ctx.demandRt.toFixed(0)} RT)`
  );

  steps.push(
    `Duty: ${ctx.demandRt.toFixed(0)} RT → ${ctx.coolingKw.toFixed(0)} kW (Q = RT × 3.517)`
  );

  steps.push(
    `Secondary loop: CHWS SP ${ctx.chwsSp.toFixed(1)}°C → ${ctx.chwsC.toFixed(1)}/${ctx.chwrC.toFixed(1)}°C · ΔT ${ctx.secDeltaT.toFixed(1)}°C · flow ${ctx.secFlowM3h.toFixed(0)} m³/h`
  );

  steps.push(
    `FLOW-VSD: DP SP ${ctx.dpSp.toFixed(0)} kPa → header ${ctx.headerDpKpa.toFixed(0)} kPa · ${ctx.pumpsRunning}/3 CHWP @ ${ctx.pumpSpeedPct.toFixed(0)}% · ${ctx.pumpPowerKwTotal.toFixed(1)} kW (${ctx.pumpKwPerRt.toFixed(3)} kW/RT)`
  );

  const hxLabel = ctx.hxInService === 1 ? '1 HX online (600 RT)' : '2 HX online (1100 RT)';
  steps.push(
    `Plate HX: ${hxLabel} · load ${(ctx.loadFrac * 100).toFixed(0)}% · approach ${ctx.approachC.toFixed(1)}°C · ε ${(ctx.effectiveness * 100).toFixed(0)}% · LMTD ${ctx.lmtdC.toFixed(1)}°C`
  );

  steps.push(
    `Primary DCS: supply ${ctx.dcsSupplyC.toFixed(1)}°C → DCR ${ctx.dcrC.toFixed(1)}°C · ΔT ${ctx.priDeltaT.toFixed(1)}°C · flow ${ctx.priFlowM3h.toFixed(0)} m³/h`
  );

  if (ctx.ltBypassPct > 0.5) {
    steps.push(
      `LT bypass: CHWRT SP ${ctx.chwrtSp.toFixed(1)}°C → valve ${ctx.ltBypassPct.toFixed(0)}% · ${ctx.ltBypassFlowM3h.toFixed(1)} m³/h`
    );
  }

  steps.push(
    `Energy meter: ${ctx.coolingKw.toFixed(0)} kW · ${ctx.demandRt.toFixed(1)} ton · cumulative from physics tick`
  );

  if (ctx.alertCount > 0) {
    steps.push(`Alarms: ${ctx.alertCount} active from calculated state (approach, ΔT, capacity)`);
  } else {
    steps.push('Alarms: none — operating within design limits');
  }

  return steps;
}
