/**
 * Parse chatbot messages for L29 Chiller Plant scenario runs and control changes.
 */
import { CHILLER_SCENARIOS, getChillerScenarioById } from './chillerScenarios.js';

/**
 * @typedef {{
 *   controlId: string;
 *   label: string;
 *   oldValue: number;
 *   newValue: number;
 *   unit: string;
 * }} AppliedChillerControl
 */

/**
 * @typedef {{
 *   applied: AppliedChillerControl[];
 *   errors: string[];
 *   scenarioId: string | null;
 *   scenarioPayload: object | null;
 * }} ChillerCopilotParseResult
 */

function getByType(controls, controlType) {
  return controls.find((c) => c.controlType === controlType);
}

function snapToStep(value, control) {
  const step = control.step || 1;
  const snapped = Math.round(value / step) * step;
  return Math.min(control.max, Math.max(control.min, snapped));
}

function queueChange(pending, controls, controlType, newValue) {
  const ctrl = getByType(controls, controlType);
  if (!ctrl || typeof ctrl.value !== 'number') return;

  const snapped = snapToStep(newValue, ctrl);
  const existing = pending.get(ctrl.id);
  const oldValue = existing?.oldValue ?? ctrl.value;
  if (snapped === oldValue) return;

  pending.set(ctrl.id, {
    controlId: ctrl.id,
    label: ctrl.label,
    oldValue,
    newValue: snapped,
    unit: ctrl.unit,
  });
}

