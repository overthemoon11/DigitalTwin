/**
 * Deterministic answer composition.
 *
 * Two jobs, and the second is the reason this file is as long as it is.
 *
 * When the language model is unreachable — and it lives on a VPN, so it often
 * is — this writes the whole reply. Every question type has to land somewhere
 * useful here, or the assistant degrades back into the command menu the brief
 * is trying to delete.
 *
 * When the model IS up, the same composition runs first and is handed to it as
 * a grounded draft. That is what stops the model from having to derive a
 * conclusion from raw JSON, which is where fabrication comes from.
 *
 * Everything printed here is either a number a tool returned or a mechanism
 * from the HVAC glossary. Nothing is inferred from a pattern in the data.
 */
import type { AnswerBlock, SuggestedAction, ToolResult } from './types';
import type { Classification } from './intent';
import { searchKnowledgeBase } from './knowledge/index';
import { fmt, isNum, round } from './util';

export interface Composed {
  markdown: string;
  blocks: AnswerBlock[];
  actions: SuggestedAction[];
  warnings: string[];
}

const NO_ACTIONS: SuggestedAction[] = [];

function find(results: ToolResult[], tool: string): any | null {
  const r = results.find((x) => x.tool === tool && x.ok);
  return r ? (r.data as any) : null;
}

function failed(results: ToolResult[], tool: string): string | null {
  const r = results.find((x) => x.tool === tool && !x.ok);
  return r ? (r.error ?? 'failed') : null;
}

const rows = (entries: Array<[string, string | number | null | undefined]>): string =>
  entries
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- **${k}:** ${v}`)
    .join('\n');

const ACTION_RUN_MPC: SuggestedAction = {
  id: 'run-mpc',
  label: 'Run MPC',
  prompt: 'run mpc on the current conditions',
  tone: 'primary',
};
const ACTION_EXPLAIN: SuggestedAction = {
  id: 'explain-mpc',
  label: 'Explain the MPC decision',
  prompt: 'why did the MPC choose those settings?',
};
const ACTION_TRUST: SuggestedAction = {
  id: 'mpc-trust',
  label: 'Is this result trustworthy?',
  prompt: 'is this MPC result trustworthy?',
};
const ACTION_COMPARE: SuggestedAction = {
  id: 'compare-mpc',
  label: 'Compare against baseline',
  prompt: 'compare baseline and MPC over the next few hours',
};
const ACTION_OPTIMISE: SuggestedAction = {
  id: 'optimise',
  label: 'What should I optimise?',
  prompt: 'what should I optimise right now?',
};

/* ────────────────────────────────────────────── plant-state narratives ── */

/**
 * Why a chilled-water return temperature is where it is.
 *
 * Written as a checklist of the four mechanisms that actually move CHWR, each
 * tested against real numbers. A cause is only printed when its evidence is
 * present, so an answer never lists a possibility it has no reason to suspect.
 */
function diagnoseChwr(state: any, trends: any): { lines: string[]; blocks: AnswerBlock[] } {
  const lines: string[] = [];
  const blocks: AnswerBlock[] = [];
  const limit = state?.constraintStatus?.maxChwrC;
  const chwr = state?.chwrtC;
  const chws = state?.chwstC;
  const dt = state?.chwDeltaTC;

  if (isNum(chwr)) {
    const margin = isNum(limit) ? round(limit - chwr, 2) : null;
    blocks.push({
      kind: 'metric',
      label: 'CHW return',
      value: `${chwr}`,
      unit: '°C',
      note: isNum(limit) ? `limit ${limit} °C · ${margin} K of margin` : undefined,
      tone: isNum(margin) ? (margin < 0 ? 'bad' : margin < 0.5 ? 'warn' : 'good') : 'neutral',
    });
    if (isNum(margin) && margin < 0) {
      lines.push(`CHWR is **${chwr} °C**, which is above the **${limit} °C** return limit.`);
    } else if (isNum(margin)) {
      lines.push(`CHWR is **${chwr} °C** against a **${limit} °C** limit — ${margin} K of margin.`);
    }
  }

  if (isNum(dt) && isNum(chws)) {
    lines.push(
      `Supply is **${chws} °C**, so the loop ΔT is **${dt} K**. Return temperature is supply plus ΔT, and ΔT is set by how much heat the building put in against how much water is moving.`
    );
    if (dt > 7.2) {
      lines.push(
        `That ΔT is above the 5–7 K design band, which points at flow rather than load: less water for the same heat means each litre comes back warmer. CHW flow is **${state.chwFlowLs} L/s** with the CHW pumps at **${state.chwpSpeedPct}%** and DP at **${state.dpPsi} psi**.`
      );
    } else if (dt < 4.5) {
      lines.push(
        `That ΔT is below the design band, so the loop is over-pumped for the load — a high return here is being driven by load rather than by starved flow.`
      );
    }
  }

  if (isNum(state?.buildingLoadRt) && isNum(state?.chillerLoadPct)) {
    lines.push(
      `Building load is **${fmt(state.buildingLoadRt)} RT** with **${state.runningChillers}** chiller(s) online at **${state.chillerLoadPct}%** part load.`
    );
    if (state.chillerLoadPct > 92) {
      lines.push(
        'The running machines are near full load, so the plant may simply be unable to pull the return down without staging another chiller on.'
      );
    }
  }

  const series = (trends?.series ?? []).find((s: any) => s.channel === 'chwrtC');
  if (series && series.samples > 2) {
    lines.push(
      `Over the last ${trends.windowMinutes} minutes CHWR is **${series.direction}** — ${series.first} → ${series.last} °C (min ${series.min}, max ${series.max}).`
    );
  }

  return { lines, blocks };
}

/** Efficiency drivers, each stated only when the number supports it. */
function diagnoseEfficiency(eff: any, state: any): { lines: string[]; blocks: AnswerBlock[] } {
  const lines: string[] = [];
  const blocks: AnswerBlock[] = [];
  if (!eff) return { lines, blocks };

  const target = typeof eff.plantKwPerRtTarget === 'string'
    ? eff.plantKwPerRtTarget.replace(/[^\d.]/g, '')
    : eff.plantKwPerRtTarget;
  const targetNum = Number(target);
  const tone = isNum(eff.plantKwPerRt) && Number.isFinite(targetNum)
    ? eff.plantKwPerRt <= targetNum ? 'good' : 'warn'
    : 'neutral';

  blocks.push({
    kind: 'metric',
    label: 'Plant efficiency',
    value: `${eff.plantKwPerRt}`,
    unit: 'kW/RT',
    note: eff.plantKwPerRtTarget ? `target ${eff.plantKwPerRtTarget}` : undefined,
    tone,
  });

  lines.push(
    `The plant is running **${eff.plantKwPerRt} kW/RT** (COP ${eff.plantCop}) at **${fmt(eff.buildingLoadRt)} RT**, target ${eff.plantKwPerRtTarget ?? '—'}.`
  );

  const split = (eff.breakdown ?? [])
    .filter((b: any) => isNum(b.kw))
    .map((b: any) => `${b.component} ${fmt(b.kw, 0)} kW (${b.sharePct}%)`)
    .join(' · ');
  if (split) lines.push(`Where the power goes: ${split}.`);

  const c = eff.conditions ?? {};
  if (isNum(c.wetBulbC)) {
    lines.push(
      `Conditions behind that number: wet bulb **${c.wetBulbC} °C**, CHWST **${c.chwstC} °C**, CHWR **${c.chwrtC} °C** (ΔT ${c.chwDeltaTC} K), tower approach **${c.towerApproachC} K**, chillers at **${c.chillerLoadPct}%** part load.`
    );
  }

  // Named drivers, in the order they usually matter.
  const drivers: string[] = [];
  if (isNum(c.chillerLoadPct) && c.chillerLoadPct < 45) {
    drivers.push(
      `The machines are at **${c.chillerLoadPct}%** part load. Below about half load a centrifugal chiller's fixed losses start to dominate, and each running machine also carries its own pumps.`
    );
  }
  if (isNum(c.chillerLoadPct) && c.chillerLoadPct > 92) {
    drivers.push(`The machines are at **${c.chillerLoadPct}%** load, near the top of their curve where efficiency falls away again.`);
  }
  if (isNum(c.towerApproachC) && c.towerApproachC > 5) {
    drivers.push(
      `Tower approach is **${c.towerApproachC} K**. A wide approach means warmer condenser water than the wet bulb allows, and every extra Kelvin of condensing temperature costs chiller power.`
    );
  }
  if (isNum(c.chwDeltaTC) && c.chwDeltaTC < 4.5) {
    drivers.push(
      `ΔT is **${c.chwDeltaTC} K**, below the design band — the plant is moving more water than the load needs, which shows up directly as pump power.`
    );
  }
  const pumpShare = (eff.breakdown ?? [])
    .filter((b: any) => /pump/i.test(b.component))
    .reduce((a: number, b: any) => a + (b.sharePct ?? 0), 0);
  if (pumpShare > 16) {
    drivers.push(`Pumping is **${round(pumpShare, 1)}%** of plant power, above the 11–20% a water-cooled plant usually runs at.`);
  }
  if (drivers.length) lines.push('', ...drivers.map((d) => `- ${d}`));

  if (state?.calibration?.status === 'extrapolated') {
    lines.push(
      '',
      `> These figures come from the Digital Twin at an operating point outside its calibrated envelope (${state.calibration.reasons.join('; ')}), so treat the magnitudes as modelled rather than measured.`
    );
  }
  return { lines, blocks };
}

