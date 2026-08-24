/**
 * The Plant AI Assistant.
 *
 * The tests are organised around the two claims the feature makes, because
 * those are the two things that can quietly stop being true:
 *
 *   1. It understands free-form questions. So the routing tests never assert on
 *      a phrase — they assert that five different wordings of the same question
 *      reach the same tools, and that a question nobody anticipated still gets
 *      a grounded answer rather than a command menu.
 *
 *   2. It does not make plant numbers up. So every figure in an answer must be
 *      traceable to a tool result, a write must never happen without an
 *      explicit confirmation, and a language model that invents a saving must
 *      be overridden rather than published.
 *
 * Everything here runs with `forceComposer` or with a scripted provider, so no
 * test depends on a GPU, a VPN, or a model being in a particular mood.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  chat,
  confirmAction,
  classify,
  runTool,
  toolManifest,
  searchKnowledgeBase,
  setAiProvider,
  resetAiProvider,
  assistantStatus,
  resetConversations,
  clearMpcMemory,
  clearTrends,
} from '../src/assistant/index.ts';
import { resetPlantControls, stepPlantSimulation } from '../src/digital-twin/chiller/index.ts';

/** Run one turn with the deterministic composer — no model involved. */
const ask = (message, opts = {}) =>
  chat({ message, conversationId: opts.conversationId, context: opts.context }, { forceComposer: true, ...opts.chatOpts });

/** A scripted AI provider, so the LLM path is testable without a model. */
function stubProvider(reply, { ready = true, onPrompt } = {}) {
  return {
    name: 'stub',
    status: () => ({ ready, status: ready ? 'ready' : 'unavailable', provider: 'stub', model: 'stub-1', message: '' }),
    async complete(messages) {
      onPrompt?.(messages);
      return typeof reply === 'function' ? reply(messages) : reply;
    },
  };
}

beforeEach(() => {
  resetConversations();
  clearMpcMemory();
  clearTrends();
  resetAiProvider();
});

/* ─────────────────────────────────────────────────────────────── routing ── */

describe('free-form routing', () => {
  test('the same question in five wordings reaches the same tools', async () => {
    const wordings = [
      'why is energy high',
      'why power consumption so high',
      'what is causing my plant to use more power',
      'why is kW/RT bad',
      'why is efficiency poor today',
    ];
    const runs = [];
    for (const q of wordings) runs.push(await ask(q));

    for (const [i, r] of runs.entries()) {
      assert.ok(
        ['EFFICIENCY', 'PLANT_DIAGNOSTIC'].includes(r.intent),
        `"${wordings[i]}" classified as ${r.intent}`
      );
      assert.ok(
        r.toolsUsed.some((t) => t === 'getPlantEfficiency' || t === 'getPlantState'),
        `"${wordings[i]}" read no plant data (tools: ${r.toolsUsed})`
      );
      assert.match(r.message, /kW\/RT|kW/, `"${wordings[i]}" quoted no power figure`);
    }
  });

  test('a concept question is answered from knowledge, without reading the plant', async () => {
    const r = await ask('what is kW/RT');
    assert.equal(r.intent, 'GENERAL_KNOWLEDGE');
    assert.deepEqual(r.toolsUsed, ['searchKnowledgeBase']);
    assert.equal(r.sourceType, 'KNOWLEDGE_BASE');
    assert.match(r.message, /refrigeration ton|3\.517/i);
    // A definition must not quote this plant's operating point.
    assert.doesNotMatch(r.message, /3,?094 RT/);
  });

  test('"what is CHWST" returns the CHWST entry, not a document that mentions it', async () => {
    const hits = searchKnowledgeBase('what is CHWST');
    assert.ok(hits.length > 0);
    assert.match(hits[0].title, /CHWST/i);
    assert.match(hits[0].excerpt, /leaving the chillers|primary temperature setpoint/i);
  });

  test('a plant question reads the plant', async () => {
    const r = await ask('why is CHWR high');
    assert.equal(r.intent, 'PLANT_DIAGNOSTIC');
    assert.ok(r.toolsUsed.includes('getPlantState'));
    assert.equal(r.sourceType, 'DIGITAL_TWIN');
    // The answer must name the return limit it is being judged against.
    assert.match(r.message, /16 °C|return limit/i);
  });

  test('an optimisation question inspects the plant instead of answering in the abstract', async () => {
    const r = await ask('how to optimise');
    assert.equal(r.intent, 'OPTIMIZATION_ADVICE');
    assert.ok(r.toolsUsed.includes('getPlantState'), 'did not read plant state');
    assert.ok(r.toolsUsed.includes('runMPC'), 'did not solve for an optimum');
    assert.match(r.message, /kW\/RT/);
  });

  test('an alarm question uses the alarm tool', async () => {
    const r = await ask('are there any alarms');
    assert.equal(r.intent, 'ALARMS');
    assert.deepEqual(r.toolsUsed, ['getActiveAlarms']);
  });

  test('a question about another building system says so instead of guessing', async () => {
    const r = await ask('check air quality');
    assert.equal(r.intent, 'OUT_OF_DOMAIN');
    assert.match(r.message, /not in this twin|no measurements/i);
    assert.equal(r.toolsUsed.length, 0);
  });

  test('the classifier never returns a raw command match', () => {
    // The point of the rewrite: capitalisation, punctuation and filler must not
    // change the route.
    const variants = ['Run MPC', 'run mpc please', 'RUN MPC!', 'can you run mpc'];
    for (const v of variants) {
      assert.equal(classify(v).intent, 'MPC_RUN', `"${v}" did not route to MPC_RUN`);
    }
  });
});

