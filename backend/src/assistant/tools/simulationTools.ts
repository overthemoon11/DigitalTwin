/**
 * Simulation and what-if tools.
 *
 * The rule these enforce is the one from the brief that matters most: the
 * language model never computes a plant outcome. It converts a sentence into a
 * set of control values, and the twin says what happens. "What if wet bulb
 * reaches 30 °C" becomes an `evaluatePlant` call, not a paragraph of plausible
 * physics.
 *
 * `evaluatePlant` is stateless and snapshots every module global, so a what-if
 * cannot disturb the plant other operators are watching. The two tools that DO
 * move the twin — advancing virtual time and applying a preset scenario — are
 * the two the previous chat already had, and they say so in their result.
 */
import {
  evaluatePlant,
  advancePlantSimulation,
  applyChillerScenario,
  applyChillerScenarioPayload,
  getPlantControls,
  CHILLER_SCENARIOS,
  getChillerScenarioById,
  CALIBRATION_BOUNDS,
} from '../../digital-twin/chiller/index';
// The existing chiller command parser. It resolves "set building load to 3200"
// against the live control set — exactly what a control proposal needs — so it
// is reused rather than reimplemented. This is the old command handler becoming
// a tool, which is the whole point of the refactor.
import { parseChillerCopilotIntents } from '../../services/copilot/chillerCopilotActions.js';
import type { ToolDefinition } from '../types';
import { deltaPct, isNum, kpaToPsi, psiToKpa, round } from '../util';
import { livePlant } from './plantTools';

/* ─────────────────────────────────────────────── what-if control mapping ── */

/**
 * Named what-if knobs → the twin's control ids.
 *
 * Only these may be moved by a what-if. An LLM cannot reach an arbitrary
 * control id through this path, which is the allowlist the brief asks for
 * expressed as data rather than as a check.
 */
const WHAT_IF_CONTROLS: Record<string, { id: string; label: string; unit: string; dp: number }> = {
  buildingLoadRt: { id: 'ctrl-building-load', label: 'Building load', unit: 'RT', dp: 0 },
  ambientTempC: { id: 'ctrl-ambient-temp', label: 'Outdoor dry bulb', unit: '°C', dp: 1 },
  humidityRh: { id: 'ctrl-humidity', label: 'Outdoor humidity', unit: '%RH', dp: 0 },
  chwstC: { id: 'ctrl-chws-sp', label: 'CHWST setpoint', unit: '°C', dp: 2 },
  chwrtC: { id: 'ctrl-chwr-sp', label: 'CHWRT setpoint', unit: '°C', dp: 2 },
  cwsC: { id: 'ctrl-cws-sp', label: 'CWS setpoint', unit: '°C', dp: 2 },
  dpPsi: { id: 'ctrl-dp-sp', label: 'CHW DP setpoint', unit: 'psi', dp: 1 },
  ctFanPct: { id: 'ctrl-ct-fan', label: 'CT fan override', unit: '%', dp: 0 },
  chwpSpeedPct: { id: 'ctrl-pump-spd', label: 'CHWP speed override', unit: '%', dp: 0 },
  cwpSpeedPct: { id: 'ctrl-cwp-spd', label: 'CWP speed override', unit: '%', dp: 0 },
};

function controlById(id: string) {
  return getPlantControls().find((c) => c.id === id) ?? null;
}

/**
 * Wet bulb is not a control — it is solved from dry bulb and humidity. A
 * question about wet bulb is therefore answered by moving the humidity at the
 * current dry bulb until the twin's own psychrometrics land on the target,
 * which keeps one wet-bulb model in the codebase instead of two.
 */
function humidityForWetBulb(targetWbC: number, dryBulbC: number): number | null {
  let lo = 40;
  let hi = 95;
  let best: number | null = null;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const evaluated = evaluatePlant({ 'ctrl-ambient-temp': dryBulbC, 'ctrl-humidity': mid });
    const wb = evaluated.thermal.wetBulb;
    if (!isNum(wb)) return null;
    best = mid;
    if (Math.abs(wb - targetWbC) < 0.02) return round(mid, 1);
    if (wb < targetWbC) lo = mid;
    else hi = mid;
  }
  return best === null ? null : round(best, 1);
}

