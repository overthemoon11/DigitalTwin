/**
 * AHU01 domino-effect trace for virtual simulator UI.
 */
export function buildAhuCascadeTrace(ctx) {
  const steps = [];
  if (ctx.trigger) steps.push(`▶ ${ctx.trigger}`);
  steps.push(
    `Mode ${ctx.mode.toUpperCase()} · OAT ${ctx.oatC}°C/${ctx.oaRhPct}%RH → OA fraction ${(ctx.oaFraction * 100).toFixed(0)}%`
  );
  steps.push(
    `Return air RA ${ctx.ratC}°C/${ctx.raRhPct}%RH (SP ${ctx.raTempSpC}°C / ${ctx.raRhSpPct}%RH) → mixed MAT ${ctx.matC}°C`
  );
  steps.push(
    `Coils: CHW valve ${ctx.chwValvePct}% · HW valve ${ctx.hwValvePct}% → SAT ${ctx.satC}°C (SP ${ctx.satSpC}°C)`
  );
  steps.push(
    `SA fan ${ctx.saFanSpeedPct}% · RA fan ${ctx.raFanSpeedPct}% → ${ctx.saCfm} CFM supply / ${ctx.raCfm} CFM return (SP ${ctx.saCfmSp}/${ctx.raCfmSp} CFM)`
  );
  steps.push(
    `Static ${ctx.staticPressurePa} Pa · cooling ${ctx.coolingKw} kW · fan power ${ctx.fanPowerKw} kW`
  );
  steps.push(
    `Dampers OA ${ctx.oaDamperPct}% / RA ${ctx.raDamperPct}% · filter DP ${ctx.filterDpPa} Pa`
  );
  if (ctx.alertCount > 0) {
    steps.push(`Alarms: ${ctx.alertCount} active from calculated state`);
  } else {
    steps.push('Alarms: none — operating within setpoint bands');
  }
  return steps;
}
