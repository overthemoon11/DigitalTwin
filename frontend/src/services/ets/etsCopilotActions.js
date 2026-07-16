/**
 * Parse chatbot messages for ETS A-B03-01 scenario runs and control changes.
 */
import { ETS_SCENARIOS, getEtsScenarioById } from './etsScenarios.js';

/**
 * @typedef {{
 *   controlId: string;
 *   label: string;
 *   oldValue: number;
 *   newValue: number;
 *   unit: string;
 * }} AppliedEtsControl
 */

/**
 * @typedef {{
 *   applied: AppliedEtsControl[];
 *   errors: string[];
 *   scenarioId: string | null;
 *   scenarioPayload: object | null;
 * }} EtsCopilotParseResult
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
  { id: 'night-setback', patterns: [/night\s*setback/i, /unoccupied\s+night/i] },
  { id: 'single-hx', patterns: [/single\s+hx/i, /one\s+hx/i, /hx\s+out/i] },
  { id: 'warm-dcs', patterns: [/warm\s+dcs/i, /warm\s+district/i] },
  { id: 'high-header-dp', patterns: [/high\s+(?:header\s+)?dp/i, /aggressive\s+dp/i] },
  { id: 'lt-bypass-tune', patterns: [/lt\s+bypass\s+tun/i, /bypass\s+tun/i] },
  { id: 'baseline', patterns: [/design\s+baseline/i, /reset\s+baseline/i, /\bbaseline\b/i] },
];

function matchScenarioByText(text) {
  for (const { id, patterns } of SCENARIO_ALIASES) {
    if (patterns.some((p) => p.test(text))) return id;
  }
  for (const sc of ETS_SCENARIOS) {
    const slug = sc.id.replace(/-/g, ' ');
    if (text.includes(sc.id) || text.includes(slug) || text.includes(sc.label.toLowerCase())) {
      return sc.id;
    }
  }
  return null;
}

/**
 * @param {string} message
 * @param {import('../../types/ets').EtsControl[]} controls
 * @returns {EtsCopilotParseResult}
 */
export function parseEtsCopilotIntents(message, controls) {
  const pending = new Map();
  const errors = [];
  const text = message.trim();
  const lower = text.toLowerCase();

  const json = tryParseScenarioJson(text);
  if (json && typeof json === 'object') {
    if (json.id && getEtsScenarioById(json.id)) {
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
      errors.push(`Unknown scenario id "${json.id}". Known: ${ETS_SCENARIOS.map((s) => s.id).join(', ')}`);
    }
  }

  const wantsScenario =
    /\b(run|apply|load|simulate|switch\s+to|use|start|trigger)\b/i.test(text)
    || /\bscenario\b/i.test(text)
    || (json && json.id);

  if (wantsScenario || /\b(peak|setback|baseline|warm\s+dcs)\b/i.test(lower)) {
    const scenarioId = matchScenarioByText(lower);
    if (scenarioId) {
      return { applied: [], errors, scenarioId, scenarioPayload: null };
    }
    if (/\bscenario\b/i.test(lower) && !json) {
      errors.push('Could not match a preset scenario — try "run peak summer scenario" or paste scenario JSON with an id.');
    }
  }

  const loadCtrl = getByType(controls, 'buildingLoad');
  if (loadCtrl) {
    let m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (!m) m = text.match(/\b(?:building\s+)?load\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*rt\b/i);
    if (m) queueChange(pending, controls, 'buildingLoad', parseFloat(m[1]));
  }

  const ambCtrl = getByType(controls, 'ambientTemperature');
  if (ambCtrl) {
    let m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:outdoor|ambient|oat)\s*(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'ambientTemperature', parseFloat(m[1]));
  }

  const chwsCtrl = getByType(controls, 'chwsSetpoint');
  if (chwsCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:chws|chilled\s+water\s+supply)\s*(?:setpoint|sp|temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwsSetpoint', parseFloat(m[1]));
  }

  const dpCtrl = getByType(controls, 'dpSetpoint');
  if (dpCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:header\s+)?dp\s*(?:setpoint|sp)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:kpa)?\b/i
    );
    if (m) queueChange(pending, controls, 'dpSetpoint', parseFloat(m[1]));
  }

  const dcsCtrl = getByType(controls, 'dcsSupply');
  if (dcsCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?dcs\s*(?:supply\s+)?temp(?:erature)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'dcsSupply', parseFloat(m[1]));
  }

  const chwrtCtrl = getByType(controls, 'chwrtSetpoint');
  if (chwrtCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:lt\s+)?(?:bypass\s+)?chwrt\s*(?:sp|setpoint)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwrtSetpoint', parseFloat(m[1]));
  }

  const hxCtrl = getByType(controls, 'hxInService');
  if (hxCtrl) {
    const m = text.match(
      /\b(?:set|put|bring)\s+(?:the\s+)?(?:(\d)\s+)?(?:heat\s+)?exchangers?\s+(?:in\s+service|online)\b/i
    );
    if (m) queueChange(pending, controls, 'hxInService', parseInt(m[1] || '2', 10));
  }

  if (/\bunoccupied\b/i.test(text) && /\b(set|switch|time\s+program)\b/i.test(text)) {
    queueChange(pending, controls, 'occupancy', 0);
  } else if (/\boccupied\b/i.test(text) && /\b(set|switch|time\s+program)\b/i.test(text)) {
    queueChange(pending, controls, 'occupancy', 1);
  }

  if (
    /\b(set|change|adjust)\b/i.test(text)
    && pending.size === 0
    && !errors.length
    && /\b(load|temp|chws|dp|dcs|hx|scenario)\b/i.test(lower)
  ) {
    errors.push(
      'Could not parse ETS control — try "run peak summer scenario", paste scenario JSON, or "set building load to 950 RT".'
    );
  }

  return {
    applied: [...pending.values()],
    errors,
    scenarioId: null,
    scenarioPayload: null,
  };
}