export interface WhatIfArgs {
  buildingLoadRt?: number;
  /** Relative forms, resolved against the live value inside the tool. */
  buildingLoadDeltaRt?: number;
  wetBulbDeltaC?: number;
  ambientTempDeltaC?: number;
  chwstDeltaC?: number;
  dpDeltaPsi?: number;
  wetBulbC?: number;
  ambientTempC?: number;
  humidityRh?: number;
  chwstC?: number;
  chwrtC?: number;
  cwsC?: number;
  dpPsi?: number;
  dpKpa?: number;
  ctFanPct?: number;
  chwpSpeedPct?: number;
  cwpSpeedPct?: number;
  runningChillers?: number;
}

/**
 * Score one hypothetical operating condition against the current one.
 *
 * Returns both sides plus the deltas, so an answer can be written entirely from
 * numbers the twin produced.
 */
export function runWhatIfScenario(args: WhatIfArgs = {}) {
  const state = livePlant();
  const overrides: Record<string, number> = {};
  const requested: Array<{ label: string; from: number | null; to: number; unit: string }> = [];
  const notes: string[] = [];

  const set = (key: keyof typeof WHAT_IF_CONTROLS, value: number) => {
    const meta = WHAT_IF_CONTROLS[key as string];
    const ctrl = controlById(meta.id);
    const clamped = ctrl ? Math.min(ctrl.max, Math.max(ctrl.min, value)) : value;
    if (ctrl && clamped !== value) {
      notes.push(
        `${meta.label} ${round(value, meta.dp)} ${meta.unit} is outside the twin's allowed range ${ctrl.min}–${ctrl.max} ${meta.unit}; simulated at ${round(clamped, meta.dp)} instead.`
      );
    }
    overrides[meta.id] = clamped;
    requested.push({
      label: meta.label,
      from: isNum(ctrl?.value as number) ? round(ctrl!.value as number, meta.dp) : null,
      to: round(clamped, meta.dp) as number,
      unit: meta.unit,
    });
  };

  // DP may arrive in either unit; the twin's control is psi.
  let dpPsi = isNum(args.dpPsi) ? args.dpPsi : isNum(args.dpKpa) ? kpaToPsi(args.dpKpa) : null;

  /*
   * Relative conditions.
   *
   * "What happens if wet bulb increases?" names a direction and no number.
   * Refusing to answer would be pedantic; inventing a target would be worse.
   * Resolving the delta against the LIVE value keeps the answer real, and the
   * note below says exactly what step was simulated.
   */
  const liveWetBulb = Array.isArray(state.headers.wetBulbSensors) && state.headers.wetBulbSensors.length
    ? state.headers.wetBulbSensors.reduce((a, b) => a + b, 0) / state.headers.wetBulbSensors.length
    : null;
  const relative: Array<[number | undefined, number | null, string, (v: number) => void]> = [
    [args.buildingLoadDeltaRt, state.headers.buildingLoadRt, 'building load', (v) => { args.buildingLoadRt = v; }],
    [args.wetBulbDeltaC, liveWetBulb, 'wet bulb', (v) => { args.wetBulbC = v; }],
    [args.ambientTempDeltaC, state.headers.ambientTemp, 'outdoor dry bulb', (v) => { args.ambientTempC = v; }],
    [args.chwstDeltaC, state.headers.chws, 'CHWST', (v) => { args.chwstC = v; }],
    [args.dpDeltaPsi, controlById('ctrl-dp-sp')?.value as number, 'CHW DP setpoint', (v) => { dpPsi = v; }],
  ];
  for (const [delta, current, label, apply] of relative) {
    if (!isNum(delta) || !isNum(current)) continue;
    const target = current + delta;
    apply(target);
    notes.push(
      `No target was given for ${label}, so I simulated the current ${round(current, 2)} ${delta > 0 ? 'plus' : 'minus'} ${Math.abs(round(delta, 2) as number)} — that is ${round(target, 2)}.`
    );
  }

  if (isNum(args.buildingLoadRt)) set('buildingLoadRt', args.buildingLoadRt);
  if (isNum(args.ambientTempC)) set('ambientTempC', args.ambientTempC);
  if (isNum(args.humidityRh)) set('humidityRh', args.humidityRh);
  if (isNum(args.chwstC)) set('chwstC', args.chwstC);
  if (isNum(args.chwrtC)) set('chwrtC', args.chwrtC);
  if (isNum(args.cwsC)) set('cwsC', args.cwsC);
  if (isNum(dpPsi)) set('dpPsi', dpPsi as number);
  if (isNum(args.ctFanPct)) set('ctFanPct', args.ctFanPct);
  if (isNum(args.chwpSpeedPct)) set('chwpSpeedPct', args.chwpSpeedPct);
  if (isNum(args.cwpSpeedPct)) set('cwpSpeedPct', args.cwpSpeedPct);

  if (isNum(args.wetBulbC)) {
    const dry = overrides['ctrl-ambient-temp'] ?? state.headers.ambientTemp;
    const rh = humidityForWetBulb(args.wetBulbC, dry);
    if (rh === null) {
      notes.push('Wet bulb could not be resolved to an outdoor humidity at this dry-bulb temperature.');
    } else {
      overrides['ctrl-humidity'] = rh;
      requested.push({ label: 'Outdoor wet bulb (via humidity)', from: round(state.headers.wetBulbSensors?.length ? state.headers.wetBulbSensors.reduce((a, b) => a + b, 0) / state.headers.wetBulbSensors.length : NaN, 2), to: round(args.wetBulbC, 2) as number, unit: '°C' });
      notes.push(
        `Wet bulb is not a setpoint — it was reached by holding dry bulb at ${round(dry, 1)} °C and moving outdoor humidity to ${rh} %RH, which is what the twin's psychrometrics require for ${round(args.wetBulbC, 1)} °C wet bulb.`
      );
    }
  }

  if (!Object.keys(overrides).length) {
    return {
      ran: false,
      reason:
        'No recognised what-if condition was given. Name a load, wet bulb, outdoor temperature, CHWST, DP, or a pump / fan speed.',
      supportedConditions: Object.keys(WHAT_IF_CONTROLS).concat('wetBulbC'),
    };
  }

  const staging = isNum(args.runningChillers)
    ? { chiller: Math.max(1, Math.min(5, Math.round(args.runningChillers))) }
    : undefined;

  const base = evaluatePlant({});
  const next = evaluatePlant(overrides, staging ? { staging } : {});

  const compare = (label: string, b: number | null, a: number | null, unit: string, dp: number) => ({
    label,
    before: round(b, dp),
    after: round(a, dp),
    delta: isNum(b) && isNum(a) ? round(a - b, dp) : null,
    deltaPct: deltaPct(b, a),
    unit,
  });

  return {
    ran: true,
    /** Not the live plant: this is a hypothetical scored on the twin. */
    committedToTwin: false,
    requested,
    notes,
    staging: staging ? { chillersPinned: staging.chiller } : null,
    outcome: [
      compare('Total plant power', base.power.totalKw, next.power.totalKw, 'kW', 1),
      compare('Plant efficiency', base.efficiency.kwPerRt, next.efficiency.kwPerRt, 'kW/RT', 3),
      compare('Plant COP', base.efficiency.cop, next.efficiency.cop, '', 2),
      compare('Chiller power', base.power.chillerKw, next.power.chillerKw, 'kW', 1),
      compare('CHW pump power', base.power.chwpKw, next.power.chwpKw, 'kW', 1),
      compare('CW pump power', base.power.cwpKw, next.power.cwpKw, 'kW', 1),
      compare('Tower fan power', base.power.ctKw, next.power.ctKw, 'kW', 1),
      compare('Building load', base.thermal.buildingLoadRt, next.thermal.buildingLoadRt, 'RT', 0),
      compare('CHWS', base.thermal.chws, next.thermal.chws, '°C', 2),
      compare('CHWR', base.thermal.chwr, next.thermal.chwr, '°C', 2),
      compare('CHW ΔT', base.thermal.deltaT, next.thermal.deltaT, '°C', 2),
      compare('CWS', base.thermal.cws, next.thermal.cws, '°C', 2),
      compare('Wet bulb', base.thermal.wetBulb, next.thermal.wetBulb, '°C', 2),
      compare('Tower approach', base.thermal.towerApproach, next.thermal.towerApproach, '°C', 2),
      compare('Chillers staged', base.staging.chillers, next.staging.chillers, '', 0),
      compare('Chiller part load', base.hydraulic.chillerLoadPct, next.hydraulic.chillerLoadPct, '%', 1),
    ],
    alarmsBefore: base.alarms,
    alarmsAfter: next.alarms,
    calibration: next.calibration,
    calibratedEnvelope: CALIBRATION_BOUNDS,
  };
}

