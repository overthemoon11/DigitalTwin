import type { PlantState } from '../types/plant';
import { alarmSummary } from './alarmEngine';
import { getPlantControls, getSimInternals } from './controlEngine';

function avgRunningChillers(state: PlantState): { load: number; cop: number; count: number } {
  const chillers = ['ch-29-1', 'ch-29-2', 'ch-29-3']
    .map((id) => state.equipment[id])
    .filter((e) => e && e.type === 'chiller' && e.status === 'running');
  if (!chillers.length) return { load: 0, cop: 0, count: 0 };
  const load = chillers.reduce((s, c) => s + (c.type === 'chiller' ? c.loadPercent : 0), 0) / chillers.length;
  const cop = chillers.reduce((s, c) => s + (c.type === 'chiller' ? c.cop : 0), 0) / chillers.length;
  return { load, cop, count: chillers.length };
}

export function analyzePlantQuery(message: string, state: PlantState | null): string | null {
  if (!state) return 'Plant telemetry is not available yet. Wait for the simulation to initialize.';

  const q = message.toLowerCase();
  const controls = getPlantControls();
  const chwsSp = controls.find((c) => c.id === 'ctrl-chws-sp')?.value ?? 7;
  const cwsSp = controls.find((c) => c.id === 'ctrl-cws-sp')?.value ?? 29;
  const { headers, kpis } = state;
  const { load, cop, count } = avgRunningChillers(state);
  const alarms = alarmSummary(state);
  const deltaT = headers.chwr - headers.chws;
  const copKpi = kpis.find((k) => k.id === 'kpi-cop')?.value;
  const kwKpi = kpis.find((k) => k.id === 'kpi-kw')?.value;

  if (q.includes('cop') && (q.includes('low') || q.includes('why'))) {
    const reasons: string[] = [];
    if (headers.cws > cwsSp + 1) {
      reasons.push(`- Condenser water temperature is high (${headers.cws}°C vs setpoint ${cwsSp}°C).`);
    }
    if (headers.ambientTemp > 34) {
      reasons.push(`- Hot outdoor air (${headers.ambientTemp}°C) increases condenser lift.`);
    }
    if (headers.humidityRh > 80) {
      reasons.push(`- High outdoor humidity (${headers.humidityRh}%RH) reduces cooling tower performance.`);
    }
    const ct = state.equipment['ct-41-1'];
    if (ct && ct.type === 'cooling_tower' && ct.fanSpeedPercent < 60) {
      reasons.push(`- Cooling tower fan speed is low (${ct.fanSpeedPercent}%).`);
    }
    if (load > 90) {
      reasons.push(`- Chiller loading exceeds 90% (avg ${load.toFixed(0)}%).`);
    }
    if (deltaT < 4) {
      reasons.push(`- Low delta-T (${deltaT.toFixed(1)}°C) indicates bypass or over-pumping.`);
    }
    if (!reasons.length) {
      reasons.push(`- Plant COP is ${copKpi}. Current operating point appears normal.`);
      reasons.push(`- Average chiller load ${load.toFixed(0)}% across ${count} unit(s).`);
    }
    return `## COP Analysis\n\nPlant COP: **${copKpi}**\n\nPossible factors:\n${reasons.join('\n')}`;
  }

  if (q.includes('save energy') || q.includes('energy') && q.includes('how')) {
    const tips: string[] = [];
    if (chwsSp < 7) {
      tips.push(`- Raise CHWS setpoint from ${chwsSp}°C to 7°C to reduce chiller lift.`);
    }
    if (cwsSp >= 29) {
      tips.push('- Lower condenser water setpoint to improve chiller efficiency (more tower fan kW).');
    }
    if (count > 1 && load < 75) {
      tips.push('- Consider staging down one chiller — load is balanced below 75% per unit.');
    }
    if (deltaT < 4.5) {
      tips.push('- Close bypass valves and reduce CHWP speed to restore delta-T.');
    }
    tips.push(`- Current plant power: **${kwKpi} kW** for **${headers.buildingLoadRt} RT**.`);
    return `## Energy Optimization\n\n${tips.map((t) => `- ${t.slice(2)}`).join('\n')}`;
  }

  if (q.includes('chiller') && (q.includes('stop') || q.includes('which'))) {
    if (count <= 1) {
      return 'Only one chiller is running. Staging down is not recommended at current plant load.';
    }
    const weakest = ['ch-29-1', 'ch-29-2', 'ch-29-3']
      .map((id) => state.equipment[id])
      .filter((e) => e?.type === 'chiller' && e.status === 'running')
      .sort((a, b) => (a.type === 'chiller' && b.type === 'chiller' ? a.loadPercent - b.loadPercent : 0))[0];
    const name = weakest?.name || 'CH-29-3';
    return `## Chiller Sequencing\n\nRecommend staging down **${name}** (lowest load among running units).\n\nPlant load: **${headers.buildingLoadRt} RT** with **${count}** chillers online.`;
  }

  if (q.includes('chws') && (q.includes('high') || q.includes('caused'))) {
    return `## High CHWS Analysis\n\nCHWS: **${headers.chws}°C** (setpoint **${chwsSp}°C**)\n\nLikely causes:\n- Chiller capacity insufficient for **${headers.buildingLoadRt} RT** demand\n- Condenser water elevated at **${headers.cws}°C**\n- Check active alarms: ${alarms.length ? alarms.join(', ') : 'none'}`;
  }

  if (q.includes('alarm') || q.includes('status')) {
    const active = state.alerts.filter((a) => !a.resolved);
    if (!active.length) return '## Plant Status\n\nNo active alarms. All systems operating within setpoints.';
    return `## Active Alarms\n\n${active.map((a) => `- **${a.severity}**: ${a.message}`).join('\n')}\n\n## Key Metrics\n- CHWS ${headers.chws}°C / CHWR ${headers.chwr}°C (ΔT ${deltaT.toFixed(1)}°C)\n- CWS ${headers.cws}°C\n- Plant COP ${copKpi}`;
  }

  if (q.includes('maintenance') || q.includes('predict')) {
    const internals = getSimInternals();
    return `## Predictive Maintenance\n\n- CH-29-3 runtime highest among chillers — inspect condenser approach if CWR- CWS > 4°C\n- Makeup tank level trend: **${internals.tankLevel.toFixed(0)}%**\n- Monitor CHWP-29-4 (typical standby/trip candidate)\n- Delta-T **${deltaT.toFixed(1)}°C** — ${deltaT < 4.5 ? 'investigate hydronics' : 'within expected range'}`;
  }

  return null;
}

export function buildPlantContextForCopilot(state: PlantState | null): string {
  if (!state) return '';
  const { headers, kpis } = state;
  const alarms = alarmSummary(state);
  const sim = state.simulation;
  const cascade = sim?.cascadeTrace?.slice(0, 4).join(' → ') ?? '';
  return [
    'Chiller Plant Virtual Simulator Context (physics-calculated, no live sensors):',
    sim ? `Mode: ${sim.mode}, tick ${sim.tick}, last: ${sim.lastTrigger}` : '',
    `Load ${headers.buildingLoadRt} RT, CHWS ${headers.chws}°C, CHWR ${headers.chwr}°C`,
    `Outdoor ${headers.ambientTemp}°C / ${headers.humidityRh}%RH`,
    `CWS ${headers.cws}°C, CWR ${headers.cwr}°C`,
    `KPIs: ${kpis.slice(0, 4).map((k) => `${k.name}=${k.value}${k.unit}`).join(', ')}`,
    cascade ? `Cascade: ${cascade}` : '',
    alarms.length ? `Alarms: ${alarms.join('; ')}` : 'No active alarms',
  ]
    .filter(Boolean)
    .join('\n');
}