/** @param {AppliedEtsControl[]} applied */
export function formatEtsControlConfirmation(applied) {
  if (!applied.length) return '';
  const lines = applied.map(
    (a) => `- **${a.label}:** ${a.oldValue} → **${a.newValue}** ${a.unit}`
  );
  return `## ETS Controls Updated\n\n${lines.join('\n')}\n\nETS simulation recalculated.`;
}

/** @param {string} scenarioId */
export function formatEtsScenarioConfirmation(scenarioId) {
  const sc = getEtsScenarioById(scenarioId);
  if (!sc) return `## ETS Scenario Applied\n\nScenario **${scenarioId}** loaded.`;
  return `## ETS Scenario Applied\n\n**${sc.label}** — ${sc.description}${sc.advanceSec ? ` (fast-forward ${sc.advanceSec}s virtual)` : ''}`;
}

/** @param {{ label?: string; description?: string; advanceSec?: number }} payload */
export function formatEtsCustomScenarioConfirmation(payload) {
  const label = payload.label || 'Custom scenario';
  const desc = payload.description ? ` — ${payload.description}` : '';
  const adv = payload.advanceSec ? ` (fast-forward ${payload.advanceSec}s virtual)` : '';
  return `## ETS Scenario Applied\n\n**${label}**${desc}${adv}`;
}