function tryParseScenarioJson(message) {
  const start = message.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < message.length; i++) {
    if (message[i] === '{') depth += 1;
    if (message[i] === '}') depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(message.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const SCENARIO_ALIASES = [
  { id: 'peak-summer', patterns: [/peak\s*-?\s*summer/i, /peak\s+summer\s+afternoon/i] },
  { id: 'night-low-load', patterns: [/night\s+low\s+load/i, /night\s*setback/i, /low\s+load\s+night/i] },
  { id: 'aggressive-chws', patterns: [/aggressive\s+chws/i, /tight\s+chws/i, /low\s+chws\s+reset/i] },
  { id: 'high-header-dp', patterns: [/high\s+(?:header\s+)?dp/i, /aggressive\s+dp/i] },
  { id: 'humid-monsoon', patterns: [/humid\s+monsoon/i, /monsoon/i, /high\s+humidity\s+day/i] },
  { id: 'condenser-stress', patterns: [/condenser\s+stress/i, /condenser\s+loop\s+stress/i, /hot\s+condenser/i] },
  { id: 'part-load-tune', patterns: [/part\s*-?\s*load/i, /shoulder\s+season/i] },
  { id: 'baseline', patterns: [/design\s+baseline/i, /reset\s+baseline/i, /\bbaseline\b/i] },
];

function matchScenarioByText(text) {
  for (const { id, patterns } of SCENARIO_ALIASES) {
    if (patterns.some((p) => p.test(text))) return id;
  }
  for (const sc of CHILLER_SCENARIOS) {
    const slug = sc.id.replace(/-/g, ' ');
    if (text.includes(sc.id) || text.includes(slug) || text.includes(sc.label.toLowerCase())) {
      return sc.id;
    }
  }
  return null;
}

/**
 * @param {string} message
 * @param {import('../types/plant').PlantControl[]} controls
 * @returns {ChillerCopilotParseResult}
 */
export function parseChillerCopilotIntents(message, controls) {
  const pending = new Map();
  const errors = [];
  const text = message.trim();
  const lower = text.toLowerCase();

  const json = tryParseScenarioJson(text);
  if (json && typeof json === 'object') {
    if (json.id && getChillerScenarioById(json.id)) {
      return { applied: [], errors, scenarioId: json.id, scenarioPayload: null };
    }
    if (json.controls || json.reset) {
      return {
        applied: [],
        errors,
        scenarioId: null,
        scenarioPayload: {
          id: json.id || 'chatbot-custom',
          label: json.label || 'Custom scenario (chatbot)',
          description: json.description,
          controls: json.controls,
          reset: !!json.reset,
          advanceSec: typeof json.advanceSec === 'number' ? json.advanceSec : 60,
        },
      };
    }
    if (json.id) {
      errors.push(`Unknown scenario id "${json.id}". Known: ${CHILLER_SCENARIOS.map((s) => s.id).join(', ')}`);
    }
  }

  const wantsScenario =
    /\b(run|apply|load|simulate|switch\s+to|use|start|trigger)\b/i.test(text)
    || /\bscenario\b/i.test(text)
    || (json && json.id);

  if (wantsScenario || /\b(peak|baseline|monsoon|condenser|shoulder)\b/i.test(lower)) {
    const scenarioId = matchScenarioByText(lower);
    if (scenarioId) {
      return { applied: [], errors, scenarioId, scenarioPayload: null };
    }
    if (/\bscenario\b/i.test(lower) && !json) {
      errors.push(
        'Could not match a preset scenario — try "run peak summer scenario" or paste scenario JSON with an id.'
      );
    }
  }

  const loadCtrl = getByType(controls, 'buildingLoad');
  if (loadCtrl) {
    let m = text.match(
      /\b(?:set|change|adjust|move)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (!m) m = text.match(/\b(?:building\s+)?(?:cooling\s+)?load\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*rt\b/i);
    if (!m) m = text.match(/\bload\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*rt\b/i);
    if (m) queueChange(pending, controls, 'buildingLoad', parseFloat(m[1]));

    m = text.match(
      /\b(increase|raise|boost)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (m) {
      const current = pending.get(loadCtrl.id)?.newValue ?? loadCtrl.value;
      queueChange(pending, controls, 'buildingLoad', current + parseFloat(m[2]));
    }

    m = text.match(
      /\b(decrease|lower|reduce|drop)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (m) {
      const current = pending.get(loadCtrl.id)?.newValue ?? loadCtrl.value;
      queueChange(pending, controls, 'buildingLoad', current - parseFloat(m[2]));
    }
  }

  const ambCtrl = getByType(controls, 'ambientTemperature');
  if (ambCtrl) {
    let m = text.match(
      /\b(?:set|change|adjust|move)\s+(?:the\s+)?(?:outdoor|ambient|outside|oat)\s+(?:air\s+)?(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (!m) {
      m = text.match(
        /\b(?:outdoor|ambient|outside)\s+temp(?:erature)?\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
      );
    }
    if (m) queueChange(pending, controls, 'ambientTemperature', parseFloat(m[1]));
  }

  const humCtrl = getByType(controls, 'humiditySetpoint');
  if (humCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:outdoor\s+)?humidity\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?\s*(?:rh)?\b/i
    );
    if (m) queueChange(pending, controls, 'humiditySetpoint', parseFloat(m[1]));
  }

  const chwsCtrl = getByType(controls, 'chwsSetpoint');
  if (chwsCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:chws|chilled\s+water\s+supply)\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwsSetpoint', parseFloat(m[1]));
  }

  const chwrCtrl = getByType(controls, 'chwrSetpoint');
  if (chwrCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:chwr|chilled\s+water\s+return)\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwrSetpoint', parseFloat(m[1]));
  }

  const cwsCtrl = getByType(controls, 'cwsSetpoint');
  if (cwsCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?cws\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'cwsSetpoint', parseFloat(m[1]));
  }

  const cwrCtrl = getByType(controls, 'cwrSetpoint');
  if (cwrCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?cwr\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'cwrSetpoint', parseFloat(m[1]));
  }

  const dpCtrl = getByType(controls, 'differentialPressureSetpoint');
  if (dpCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:header\s+)?dp\s*(?:setpoint|sp)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:psi)?\b/i
    );
    if (m) queueChange(pending, controls, 'differentialPressureSetpoint', parseFloat(m[1]));
  }

  const ctCtrl = getByType(controls, 'coolingTowerFanOverride');
  if (ctCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:cooling\s+tower\s+)?(?:ct\s+)?fan\s*(?:override|speed)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?\b/i
    );
    if (m) queueChange(pending, controls, 'coolingTowerFanOverride', parseFloat(m[1]));
  }

  const pumpCtrl = getByType(controls, 'pumpSpeedOverride');
  if (pumpCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?pump\s+speed\s*(?:override)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?\b/i
    );
    if (m) queueChange(pending, controls, 'pumpSpeedOverride', parseFloat(m[1]));
  }

  if (/\b(enable|start)\s+chillers?\b/i.test(text)) {
    queueChange(pending, controls, 'chillerEnable', 1);
  } else if (/\b(disable|stop)\s+chillers?\b/i.test(text)) {
    queueChange(pending, controls, 'chillerEnable', 0);
  }

  if (
    /\b(set|change|adjust|increase|decrease|raise|lower)\b/i.test(text)
    && pending.size === 0
    && !errors.length
    && /\b(load|temp|humidity|chws|chwr|cws|cwr|dp|fan|pump|scenario)\b/i.test(lower)
  ) {
    errors.push(
      'Could not parse plant control — try "run peak summer scenario", paste scenario JSON, or "set building load to 1300 RT".'
    );
  }

  return {
    applied: [...pending.values()],
    errors,
    scenarioId: null,
    scenarioPayload: null,
  };
}