/* ─────────────────────────────────────────────── MPC explanation prose ── */

/** The physical mechanism behind each control move. General knowledge, applied
 *  to a real delta — never a number of its own. */
const MECHANISM: Record<string, { up: string; down: string }> = {
  chwstSetpointC: {
    up: 'a warmer chilled-water supply raises the evaporating temperature, which cuts compressor lift and therefore chiller power',
    down: 'a colder chilled-water supply increases lift and chiller power, so this is only chosen when capacity or the return limit demands it',
  },
  dpSetpointPsi: {
    up: 'a higher differential-pressure setpoint pushes the CHW pumps faster, which costs roughly the cube of the speed change but restores flow to the coils',
    down: 'a lower differential-pressure setpoint lets the CHW pumps slow down, and pump power falls with roughly the cube of speed',
  },
  runningChillers: {
    up: 'staging another chiller on spreads the load, moving each machine down its part-load curve — at the cost of that machine\'s auxiliaries',
    down: 'shedding a chiller removes its fixed losses and its dedicated pumps, at the cost of loading the remaining machines harder',
  },
  chwpSpeedPct: {
    up: 'faster chilled-water pumps deliver more flow, which lowers ΔT and pulls the return temperature back down',
    down: 'slower chilled-water pumps save cubic pump power, and the loop pays for it in a warmer return',
  },
  cwpSpeedPct: {
    up: 'faster condenser pumps narrow the condenser-water rise and improve the tube-bundle approach, lowering lift',
    down: 'slower condenser pumps save cubic pump power, but widen the condenser approach and push some of that saving back into the compressors',
  },
  ctFanSpeedPct: {
    up: 'more tower airflow brings the condenser water closer to the wet bulb, and colder condenser water is directly less chiller power',
    down: 'less tower airflow saves cubic fan power and lets the condenser water float up, which is usually the right trade at low load',
  },
};

function explainMpc(ctx: any): Composed {
  const lines: string[] = [];
  const blocks: AnswerBlock[] = [];
  const warnings: string[] = [];

  if (!ctx?.available) {
    return {
      markdown: `## MPC explanation\n\n${ctx?.reason ?? 'No MPC run is available to explain.'}\n\nRun the optimiser and I will explain the result against the plant's own solver diagnostics.`,
      blocks: [],
      actions: [ACTION_RUN_MPC],
      warnings: [],
    };
  }

  const isHorizon = ctx.runKind === 'horizon';
  lines.push(
    `## Why the MPC chose this`,
    '',
    ctx.basis === 'freshly-solved'
      ? `> No MPC run existed in this session, so I solved one against the current conditions to answer this.`
      : `Explaining the ${isHorizon ? 'receding-horizon' : 'steady-state'} run from ${new Date(ctx.ranAt).toLocaleTimeString('en-GB')}, started from the ${ctx.startedFrom}.`
  );

  const cond = ctx.conditions ?? {};
  lines.push(
    '',
    rows([
      ['Building load', isNum(cond.buildingLoadRt) ? `${fmt(cond.buildingLoadRt)} RT` : null],
      ['Wet bulb', isNum(cond.wetBulbC) ? `${cond.wetBulbC} °C` : null],
      ['Horizon', isHorizon ? `${cond.steps} × ${cond.stepMinutes} min (${cond.forecastKind} forecast)` : 'single steady-state operating point'],
    ])
  );

  const changed = (ctx.controls ?? []).filter((c: any) => c.changed);
  if (changed.length) {
    lines.push('', '### What it changed and why', '');
    for (const c of changed) {
      const direction = isNum(c.before) && isNum(c.after) ? (c.after > c.before ? 'up' : 'down') : null;
      const mech = direction ? MECHANISM[c.control]?.[direction] : null;
      const move = `**${c.label}** ${c.before}${c.unit ? ` ${c.unit}` : ''} → **${c.after}${c.unit ? ` ${c.unit}` : ''}**`;
      lines.push(mech ? `- ${move} — ${mech}.` : `- ${move}.`);
      if (isNum(c.before) && isNum(c.after)) {
        blocks.push({
          kind: 'comparison',
          label: c.label,
          before: `${c.before}${c.unit ? ` ${c.unit}` : ''}`,
          after: `${c.after}${c.unit ? ` ${c.unit}` : ''}`,
          delta: `${c.after - c.before > 0 ? '+' : ''}${round(c.after - c.before, 2)}${c.unit ? ` ${c.unit}` : ''}`,
        });
      }
    }
  } else {
    lines.push('', 'The optimiser left every control where it was — the plant is already at the cheapest point it can legally reach under the current constraints.');
  }

  const p = ctx.power ?? {};
  lines.push('', '### What it bought', '');
  if (isHorizon) {
    lines.push(
      rows([
        ['Baseline energy', isNum(p.baselinePlantKwh) ? `${fmt(p.baselinePlantKwh, 0)} kWh` : null],
        ['MPC energy', isNum(p.mpcPlantKwh) ? `${fmt(p.mpcPlantKwh, 0)} kWh` : null],
        ['Baseline efficiency', isNum(p.baselineKwPerRt) ? `${p.baselineKwPerRt} kW/RT` : null],
        ['MPC efficiency', isNum(p.mpcKwPerRt) ? `${p.mpcKwPerRt} kW/RT` : null],
        ['Headline saving', p.headline === 'kwPerRtPct' ? `${p.savingPctKwPerRt}% on kW/RT` : `${p.savingPctKwh}% on energy`],
      ])
    );
  } else {
    lines.push(
      rows([
        ['Plant power', `${fmt(p.baselinePlantKw, 0)} → **${fmt(p.mpcPlantKw, 0)}** kW`],
        ['Plant efficiency', `${p.baselineKwPerRt} → **${p.mpcKwPerRt}** kW/RT`],
        ['Saving', `${fmt(p.savingKw, 1)} kW (${p.savingPct}%)`],
      ])
    );
    if (p.split) {
      const [cb, ca] = p.split.chillerKw;
      const [hb, ha] = p.split.chwpKw;
      const [wb, wa] = p.split.cwpKw;
      const [tb, ta] = p.split.towerKw;
      lines.push(
        '',
        `The trade is visible in the split: chillers ${fmt(cb, 0)} → ${fmt(ca, 0)} kW, CHW pumps ${fmt(hb, 0)} → ${fmt(ha, 0)} kW, CW pumps ${fmt(wb, 0)} → ${fmt(wa, 0)} kW, tower fans ${fmt(tb, 0)} → ${fmt(ta, 0)} kW.`
      );
    }
    blocks.push({
      kind: 'comparison',
      label: 'Total plant power',
      before: `${fmt(p.baselinePlantKw, 0)} kW`,
      after: `${fmt(p.mpcPlantKw, 0)} kW`,
      delta: `${p.savingPct}%`,
      tone: isNum(p.savingPct) && p.savingPct > 0 ? 'good' : 'neutral',
    });
  }

  const t = ctx.temperatures ?? {};
  const chwr = isHorizon ? t.mpcChwrMaxC : t.mpcChwrC;
  if (isNum(chwr) && isNum(t.chwrLimitC)) {
    lines.push(
      '',
      `Return temperature ${isHorizon ? 'peaks at' : 'lands at'} **${chwr} °C** against the **${t.chwrLimitC} °C** limit — ${round(t.chwrLimitC - chwr, 2)} K of margin. That limit is what stops the CHWST and DP moves going further.`
    );
  }

  const binding = ctx.bindingConstraints ?? [];
  if (binding.length) {
    lines.push('', '### What limited it', '');
    for (const b of binding.slice(0, 5)) {
      lines.push(`- **${b.label}** — ${b.message ?? b.source}`);
    }
  }

  const obj = ctx.solver?.objectiveComponents;
  if (obj && Object.keys(obj).length) {
    const terms = Object.entries(obj)
      .filter(([, v]) => isNum(v) && Math.abs(v as number) > 0.01)
      .map(([k, v]) => `${k} ${fmt(v, 1)}`)
      .join(' · ');
    if (terms) lines.push('', `Objective terms for the applied step, in kW-equivalent: ${terms}.`);
  }

  if (ctx.solver?.fallbackUsed) {
    warnings.push(`The solver fell back to a heuristic: ${ctx.solver.fallbackReason ?? 'reason not recorded'}.`);
  }

  const trust = ctx.trust;
  if (trust) {
    lines.push('', '### How far to trust it', '', trust.headline);
    for (const c of trust.caveats.slice(0, 5)) lines.push(`- ${c}`);
    if (trust.verdict === 'questionable') {
      warnings.push(trust.headline);
      blocks.push({ kind: 'warning', text: trust.caveats[0] ?? trust.headline });
    }
  }

  const uncal = ctx.modelCalibration?.notFullyCalibrated ?? [];
  if (uncal.length) {
    lines.push(
      '',
      `> Model provenance: ${uncal.map((m: any) => `${m.label} (${m.status})`).join(', ')}. These parts of the twin were not fitted to this site's trend, so the direction of their response is physically shaped but the magnitude is an assumption.`
    );
  }

  return {
    markdown: lines.filter((l) => l !== undefined).join('\n'),
    blocks,
    actions: [ACTION_TRUST, ACTION_COMPARE, ACTION_RUN_MPC],
    warnings,
  };
}