/* ────────────────────────────────────────────────────────────────── MPC ── */

describe('MPC', () => {
  test('"run mpc" calls the optimiser and does not move the plant', async () => {
    const before = stepPlantSimulation().headers.chws;
    const r = await ask('run mpc');
    assert.equal(r.intent, 'MPC_RUN');
    assert.ok(r.toolsUsed.includes('runMPC'));
    assert.equal(r.sourceType, 'MPC_PREDICTION');
    assert.match(r.message, /Nothing has been applied|applied to the twin/i);
    assert.equal(stepPlantSimulation().headers.chws, before, 'the twin moved without confirmation');
  });

  test('the explanation uses the last real run rather than solving a new one', async () => {
    await ask('run mpc');
    const r = await ask('why did mpc increase chwst');
    assert.equal(r.intent, 'MPC_EXPLAIN');
    assert.ok(r.toolsUsed.includes('getMPCExplanationContext'));
    // It must name the mechanism AND the numbers from that run.
    assert.match(r.message, /lift/i);
    assert.match(r.message, /CHWST setpoint/i);
    assert.match(r.message, /Explaining the/i, 'did not say which run it was explaining');
    assert.doesNotMatch(r.message, /freshly/i, 'solved a new run despite one existing');
  });

  test('with no prior run, the explanation solves one and says so', async () => {
    const r = await ask('why did the mpc choose those settings');
    assert.equal(r.intent, 'MPC_EXPLAIN');
    assert.match(r.message, /No MPC run existed/i);
  });

  test('the trust assessment names its caveats rather than hiding them', async () => {
    await ask('run mpc');
    const r = await ask('is this mpc result trustworthy?');
    assert.equal(r.intent, 'MPC_TRUST');
    assert.match(r.message, /calibration envelope|steady-state optimum|unserved/i);
    assert.match(r.message, /Model provenance/i);
  });

  test('an MPC explanation reports the return limit and what bound the search', async () => {
    await ask('run mpc');
    const result = await runTool('getMPCExplanationContext', {});
    assert.ok(result.ok);
    const ctx = result.data;
    assert.equal(ctx.available, true);
    assert.ok(Number.isFinite(ctx.temperatures.chwrLimitC), 'no CHWR limit in the explanation context');
    assert.ok(Array.isArray(ctx.bindingConstraints));
    assert.ok(ctx.trust.verdict);
    assert.ok(ctx.modelCalibration.notFullyCalibrated.length > 0, 'no model provenance reported');
  });
});

/* ─────────────────────────────────────────────────────────── simulation ── */