/** @param {AppliedChillerControl[]} applied */
export function formatChillerControlConfirmation(applied) {
  if (!applied.length) return '';
  const lines = applied.map(
    (a) => `- **${a.label}:** ${a.oldValue} → **${a.newValue}** ${a.unit}`
  );
  return `## Chiller Plant Controls Updated\n\n${lines.join('\n')}\n\nPlant simulation recalculated.`;
}

/** @param {string} scenarioId */
export function formatChillerScenarioConfirmation(scenarioId) {
  const sc = getChillerScenarioById(scenarioId);
  if (!sc) return `## Chiller Scenario Applied\n\nScenario **${scenarioId}** loaded.`;
  return `## Chiller Scenario Applied\n\n**${sc.label}** — ${sc.description}${sc.advanceSec ? ` (fast-forward ${sc.advanceSec}s virtual)` : ''}`;
}

/** @param {{ label?: string; description?: string; advanceSec?: number }} payload */
export function formatChillerCustomScenarioConfirmation(payload) {
  const label = payload.label || 'Custom scenario';
  const desc = payload.description ? ` — ${payload.description}` : '';
  const adv = payload.advanceSec ? ` (fast-forward ${payload.advanceSec}s virtual)` : '';
  return `## Chiller Scenario Applied\n\n**${label}**${desc}${adv}`;
}