/* ──────────────────────────────────────────────────────── the composer ── */

/**
 * Build the grounded answer for one turn.
 *
 * `results` are already-run tool results. Nothing in here calls a tool, which
 * is what makes it safe to run twice (once as the LLM's draft, once as the
 * fallback) with identical output.
 */
export function compose(message: string, c: Classification, results: ToolResult[]): Composed {
  const state = find(results, 'getPlantState');
  const summary = find(results, 'getPlantSummary');
  const eff = find(results, 'getPlantEfficiency');
  const trends = find(results, 'getPlantTrends');
  const knowledge = find(results, 'searchKnowledgeBase');
  const alarms = find(results, 'getActiveAlarms');
  const chillers = find(results, 'getChillerStatus');
  const pumps = find(results, 'getPumpStatus');
  const towers = find(results, 'getCoolingTowerStatus');
  const constraints = find(results, 'getCurrentConstraints');
  const mpcRun = find(results, 'runMPC');
  const mpcCompare = find(results, 'compareBaselineVsMPC');
  const mpcExplain = find(results, 'getMPCExplanationContext');
  const whatIf = find(results, 'runWhatIfScenario');
  const sim = find(results, 'runSimulation');
  const scenario = find(results, 'applyScenario') ?? find(results, 'applyCustomScenario');
  const scenarios = find(results, 'listScenarios');
  const proposal = find(results, 'proposeControlChange');

  const warnings: string[] = [];
  const blocks: AnswerBlock[] = [];
  for (const r of results) {
    if (!r.ok) warnings.push(`${r.tool} failed: ${r.error}`);
  }

  switch (c.intent) {
    /* ── concepts ─────────────────────────────────────────────────────── */
    case 'GENERAL_KNOWLEDGE': {
      const hits = knowledge?.hits ?? [];
      if (!hits.length) {
        return {
          markdown: composeUnknownConcept(message),
          blocks,
          actions: [ACTION_OPTIMISE],
          warnings,
        };
      }
      const primary = hits[0];
      const body = [`## ${primary.title.replace(/^.*? — /, '')}`, '', primary.excerpt];
      for (const extra of hits.slice(1, 3)) {
        body.push('', `### ${extra.title.replace(/^.*? — /, '')}`, '', extra.excerpt.slice(0, 500));
      }
      body.push('', '> General HVAC knowledge — this says nothing about what this plant is doing right now. Ask about the plant and I will read its live state.');
      return { markdown: body.join('\n'), blocks, actions: [ACTION_OPTIMISE], warnings };
    }

    /* ── plant status ─────────────────────────────────────────────────── */
    case 'PLANT_STATUS': {
      if (!summary) return unavailable('plant status', results, warnings);
      const h = summary.headline;
      blocks.push(
        { kind: 'metric', label: 'Plant load', value: fmt(h.buildingLoadRt), unit: 'RT' },
        { kind: 'metric', label: 'Plant power', value: fmt(h.totalPlantKw, 0), unit: 'kW' },
        { kind: 'metric', label: 'Efficiency', value: `${h.plantKwPerRt}`, unit: 'kW/RT' }
      );
      const md = [
        '## Plant status',
        '',
        rows([
          ['Load', `${fmt(h.buildingLoadRt)} RT`],
          ['Plant power', `${fmt(h.totalPlantKw, 0)} kW`],
          ['Efficiency', `${h.plantKwPerRt} kW/RT (COP ${h.plantCop})`],
          ['CHWS / CHWR', `${summary.chilledWater.chwstC} / ${summary.chilledWater.chwrtC} °C (ΔT ${summary.chilledWater.deltaTC} K)`],
          ['CHW flow / DP', `${fmt(summary.chilledWater.flowLs, 0)} L/s · ${summary.chilledWater.dpPsi} psi (${summary.chilledWater.dpKpa} kPa)`],
          ['CWS / CWR', `${summary.condenser.cwsC} / ${summary.condenser.cwrC} °C · approach ${summary.condenser.towerApproachC} K`],
          ['Weather', `${summary.weather.ambientTempC} °C dry bulb, ${summary.weather.humidityRh} %RH, wet bulb ${summary.weather.wetBulbC} °C`],
          ['Staging', `${summary.staging.chillers} chillers (${summary.staging.chillerNames.join(', ') || '—'}) at ${summary.staging.chillerLoadPct}% · ${summary.staging.chwp} CHWP · ${summary.staging.cwp} CWP · ${summary.staging.towers} towers`],
          ['Power split', `chillers ${fmt(summary.power.chillerKw, 0)} · CHWP ${fmt(summary.power.chwpKw, 0)} · CWP ${fmt(summary.power.cwpKw, 0)} · towers ${fmt(summary.power.towerKw, 0)} kW`],
          ['Active alarms', `${h.activeAlarms}`],
        ]),
      ];
      if (summary.alarms?.length) {
        md.push('', '### Alarms', '', ...summary.alarms.map((a: any) => `- **${a.severity}** — ${a.message}`));
      }
      if (summary.calibration?.status === 'extrapolated') {
        md.push('', `> The twin is extrapolating at this operating point: ${summary.calibration.reasons.join('; ')}.`);
      }
      return { markdown: md.join('\n'), blocks, actions: [ACTION_OPTIMISE, ACTION_RUN_MPC], warnings };
    }

    /* ── diagnosis ────────────────────────────────────────────────────── */
    case 'PLANT_DIAGNOSTIC': {
      if (!state) return unavailable('the plant state', results, warnings);
      const md: string[] = ['## What the plant is doing', ''];
      let diagnosed = false;

      if (c.topics.includes('chwrt') || c.topics.includes('deltaT')) {
        const d = diagnoseChwr(state, trends);
        md.push(...d.lines);
        blocks.push(...d.blocks);
        diagnosed = d.lines.length > 0;
      }

      if (!diagnosed && (c.topics.includes('efficiency') || c.topics.includes('energy'))) {
        const d = diagnoseEfficiency(eff ?? efficiencyFromState(state), state);
        md.push(...d.lines);
        blocks.push(...d.blocks);
        diagnosed = d.lines.length > 0;
      }

      if (!diagnosed) {
        md.push(
          rows([
            ['Load', `${fmt(state.buildingLoadRt)} RT`],
            ['CHWS / CHWR', `${state.chwstC} / ${state.chwrtC} °C (ΔT ${state.chwDeltaTC} K)`],
            ['CWS / CWR', `${state.cwsC} / ${state.cwrC} °C · approach ${state.towerApproachC} K`],
            ['Wet bulb', `${state.wetBulbC} °C`],
            ['Plant power', `${fmt(state.totalPlantKw, 0)} kW at ${state.plantKwPerRt} kW/RT`],
            ['Staging', `${state.runningChillers} chillers at ${state.chillerLoadPct}% part load`],
            ['DP', `${state.dpPsi} psi (${state.dpKpa} kPa), CHW pumps at ${state.chwpSpeedPct}%`],
          ])
        );
        const t = (trends?.series ?? []).filter((s: any) => s.samples > 2 && s.direction !== 'steady');
        if (t.length) {
          md.push('', '### What has moved recently', '', ...t.map((s: any) => `- **${s.channel}** is ${s.direction}: ${s.first} → ${s.last} over ${trends.windowMinutes} min.`));
        }
      }

      const violations = state.constraintStatus?.violations ?? [];
      if (violations.length) {
        md.push('', '### Constraints being hit', '', ...violations.map((v: any) => `- **${v.label}** — ${v.message}`));
        blocks.push({ kind: 'warning', text: violations[0].message });
      }
      if (state.alarms?.length) {
        md.push('', '### Active alarms', '', ...state.alarms.map((a: any) => `- **${a.severity}** — ${a.message}`));
      }
      const k = knowledge?.hits?.[0];
      if (k) md.push('', `> Background — ${k.title.replace(/^.*? — /, '')}: ${k.excerpt.split('\n\n')[0]}`);

      return { markdown: md.join('\n'), blocks, actions: [ACTION_OPTIMISE, ACTION_RUN_MPC], warnings };
    }

    /* ── efficiency ───────────────────────────────────────────────────── */
    case 'EFFICIENCY': {
      const source = eff ?? (state ? efficiencyFromState(state) : null);
      if (!source) return unavailable('plant efficiency', results, warnings);
      const d = diagnoseEfficiency(source, state);
      const md = ['## Plant efficiency', '', ...d.lines];
      blocks.push(...d.blocks);
      const t = (trends?.series ?? []).find((s: any) => s.channel === 'plantKwPerRt' && s.samples > 2);
      if (t && t.direction !== 'steady') {
        md.push('', `Over the last ${trends.windowMinutes} minutes kW/RT is ${t.direction}: ${t.first} → ${t.last}.`);
      }
      md.push('', 'Ask me to run the optimiser and I will tell you what the cheapest legal operating point is for these exact conditions.');
      return { markdown: md.join('\n'), blocks, actions: [ACTION_RUN_MPC, ACTION_OPTIMISE], warnings };
    }

    /* ── optimisation advice ──────────────────────────────────────────── */
    case 'OPTIMIZATION_ADVICE':
      return composeOptimisation({ state, eff, constraints, mpcRun, knowledge, blocks, warnings });

    /* ── equipment ────────────────────────────────────────────────────── */
    case 'EQUIPMENT': {
      const md: string[] = [];
      if (chillers) {
        md.push('## Chillers', '');
        md.push(
          `${chillers.running} of ${chillers.installed} machines running (${chillers.ratedCapacityRtEach} RT each). Duty order ${chillers.dutyOrder?.join(' → ') ?? '—'}.`,
          ''
        );
        for (const ch of chillers.chillers) {
          md.push(
            ch.status === 'running'
              ? `- **${ch.name}** — ${ch.loadPct}% load, ${fmt(ch.powerKw, 0)} kW, COP ${ch.cop}${isNum(ch.kwPerRt) ? ` (${ch.kwPerRt} kW/RT)` : ''}, CHW ${ch.supplyTempC} / ${ch.returnTempC} °C, CW ${ch.cwSupplyTempC} / ${ch.cwReturnTempC} °C`
              : `- **${ch.name}** — ${ch.status}`
          );
        }
        if (chillers.leastEfficientRunning) {
          md.push(
            '',
            `Least efficient running machine: **${chillers.leastEfficientRunning.name}** at ${chillers.leastEfficientRunning.kwPerRt} kW/RT and ${chillers.leastEfficientRunning.loadPct}% load.`
          );
        }
        if (chillers.lightestLoadedRunning && chillers.running > 1) {
          md.push(
            `Lightest loaded: **${chillers.lightestLoadedRunning.name}** at ${chillers.lightestLoadedRunning.loadPct}% — that is the candidate if you are considering staging down. Check the minimum-runtime timer before acting.`
          );
        }
      }
      if (pumps) {
        md.push('', '## Pumps', '');
        md.push(
          rows([
            ['CHW pumps', `${pumps.chwp.filter((p: any) => p.status === 'running').length} running of ${pumps.installed.chwp} at ${pumps.commandedSpeedPct.chwp}% · ${fmt(pumps.totals.chwpKw, 0)} kW · ${fmt(pumps.totals.chwFlowLs, 0)} L/s`],
            ['CW pumps', `${pumps.cwp.filter((p: any) => p.status === 'running').length} running of ${pumps.installed.cwp} at ${pumps.commandedSpeedPct.cwp}% · ${fmt(pumps.totals.cwpKw, 0)} kW · ${fmt(pumps.totals.cwFlowLs, 0)} L/s`],
            ['DP setpoint', `${pumps.dpSetpointPsi} psi (${pumps.dpSetpointKpa} kPa)`],
          ])
        );
      }
      if (towers) {
        md.push('', '## Cooling towers', '');
        md.push(
          rows([
            ['Running', `${towers.running} of ${towers.installed}`],
            ['Approach', `${towers.approachC} K above a ${towers.wetBulbC} °C wet bulb`],
            ['CWS / CWR', `${towers.cwsC} / ${towers.cwrC} °C`],
            ['Fan power', `${fmt(towers.totalTowerKw, 1)} kW`],
          ])
        );
      }
      if (!md.length) return unavailable('equipment status', results, warnings);
      return { markdown: md.join('\n'), blocks, actions: [ACTION_OPTIMISE, ACTION_RUN_MPC], warnings };
    }

    /* ── alarms ───────────────────────────────────────────────────────── */
    case 'ALARMS': {
      if (!alarms) return unavailable('alarms', results, warnings);
      if (!alarms.count && !alarms.constraintViolations?.length) {
        return {
          markdown: '## Alarms\n\nNo active alarms, and no constraint is being violated at the current operating point.',
          blocks: [{ kind: 'metric', label: 'Active alarms', value: '0', tone: 'good' }],
          actions: [ACTION_OPTIMISE],
          warnings,
        };
      }
      const md = [`## Active alarms (${alarms.count})`, ''];
      for (const a of alarms.alarms) {
        md.push(`### ${a.severity.toUpperCase()} — ${a.message}`);
        md.push(rows([['Asset', a.assetId], ['Acknowledged', a.acknowledged ? 'yes' : 'no'], ['Recommended', a.recommendedAction]]));
        for (const adj of a.recommendedAdjustments ?? []) {
          md.push(`- ${adj.label}: **${adj.suggestedValue}** ${adj.unit ?? ''} (now ${adj.currentValue})`);
        }
        md.push('');
      }
      if (alarms.constraintViolations?.length) {
        md.push('### Constraints being violated', '');
        for (const v of alarms.constraintViolations) md.push(`- **${v.label}** — ${v.message}`);
      }
      blocks.push({ kind: 'metric', label: 'Active alarms', value: `${alarms.count}`, tone: alarms.count ? 'bad' : 'good' });
      return { markdown: md.join('\n'), blocks, actions: [ACTION_OPTIMISE], warnings };
    }

    /* ── trends ───────────────────────────────────────────────────────── */
    case 'TRENDS': {
      if (!trends) return unavailable('trend history', results, warnings);
      if (trends.source === 'bms') {
        const md = [`## Measured history — ${trends.day}`, ''];
        for (const s of trends.series) {
          md.push(`- **${s.channel}** — mean ${s.mean}, range ${s.min} to ${s.max} over ${s.samples} buckets`);
        }
        return { markdown: md.join('\n'), blocks, actions: NO_ACTIONS, warnings };
      }
      if (!trends.available) {
        return {
          markdown: `## Recent trend\n\nI don't have trend history yet — the twin's rolling buffer starts empty each time the backend restarts and fills at one sample every two seconds while the plant view is open.\n\nMeasured T1 history is available instead: ask for the BMS trend for a specific day.`,
          blocks,
          actions: NO_ACTIONS,
          warnings,
        };
      }
      const md = [`## Last ${trends.windowMinutes} minutes`, '', `${trends.samples} samples.`, ''];
      for (const s of trends.series) {
        md.push(`- **${s.channel}** — ${s.direction}: ${s.first} → ${s.last} (min ${s.min}, max ${s.max})`);
      }
      if (trends.note) md.push('', `> ${trends.note}`);
      return { markdown: md.join('\n'), blocks, actions: NO_ACTIONS, warnings };
    }

    /* ── constraints ──────────────────────────────────────────────────── */
    case 'CONSTRAINTS': {
      if (!constraints) return unavailable('the constraint set', results, warnings);
      const cw = constraints.chilledWater;
      const cond = constraints.condenser;
      const st = constraints.staging;
      const md: string[] = [];
      if (constraints.bindingNow?.length) {
        md.push(
          '## What is limiting the plant',
          '',
          ...constraints.bindingNow.map((b: any) => `- **${b.label}** — ${b.message}`),
          '',
          '### The full envelope',
          ''
        );
        blocks.push({ kind: 'warning', text: constraints.bindingNow[0].message });
      } else {
        md.push(
          '## Nothing is binding right now',
          '',
          'No constraint is being violated at the current operating point — the plant is operating inside every configured limit. Here is the envelope it has to stay inside.',
          ''
        );
      }
      md.push(
        rows([
          ['CHWST', `${cw.chwstMinC} – ${cw.chwstMaxC} °C`],
          ['CHWR limit', `${cw.maxChwrC} °C`],
          ['CHW DP', `${cw.dpMinPsi} – ${cw.dpMaxPsi} psi (${cw.dpMinKpa} – ${cw.dpMaxKpa} kPa)`],
          ['CHWP speed', `${cw.chwpSpeedPct[0]} – ${cw.chwpSpeedPct[1]} %`],
          ['CWP speed', `${cond.cwpSpeedPct[0]} – ${cond.cwpSpeedPct[1]} %`],
          ['CT fan speed', `${cond.towerFanPct[0]} – ${cond.towerFanPct[1]} %`],
          ['Tower approach floor', `${cond.minApproachC} K above wet bulb`],
          ['Chillers staged', `${st.minRunningChillers} – ${st.maxRunningChillers} (${st.requiredStandbyChillers} standby required)`],
          ['Dwell timers', `${st.minRuntimeMin} min minimum run, ${st.minOffTimeMin} min minimum off`],
          ['Move limits per cycle', `CHWST ${constraints.moveLimitsPerCycle.chwstC} K · DP ${constraints.moveLimitsPerCycle.dpPsi} psi · CWP ${constraints.moveLimitsPerCycle.cwpSpeedPct}% · CT ${constraints.moveLimitsPerCycle.ctFanSpeedPct}%`],
        ])
      );
      const env = constraints.calibratedEnvelope ?? {};
      const envRows = Object.entries(env).map(([, v]: [string, any]) => `${v.label} ${v.min}–${v.max} ${v.unit}`);
      if (envRows.length) {
        md.push('', `> Separately from the constraints, the twin was calibrated over: ${envRows.join(' · ')}. Outside that range its numbers are extrapolations.`);
      }
      return { markdown: md.join('\n'), blocks, actions: [ACTION_RUN_MPC], warnings };
    }

    /* ── MPC ──────────────────────────────────────────────────────────── */
    case 'MPC_EXPLAIN': {
      const explained = explainMpc(mpcExplain);
      return { ...explained, warnings: [...warnings, ...explained.warnings] };
    }

    case 'MPC_TRUST': {
      if (!mpcExplain?.available) {
        return {
          markdown: `## MPC result confidence\n\n${mpcExplain?.reason ?? 'There is no MPC result to assess yet.'}`,
          blocks,
          actions: [ACTION_RUN_MPC],
          warnings,
        };
      }
      const trust = mpcExplain.trust;
      const md = ['## How far to trust this result', '', `**${trust.headline}**`, ''];
      if (trust.caveats.length) {
        md.push(...trust.caveats.map((x: string) => `- ${x}`));
      } else {
        md.push('- No caveat was raised against this run.');
      }
      const uncal = mpcExplain.modelCalibration?.notFullyCalibrated ?? [];
      if (uncal.length) {
        md.push('', '### Model provenance', '');
        for (const m of uncal) md.push(`- **${m.label}** — ${m.status}${m.missingInputs?.length ? `, missing ${m.missingInputs.join(', ')}` : ''}`);
      }
      if (trust.verdict !== 'verified') {
        blocks.push({ kind: 'warning', text: trust.headline });
        warnings.push(trust.headline);
      }
      return { markdown: md.join('\n'), blocks, actions: [ACTION_EXPLAIN, ACTION_COMPARE], warnings };
    }

    case 'MPC_APPLY': {
      if (!mpcRun) return unavailable('the optimiser', results, warnings);
      if (!mpcRun.solved) {
        return {
          markdown: `## Nothing to apply\n\nThe optimiser found no feasible operating point better than the current one, so there is no control state to commit.`,
          blocks,
          actions: [{ id: 'constraints', label: 'Show the constraints', prompt: 'what constraints are limiting the plant?' }],
          warnings,
        };
      }
      if (!mpcRun.changes.length) {
        return {
          markdown: `## Already there\n\nThe optimum is the operating point the plant is already on — there is nothing to change.`,
          blocks,
          actions: [ACTION_COMPARE],
          warnings,
        };
      }
      const md = [
        '## Apply the MPC optimum — confirmation required',
        '',
        'I re-solved against the current conditions. This is what committing it would set:',
        '',
      ];
      for (const ch of mpcRun.changes) {
        md.push(`- **${ch.label}:** ${ch.before} → **${ch.after}**${ch.unit ? ` ${ch.unit}` : ''}`);
      }
      md.push(
        '',
        rows([
          ['Predicted plant power', `${fmt(mpcRun.before.totalPlantKw, 0)} → **${fmt(mpcRun.after.totalPlantKw, 0)}** kW`],
          ['Predicted efficiency', `${mpcRun.before.plantKwPerRt} → **${mpcRun.after.plantKwPerRt}** kW/RT`],
          ['Predicted CHW return', `${mpcRun.before.chwrC} → **${mpcRun.after.chwrC}** °C`],
        ]),
        '',
        '> Nothing has been applied yet. Confirming moves the Digital Twin — and the schematic every operator is watching — onto this control state. It is never written to a real BMS.'
      );
      if (mpcRun.trust?.caveats?.length) {
        md.push('', '### Before you do', '', ...mpcRun.trust.caveats.slice(0, 4).map((x: string) => `- ${x}`));
      }
      blocks.push({
        kind: 'comparison',
        label: 'Plant power if applied',
        before: `${fmt(mpcRun.before.totalPlantKw, 0)} kW`,
        after: `${fmt(mpcRun.after.totalPlantKw, 0)} kW`,
        delta: `−${mpcRun.savingPct}%`,
        tone: 'good',
      });
      return { markdown: md.join('\n'), blocks, actions: [ACTION_EXPLAIN, ACTION_TRUST], warnings };
    }

    case 'MPC_RUN': {
      if (!mpcRun) return unavailable('the optimiser', results, warnings);
      if (!mpcRun.solved) {
        return {
          markdown: `## MPC could not find a feasible point\n\nThe optimiser evaluated ${mpcRun.evaluatedCandidates} candidates and none satisfied every constraint.\n\nRejections by constraint:\n${Object.entries(mpcRun.rejectionsByCode).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
          blocks: [{ kind: 'warning', text: 'No feasible operating point under the current constraints.' }],
          actions: [{ id: 'constraints', label: 'Show the constraints', prompt: 'what constraints are limiting the plant?' }],
          warnings,
        };
      }
      const b = mpcRun.before;
      const a = mpcRun.after;
      const md = [
        '## MPC complete',
        '',
        rows([
          ['Predicted plant power', `${fmt(b.totalPlantKw, 0)} → **${fmt(a.totalPlantKw, 0)}** kW`],
          ['Predicted efficiency', `${b.plantKwPerRt} → **${a.plantKwPerRt}** kW/RT`],
          ['Predicted saving', `${fmt(mpcRun.savingKw, 1)} kW (${mpcRun.savingPct}%)`],
          ['Conditions', `${fmt(mpcRun.input.buildingLoadRt)} RT at ${round(mpcRun.input.wetBulbC, 1)} °C wet bulb`],
          ['Search', `${mpcRun.evaluatedCandidates} candidates, ${mpcRun.feasibleCandidates} feasible`],
        ]),
        '',
        '### Changes it proposes',
        '',
      ];
      if (mpcRun.changes.length) {
        for (const ch of mpcRun.changes) {
          md.push(`- **${ch.label}:** ${ch.before} → **${ch.after}**${ch.unit ? ` ${ch.unit}` : ''}`);
        }
      } else {
        md.push('- None — the plant is already at the optimiser\'s best legal point.');
      }
      md.push(
        '',
        mpcRun.committedToTwin
          ? '> These settings have been applied to the twin.'
          : '> Nothing has been applied. This is a prediction against the Digital Twin — use **Apply MPC result** to move the twin onto it.'
      );
      const trust = mpcRun.trust;
      if (trust?.caveats?.length) {
        md.push('', '### Read with care', '', ...trust.caveats.slice(0, 4).map((x: string) => `- ${x}`));
        if (trust.verdict === 'questionable') warnings.push(trust.headline);
      }
      blocks.push({
        kind: 'comparison',
        label: 'Plant power',
        before: `${fmt(b.totalPlantKw, 0)} kW`,
        after: `${fmt(a.totalPlantKw, 0)} kW`,
        delta: `−${mpcRun.savingPct}%`,
        tone: 'good',
      });
      return {
        markdown: md.join('\n'),
        blocks,
        actions: [
          { id: 'apply-mpc', label: 'Apply MPC result', prompt: 'apply the MPC result to the twin', tone: 'primary' },
          ACTION_EXPLAIN,
          ACTION_TRUST,
        ],
        warnings,
      };
    }

    case 'MPC_COMPARE': {
      if (!mpcCompare) return unavailable('the horizon comparison', results, warnings);
      const s = mpcCompare.savings;
      const md = [
        `## Baseline vs MPC — ${mpcCompare.hoursCovered} h${mpcCompare.day ? ` of ${mpcCompare.day}` : ''}`,
        '',
        rows([
          ['Conditions', `${mpcCompare.steps} × ${mpcCompare.stepMinutes} min, ${mpcCompare.forecast?.kind ?? 'forecast'}`],
          ['Baseline energy', `${fmt(mpcCompare.baselineTotals?.totalPlantKwh, 0)} kWh`],
          ['MPC energy', `${fmt(mpcCompare.mpcTotals?.totalPlantKwh, 0)} kWh`],
          ['Baseline efficiency', `${s.kwPerRtBaseline} kW/RT`],
          ['MPC efficiency', `${s.kwPerRtMpc} kW/RT`],
          ['Cooling delivered', `${fmt(s.deliveredRtHoursBaseline, 0)} → ${fmt(s.deliveredRtHoursMpc, 0)} RT·h (${s.deliveredRtHoursDeltaPct}%)`],
        ]),
        '',
        `**Headline: ${mpcCompare.headlineFigure.pct}% on ${mpcCompare.headlineFigure.metric}** — ${mpcCompare.headlineFigure.reason}.`,
      ];
      if (mpcCompare.changes?.length) {
        md.push('', '### First applied move', '', ...mpcCompare.changes.map((ch: any) => `- **${ch.label}:** ${ch.before} → **${ch.after}** ${ch.unit}`));
      }
      if (mpcCompare.caveats?.length) {
        md.push('', '### Caveats', '', ...mpcCompare.caveats.map((x: string) => `- ${x}`));
        warnings.push(...mpcCompare.caveats.slice(0, 2));
      }
      blocks.push({
        kind: 'comparison',
        label: `Efficiency over ${mpcCompare.hoursCovered} h`,
        before: `${s.kwPerRtBaseline} kW/RT`,
        after: `${s.kwPerRtMpc} kW/RT`,
        delta: `${s.kwPerRtPct}%`,
        tone: 'good',
      });
      if (mpcCompare.trust?.verdict === 'questionable') {
        blocks.push({ kind: 'warning', text: mpcCompare.trust.headline });
      }
      return { markdown: md.join('\n'), blocks, actions: [ACTION_EXPLAIN, ACTION_TRUST], warnings };
    }

    /* ── simulation ───────────────────────────────────────────────────── */
    case 'WHAT_IF': {
      if (!whatIf) {
        // The planner could not extract numbers; say what is needed.
        return {
          markdown: [
            '## What-if',
            '',
            'I can simulate that on the Digital Twin, but I need the condition as a number. Tell me a value for any of these and I will run it:',
            '',
            '- building load in RT',
            '- outdoor wet bulb or dry bulb in °C',
            '- CHWST or CHWR setpoint in °C',
            '- CHW differential pressure in kPa or psi',
            '- CHW pump, CW pump or tower fan speed in %',
            '- the number of chillers to stage',
            '',
            state ? `For reference, right now: **${fmt(state.buildingLoadRt)} RT**, wet bulb **${state.wetBulbC} °C**, CHWST **${state.chwstC} °C**, DP **${state.dpPsi} psi**, **${state.runningChillers}** chillers online.` : '',
          ].join('\n'),
          blocks,
          actions: NO_ACTIONS,
          warnings,
        };
      }
      if (!whatIf.ran) {
        return { markdown: `## What-if\n\n${whatIf.reason}`, blocks, actions: NO_ACTIONS, warnings };
      }
      const md = ['## What-if on the Digital Twin', ''];
      md.push('**Condition simulated**', '');
      for (const r of whatIf.requested) {
        md.push(`- ${r.label}: ${r.from ?? '—'} → **${r.to}** ${r.unit}`);
      }
      md.push('', '**Result**', '');
      for (const o of whatIf.outcome) {
        if (o.before === null || o.after === null) continue;
        if (o.delta === 0) continue;
        md.push(`- **${o.label}:** ${o.before} → **${o.after}** ${o.unit}${isNum(o.deltaPct) ? ` (${o.deltaPct > 0 ? '+' : ''}${o.deltaPct}%)` : ''}`);
      }
      const power = whatIf.outcome.find((o: any) => o.label === 'Total plant power');
      const effOut = whatIf.outcome.find((o: any) => o.label === 'Plant efficiency');
      if (power && isNum(power.before) && isNum(power.after)) {
        blocks.push({
          kind: 'comparison',
          label: 'Total plant power',
          before: `${fmt(power.before, 0)} kW`,
          after: `${fmt(power.after, 0)} kW`,
          delta: `${power.deltaPct > 0 ? '+' : ''}${power.deltaPct}%`,
          tone: power.delta > 0 ? 'warn' : 'good',
        });
      }
      if (effOut && isNum(effOut.after)) {
        blocks.push({ kind: 'metric', label: 'Efficiency at that condition', value: `${effOut.after}`, unit: 'kW/RT' });
      }
      if (whatIf.alarmsAfter > whatIf.alarmsBefore) {
        md.push('', `⚠️ That condition raises the active alarm count from ${whatIf.alarmsBefore} to ${whatIf.alarmsAfter}.`);
      }
      for (const n of whatIf.notes ?? []) md.push('', `> ${n}`);
      if (whatIf.calibration?.status === 'extrapolated') {
        md.push('', `> This condition is outside the twin's calibrated envelope: ${whatIf.calibration.reasons.join('; ')}. The direction of the response is modelled; the magnitude is an extrapolation.`);
        warnings.push('Simulated outside the twin\'s calibration envelope.');
      }
      md.push('', '> Nothing was changed on the plant — this was scored on the twin.');
      return { markdown: md.join('\n'), blocks, actions: [ACTION_RUN_MPC], warnings };
    }

    case 'SIMULATE_TIME': {
      if (!sim) return unavailable('the simulator', results, warnings);
      const md = [
        `## Simulation advanced ${sim.minutesAdvanced} minutes`,
        '',
        rows([
          ['Plant power', `${fmt(sim.plantKw.before, 0)} → **${fmt(sim.plantKw.after, 0)}** kW`],
          ['Building load', `${fmt(sim.buildingLoadRt.before)} → **${fmt(sim.buildingLoadRt.after)}** RT`],
          ['CHWR', `${sim.chwrC.before} → **${sim.chwrC.after}** °C`],
        ]),
      ];
      if (sim.newAlarms?.length) {
        md.push('', '### New alarms', '', ...sim.newAlarms.map((a: any) => `- **${a.severity}** — ${a.message}`));
      } else {
        md.push('', 'No new alarms were raised.');
      }
      return { markdown: md.join('\n'), blocks, actions: NO_ACTIONS, warnings };
    }

    case 'SCENARIO': {
      if (scenario?.ran) {
        const md = [`## Scenario applied — ${scenario.label}`, ''];
        if (scenario.description) md.push(scenario.description, '');
        if (scenario.applied?.length) {
          md.push('**Controls set**', '');
          for (const a of scenario.applied) md.push(`- ${a.label}: **${a.value}** ${a.unit}`);
          md.push('');
        }
        for (const r of scenario.rejected ?? []) md.push(`⚠️ ${r}`);
        for (const o of scenario.outcome) md.push(`- **${o.label}:** ${o.before} → **${o.after}** ${o.unit}`);
        if (scenario.activeAlarms?.length) md.push('', '### Alarms now active', '', ...scenario.activeAlarms.map((m: string) => `- ${m}`));
        md.push('', '> The twin now sits at this scenario. Ask for a plant summary to see the full state.');
        return { markdown: md.join('\n'), blocks, actions: [ACTION_RUN_MPC, ACTION_OPTIMISE], warnings };
      }
      if (scenario && !scenario.ran) {
        const presets = (scenario.scenarios ?? []).map((s: any) => `- **${s.id}** — ${s.label}`).join('\n');
        const md = [`## That scenario could not be applied`, '', scenario.reason];
        if (presets) md.push('', 'Presets available:', '', presets);
        else {
          // A rejected custom payload: the useful reply is which ids are real.
          const controls = find(results, 'getPlantControls')?.controls ?? [];
          if (controls.length) {
            md.push('', 'Control ids the twin accepts:', '');
            for (const c of controls.slice(0, 14)) {
              md.push(`- \`${c.id}\` — ${c.label}, now ${c.value} ${c.unit} (range ${c.min}–${c.max})`);
            }
          }
        }
        return { markdown: md.join('\n'), blocks, actions: NO_ACTIONS, warnings };
      }
      if (scenarios) {
        return {
          markdown: `## Available scenarios\n\n${scenarios.scenarios.map((s: any) => `- **${s.label}** (\`${s.id}\`) — ${s.description}`).join('\n')}\n\nSay "run the peak summer scenario" or name any of them.`,
          blocks,
          actions: NO_ACTIONS,
          warnings,
        };
      }
      return unavailable('scenarios', results, warnings);
    }

    /* ── control writes ───────────────────────────────────────────────── */
    case 'CONTROL_WRITE': {
      if (!proposal) return unavailable('the control set', results, warnings);
      if (proposal.isScenario) {
        return {
          markdown: `## That reads as a scenario\n\nSay "run the ${proposal.scenarioId} scenario" and I will load it on the twin.`,
          blocks,
          actions: [{ id: 'run-scenario', label: `Run ${proposal.scenarioId}`, prompt: `run the ${proposal.scenarioId} scenario` }],
          warnings,
        };
      }
      if (!proposal.proposed) {
        const available = (proposal.availableControls ?? [])
          .slice(0, 12)
          .map((x: any) => `- **${x.label}** — now ${x.value} ${x.unit} (range ${x.min}–${x.max})`)
          .join('\n');
        return {
          markdown: `## I could not resolve that change\n\n${proposal.reason}\n\nControls I can change on the Digital Twin — I never write to a real BMS:\n\n${available}`,
          blocks,
          actions: NO_ACTIONS,
          warnings,
        };
      }
      const md = ['## Proposed change — confirmation required', ''];
      for (const ch of proposal.changes) {
        md.push(`- **${ch.label}:** ${ch.currentValue} → **${ch.proposedValue}** ${ch.unit}`);
      }
      md.push('', '### Expected effect on the twin', '');
      for (const e of proposal.expectedEffect) md.push(`- **${e.label}:** ${e.before} → **${e.after}** (${e.delta})`);
      for (const w of proposal.warnings ?? []) md.push('', `⚠️ ${w}`);
      md.push('', '> Nothing has been changed. Confirm to apply this to the Digital Twin. I never write to a real BMS.');
      /*
       * The proposal's own warnings are NOT added to the turn's warnings, and
       * not repeated as blocks. They already appear twice — in the Markdown
       * above and inside the confirmation card, where a risk belongs, next to
       * the button that takes it. A third banner reads as three problems.
       */
      return { markdown: md.join('\n'), blocks, actions: NO_ACTIONS, warnings };
    }

    /* ── conversation ─────────────────────────────────────────────────── */
    case 'CAPABILITIES':
      return {
        markdown: [
          '## What I can do',
          '',
          'Ask me naturally — there are no commands to remember.',
          '',
          '- **Plant performance** — status, efficiency, what is driving power right now',
          '- **Diagnosis** — why a temperature, flow or power reading is where it is',
          '- **Equipment** — chillers, pumps, towers, staging, which machine is worst',
          '- **Alarms and constraints** — what is active, and what is limiting the plant',
          '- **MPC** — run the optimiser, explain its decision, and say how far to trust it',
          '- **Simulation** — what-if conditions and preset scenarios on the Digital Twin',
          '- **Concepts** — CHWST, kW/RT, approach, lift, staging, and how they interact',
          '',
          'I read plant numbers from the Digital Twin and the MPC solver, never from memory. Setpoint changes are proposed for your confirmation and never written to a real BMS.',
        ].join('\n'),
        blocks,
        actions: [ACTION_OPTIMISE, ACTION_RUN_MPC],
        warnings,
      };

    case 'SMALL_TALK':
      return {
        markdown: 'Ready when you are — ask me about plant performance, an alarm, an MPC result, or a what-if condition.',
        blocks,
        actions: [ACTION_OPTIMISE],
        warnings,
      };

    case 'OUT_OF_DOMAIN':
      return {
        markdown: [
          '## Outside this plant',
          '',
          'I cover the T1 chilled-water plant — chillers, chilled and condenser water, pumps, cooling towers, the Digital Twin and the MPC. Air-side conditions, zone temperatures, indoor air quality and occupancy are handled by other systems and are not in this twin, so I have no measurements for them.',
          '',
          'If it is the chilled-water side you meant, ask again naming the temperature or the equipment and I will read it from the plant.',
        ].join('\n'),
        blocks,
        actions: [ACTION_OPTIMISE],
        warnings,
      };

    /* ── unknown ──────────────────────────────────────────────────────── */
    case 'UNKNOWN':
    default:
      return composeUnknown(message, { state, knowledge, blocks, warnings });
  }
}