/* ────────────────────────────────────────────────────────  runSimulation ── */

/**
 * Advance the twin's virtual clock. This DOES move the shared twin, which is
 * why the result says so — it is the same "run simulation for 30 minutes"
 * capability the previous chat had, and the panel's live view will follow it.
 */
export function runSimulation(args: { minutes?: number } = {}) {
  const minutes = isNum(args.minutes) ? Math.max(1, Math.min(240, Math.round(args.minutes))) : 30;
  const before = livePlant();
  const beforeKw = before.kpis?.find((k) => k.id === 'kpi-kw')?.value ?? null;
  const after = advancePlantSimulation(Math.max(1, Math.floor((minutes * 60) / 2)));
  const afterKw = after.kpis?.find((k) => k.id === 'kpi-kw')?.value ?? null;

  return {
    ran: true,
    committedToTwin: true,
    minutesAdvanced: minutes,
    fromTime: before.simulationTime,
    toTime: after.simulationTime,
    plantKw: { before: round(beforeKw as number, 1), after: round(afterKw as number, 1) },
    buildingLoadRt: {
      before: round(before.headers.buildingLoadRt, 0),
      after: round(after.headers.buildingLoadRt, 0),
    },
    chwrC: { before: round(before.headers.chwr, 2), after: round(after.headers.chwr, 2) },
    newAlarms: (after.alerts ?? [])
      .filter((a) => !a.resolved && !(before.alerts ?? []).some((b) => b.id === a.id && !b.resolved))
      .map((a) => ({ severity: a.severity, message: a.message })),
    lastChange: after.simulation?.lastTrigger ?? null,
  };
}