/** @param {import('../types/plant').PlantState | null} state */
export function buildChillerContextForCopilot(state) {
  if (!state) return '';
  const { headers, simulation, alerts, kpis } = state;
  const cascade = simulation?.cascadeTrace?.slice(0, 3).join(' → ') ?? '';
  const copKpi = kpis?.find((k) => k.id === 'kpi-cop')?.value;
  const kwRtKpi = kpis?.find((k) => k.id === 'kpi-eff')?.value;
  return [
    'L29 Chiller Plant Virtual Simulator (physics-calculated, no live sensors):',
    simulation ? `Mode: ${simulation.mode}, tick ${simulation.tick}, last: ${simulation.lastTrigger}` : '',
    simulation?.scenarioId ? `Active scenario: ${simulation.scenarioId}` : '',
    `Load ${headers.buildingLoadRt} RT · CHWS/CHWR ${headers.chws}/${headers.chwr}°C · CWS/CWR ${headers.cws}/${headers.cwr}°C`,
    `OAT ${headers.ambientTemp}°C / ${headers.humidityRh}%RH · Plant COP ${copKpi ?? '—'} · kW/RT ${kwRtKpi ?? '—'}`,
    cascade ? `Cascade: ${cascade}` : '',
    alerts?.filter((a) => !a.resolved).length
      ? `Alarms: ${alerts.filter((a) => !a.resolved).map((a) => a.message).join('; ')}`
      : 'No active alarms',
    `Preset scenarios: ${CHILLER_SCENARIOS.map((s) => s.id).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {import('../types/plant').PlantControl[]} controls */
export function buildChillerControlsSummary(controls) {
  return controls
    .filter((c) => typeof c.value === 'number')
    .map((c) => ({
      id: c.id,
      label: c.label,
      controlType: c.controlType,
      value: c.value,
      min: c.min,
      max: c.max,
      unit: c.unit,
    }));
}

function formatChillerAlertBlock(alerts) {
  const active = alerts?.filter((a) => !a.resolved) ?? [];
  if (!active.length) return 'No active plant alerts.';
  return active
    .map((a) => {
      let block = `- **${a.severity}:** ${a.message}`;
      if (a.recommendedAdjustments?.length) {
        block += '\n  Recommended:';
        for (const adj of a.recommendedAdjustments) {
          block += `\n  - ${adj.label}: **${adj.suggestedValue}** ${adj.unit || ''} (now ${adj.currentValue})`;
        }
      } else if (a.recommendedAction) {
        block += `\n  → ${a.recommendedAction}`;
      }
      return block;
    })
    .join('\n');
}

/** @param {import('../types/plant').PlantState | null} state */
export function buildChillerChatSuggestions(state) {
  if (!state) return [];
  /** @type {{ id: string; label: string; prompt: string; priority: string }[]} */
  const suggestions = [];
  const activeAlerts = state.alerts?.filter((a) => !a.resolved) ?? [];

  if (activeAlerts.length > 0) {
    suggestions.push({
      id: 'review_alerts',
      label: `Review ${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}`,
      prompt: 'show active alarms',
      priority: 'high',
    });
  }

  const kwRtKpi = state.kpis?.find((k) => k.id === 'kpi-eff');
  const copKpi = state.kpis?.find((k) => k.id === 'kpi-cop');
  if (kwRtKpi?.status === 'warning' || kwRtKpi?.status === 'critical') {
    suggestions.push({
      id: 'kw_rt',
      label: 'Plant kW/RT elevated',
      prompt: 'how can we save energy?',
      priority: 'medium',
    });
  }
  if (copKpi?.status === 'warning' && !suggestions.some((s) => s.id === 'review_alerts')) {
    suggestions.push({
      id: 'cop_low',
      label: 'Plant COP low',
      prompt: 'why is plant COP low?',
      priority: 'medium',
    });
  }

  suggestions.push({
    id: 'peak_summer',
    label: 'Run peak summer',
    prompt: 'run peak summer scenario',
    priority: 'low',
  });

  suggestions.push({
    id: 'status',
    label: 'Plant status summary',
    prompt: 'give me a plant status summary',
    priority: 'low',
  });

  return suggestions.slice(0, 5);
}

/** @param {string} message @param {import('../types/plant').PlantState | null} state */
export function analyzeChillerQuery(message, state) {
  if (!state) return 'Plant telemetry is not available yet. Wait for the simulation to initialize.';

  const q = message.toLowerCase();

  if (
    /\b(run|apply|simulate|trigger)\b.*\bscenario\b/i.test(q)
    || /\bset\b.*\b(load|temp|humidity|chws|chwr|cws|cwr|dp|fan)\b/i.test(q)
  ) {
    return null;
  }

  const { headers, kpis, alerts, simulation } = state;
  const deltaT = headers.chwr - headers.chws;
  const copKpi = kpis.find((k) => k.id === 'kpi-cop')?.value;
  const kwKpi = kpis.find((k) => k.id === 'kpi-kw')?.value;

  if (q.includes('alarm') || q.includes('alert')) {
    return `## Active Alerts\n\n${formatChillerAlertBlock(alerts)}`;
  }

  if (q.includes('summary') || (q.includes('status') && !q.includes('chws'))) {
    const activeCount = alerts?.filter((a) => !a.resolved).length ?? 0;
    return [
      '## Plant Status Summary',
      '',
      `- **Load:** ${headers.buildingLoadRt} RT · **CHWS/CHWR:** ${headers.chws}/${headers.chwr}°C (ΔT ${deltaT.toFixed(1)}°C)`,
      `- **CWS/CWR:** ${headers.cws}/${headers.cwr}°C · **OAT:** ${headers.ambientTemp}°C / ${headers.humidityRh}%RH`,
      `- **Plant COP:** ${copKpi} · **Total kW:** ${kwKpi}`,
      `- **Active alerts:** ${activeCount}`,
      simulation?.lastTrigger ? `- **Last change:** ${simulation.lastTrigger}` : '',
      simulation?.scenarioId ? `- **Scenario:** ${simulation.scenarioId}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (q.includes('cop') && (q.includes('low') || q.includes('why'))) {
    const reasons = [];
    if (headers.cws > 31) reasons.push(`- Condenser water elevated (${headers.cws}°C).`);
    if (headers.ambientTemp > 34) reasons.push(`- Hot outdoor air (${headers.ambientTemp}°C).`);
    if (headers.humidityRh > 80) reasons.push(`- High humidity (${headers.humidityRh}%RH).`);
    if (deltaT < 4) reasons.push(`- Low delta-T (${deltaT.toFixed(1)}°C) — bypass or over-pumping.`);
    if (!reasons.length) {
      reasons.push(`- Plant COP is ${copKpi}. Operating point appears normal for ${headers.buildingLoadRt} RT.`);
    }
    return `## COP Analysis\n\nPlant COP: **${copKpi}**\n\nPossible factors:\n${reasons.join('\n')}`;
  }

  if (q.includes('save energy') || (q.includes('energy') && q.includes('how'))) {
    const tips = [
      '- Raise CHWS setpoint toward 7.5°C if zone loads allow',
      '- Reduce header DP setpoint if bypass valve is open',
      '- Stage down chillers when per-unit load is below 75%',
      `- Current plant power: **${kwKpi} kW** for **${headers.buildingLoadRt} RT**`,
    ];
    return `## Energy Optimization\n\n${tips.join('\n')}`;
  }

  if (q.includes('chiller') && (q.includes('stop') || q.includes('which'))) {
    const running = ['ch-29-1', 'ch-29-2', 'ch-29-3']
      .map((id) => state.equipment[id])
      .filter((e) => e?.type === 'chiller' && e.status === 'running');
    if (running.length <= 1) {
      return 'Only one chiller is running. Staging down is not recommended at current plant load.';
    }
    const weakest = [...running].sort((a, b) =>
      a.type === 'chiller' && b.type === 'chiller' ? a.loadPercent - b.loadPercent : 0
    )[0];
    return `## Chiller Sequencing\n\nRecommend staging down **${weakest?.name || 'CH-29-3'}** (lowest load among running units).\n\nPlant load: **${headers.buildingLoadRt} RT** with **${running.length}** chillers online.`;
  }

  if (q.includes('chws') && (q.includes('high') || q.includes('caused'))) {
    const chwsAlert = alerts?.find((a) => !a.resolved && a.id === 'alm-chws-high');
    let extra = '';
    if (chwsAlert?.recommendedAdjustments?.length) {
      extra = '\n\n**Recommended adjustments:**\n';
      for (const adj of chwsAlert.recommendedAdjustments) {
        extra += `- ${adj.label}: **${adj.suggestedValue}** ${adj.unit || ''} (now ${adj.currentValue})\n`;
      }
    }
    return `## High CHWS Analysis\n\nCHWS: **${headers.chws}°C** · Load **${headers.buildingLoadRt} RT** · CWS **${headers.cws}°C**${extra}`;
  }

  if (q.includes('scenario') || q.includes('simulate')) {
    return `## Chiller Scenarios\n\nSay **"run peak summer scenario"** or paste preset JSON (with \`id: "peak-summer"\`).\n\nAvailable: ${CHILLER_SCENARIOS.map((s) => `**${s.id}** — ${s.label}`).join('\n')}`;
  }

  if (q.includes('maintenance') || q.includes('predict')) {
    return `## Predictive Maintenance\n\n- Monitor condenser approach on running towers\n- Makeup tank level trend — verify CWMUP lead/lag\n- Delta-T **${deltaT.toFixed(1)}°C** — ${deltaT < 4.5 ? 'investigate bypass / pump speed' : 'within expected range'}`;
  }

  return null;
}

// Back-compat aliases used by older imports
export const parsePlantControlIntents = parseChillerCopilotIntents;
export const formatPlantControlConfirmation = formatChillerControlConfirmation;
export const buildPlantControlsSummary = buildChillerControlsSummary;
export const buildPlantContextForCopilot = buildChillerContextForCopilot;
export const analyzePlantQuery = analyzeChillerQuery;