/* ────────────────────────────────────────────────── optimisation advice ── */

function composeOptimisation(ctx: {
  state: any; eff: any; constraints: any; mpcRun: any; knowledge: any;
  blocks: AnswerBlock[]; warnings: string[];
}): Composed {
  const { state, eff, constraints, mpcRun, blocks, warnings } = ctx;
  if (!state && !mpcRun) {
    return {
      markdown: [
        '## Optimising this plant',
        '',
        'The levers on a water-cooled chiller plant are chiller staging, the CHWST setpoint, the CHW differential-pressure setpoint, CHW pump speed, CW pump speed and cooling-tower fan speed. They interact — every one of them moves the operating point the others are optimised against — so they have to be solved together rather than tuned one at a time.',
        '',
        'I could not read the plant just now, so I cannot say which of them has the largest opportunity at this moment.',
      ].join('\n'),
      blocks,
      actions: [ACTION_RUN_MPC],
      warnings,
    };
  }

  const md = ['## Where the opportunity is right now', ''];
  if (eff) {
    md.push(
      rows([
        ['Current efficiency', `${eff.plantKwPerRt} kW/RT (COP ${eff.plantCop}), target ${eff.plantKwPerRtTarget ?? '—'}`],
        ['Load', `${fmt(eff.buildingLoadRt)} RT at ${eff.conditions?.wetBulbC} °C wet bulb`],
      ])
    );
    blocks.push({ kind: 'metric', label: 'Plant efficiency', value: `${eff.plantKwPerRt}`, unit: 'kW/RT', note: `target ${eff.plantKwPerRtTarget ?? '—'}` });
  }

  // The ranked opportunities come from the optimiser's actual answer, so each
  // one is a move the solver found feasible — not a generic suggestion.
  if (mpcRun?.solved && mpcRun.changes?.length) {
    md.push('', '### What the optimiser would change', '');
    for (const [i, ch] of mpcRun.changes.entries()) {
      const dir = isNum(ch.delta) ? (ch.delta > 0 ? 'up' : 'down') : null;
      const mech = dir ? MECHANISM[ch.control]?.[dir] : null;
      const to = ch.unit ? `**${ch.after}** ${ch.unit}` : `**${ch.after}**`;
      md.push(`${i + 1}. **${ch.label}** — ${ch.before} → ${to}${mech ? `. ${mech[0].toUpperCase()}${mech.slice(1)}.` : '.'}`);
    }
    md.push(
      '',
      rows([
        ['Predicted plant power', `${fmt(mpcRun.before.totalPlantKw, 0)} → **${fmt(mpcRun.after.totalPlantKw, 0)}** kW`],
        ['Predicted efficiency', `${mpcRun.before.plantKwPerRt} → **${mpcRun.after.plantKwPerRt}** kW/RT`],
        ['Predicted saving', `${fmt(mpcRun.savingKw, 1)} kW (${mpcRun.savingPct}%)`],
      ])
    );
    md.push('', '> Solved against the Digital Twin at the current load and wet bulb. Nothing has been applied.');
    blocks.push({
      kind: 'comparison',
      label: 'Achievable plant power',
      before: `${fmt(mpcRun.before.totalPlantKw, 0)} kW`,
      after: `${fmt(mpcRun.after.totalPlantKw, 0)} kW`,
      delta: `−${mpcRun.savingPct}%`,
      tone: 'good',
    });
    if (mpcRun.trust?.caveats?.length) {
      md.push('', '### Read with care', '', ...mpcRun.trust.caveats.slice(0, 3).map((x: string) => `- ${x}`));
      if (mpcRun.trust.verdict === 'questionable') warnings.push(mpcRun.trust.headline);
    }
  } else if (mpcRun && !mpcRun.solved) {
    md.push('', 'The optimiser found no feasible operating point better than the current one under the configured constraints.');
  } else if (state) {
    // No optimiser result — fall back to naming the levers against real values.
    md.push('', '### The levers, against what the plant is doing now', '');
    md.push(`1. **Chiller staging** — ${state.runningChillers} machine(s) online at ${state.chillerLoadPct}% part load.`);
    md.push(`2. **CHWST** — currently ${state.chwstC} °C, with CHWR at ${state.chwrtC} °C against a ${state.constraintStatus?.maxChwrC} °C limit.`);
    md.push(`3. **CHW DP** — currently ${state.dpPsi} psi (${state.dpKpa} kPa), pumps at ${state.chwpSpeedPct}%.`);
    md.push(`4. **CW pump speed** — currently ${state.cwpSpeedPct}%.`);
    md.push(`5. **Tower fans** — currently ${state.ctFanSpeedPct}%, holding a ${state.towerApproachC} K approach on a ${state.wetBulbC} °C wet bulb.`);
  }

  if (constraints?.bindingNow?.length) {
    md.push('', '### What is limiting the plant', '', ...constraints.bindingNow.map((b: any) => `- **${b.label}** — ${b.message}`));
  }

  md.push('', '**Next step:** apply the optimiser result to the twin, or ask me to compare baseline against MPC over the next few hours to see whether the saving survives the loop dynamics.');

  return {
    markdown: md.join('\n'),
    blocks,
    actions: [
      { id: 'apply-mpc', label: 'Apply MPC result', prompt: 'apply the MPC result to the twin', tone: 'primary' },
      ACTION_COMPARE,
      ACTION_EXPLAIN,
    ],
    warnings,
  };
}

