/**
 * Parse chatbot messages for AHU01 scenario runs and control changes.
 */
import { AHU_SCENARIOS, getAhuScenarioById } from './ahuScenarios.js';

/**
 * @typedef {{
 *   controlId: string;
 *   label: string;
 *   oldValue: number;
 *   newValue: number;
 *   unit: string;
 * }} AppliedAhuControl
 */

/**
 * @typedef {{
 *   applied: AppliedAhuControl[];
 *   errors: string[];
 *   scenarioId: string | null;
 *   scenarioPayload: object | null;
 * }} AhuCopilotParseResult
 */

function getByType(controls, controlType) {
  return controls.find((c) => c.controlType === controlType);
}

function getById(controls, controlId) {
  return controls.find((c) => c.id === controlId);
}

function snapToStep(value, control) {
  const step = control.step || 1;
  const snapped = Math.round(value / step) * step;
  return Math.min(control.max, Math.max(control.min, snapped));
}

function queueChange(pending, controls, controlType, newValue) {
  const ctrl = getByType(controls, controlType);
  if (!ctrl || typeof ctrl.value !== 'number') return;
  queueChangeById(pending, controls, ctrl.id, newValue);
}

function queueChangeById(pending, controls, controlId, newValue) {
  const ctrl = getById(controls, controlId);
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
  { id: 'baseline', patterns: [/bms\s+baseline/i, /reset\s+baseline/i, /\bbaseline\b/i] },
  { id: 'high-humidity', patterns: [/high\s+(?:room\s+)?humidity/i, /humid(?:ity)?\s+room/i] },
  { id: 'economizer', patterns: [/economizer/i, /free\s+cool/i] },
  { id: 'dirty-filter', patterns: [/dirty\s+filter/i, /loaded\s+filter/i, /filter\s+load/i] },
  { id: 'heating-morning', patterns: [/heating\s+morning/i, /morning\s+heat/i] },
  { id: 'sa-overvent', patterns: [/over\s*vent/i, /sa\s+over/i, /over\s+ventilation/i] },
];

function matchScenarioByText(text) {
  for (const { id, patterns } of SCENARIO_ALIASES) {
    if (patterns.some((p) => p.test(text))) return id;
  }
  for (const sc of AHU_SCENARIOS) {
    const slug = sc.id.replace(/-/g, ' ');
    if (text.includes(sc.id) || text.includes(slug) || text.includes(sc.label.toLowerCase())) {
      return sc.id;
    }
  }
  return null;
}

/**
 * @param {string} message
 * @param {import('../../types/ahu').AhuControl[]} controls
 * @returns {AhuCopilotParseResult}
 */
export function parseAhuCopilotIntents(message, controls) {
  const pending = new Map();
  const errors = [];
  const text = message.trim();
  const lower = text.toLowerCase();

  const json = tryParseScenarioJson(text);
  if (json && typeof json === 'object') {
    if (json.id && getAhuScenarioById(json.id)) {
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
      errors.push(`Unknown scenario id "${json.id}". Known: ${AHU_SCENARIOS.map((s) => s.id).join(', ')}`);
    }
  }

  const wantsScenario =
    /\b(run|apply|load|simulate|switch\s+to|use|start|trigger)\b/i.test(text)
    || /\bscenario\b/i.test(text)
    || (json && json.id);

  if (wantsScenario || /\b(baseline|economizer|humidity|dirty\s+filter|heating)\b/i.test(lower)) {
    const scenarioId = matchScenarioByText(lower);
    if (scenarioId) {
      return { applied: [], errors, scenarioId, scenarioPayload: null };
    }
    if (/\bscenario\b/i.test(lower) && !json) {
      errors.push('Could not match a preset scenario — try "run high humidity scenario" or paste scenario JSON with an id.');
    }
  }

  const zoneCtrl = getByType(controls, 'zoneLoad');
  if (zoneCtrl) {
    let m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?zone\s+load\s*(?:index)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\b/i
    );
    if (m) queueChange(pending, controls, 'zoneLoad', parseFloat(m[1]));
  }

  const satCtrl = getByType(controls, 'satSetpoint');
  if (satCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?sat\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'satSetpoint', parseFloat(m[1]));
  }

  const saCfmCtrl = getByType(controls, 'saCfmSetpoint');
  if (saCfmCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?sa\s*(?:airflow|cfm)\s*(?:setpoint|sp)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:cfm)?\b/i
    );
    if (m) queueChange(pending, controls, 'saCfmSetpoint', parseFloat(m[1]));
  }

  const raCfmCtrl = getByType(controls, 'raCfmSetpoint');
  if (raCfmCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?ra\s*(?:airflow|cfm)\s*(?:setpoint|sp)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:cfm)?\b/i
    );
    if (m) queueChange(pending, controls, 'raCfmSetpoint', parseFloat(m[1]));
  }

  const spCtrl = getByType(controls, 'staticPressure');
  if (spCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:static\s+pressure|duct\s+sp)\s*(?:setpoint|sp)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:pa)?\b/i
    );
    if (m) queueChange(pending, controls, 'staticPressure', parseFloat(m[1]));
  }

  const chwCtrl = getByType(controls, 'chwEntering');
  if (chwCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?chw\s*(?:entering|supply)\s*(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwEntering', parseFloat(m[1]));
  }

  const oatCtrl = getByType(controls, 'ambientTemperature');
  if (oatCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:outdoor|ambient|oat)\s*(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'ambientTemperature', parseFloat(m[1]));
  }

  const filterCtrl = getByType(controls, 'filterLoading');
  if (filterCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?filter\s+load(?:ing)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:%)?\b/i
    );
    if (m) queueChange(pending, controls, 'filterLoading', parseFloat(m[1]));
  }

  const modeCtrl = getByType(controls, 'mode');
  if (modeCtrl) {
    if (/\b(?:set|switch\s+to|enable)\s+(?:the\s+)?economizer\s+mode\b/i.test(text)) {
      queueChange(pending, controls, 'mode', 2);
    } else if (/\b(?:set|switch\s+to|enable)\s+(?:the\s+)?heating\s+mode\b/i.test(text)) {
      queueChange(pending, controls, 'mode', 3);
    } else if (/\b(?:set|switch\s+to|enable)\s+(?:the\s+)?(?:recirculation|minimum\s+oa)\s+mode\b/i.test(text)) {
      queueChange(pending, controls, 'mode', 0);
    }
  }

  const idMatch = text.match(/\b(?:set|change|adjust)\s+(ahu-[a-z0-9-]+)\s+(?:to\s+)?(\d+(?:\.\d+)?)\b/i);
  if (idMatch) {
    queueChangeById(pending, controls, idMatch[1], parseFloat(idMatch[2]));
  }

  if (
    /\b(set|change|adjust)\b/i.test(text)
    && pending.size === 0
    && !errors.length
    && /\b(sat|cfm|load|temp|filter|scenario|chw|pressure|mode)\b/i.test(lower)
  ) {
    errors.push(
      'Could not parse AHU control — try "run high humidity scenario", paste scenario JSON, or "set zone load to 1.35".'
    );
  }

  return {
    applied: [...pending.values()],
    errors,
    scenarioId: null,
    scenarioPayload: null,
  };
}