/* ─────────────────────────────────────────────────────────────  scenarios ── */

export function listScenarios() {
  return {
    scenarios: CHILLER_SCENARIOS.map((s: any) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    })),
  };
}

/** Apply a preset scenario to the twin — the existing "run peak summer
 *  scenario" capability, unchanged in effect and now reachable from any
 *  wording that means it. */
export function applyScenario(args: { scenarioId: string }) {
  const scenario = getChillerScenarioById(args.scenarioId);
  if (!scenario) {
    return {
      ran: false,
      reason: `Unknown scenario "${args.scenarioId}".`,
      scenarios: CHILLER_SCENARIOS.map((s: any) => ({ id: s.id, label: s.label })),
    };
  }
  const before = livePlant();
  const after = applyChillerScenario(args.scenarioId);
  const kw = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-kw')?.value ?? null;
  const eff = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-eff')?.value ?? null;
  return {
    ran: true,
    committedToTwin: true,
    scenarioId: scenario.id,
    label: scenario.label,
    description: scenario.description,
    outcome: [
      { label: 'Building load', before: round(before.headers.buildingLoadRt, 0), after: round(after.headers.buildingLoadRt, 0), unit: 'RT' },
      { label: 'Outdoor dry bulb', before: round(before.headers.ambientTemp, 1), after: round(after.headers.ambientTemp, 1), unit: '°C' },
      { label: 'CHWS', before: round(before.headers.chws, 2), after: round(after.headers.chws, 2), unit: '°C' },
      { label: 'CHWR', before: round(before.headers.chwr, 2), after: round(after.headers.chwr, 2), unit: '°C' },
      { label: 'Total plant power', before: round(kw(before), 1), after: round(kw(after), 1), unit: 'kW' },
      { label: 'Plant efficiency', before: round(eff(before), 3), after: round(eff(after), 3), unit: 'kW/RT' },
    ],
    activeAlarms: (after.alerts ?? []).filter((a) => !a.resolved).map((a) => a.message),
  };
}

/**
 * Apply an ad-hoc scenario payload.
 *
 * The composer's advanced disclosure has always accepted raw scenario JSON, and
 * that capability survives the agent rewrite — but it now goes through the same
 * validation as everything else: every key must be a real control id and every
 * value a finite number inside that control's range. A payload written by a
 * language model gets exactly the same treatment as one pasted by a human.
 */