/* ─────────────────────────────────────────────────────────── fallbacks ── */

/**
 * An unrecognised question. Never a command list.
 *
 * The knowledge base is searched, the plant is read, and whatever both produce
 * is offered — which for a reasonable HVAC question is usually a real answer.
 */
function composeUnknown(
  message: string,
  ctx: { state: any; knowledge: any; blocks: AnswerBlock[]; warnings: string[] }
): Composed {
  const { state, knowledge, blocks, warnings } = ctx;
  const hits = knowledge?.hits ?? [];
  const md: string[] = [];

  if (hits.length) {
    md.push(`## ${hits[0].title.replace(/^.*? — /, '')}`, '', hits[0].excerpt);
    if (hits[1]) md.push('', `### ${hits[1].title.replace(/^.*? — /, '')}`, '', hits[1].excerpt.slice(0, 450));
  } else {
    md.push('## I am not certain what you are asking', '');
    md.push(
      'I could not match that to a plant reading or to anything in the knowledge base. Try naming the measurement, the equipment or the decision you are asking about — for example a temperature, a pump, the staging, or the MPC result.'
    );
  }

  if (state) {
    md.push(
      '',
      '### Where the plant is right now',
      '',
      rows([
        ['Load', `${fmt(state.buildingLoadRt)} RT`],
        ['Plant power', `${fmt(state.totalPlantKw, 0)} kW at ${state.plantKwPerRt} kW/RT`],
        ['CHWS / CHWR', `${state.chwstC} / ${state.chwrtC} °C`],
        ['Chillers online', `${state.runningChillers}`],
        ['Active alarms', `${state.activeAlarmCount ?? (state.alarms?.length ?? 0)}`],
      ])
    );
  }

  return { markdown: md.join('\n'), blocks, actions: [ACTION_OPTIMISE, ACTION_RUN_MPC], warnings };
}