/** @param {import('../../types/ets').EtsState | null} state */
export function buildEtsContextForCopilot(state) {
  if (!state) return '';
  const { headers, simulation, alerts, recommendedActions } = state;
  const cascade = simulation?.cascadeTrace?.slice(0, 3).join(' → ') ?? '';
  return [
    'ETS A-B03-01 Virtual Simulator (physics-calculated, serves ASM):',
    simulation ? `Mode: ${simulation.mode}, tick ${simulation.tick}, last: ${simulation.lastTrigger}` : '',
    `Demand ${headers.coolingDemandRt} RT · CHWS/CHWR ${headers.chws}/${headers.chwr}°C · DCS/DCR ${headers.dcsSupplyC}/${headers.dcrReturnC}°C`,
    `Approach ${headers.approachC}°C · ε ${(headers.effectiveness * 100).toFixed(0)}% · pumps ${simulation?.stage ?? '?'}/3`,
    `OAT ${headers.ambientTempC}°C · header DP ${headers.headerDpKpa} kPa · pump ${headers.pumpKwPerRt} kW/RT`,
    cascade ? `Cascade: ${cascade}` : '',
    alerts?.filter((a) => !a.resolved).length
      ? `Alarms: ${alerts.filter((a) => !a.resolved).map((a) => a.message).join('; ')}`
      : 'No active alarms',
    recommendedActions?.[0] ? `Hint: ${recommendedActions[0]}` : '',
    `Preset scenarios: ${ETS_SCENARIOS.map((s) => s.id).join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {import('../../types/ets').EtsState | null} state */
export function buildEtsChatSuggestions(state) {
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

  const pumpKpi = state.kpis?.find((k) => k.id === 'ets-kpi-pumpeff');
  const approachKpi = state.kpis?.find((k) => k.id === 'ets-kpi-approach');
  if (pumpKpi?.status === 'warning') {
    suggestions.push({
      id: 'pump_eff',
      label: 'Pump kW/RT is high',
      prompt: 'what should I optimize on ETS?',
      priority: 'medium',
    });
  }
  if (approachKpi?.status === 'warning' && !suggestions.some((s) => s.id === 'review_alerts')) {
    suggestions.push({
      id: 'hx_approach',
      label: 'HX approach elevated',
      prompt: 'what is the HX approach?',
      priority: 'medium',
    });
  }

  suggestions.push({
    id: 'status',
    label: 'ETS status summary',
    prompt: 'give me an ETS status summary',
    priority: 'low',
  });

  suggestions.push({
    id: 'optimize',
    label: 'Optimization recommendations',
    prompt: 'what should I optimize on ETS?',
    priority: 'low',
  });

  return suggestions.slice(0, 5);
}

function formatEtsAlertBlock(alerts) {
  const active = alerts?.filter((a) => !a.resolved) ?? [];
  if (!active.length) return 'No active ETS alerts.';
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

/** @param {string} message @param {import('../../types/ets').EtsState | null} state */
export function analyzeEtsQuery(message, state) {
  if (!state) return 'ETS telemetry is not available yet. Wait for the simulation to initialize.';
  const q = message.toLowerCase();

  // Command messages — handled by parseEtsCopilotIntents / scenario runner
  if (
    /\b(run|apply|simulate|trigger)\b.*\bscenario\b/i.test(q)
    || /\bset\b.*\b(load|temp|dp|chws|dcs|chwrt)\b/i.test(q)
  ) {
    return null;
  }

  const { headers, alerts, recommendedActions, simulation } = state;

  if (q.includes('alarm') || q.includes('alert')) {
    return `## Active Alerts\n\n${formatEtsAlertBlock(alerts)}`;
  }

  if (q.includes('summary') || q.includes('status')) {
    const activeCount = alerts?.filter((a) => !a.resolved).length ?? 0;
    return [
      '## ETS Status Summary',
      '',
      `- **Demand:** ${headers.coolingDemandRt} RT · **CHWS/CHWR:** ${headers.chws}/${headers.chwr}°C`,
      `- **Approach:** ${headers.approachC}°C · **Pump kW/RT:** ${headers.pumpKwPerRt}`,
      `- **Active alerts:** ${activeCount}`,
      simulation?.lastTrigger ? `- **Last change:** ${simulation.lastTrigger}` : '',
      recommendedActions?.[0] ? `\n**Hint:** ${recommendedActions[0]}` : '',
    ].filter(Boolean).join('\n');
  }

  if (q.includes('energy') || q.includes('reduce') || q.includes('optim') || q.includes('save')) {
    const tips = [
      `- Pump **${headers.pumpPowerKw} kW** (${headers.pumpKwPerRt} kW/RT) — trim header DP setpoint if high`,
      `- Approach **${headers.approachC}°C** — verify HX count and DCS supply temperature`,
    ];
    if (recommendedActions?.length) tips.push(`- ${recommendedActions[0]}`);
    return `## ETS Optimization\n\n${tips.join('\n')}`;
  }

  if (q.includes('approach') || q.includes('hx')) {
    const lines = [
      `Current approach **${headers.approachC}°C** (alarm limit 3.2°C). Effectiveness **${(headers.effectiveness * 100).toFixed(1)}%**.`,
      `- DCS/DCR **${headers.dcsSupplyC}/${headers.dcrReturnC}°C** · demand **${headers.coolingDemandRt} RT**`,
    ];
    const approachAlert = alerts?.find((a) => !a.resolved && a.id === 'ets-alert-approach');
    if (approachAlert?.recommendedAdjustments?.length) {
      lines.push('', '**Recommended adjustments:**');
      for (const adj of approachAlert.recommendedAdjustments) {
        lines.push(`- ${adj.label}: **${adj.suggestedValue}** ${adj.unit || ''} (now ${adj.currentValue})`);
      }
    } else if (approachAlert?.recommendedAction) {
      lines.push('', `→ ${approachAlert.recommendedAction}`);
    }
    return `## HX Approach\n\n${lines.join('\n')}`;
  }
  if (q.includes('pump') || q.includes('kw/rt')) {
    return `## Pumping\n\nPump power **${headers.pumpPowerKw} kW** · **${headers.pumpKwPerRt} kW/RT** (target ≤ 0.07).`;
  }
  if (q.includes('scenario') || q.includes('simulate')) {
    return `## ETS Scenarios\n\nSay **"run peak summer scenario"** or paste preset JSON (with \`id: "peak-summer"\`).\n\nAvailable: ${ETS_SCENARIOS.map((s) => `**${s.id}** — ${s.label}`).join('\n')}`;
  }
  return null;
}

/** @param {import('../../types/ets').EtsControl[]} controls */
export function buildEtsControlsSummary(controls) {
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