/** @param {AppliedAhuControl[]} applied */
export function formatAhuControlConfirmation(applied) {
  if (!applied.length) return '';
  const lines = applied.map(
    (a) => `- **${a.label}:** ${a.oldValue} → **${a.newValue}** ${a.unit}`
  );
  return `## AHU01 Controls Updated\n\n${lines.join('\n')}\n\nAHU simulation recalculated.`;
}

/** @param {string} scenarioId */
export function formatAhuScenarioConfirmation(scenarioId) {
  const sc = getAhuScenarioById(scenarioId);
  if (!sc) return `## AHU01 Scenario Applied\n\nScenario **${scenarioId}** loaded.`;
  return `## AHU01 Scenario Applied\n\n**${sc.label}** — ${sc.description}${sc.advanceSec ? ` (fast-forward ${sc.advanceSec}s virtual)` : ''}`;
}

/** @param {{ label?: string; description?: string; advanceSec?: number }} payload */
export function formatAhuCustomScenarioConfirmation(payload) {
  const label = payload.label || 'Custom scenario';
  const desc = payload.description ? ` — ${payload.description}` : '';
  const adv = payload.advanceSec ? ` (fast-forward ${payload.advanceSec}s virtual)` : '';
  return `## AHU01 Scenario Applied\n\n**${label}**${desc}${adv}`;
}