/** A concept question the knowledge base did not match. */
function composeUnknownConcept(message: string): string {
  const near = searchKnowledgeBase(message, { limit: 3, minScore: 0.4 });
  const md = ['## I don\'t have a definition for that', ''];
  md.push(
    'That term is not in the plant knowledge base, and I will not invent a definition for a term I do not hold.'
  );
  if (near.length) {
    md.push('', 'The closest entries I do have:', '', ...near.map((n) => `- ${n.title.replace(/^.*? — /, '')}`));
  }
  return md.join('\n');
}

/** A tool that should have answered did not. Say what is missing. */
function unavailable(what: string, results: ToolResult[], warnings: string[]): Composed {
  const errors = results.filter((r) => !r.ok);
  const md = [
    `## I don't have ${what} right now`,
    '',
    'That question needs live data from the Digital Twin, and the read did not come back. I will not answer it from memory — a made-up plant number is worse than no number.',
  ];
  if (errors.length) {
    md.push('', '**What failed**', '', ...errors.map((e) => `- \`${e.tool}\` — ${e.error}`));
  }
  md.push('', 'Try again in a moment, or check that the backend simulation is running.');
  return { markdown: md.join('\n'), blocks: [], actions: NO_ACTIONS, warnings };
}

/** Build an efficiency-shaped object out of a plant-state payload, so an
 *  efficiency answer still works when only `getPlantState` succeeded. */
function efficiencyFromState(state: any) {
  return {
    plantKwPerRt: state.plantKwPerRt,
    plantKwPerRtTarget: null,
    plantCop: state.plantCop,
    buildingLoadRt: state.buildingLoadRt,
    breakdown: [
      { component: 'Chillers', kw: state.chillerKw, sharePct: sharePct(state.chillerKw, state.totalPlantKw) },
      { component: 'CHW pumps', kw: state.chwpKw, sharePct: sharePct(state.chwpKw, state.totalPlantKw) },
      { component: 'CW pumps', kw: state.cwpKw, sharePct: sharePct(state.cwpKw, state.totalPlantKw) },
      { component: 'Cooling towers', kw: state.towerKw, sharePct: sharePct(state.towerKw, state.totalPlantKw) },
    ],
    conditions: {
      wetBulbC: state.wetBulbC,
      chwstC: state.chwstC,
      chwrtC: state.chwrtC,
      chwDeltaTC: state.chwDeltaTC,
      towerApproachC: state.towerApproachC,
      chillerLoadPct: state.chillerLoadPct,
    },
  };
}

function sharePct(part: unknown, total: unknown): number | null {
  return isNum(part) && isNum(total) && total > 0 ? round((part / total) * 100, 1) : null;
}