export function applyCustomScenario(args: { payload: string }) {
  let parsed: any;
  try {
    parsed = typeof args.payload === 'string' ? JSON.parse(args.payload) : args.payload;
  } catch (err) {
    return { ran: false, reason: `That is not valid JSON: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ran: false, reason: 'A scenario payload must be a JSON object.' };
  }
  if (typeof parsed.id === 'string' && getChillerScenarioById(parsed.id)) {
    return applyScenario({ scenarioId: parsed.id });
  }
  if (!parsed.controls || typeof parsed.controls !== 'object') {
    return {
      ran: false,
      reason: 'A custom scenario needs a `controls` object, or an `id` naming a preset.',
      scenarios: CHILLER_SCENARIOS.map((s: any) => ({ id: s.id, label: s.label })),
    };
  }

  const controls = getPlantControls();
  const overrides: Record<string, number> = {};
  const rejected: string[] = [];
  for (const [key, raw] of Object.entries(parsed.controls as Record<string, unknown>)) {
    const ctrl = controls.find((c) => c.id === key);
    const value = Number(raw);
    if (!ctrl) { rejected.push(`unknown control "${key}"`); continue; }
    if (!Number.isFinite(value)) { rejected.push(`"${key}" is not a number`); continue; }
    const clamped = Math.min(ctrl.max, Math.max(ctrl.min, value));
    if (clamped !== value) rejected.push(`${ctrl.label} clamped to ${clamped} ${ctrl.unit}`);
    overrides[key] = clamped;
  }
  if (!Object.keys(overrides).length) {
    return { ran: false, reason: `No usable control values. ${rejected.join('; ')}` };
  }

  const before = livePlant();
  const after = applyChillerScenarioPayload({
    id: typeof parsed.id === 'string' ? parsed.id.slice(0, 40) : 'chat-custom',
    label: typeof parsed.label === 'string' ? parsed.label.slice(0, 80) : 'Custom scenario',
    description: typeof parsed.description === 'string' ? parsed.description.slice(0, 200) : undefined,
    controls: overrides,
    advanceSec: Number.isFinite(Number(parsed.advanceSec))
      ? Math.max(0, Math.min(600, Number(parsed.advanceSec)))
      : 60,
  } as never);

  const kw = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-kw')?.value ?? null;
  const eff = (s: any) => s.kpis?.find((k: any) => k.id === 'kpi-eff')?.value ?? null;
  return {
    ran: true,
    committedToTwin: true,
    scenarioId: 'chat-custom',
    label: typeof parsed.label === 'string' ? parsed.label : 'Custom scenario',
    description: undefined,
    applied: Object.entries(overrides).map(([id, value]) => {
      const ctrl = controls.find((c) => c.id === id);
      return { controlId: id, label: ctrl?.label ?? id, value, unit: ctrl?.unit ?? '' };
    }),
    rejected,
    outcome: [
      { label: 'Building load', before: round(before.headers.buildingLoadRt, 0), after: round(after.headers.buildingLoadRt, 0), unit: 'RT' },
      { label: 'CHWS', before: round(before.headers.chws, 2), after: round(after.headers.chws, 2), unit: '°C' },
      { label: 'CHWR', before: round(before.headers.chwr, 2), after: round(after.headers.chwr, 2), unit: '°C' },
      { label: 'Total plant power', before: round(kw(before), 1), after: round(kw(after), 1), unit: 'kW' },
      { label: 'Plant efficiency', before: round(eff(before), 3), after: round(eff(after), 3), unit: 'kW/RT' },
    ],
    activeAlarms: (after.alerts ?? []).filter((a) => !a.resolved).map((a) => a.message),
  };
}

/* ──────────────────────────────────────────────── proposeControlChange ──── */

/**
 * Free-form fallback for a control request the legacy parser did not match.
 *
 * `parseChillerCopilotIntents` is precise and narrow — it was written against a
 * fixed command vocabulary, and "set CHWST to 8 degrees" is outside it because
 * of the word "degrees". Rather than loosen a parser other code depends on,
 * this resolves the same intent one step later: name a control, find a target
 * number, clamp it to the control's own range.
 *
 * Order matters: the exact parser runs first and this only sees what it missed,
 * so nothing that worked before changes behaviour.
 */
const CONTROL_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(chwst|chws|chilled\s*water\s*supply|supply\s*(?:water\s*)?temp\w*)\b/i, 'ctrl-chws-sp'],
  [/\b(chwrt|chwr|chilled\s*water\s*return|return\s*(?:water\s*)?temp\w*)\b/i, 'ctrl-chwr-sp'],
  [/\b(cws|condenser\s*water\s*supply)\b/i, 'ctrl-cws-sp'],
  [/\b(cwr|condenser\s*water\s*return)\b/i, 'ctrl-cwr-sp'],
  [/\b(dp|differential\s*pressure|header\s*dp)\b/i, 'ctrl-dp-sp'],
  [/\b(building\s*)?(cooling\s*)?load\b|\btonnage\b/i, 'ctrl-building-load'],
  [/\b(outdoor|ambient|outside)\s*(air\s*)?temp\w*|\boat\b|dry\s*-?\s*bulb/i, 'ctrl-ambient-temp'],
  [/\bhumidity\b|\brh\b/i, 'ctrl-humidity'],
  [/\b(cooling\s*tower|ct)\s*fan\b|\bfan\s*speed\b/i, 'ctrl-ct-fan'],
  [/\b(cwp|condenser\s*(?:water\s*)?pump)\s*(speed)?\b/i, 'ctrl-cwp-spd'],
  [/\b(chwp|chilled\s*water\s*pump|pump)\s*(speed)?\b/i, 'ctrl-pump-spd'],
];

function resolveControlRequest(
  request: string,
  controls: ReturnType<typeof getPlantControls>
): Array<{ controlId: string; label: string; oldValue: number; newValue: number; unit: string }> {
  const target = request.match(
    /\b(?:to|at|=|becomes?|reaches?)\s*(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)\s*(?:°\s*c|deg\w*|celsius|psi|kpa|rt|%|percent)\b/i
  );
  const raw = Number(target?.[1] ?? target?.[2]);
  if (!Number.isFinite(raw)) return [];

  const match = CONTROL_SYNONYMS.find(([pattern]) => pattern.test(request));
  if (!match) return [];
  const ctrl = controls.find((c) => c.id === match[1]);
  if (!ctrl || typeof ctrl.value !== 'number') return [];

  // kPa is a legitimate way to ask for a psi setpoint; convert rather than
  // clamping 110 kPa down to the 30 psi maximum and calling it the answer.
  let value = raw;
  if (ctrl.id === 'ctrl-dp-sp' && /kpa/i.test(request)) {
    value = kpaToPsi(raw) ?? raw;
  }
  const clamped = Math.min(ctrl.max, Math.max(ctrl.min, value));
  if (round(clamped, 3) === round(ctrl.value, 3)) return [];
  return [{ controlId: ctrl.id, label: ctrl.label, oldValue: ctrl.value, newValue: clamped, unit: ctrl.unit }];
}

/**
 * Turn a control request into a PROPOSAL with a simulated preview.
 *
 * Nothing here mutates. The registry marks this `write` so the service knows to
 * return it as a pending action rather than a completed one; execution happens
 * only in the confirm endpoint, after a human has seen the table below.
 */
export function proposeControlChange(args: { request?: string; controlId?: string; value?: number }) {
  // eslint-disable-next-line no-param-reassign
  args = { ...args };
  const controls = getPlantControls();
  let changes: Array<{ controlId: string; label: string; oldValue: number; newValue: number; unit: string }> = [];
  const errors: string[] = [];

  /*
   * An explicit id wins when it is real. When it is not — a caller guessing
   * "chwst" for "ctrl-chws-sp" — fall through to the wording rather than
   * failing, because the wording is what the operator actually said.
   */
  const explicit = args.controlId ? controls.find((c) => c.id === args.controlId) : null;
  if (args.controlId && !explicit && args.request) {
    args.controlId = undefined;
  }

  if (args.controlId && isNum(args.value)) {
    const ctrl = controls.find((c) => c.id === args.controlId);
    if (!ctrl) {
      errors.push(`Unknown control "${args.controlId}".`);
    } else if (typeof ctrl.value !== 'number') {
      errors.push(`Control "${ctrl.label}" is not numeric.`);
    } else {
      const clamped = Math.min(ctrl.max, Math.max(ctrl.min, args.value));
      if (clamped !== args.value) {
        errors.push(`${ctrl.label} clamped to its ${ctrl.min}–${ctrl.max} ${ctrl.unit} range.`);
      }
      changes = [{ controlId: ctrl.id, label: ctrl.label, oldValue: ctrl.value, newValue: clamped, unit: ctrl.unit }];
    }
  } else if (args.request) {
    const parsed = parseChillerCopilotIntents(args.request, controls);
    errors.push(...(parsed.errors ?? []));
    if (parsed.scenarioId) {
      return {
        proposed: false,
        isScenario: true,
        scenarioId: parsed.scenarioId,
        note: 'This reads as a scenario rather than a single control change.',
      };
    }
    changes = parsed.applied ?? [];
    if (!changes.length) {
      const resolved = resolveControlRequest(args.request, controls);
      if (resolved.length) {
        changes = resolved;
        // The exact parser's complaint is not a real error once this resolved.
        errors.length = 0;
      }
    }
  }

  if (!changes.length) {
    return {
      proposed: false,
      reason: errors.length
        ? errors.join(' ')
        : 'No control change could be resolved from that request.',
      availableControls: controls
        .filter((c) => typeof c.value === 'number')
        .map((c) => ({ id: c.id, label: c.label, value: c.value, unit: c.unit, min: c.min, max: c.max })),
    };
  }

  // The preview is a real evaluation of the proposed control set, not an
  // estimate: this is the difference between "expected effect" and a guess.
  const overrides: Record<string, number> = {};
  for (const c of changes) overrides[c.controlId] = c.newValue;
  const base = evaluatePlant({});
  const next = evaluatePlant(overrides);

  const row = (label: string, b: number, a: number, unit: string, dp: number) => ({
    label,
    before: `${round(b, dp)}${unit ? ` ${unit}` : ''}`,
    after: `${round(a, dp)}${unit ? ` ${unit}` : ''}`,
    delta: `${a - b >= 0 ? '+' : ''}${round(a - b, dp)}${unit ? ` ${unit}` : ''}`,
  });

  const warnings: string[] = [...errors];
  if (next.calibration.status === 'extrapolated') {
    warnings.push(
      `The proposed operating point is outside the twin's calibration envelope: ${next.calibration.reasons.join('; ')}.`
    );
  }
  if (next.alarms > base.alarms) {
    warnings.push(`This change raises the active alarm count from ${base.alarms} to ${next.alarms}.`);
  }
  if (next.power.totalKw > base.power.totalKw) {
    warnings.push(`Total plant power increases by ${round(next.power.totalKw - base.power.totalKw, 1)} kW.`);
  }

  return {
    proposed: true,
    requiresConfirmation: true,
    committedToTwin: false,
    changes: changes.map((c) => ({
      controlId: c.controlId,
      label: c.label,
      currentValue: round(c.oldValue, 2),
      proposedValue: round(c.newValue, 2),
      unit: c.unit,
    })),
    expectedEffect: [
      row('Total plant power', base.power.totalKw, next.power.totalKw, 'kW', 1),
      row('Plant efficiency', base.efficiency.kwPerRt, next.efficiency.kwPerRt, 'kW/RT', 3),
      row('CHWS', base.thermal.chws, next.thermal.chws, '°C', 2),
      row('CHWR', base.thermal.chwr, next.thermal.chwr, '°C', 2),
      row('Chillers staged', base.staging.chillers, next.staging.chillers, '', 0),
    ],
    warnings,
  };
}