describe('simulation and what-if', () => {
  test('a what-if with a number is simulated on the twin', async () => {
    const r = await ask('what happens if wet bulb becomes 30');
    assert.equal(r.intent, 'WHAT_IF');
    assert.ok(r.toolsUsed.includes('runWhatIfScenario'));
    assert.equal(r.sourceType, 'WHAT_IF_SIMULATION');
    assert.match(r.message, /Total plant power/);
    assert.match(r.message, /Nothing was changed on the plant/i);
  });

  test('a load what-if parses the tonnage out of the sentence', async () => {
    const r = await ask('simulate 3500 RT load');
    const call = await runTool('runWhatIfScenario', { buildingLoadRt: 3500 });
    assert.ok(call.ok && call.data.ran);
    assert.match(r.message, /3500|3,500/);
  });

  test('a direction with no number simulates a stated step rather than refusing', async () => {
    const r = await ask('what happens if wet bulb increases');
    assert.equal(r.intent, 'WHAT_IF');
    assert.ok(r.toolsUsed.includes('runWhatIfScenario'));
    assert.match(r.message, /No target was given/i, 'did not say what step it simulated');
  });

  test('a what-if outside the calibration envelope carries the warning', async () => {
    const r = await ask('what if wet bulb reaches 30 C');
    assert.ok(
      r.warnings.some((w) => /calibration/i.test(w)) || /calibrat/i.test(r.message),
      'no calibration caveat on an extrapolated condition'
    );
  });

  test('a pasted scenario preset is still understood', async () => {
    resetPlantControls();
    const r = await ask('{ "id": "night-low-load" }');
    assert.equal(r.intent, 'SCENARIO');
    assert.ok(r.toolsUsed.includes('applyScenario'));
    assert.match(r.message, /Scenario applied/i);
    resetPlantControls();
  });

  test('a pasted custom scenario is validated, applied and reported', async () => {
    resetPlantControls();
    const r = await ask('{ "label": "Hot afternoon", "controls": { "ctrl-building-load": 3500, "ctrl-ambient-temp": 36 } }');
    assert.equal(r.intent, 'SCENARIO');
    assert.ok(r.toolsUsed.includes('applyCustomScenario'));
    assert.match(r.message, /Hot afternoon/);
    assert.match(r.message, /3500/);
    resetPlantControls();
  });

  test('a scenario payload naming a control that does not exist is refused', async () => {
    const r = await ask('{ "controls": { "ctrl-nope": 5 } }');
    assert.match(r.message, /could not be applied/i);
    assert.match(r.message, /unknown control/i);
    // The useful reply names the ids that DO exist.
    assert.match(r.message, /ctrl-building-load/);
  });

  test('a scenario payload cannot reach a control outside its range', async () => {
    const result = await runTool('applyCustomScenario', {
      payload: JSON.stringify({ controls: { 'ctrl-chws-sp': 99 } }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.ran, true);
    assert.ok(result.data.rejected.some((r) => /clamped/.test(r)));
    assert.ok(stepPlantSimulation().headers.chws <= 10.01);
    resetPlantControls();
  });

  test('malformed JSON is reported, not silently ignored', async () => {
    const result = await runTool('applyCustomScenario', { payload: '{ oops' });
    assert.equal(result.ok, true);
    assert.equal(result.data.ran, false);
    assert.match(result.data.reason, /not valid JSON/i);
  });

  test('a what-if never mutates the twin', async () => {
    const before = stepPlantSimulation().headers.buildingLoadRt;
    await ask('what if load becomes 5000 RT');
    assert.equal(stepPlantSimulation().headers.buildingLoadRt, before);
  });
});

/* ──────────────────────────────────────────────── safety and confirmation ── */

describe('write safety', () => {
  test('a setpoint change is proposed, previewed and NOT applied', async () => {
    const before = stepPlantSimulation().headers.chws;
    const r = await ask('set CHWS to 8.2 C', { conversationId: 'w1' });

    assert.equal(r.intent, 'CONTROL_WRITE');
    assert.equal(r.proposedActions.length, 1);
    const action = r.proposedActions[0];
    assert.equal(action.kind, 'control-change');
    assert.ok(action.expectedEffect.length > 0, 'no simulated preview on the proposal');
    assert.match(r.message, /confirmation required/i);
    assert.equal(stepPlantSimulation().headers.chws, before, 'the setpoint moved without confirmation');
  });

  test('confirming applies it, and the same confirmation cannot be replayed', async () => {
    resetPlantControls();
    const r = await ask('set CHWS to 8.2 C', { conversationId: 'w2' });
    const action = r.proposedActions[0];

    const applied = await confirmAction('w2', action.id);
    assert.equal(applied.applied, true);
    assert.ok(applied.outcome.length > 0);
    assert.ok(Math.abs(stepPlantSimulation().headers.chws - 8.2) < 0.35, 'the confirmed change did not reach the twin');

    const replay = await confirmAction('w2', action.id);
    assert.equal(replay.applied, false);
    assert.equal(replay.error, 'proposal-not-found');
    resetPlantControls();
  });

  test('"apply the MPC result" proposes the whole control vector and applies nothing', async () => {
    resetPlantControls();
    const before = stepPlantSimulation().headers.chws;
    const r = await ask('apply the MPC result to the twin', { conversationId: 'w4' });

    assert.equal(r.intent, 'MPC_APPLY');
    assert.ok(r.toolsUsed.includes('runMPC'));
    assert.equal(r.proposedActions.length, 1);
    assert.equal(r.proposedActions[0].kind, 'apply-mpc');
    assert.ok(r.proposedActions[0].changes.length > 1, 'a single control is not a whole optimum');
    assert.match(r.message, /confirmation required/i);
    assert.equal(stepPlantSimulation().headers.chws, before, 'the optimum was applied without confirmation');

    const applied = await confirmAction('w4', r.proposedActions[0].id);
    assert.equal(applied.applied, true);
    assert.notEqual(stepPlantSimulation().headers.chws, before, 'the confirmed optimum did not reach the twin');
    resetPlantControls();
  });

  test('an unknown proposal id is refused', async () => {
    const result = await confirmAction('nope', 'act-does-not-exist');
    assert.equal(result.applied, false);
    assert.match(result.message, /no longer available/i);
  });

  test('the assistant never claims to have written to a real BMS', async () => {
    const r = await ask('set CHWST to 8 degrees', { conversationId: 'w3' });
    assert.match(r.message, /never write to a real BMS|Digital Twin/i);
  });
});

/* ──────────────────────────────────────────────────────── tool security ── */

describe('tool allowlist', () => {
  test('an unknown tool is refused with the list of real ones', async () => {
    const result = await runTool('dropDatabase', {});
    assert.equal(result.ok, false);
    assert.match(result.error, /not an available tool/);
  });

  test('arguments are validated and out-of-range values are clamped, not passed through', async () => {
    const result = await runTool('runWhatIfScenario', { buildingLoadRt: 999999 });
    assert.equal(result.ok, true);
    assert.equal(result.args.buildingLoadRt, 8000, 'the load was not capped at the declared maximum');
    assert.ok(result.warnings?.some((w) => /capped/.test(w)));
  });

  test('a required argument cannot be omitted', async () => {
    const result = await runTool('applyScenario', {});
    assert.equal(result.ok, false);
    assert.match(result.error, /required/);
  });

  test('an unknown argument is reported rather than silently dropped', async () => {
    const result = await runTool('getPlantState', { sudo: true });
    assert.equal(result.ok, true);
    assert.ok(result.warnings?.some((w) => /unknown argument "sudo"/.test(w)));
  });

  test('the manifest declares a kind and a source type for every tool', () => {
    const tools = toolManifest();
    assert.ok(tools.length >= 15, `only ${tools.length} tools registered`);
    for (const t of tools) {
      assert.ok(['read', 'simulate', 'write'].includes(t.kind), `${t.name} has kind ${t.kind}`);
      assert.ok(t.sourceType, `${t.name} declares no source type`);
      assert.ok(t.description.length > 20, `${t.name} has no usable description`);
    }
  });

  test('the only write tool builds a preview and mutates nothing', async () => {
    const before = stepPlantSimulation().headers.chws;
    const writeTools = toolManifest().filter((t) => t.kind === 'write');
    assert.deepEqual(writeTools.map((t) => t.name), ['proposeControlChange']);
    const result = await runTool('proposeControlChange', { request: 'set chws to 9' });
    assert.equal(result.ok, true);
    assert.equal(result.data.committedToTwin, false);
    assert.equal(stepPlantSimulation().headers.chws, before);
  });
});

/* ────────────────────────────────────────────────────── failure handling ── */

describe('missing data and tool failures', () => {
  test('a failed tool is reported, and the answer does not fill the gap', async () => {
    const result = await runTool('getPlantTrends', { source: 'bms', day: 'not-a-day' });
    // Either the artifact is absent or the day is unknown; both must be honest.
    assert.equal(result.ok, true);
    if (!result.data.available) {
      assert.match(result.data.reason, /not present/i);
    }
  });

  test('an unanswerable measurement request says so instead of estimating', async () => {
    // No trend history has accumulated in a fresh process.
    clearTrends();
    const r = await ask('how has CHWR trended over the last hour?');
    assert.match(r.message, /trend|history/i);
    assert.ok(
      /don't have|no trend history|starts empty|samples/i.test(r.message),
      'did not admit the history is thin'
    );
  });

  test('a tool error surfaces in toolErrors rather than being swallowed', async () => {
    const r = await chat({ message: 'plant status' }, { forceComposer: true });
    assert.ok(Array.isArray(r.toolErrors));
    // Nothing should have failed here, but the field must exist for the UI.
    assert.equal(r.toolErrors.length, 0);
  });
});

/* ───────────────────────────────────────────────────────── conversation ── */

describe('conversation awareness', () => {
  test('a follow-up with no subject inherits the previous one', async () => {
    const first = await ask('why is CHWR high', { conversationId: 'c1' });
    assert.ok(first.toolsUsed.includes('getPlantState'));

    const second = await ask('what if I increase the pump speed?', { conversationId: 'c1' });
    assert.equal(second.intent, 'WHAT_IF');
    assert.ok(second.toolsUsed.includes('runWhatIfScenario') || second.toolsUsed.includes('getPlantState'));
    assert.equal(second.conversationId, 'c1');
  });

  test('the conversation id is stable across turns', async () => {
    const a = await ask('plant status', { conversationId: 'c2' });
    const b = await ask('and the alarms?', { conversationId: 'c2' });
    assert.equal(a.conversationId, 'c2');
    assert.equal(b.conversationId, 'c2');
  });

  test('page context steers an ambiguous question', async () => {
    const r = await ask('why is this one loaded like that?', {
      context: { page: 'plant', selectedEquipment: 'ch-3' },
    });
    assert.ok(r.toolsUsed.length > 0, 'a contextual question read nothing');
  });
});

/* ────────────────────────────────────────────────── hallucination control ── */

describe('grounding', () => {
  test('a model-invented saving is rejected in favour of the verified answer', async () => {
    setAiProvider(
      stubProvider(
        'Raising CHWST to 8.5 °C will save this plant 8% on total energy, worth $42,000 a year.'
      )
    );
    const r = await chat({ message: 'what should I optimise?' });
    assert.equal(r.answeredBy, 'composer', 'published an unbacked saving claim');
    assert.ok(r.warnings.some((w) => /unsupported saving/i.test(w)));
    assert.doesNotMatch(r.message, /42,000/);
  });

  test('figures the model did not get from a tool are flagged', async () => {
    setAiProvider(
      stubProvider('The plant is running at 0.912 kW/RT with a return temperature of 19.7 °C.')
    );
    const r = await chat({ message: 'how is the plant doing?' });
    assert.equal(r.answeredBy, 'llm');
    assert.ok(r.unverifiedFigures.length >= 2, `expected flagged figures, got ${JSON.stringify(r.unverifiedFigures)}`);
    assert.ok(r.warnings.some((w) => /not in the retrieved plant data/i.test(w)));
  });

  test('figures that ARE in the tool results pass the audit', async () => {
    const truth = await ask('plant status');
    const kw = truth.message.match(/([\d,]+) kW/)?.[1];
    assert.ok(kw, 'the composer answer quoted no plant power');
    setAiProvider(stubProvider(`The plant is drawing ${kw} kW right now.`));
    const r = await chat({ message: 'plant status' });
    assert.equal(r.answeredBy, 'llm');
    assert.deepEqual(r.unverifiedFigures, []);
  });

  test('hedged textbook figures are not treated as plant claims', async () => {
    setAiProvider(
      stubProvider('Raising CHWST typically reduces chiller power by roughly 2% per Kelvin.')
    );
    const r = await chat({ message: 'why does raising CHWST help?' });
    assert.deepEqual(r.unverifiedFigures, []);
  });

  test('the composer path can only quote real numbers', async () => {
    const r = await ask('plant status');
    assert.equal(r.answeredBy, 'composer');
    assert.deepEqual(r.unverifiedFigures, []);
    const live = stepPlantSimulation();
    const load = Math.round(live.headers.buildingLoadRt).toLocaleString('en-US');
    assert.ok(r.message.includes(load), `answer did not quote the live load ${load}`);
  });
});

/* ──────────────────────────────────────────────── the provider interface ── */

describe('AI provider abstraction', () => {
  test('the assistant answers with no model at all', async () => {
    setAiProvider(stubProvider(null, { ready: false }));
    const r = await chat({ message: 'how to optimise' });
    assert.equal(r.answeredBy, 'composer');
    assert.ok(r.message.length > 200, 'the model-free answer is too thin to be useful');
    assert.ok(r.toolsUsed.includes('runMPC'));
  });

  test('a model that returns nothing falls back rather than failing the turn', async () => {
    setAiProvider(stubProvider(''));
    const r = await chat({ message: 'what is CHWST' });
    assert.equal(r.answeredBy, 'composer');
    assert.match(r.message, /chilled water/i);
  });

  test('a model that throws falls back rather than failing the turn', async () => {
    setAiProvider({
      name: 'broken',
      status: () => ({ ready: true, status: 'ready', provider: 'stub', model: 'x', message: '' }),
      async complete() {
        throw new Error('connection reset');
      },
    });
    const r = await chat({ message: 'plant status' });
    assert.equal(r.answeredBy, 'composer');
    assert.match(r.message, /Plant status/i);
  });

  test('the prompt hands the model facts and a grounded draft', async () => {
    let captured = null;
    setAiProvider(stubProvider('ok, here is the plant.', { onPrompt: (m) => { captured = m; } }));
    await chat({ message: 'how is the plant?' });
    const user = captured.at(-1).content;
    assert.match(user, /FACTS/);
    assert.match(user, /GROUNDED DRAFT/);
    assert.match(captured[0].content, /must appear in FACTS/);
  });

  test('status distinguishes a missing model from missing tools', async () => {
    setAiProvider(stubProvider(null, { ready: false }));
    const s = await assistantStatus();
    assert.equal(s.toolServiceOk, true);
    assert.equal(s.health, 'degraded');
    assert.match(s.label, /without the language model/i);
    assert.ok(s.toolsAvailable > 10);
  });

  test('status reports ready only when the model really is', async () => {
    setAiProvider(stubProvider('hi'));
    const s = await assistantStatus();
    assert.equal(s.health, 'ready');
    assert.equal(s.label, 'AI ready');
  });
});

/* ─────────────────────────────────────────────────────────── streaming ──── */

describe('streaming', () => {
  test('tool stages are reported as they run', async () => {
    const stages = [];
    await chat({ message: 'how to optimise' }, { forceComposer: true, onStage: (s) => stages.push(s.tool) });
    assert.ok(stages.includes('getPlantState'));
    assert.ok(stages.includes('runMPC'));
    assert.ok(stages.length >= 3);
  });
});

/* ─────────────────────────────────────────── the acceptance requirements ── */

describe('acceptance', () => {
  /** The exact list from the brief. None may fall back to a command menu. */
  const MUST_ANSWER = [
    ['how to optimise', 'OPTIMIZATION_ADVICE'],
    ['what should i optimise now', 'OPTIMIZATION_ADVICE'],
    ['why is my plant inefficient', 'EFFICIENCY'],
    ['why CHWR high', 'PLANT_DIAGNOSTIC'],
    ['what is CHWST', 'GENERAL_KNOWLEDGE'],
    ['what is kw/rt', 'GENERAL_KNOWLEDGE'],
    ['why did MPC choose this', 'MPC_EXPLAIN'],
    ['is this mpc result safe', 'MPC_TRUST'],
    ['run mpc', 'MPC_RUN'],
    ['compare mpc with baseline', 'MPC_COMPARE'],
    ['what happens if wet bulb increase', 'WHAT_IF'],
    ['simulate 3500 RT load', 'WHAT_IF'],
    ['are there any alarms', 'ALARMS'],
    ['why plant kw so high', 'EFFICIENCY'],
    ['what should i change', 'OPTIMIZATION_ADVICE'],
    ['why did mpc choose 8 degree', 'MPC_EXPLAIN'],
    ['which chiller should run', 'EQUIPMENT'],
  ];

  for (const [question, expected] of MUST_ANSWER) {
    test(`"${question}" is answered as ${expected}`, async () => {
      const r = await ask(question, { conversationId: `acc-${expected}` });
      assert.equal(r.intent, expected, `routed to ${r.intent}`);
      assert.ok(r.message.length > 80, `answer too short: ${r.message}`);

      // The specific regression this whole feature exists to prevent.
      assert.doesNotMatch(
        r.message,
        /I can help you with:|Show me a summary.*How is energy usage|Set lobby temperature/i,
        'fell back to the old predefined command list'
      );
      assert.doesNotMatch(r.message, /Check air quality/i, 'offered a building-twin command');
    });
  }

  test('every acceptance question that needs plant data actually reads it', async () => {
    const needsData = [
      'how to optimise',
      'why is my plant inefficient',
      'why CHWR high',
      'run mpc',
      'are there any alarms',
      'which chiller should run',
    ];
    for (const q of needsData) {
      const r = await ask(q);
      assert.ok(r.toolsUsed.length > 0, `"${q}" answered without reading anything`);
      assert.notEqual(r.sourceType, 'GENERAL_KNOWLEDGE', `"${q}" answered from general knowledge alone`);
    }
  });

  test('an unrecognised but reasonable HVAC question still gets a real answer', async () => {
    const r = await ask('is my approach temperature reasonable for this weather');
    assert.ok(r.message.length > 120);
    assert.doesNotMatch(r.message, /I can help you with:/);
    assert.ok(r.toolsUsed.length > 0);
  });

  test('nonsense gets an honest answer rather than a command list', async () => {
    const r = await ask('zxcvbnm qwerty');
    assert.equal(r.intent, 'UNKNOWN');
    assert.match(r.message, /not certain what you are asking|plant right now/i);
    assert.doesNotMatch(r.message, /I can help you with:/);
  });
});

/* ──────────────────────────────────────────────────────── knowledge base ── */

describe('knowledge base', () => {
  test('the glossary and the project docs are both indexed', () => {
    const glossary = searchKnowledgeBase('what is compressor lift');
    assert.ok(glossary.length > 0);
    assert.ok(glossary.some((h) => h.source === 'HVAC glossary'));

    const docs = searchKnowledgeBase('how is the twin calibrated against BMS data');
    assert.ok(docs.length > 0, 'the project documentation was not indexed');
  });

  test('a query with no match returns nothing rather than a weak guess', () => {
    const hits = searchKnowledgeBase('quarterly revenue forecast for the sales team');
    assert.equal(hits.length, 0);
  });

  test('wording does not decide retrieval', () => {
    const a = searchKnowledgeBase('why raise chilled water supply temperature');
    const b = searchKnowledgeBase('benefit of increasing CHWS setpoint');
    assert.ok(a.length && b.length);
    const overlap = a.filter((x) => b.some((y) => y.id === x.id));
    assert.ok(overlap.length > 0, 'two phrasings of one question retrieved nothing in common');
  });
});