/** @param {import('../../types/ahu').AhuState | null} state */
export function buildAhuContextForCopilot(state) {
  if (!state) return '';
  const { headers, simulation, alerts, recommendedActions, chwCoil } = state;
  const cascade = simulation?.cascadeTrace?.slice(0, 3).join(' → ') ?? '';
  return [
    'AHU01 (1F) Virtual Simulator (physics-calculated airside):',
    simulation ? `Mode: ${simulation.mode}, tick ${simulation.tick}, last: ${simulation.lastTrigger}` : '',
    `RA ${headers.ratC}°C / ${headers.raRhPct}%RH · SAT ${headers.satC}°C · MAT ${headers.matC}°C`,
    `SA/RA ${headers.saCfm}/${headers.raCfm} CFM · SP ${headers.staticPressurePa} Pa · OA ${(headers.oaFraction * 100).toFixed(0)}%`,
    `CHW valve ${chwCoil?.valvePct ?? '?'}% · cooling ${headers.coolingKw} kW · fan ${headers.fanPowerKw} kW`,
    cascade ? `Cascade: ${cascade}` : '',
    alerts?.filter((a) => !a.resolved).length
      ? `Alarms: ${alerts.filter((a) => !a.resolved).map((a) => a.message).join('; ')}`
      : 'No active alarms',
    recommendedActions?.[0] ? `Hint: ${recommendedActions[0]}` : '',
    `Preset scenarios: ${AHU_SCENARIOS.map((s) => s.id).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {import('../../types/ahu').AhuState | null} state */
export function buildAhuChatSuggestions(state) {
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

  const fanKpi = state.kpis?.find((k) => k.id === 'ahu-kpi-fan');
  const kwCfmKpi = state.kpis?.find((k) => k.id === 'ahu-kpi-kw-cfm');
  if (fanKpi?.status === 'warning' || kwCfmKpi?.status === 'warning') {
    suggestions.push({
      id: 'energy_high',
      label: 'Fan energy is high',
      prompt: 'how can I reduce fan energy on AHU01?',
      priority: 'medium',
    });
  }

  const chwKpi = state.kpis?.find((k) => k.id === 'ahu-kpi-chw');
  if (chwKpi?.status === 'warning') {
    suggestions.push({
      id: 'chw_sat',
      label: 'CHW valve near limit',
      prompt: 'show active alarms',
      priority: 'high',
    });
  }

  suggestions.push({
    id: 'status',
    label: 'AHU status summary',
    prompt: 'give me an AHU status summary',
    priority: 'low',
  });

  suggestions.push({
    id: 'optimize',
    label: 'Optimization recommendations',
    prompt: 'what should I optimize on AHU01?',
    priority: 'low',
  });

  return suggestions.slice(0, 5);
}

function formatAlertBlock(alerts) {
  const active = alerts?.filter((a) => !a.resolved) ?? [];
  if (!active.length) return 'No active AHU01 alerts.';
  return active.map((a) => {
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
  }).join('\n');
}

/** @param {string} message @param {import('../../types/ahu').AhuState | null} state */
export function analyzeAhuQuery(message, state) {
  if (!state) return 'AHU01 telemetry is not available yet. Wait for the simulation to initialize.';
  const q = message.toLowerCase();

  // Command messages — handled by parseAhuCopilotIntents / scenario runner
  if (
    /\b(run|apply|simulate|trigger)\b.*\bscenario\b/i.test(q)
    || /\bset\b.*\b(zone|sat|cfm|load|filter|chw|pressure|mode)\b/i.test(q)
  ) {
    return null;
  }

  const { headers, alerts, chwCoil, recommendedActions, simulation } = state;

  if (q.includes('alarm') || q.includes('alert')) {
    return `## Active Alerts\n\n${formatAlertBlock(alerts)}`;
  }

  if (q.includes('summary') || q.includes('status') || q.includes('building')) {
    const activeCount = alerts?.filter((a) => !a.resolved).length ?? 0;
    return [
      '## AHU01 Status Summary',
      '',
      `- **Mode:** ${headers.mode} · **RA:** ${headers.ratC}°C / ${headers.raRhPct}%RH`,
      `- **SAT / MAT:** ${headers.satC}°C / ${headers.matC}°C`,
      `- **SA / RA CFM:** ${headers.saCfm} / ${headers.raCfm} · **Static:** ${headers.staticPressurePa} Pa`,
      `- **CHW valve:** ${chwCoil?.valvePct ?? '?'}% · **Cooling:** ${headers.coolingKw} kW · **Fan:** ${headers.fanPowerKw} kW`,
      `- **Active alerts:** ${activeCount}`,
      simulation?.lastTrigger ? `- **Last change:** ${simulation.lastTrigger}` : '',
      recommendedActions?.[0] ? `\n**Hint:** ${recommendedActions[0]}` : '',
    ].filter(Boolean).join('\n');
  }

  if (q.includes('energy') || q.includes('reduce') || q.includes('optim') || q.includes('save')) {
    const tips = [
      `- Fan power **${headers.fanPowerKw} kW** — trim **SA Airflow SP** or replace loaded filters`,
      `- CHW valve **${chwCoil?.valvePct ?? '?'}%** — if saturated, lower **CHW Entering Temp** or ease **SAT Setpoint**`,
      `- Static **${headers.staticPressurePa} Pa** — reduce **Static Pressure SP** if SA fan is maxed`,
    ];
    if (recommendedActions?.length) {
      tips.push(`- ${recommendedActions[0]}`);
    }
    return `## AHU01 Optimization\n\n${tips.join('\n')}`;
  }

  if (q.includes('approach') || q.includes('coil') || q.includes('chw')) {
    return `## CHW Coil\n\nCHW valve **${chwCoil?.valvePct ?? '?'}%** · SAT **${headers.satC}°C** · cooling duty **${headers.coolingKw} kW**.`;
  }
  if (q.includes('cfm') || q.includes('airflow') || q.includes('fan')) {
    return `## Airflow\n\nSA **${headers.saCfm} CFM** · RA **${headers.raCfm} CFM** · fan power **${headers.fanPowerKw} kW** · static **${headers.staticPressurePa} Pa**.`;
  }
  if (q.includes('scenario') || q.includes('simulate')) {
    return `## AHU01 Scenarios\n\nSay **"run high humidity scenario"** or paste preset JSON (with \`"id": "high-humidity"\`).\n\nAvailable: ${AHU_SCENARIOS.map((s) => `**${s.id}** — ${s.label}`).join('\n')}`;
  }
  return null;
}

/** @param {import('../../types/ahu').AhuControl[]} controls */
export function buildAhuControlsSummary(controls) {
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