/* ─────────────────────────────────────────────────────────── definitions ── */

export const SIMULATION_TOOLS: ToolDefinition[] = [
  {
    name: 'runWhatIfScenario',
    kind: 'simulate',
    sourceType: 'WHAT_IF_SIMULATION',
    description:
      'Score a hypothetical condition on the Digital Twin and compare it to right now. Use for "what if wet bulb reaches 30", "simulate 3500 RT", "try CHWST at 8", "reduce DP to 110 kPa". Does not move the plant.',
    args: {
      buildingLoadRt: { type: 'number', min: 200, max: 8000, description: 'Cooling load, RT' },
      wetBulbC: { type: 'number', min: 10, max: 35, description: 'Outdoor wet bulb, °C' },
      ambientTempC: { type: 'number', min: 15, max: 48, description: 'Outdoor dry bulb, °C' },
      humidityRh: { type: 'number', min: 20, max: 100, description: 'Outdoor relative humidity, %' },
      chwstC: { type: 'number', min: 4, max: 14, description: 'Chilled water supply setpoint, °C' },
      chwrtC: { type: 'number', min: 8, max: 20, description: 'Chilled water return setpoint, °C' },
      cwsC: { type: 'number', min: 20, max: 40, description: 'Condenser water supply setpoint, °C' },
      dpPsi: { type: 'number', min: 5, max: 40, description: 'CHW differential pressure setpoint, psi' },
      dpKpa: { type: 'number', min: 30, max: 280, description: 'CHW differential pressure setpoint, kPa' },
      ctFanPct: { type: 'number', min: 0, max: 100, description: 'Cooling tower fan override, %' },
      chwpSpeedPct: { type: 'number', min: 0, max: 100, description: 'CHW pump speed override, %' },
      cwpSpeedPct: { type: 'number', min: 0, max: 100, description: 'CW pump speed override, %' },
      runningChillers: { type: 'number', min: 1, max: 5, description: 'Pin the number of chillers staged' },
      buildingLoadDeltaRt: { type: 'number', min: -3000, max: 3000, description: 'Change in load relative to now, RT' },
      wetBulbDeltaC: { type: 'number', min: -10, max: 10, description: 'Change in wet bulb relative to now, K' },
      ambientTempDeltaC: { type: 'number', min: -10, max: 10, description: 'Change in dry bulb relative to now, K' },
      chwstDeltaC: { type: 'number', min: -4, max: 4, description: 'Change in CHWST relative to now, K' },
      dpDeltaPsi: { type: 'number', min: -15, max: 15, description: 'Change in DP setpoint relative to now, psi' },
    },
    costMs: 40,
    run: (a) => runWhatIfScenario(a as WhatIfArgs),
  },
  {
    name: 'runSimulation',
    kind: 'simulate',
    sourceType: 'DIGITAL_TWIN',
    description: 'Advance the twin\'s virtual clock and report what moved. This does change the live twin everyone is viewing.',
    args: { minutes: { type: 'number', min: 1, max: 240, default: 30, description: 'Virtual minutes to advance' } },
    costMs: 200,
    run: (a) => runSimulation(a as any),
  },
  {
    name: 'listScenarios',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Preset operating scenarios available on the twin.',
    args: {},
    costMs: 2,
    run: () => listScenarios(),
  },
  {
    name: 'applyScenario',
    kind: 'simulate',
    sourceType: 'WHAT_IF_SIMULATION',
    description: 'Load a preset scenario onto the twin (peak-summer, night-low-load, condenser-stress, …) and report the before/after. This does change the live twin.',
    args: { scenarioId: { type: 'string', required: true, maxLength: 40, description: 'Scenario id from listScenarios' } },
    costMs: 100,
    run: (a) => applyScenario(a as any),
  },
  {
    name: 'applyCustomScenario',
    kind: 'simulate',
    sourceType: 'WHAT_IF_SIMULATION',
    description:
      'Apply an ad-hoc scenario given as JSON — { "label": "…", "controls": { "ctrl-…": number }, "advanceSec": n } — or a { "id": "…" } naming a preset. Every control id and value is validated. This does change the live twin.',
    args: {
      payload: { type: 'string', required: true, maxLength: 2000, description: 'The scenario JSON' },
    },
    costMs: 120,
    run: (a) => applyCustomScenario(a as any),
  },
  {
    name: 'proposeControlChange',
    kind: 'write',
    sourceType: 'DIGITAL_TWIN',
    description:
      'Prepare a setpoint change for operator confirmation, with a simulated preview of its effect. Never applies anything by itself. Use for "set CHWST to 8", "change DP to 110 kPa", "reduce the load to 2800 RT".',
    args: {
      request: { type: 'string', maxLength: 300, description: 'The operator\'s wording, e.g. "set CHWS to 8.2 C"' },
      controlId: { type: 'string', maxLength: 40, description: 'Explicit control id if known' },
      value: { type: 'number', description: 'Target value when controlId is given' },
    },
    costMs: 30,
    run: (a) => proposeControlChange(a as any),
  },
];

/** Re-exported so the confirm endpoint can price a change the same way. */
export { psiToKpa };
