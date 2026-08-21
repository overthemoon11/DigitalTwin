/**
 * The receding-horizon MPC: loop dynamics, dwell rules, all six control
 * variables, the objective, the fallback, and the guarantees that make a
 * reported saving mean something.
 *
 * Three of these tests are load-bearing beyond their own subject:
 *
 *   "identical conditions" — the comparison refuses to produce a number at all
 *   unless both arms faced the same weather, constraints and starting state;
 *   "only the first action is applied" — otherwise this is an open-loop
 *   schedule wearing an MPC's name;
 *   "no fabricated optima" — every control's provenance must match what the
 *   solver actually searched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { designConstraints } from '../src/mpc/index.ts';
import {
  DEFAULT_HORIZON_CONFIG,
  resolveHorizonConfig,
} from '../src/mpc/horizon/horizonConfig.ts';
import {
  T1_LOOP_DYNAMICS,
  advanceDwell,
  applyStaging,
  calibrationStatus,
  capacityOf,
  cloneLoopState,
  countSwitches,
  deliverableRt,
  dwellRulesFrom,
  equivalentLoopVolumeM3,
  flowForStaging,
  initialLoopState,
  measuredFlowModel,
  reachableStaging,
  stagedFlowModel,
  stepLoop,
  switchable,
  withinOperatingHours,
} from '../src/mpc/horizon/loopDynamics.ts';
import {
  degradedForesight,
  disturbanceKey,
  horizonOf,
  perfectForesight,
  persistenceForecast,
} from '../src/mpc/horizon/disturbanceForecast.ts';
import { HorizonPlantMpc, PLANT_MPC_PROVENANCE } from '../src/mpc/horizon/plantMpc.ts';
import {
  ConditionMismatchError,
  compareRuns,
  conditionDifferences,
  constraintKey,
  runClosedLoop,
} from '../src/mpc/horizon/closedLoop.ts';
import { buildScenario, runHorizonComparison } from '../src/mpc/horizon/index.ts';
import { fixedStagingBaseline } from '../src/control/baselineController.ts';
import { compareHorizon, coerceRequest, getHorizonConfig, getModelStatus } from '../src/api/controllers/horizonController.ts';
import { chwFlowLsFor, stagingFor } from '../src/mpc/index.ts';
import { REF_CHWP_SPEED } from '../src/digital-twin/chiller/model/plantPhysics.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, '..', '..', 'data', 'processed', 't1_2025_12_15min.json');
const skip = existsSync(ARTIFACT)
  ? false
  : 'BMS artifact absent — run python data/scripts/export_bms_records.py --refresh';

/** A short run keeps the suite quick; the physics does not depend on length. */
const STEPS = 8;
const DAY = '2025-12-14';

const CFG = designConstraints();
const running3 = [false, false, true, true, true];

/* ------------------------------------------------------------ loop dynamics */

describe('CHW loop dynamics', () => {
  test('cooling delivered rises with flow and with the driving temperature difference', () => {
    const cap = 3750;
    const base = deliverableRt(T1_LOOP_DYNAMICS, 14.4, 7.5, cap, 379, 3000);
    assert.ok(deliverableRt(T1_LOOP_DYNAMICS, 14.4, 7.5, cap, 500, 3000) > base, 'more flow, more cooling');
    assert.ok(deliverableRt(T1_LOOP_DYNAMICS, 15.4, 7.5, cap, 379, 3000) > base, 'warmer return, more cooling');
    assert.ok(deliverableRt(T1_LOOP_DYNAMICS, 14.4, 8.5, cap, 379, 3000) < base, 'warmer supply, less cooling');
  });

  test('nothing is delivered without capacity or without flow', () => {
    assert.equal(deliverableRt(T1_LOOP_DYNAMICS, 14.4, 7.5, 0, 379, 3000), 0);
    assert.equal(deliverableRt(T1_LOOP_DYNAMICS, 14.4, 7.5, 3750, 0, 3000), 0);
  });

  test('the loop warms exactly as fast as its capacitance says', () => {
    const state = initialLoopState(14.4, running3);
    const out = stepLoop(T1_LOOP_DYNAMICS, state, {
      loadRt: 3000, chwsC: 7.5, running: running3, capacityRt: 1000, flowLs: 379,
    });
    // Capacity-limited, so the imbalance is exactly load - capacity.
    assert.ok(Math.abs(out.deliveredRt - 1000) < 1e-6);
    const expected = 14.4 + (3000 - 1000) / T1_LOOP_DYNAMICS.loopRtPerKPerStep;
    assert.ok(Math.abs(out.next.chwrC - expected) < 1e-6, `${out.next.chwrC} vs ${expected}`);
    assert.ok(Math.abs(out.capacityShortfallRt - 2000) < 1e-6);
    assert.equal(out.saturated, true);
  });

  test('the return can never fall below the supply', () => {
    const out = stepLoop(T1_LOOP_DYNAMICS, initialLoopState(7.6, running3), {
      loadRt: 0, chwsC: 7.5, running: running3, capacityRt: 3750, flowLs: 379,
    });
    assert.ok(out.next.chwrC >= 7.5, 'cooling would be appearing from nowhere');
  });

  test('a stopped plant soaks toward ambient instead of freezing in place', () => {
    const off = [false, false, false, false, false];
    const out = stepLoop(T1_LOOP_DYNAMICS, initialLoopState(14.4, off), {
      loadRt: 3000, chwsC: 7.5, running: off, capacityRt: 0, flowLs: 0,
    });
    assert.equal(out.deliveredRt, 0);
    assert.ok(out.next.chwrC > 14.4 && out.next.chwrC < T1_LOOP_DYNAMICS.soakTargetC);
  });

  test('the capacitance is a believable volume of water, and says it is assumed', () => {
    const m3 = equivalentLoopVolumeM3(T1_LOOP_DYNAMICS);
    assert.ok(m3 > 100 && m3 < 3000, `${m3} m3 of loop water is not a plausible plant`);
    const c = calibrationStatus();
    assert.equal(c.status, 'partially-calibrated');
    assert.ok(c.assumed.includes('loopRtPerKPerStep'));
    assert.ok(c.note.length > 40, 'an assumption has to say why it could not be measured');
  });
});

describe('flow follows the pump speed the controller chose', () => {
  test('the staged flow model is the affinity law about the measured median', () => {
    const model = stagedFlowModel(T1_LOOP_DYNAMICS);
    const atRef = model.flowLs(0, 3, REF_CHWP_SPEED);
    assert.ok(Math.abs(atRef - 3 * 126.3) < 3, `${atRef} L/s at 3 pumps is not the measured point`);
    assert.ok(Math.abs(model.flowLs(0, 3, 35) - atRef / 2) < 1, 'half speed must be half flow');
    assert.equal(model.flowLs(0, 0, 70), 0);
  });

  test('the measured flow model rescales for staging AND for speed', () => {
    // Without the speed term a controller could slow the pumps, bank the cubic
    // power saving, and still deliver the flow the meter happened to record.
    const model = measuredFlowModel([400, 400], [3, 3], T1_LOOP_DYNAMICS);
    assert.ok(Math.abs(model.flowLs(0, 3, 70) - 400) < 1e-6);
    assert.ok(Math.abs(model.flowLs(0, 2, 70) - (400 * 2) / 3) < 1e-6, 'staging must rescale it');
    assert.ok(Math.abs(model.flowLs(0, 3, 35) - 200) < 1e-6, 'speed must rescale it');
    assert.ok(model.provenance.includes('MEASURED'));
  });

  test('a hole in the measurement falls back to the staged model, not to zero', () => {
    const model = measuredFlowModel([null], [0], T1_LOOP_DYNAMICS);
    assert.ok(Math.abs(model.flowLs(0, 3, 70) - flowForStaging(T1_LOOP_DYNAMICS, 3, 70)) < 1e-6);
  });

  test('the loop and the plant model agree about how much water is moving', () => {
    // The consistency that makes the CHWP decision accountable: if these two
    // disagreed, the loop would credit cooling the plant never pumped for.
    for (const speed of [45, 70, 95]) {
      for (const n of [2, 3, 4]) {
        const loop = stagedFlowModel(T1_LOOP_DYNAMICS).flowLs(0, n, speed);
        const plant = chwFlowLsFor(n, speed);
        assert.ok(Math.abs(loop - plant) / plant < 0.01, `n=${n} speed=${speed}: ${loop} vs ${plant}`);
      }
    }
  });

  test('auxiliary staging follows the chillers, as the site ran it', () => {
    assert.deepEqual(stagingFor(3), { chiller: 3, chwp: 3, cwp: 3, ct: 4 });
    assert.deepEqual(stagingFor(0), { chiller: 0, chwp: 0, cwp: 0, ct: 0 });
    assert.equal(stagingFor(5).ct, 5, 'the tower count is capped at the installed cells');
  });
});

/* --------------------------------------------------------------- dwell rules */

describe('anti-short-cycling', () => {
  const rules = dwellRulesFrom(CFG, 15);

  test('the timers convert to whole steps, rounding up', () => {
    // 30 min runtime and 20 min off-time at a 15-minute step.
    assert.equal(rules.minOnSteps, 2);
    assert.equal(rules.minOffSteps, 2);
    assert.equal(rules.maxSwitchesPerStep, 1);
  });

  test('a machine inside its timer cannot be switched', () => {
    const state = initialLoopState(14.4, running3, { dwellSteps: [-1, -99, 1, 99, 99] });
    assert.equal(switchable(state, 0, rules), false, 'stopped 1 step, min off is 2');
    assert.equal(switchable(state, 1, rules), true, 'long stopped');
    assert.equal(switchable(state, 2, rules), false, 'running 1 step, min on is 2');
    assert.equal(switchable(state, 3, rules), true, 'long running');
  });

  test('dwell counts up while running and down while stopped, and resets on a change', () => {
    const state = initialLoopState(14.4, running3, { dwellSteps: [-5, -5, 3, 3, 3] });
    const next = advanceDwell(state, [false, true, true, false, true]);
    assert.equal(next[0], -6, 'still stopped, count deeper');
    assert.equal(next[1], 1, 'just started');
    assert.equal(next[2], 4, 'still running');
    assert.equal(next[3], -1, 'just stopped');
  });

  test('at most one machine may change state per step', () => {
    const state = initialLoopState(14.4, running3);
    for (const target of reachableStaging(state, CFG, rules)) {
      assert.ok(Math.abs(target - 3) <= rules.maxSwitchesPerStep, `${target} is more than one switch away`);
    }
  });

  test('staying put is always reachable, even with every timer locked', () => {
    const locked = initialLoopState(14.4, running3, { dwellSteps: [-1, -1, 1, 1, 1] });
    assert.deepEqual(reachableStaging(locked, CFG, locked && rules), [3],
      'a state with no legal move would strand the controller');
  });

  test('reachable counts respect the configured staging limits', () => {
    const tight = { ...CFG, system: { ...CFG.system, minRunningChillers: 3, maxRunningChillers: 3 } };
    assert.deepEqual(reachableStaging(initialLoopState(14.4, running3), tight, rules), [3]);
  });

  test('an unavailable machine is never started', () => {
    const cfg = { ...CFG, chiller: { ...CFG.chiller, units: CFG.chiller.units.map((u, i) => ({ ...u, available: i > 1 })) } };
    const state = initialLoopState(14.4, running3);
    const next = applyStaging(state, 4, cfg, rules);
    assert.equal(next[0], false, 'CH-1 is unavailable');
    assert.equal(next[1], false, 'CH-2 is unavailable');
  });

  test('duty rotation stops the longest-running machine and starts the longest-stopped', () => {
    const state = initialLoopState(14.4, running3, { dwellSteps: [-9, -3, 20, 5, 5] });
    const shed = applyStaging(state, 2, CFG, rules);
    assert.equal(shed[2], false, 'the machine running longest should stop first');
    const add = applyStaging(state, 4, CFG, rules);
    assert.equal(add[0], true, 'the machine stopped longest should start first');
  });

  test('capacity counts only available running machines', () => {
    const cfg = { ...CFG, chiller: { ...CFG.chiller, units: CFG.chiller.units.map((u, i) => ({ ...u, available: i !== 4 })) } };
    assert.ok(capacityOf(running3, cfg) < capacityOf(running3, CFG));
    assert.equal(countSwitches(running3, [false, true, true, true, false]), 2);
  });
});

/* ---------------------------------------------------------------- forecasts */

describe('disturbance forecasts', () => {
  const profile = {
    day: '', stepMinutes: 15,
    t: Array.from({ length: 20 }, (_, i) => String(i)),
    loadRt: Array.from({ length: 20 }, (_, i) => 3000 + i * 10),
    wetBulbC: Array.from({ length: 20 }, (_, i) => 24 + i * 0.05),
    gapSteps: 0, qualityFlags: [],
  };

  test('perfect foresight returns the recorded future and admits it is a bound', () => {
    const f = perfectForesight(profile, 4);
    assert.deepEqual(f.at(0, 3), { buildingLoadRt: 3030, wetBulbC: 24.15 });
    assert.equal(f.meta.kind, 'perfect-foresight');
    assert.ok(f.meta.caveat.includes('upper bound'));
  });

  test('persistence holds the present flat, and says what that costs', () => {
    const f = persistenceForecast({ buildingLoadRt: 3000, wetBulbC: 25 }, 4);
    assert.deepEqual(f.at(0, 1), f.at(5, 4));
    assert.ok(f.meta.caveat.includes('Understates'));
  });

  test('the forecast error on a given future step is drawn once, not per call', () => {
    // The property that stops the closed loop averaging the error away: the
    // horizon slides over the same future step many times, and a fresh draw
    // each time would hand the controller perfect foresight by accident.
    //
    // The MAGNITUDE still shrinks as the step gets nearer — that is the point
    // of a lead-time error model — so what has to be identical is the DRAW: the
    // same step must always be predicted wrong in the same direction.
    const f = degradedForesight(profile, 8, { seed: 7 });
    const truthLoad = profile.loadRt[5];
    const truthWb = profile.wetBulbC[5];
    const far = f.at(0, 5);
    const near = f.at(4, 1);

    assert.equal(Math.sign(far.buildingLoadRt - truthLoad), Math.sign(near.buildingLoadRt - truthLoad),
      'the same future step was mispredicted in opposite directions from different times');
    assert.equal(Math.sign(far.wetBulbC - truthWb), Math.sign(near.wetBulbC - truthWb));
    assert.ok(Math.abs(far.buildingLoadRt - truthLoad) > Math.abs(near.buildingLoadRt - truthLoad),
      'a five-step-ahead forecast must be worse than a one-step-ahead one');
  });

  test('degraded foresight error grows with lead time', () => {
    const f = degradedForesight(profile, 12, { seed: 3 });
    const truth = (i) => profile.loadRt[Math.min(i, profile.loadRt.length - 1)];
    let near = 0;
    let far = 0;
    for (let now = 0; now < 12; now++) {
      near += Math.abs(f.at(now, 1).buildingLoadRt - truth(now + 1));
      far += Math.abs(f.at(now, 8).buildingLoadRt - truth(now + 8));
    }
    assert.ok(far > near, 'an eight-step-ahead forecast should be worse than a one-step');
    assert.ok(f.meta.caveat.includes('assumption'));
  });

  test('the horizon is lead 1..N and clamps past the end of the record', () => {
    const f = perfectForesight(profile, 4);
    const h = horizonOf(f, 0, 4);
    assert.equal(h.length, 4);
    assert.deepEqual(h[0], f.at(0, 1));
    assert.deepEqual(horizonOf(f, 100, 2)[0], f.at(100, 1), 'past the end must clamp, not throw');
  });

  test('the disturbance key distinguishes different weather and matches identical weather', () => {
    const a = [{ buildingLoadRt: 3000, wetBulbC: 25 }, { buildingLoadRt: 3100, wetBulbC: 25.1 }];
    const b = [{ buildingLoadRt: 3000, wetBulbC: 25 }, { buildingLoadRt: 3100, wetBulbC: 25.1 }];
    const c = [{ buildingLoadRt: 3000, wetBulbC: 25 }, { buildingLoadRt: 3101, wetBulbC: 25.1 }];
    assert.equal(disturbanceKey(a), disturbanceKey(b));
    assert.notEqual(disturbanceKey(a), disturbanceKey(c));
    assert.notEqual(disturbanceKey(a), disturbanceKey(a.slice(0, 1)));
  });
});

/* ------------------------------------------------------------ configuration */

describe('horizon configuration', () => {
  test('a partial override merges over the defaults and ignores junk', () => {
    const c = resolveHorizonConfig({ beamWidth: 4, nonsense: 1, chwstStepC: 'x' });
    assert.equal(c.beamWidth, 4);
    assert.equal(c.chwstStepC, DEFAULT_HORIZON_CONFIG.chwstStepC, 'a non-numeric override must be ignored');
    assert.equal(c.nonsense, undefined);
  });

  test('the objective weights are ordered so cooling always beats energy', () => {
    const c = DEFAULT_HORIZON_CONFIG;
    assert.ok(c.unmetPenaltyKwPerRt > c.carryPenaltyKwPerRt * 10,
      'unservable load must cost far more than load deferred into the loop');
    assert.ok(c.infeasiblePenaltyKw > c.unmetPenaltyKwPerRt * 100,
      'a constraint violation must beat every energy consideration');
    assert.ok(c.chwstMovePenaltyKwPerK > 0 && c.chwstMovePenaltyKwPerK < 50,
      'the movement penalty must break ties without blocking a real saving');
  });

  test('operating hours default to 24/7, which is what T1 ran', () => {
    assert.equal(CFG.system.operatingHours.startHour, CFG.system.operatingHours.endHour);
    assert.equal(withinOperatingHours(CFG, '2025-12-14T03:00:00'), true);
    const scheduled = { ...CFG, system: { ...CFG.system, operatingHours: { startHour: 6, endHour: 22 } } };
    assert.equal(withinOperatingHours(scheduled, '2025-12-14T03:00:00'), false);
    assert.equal(withinOperatingHours(scheduled, '2025-12-14T12:00:00'), true);
    const overnight = { ...CFG, system: { ...CFG.system, operatingHours: { startHour: 22, endHour: 6 } } };
    assert.equal(overnight && withinOperatingHours(overnight, '2025-12-14T23:00:00'), true);
    assert.equal(withinOperatingHours(overnight, '2025-12-14T12:00:00'), false);
  });
});

/* ------------------------------------------------------------ the controller */

describe('the MPC decides all six controls', { skip }, () => {
  const comparison = runHorizonComparison({ mode: 'bms', day: DAY, steps: STEPS, forecast: 'degraded' });

  test('every control carries a provenance that matches what was searched', () => {
    const p = comparison.optimisedControls;
    assert.equal(p.runningChillers, 'optimized');
    assert.equal(p.chwstSetpointC, 'optimized');
    assert.equal(p.dpSetpointPsi, 'optimized');
    assert.equal(p.cwpSpeedPct, 'optimized');
    assert.equal(p.ctFanSpeedPct, 'optimized');
    // CHWP speed follows the DP setpoint through one documented map. Calling it
    // independently optimised would be publishing two numbers no BMS could
    // execute together.
    assert.equal(p.chwpSpeedPct, 'derived');
  });

  test('the DP setpoint and the pump speed it implies never contradict each other', () => {
    for (const step of comparison.mpc.trajectory) {
      const implied = Math.max(
        CFG.chwp.minSpeedPct,
        Math.min(CFG.chwp.maxSpeedPct, 70 + (step.control.dpSetpointPsi - 15) * 3)
      );
      assert.ok(
        Math.abs(step.control.chwpSpeedPct - implied) < 0.11,
        `step ${step.step}: ${step.control.dpSetpointPsi} psi implies ${implied}% but the run says ${step.control.chwpSpeedPct}%`
      );
    }
  });

  test('the controls actually move — they are decisions, not labels', () => {
    const spread = (pick) => {
      const v = comparison.mpc.trajectory.map(pick);
      return Math.max(...v) - Math.min(...v);
    };
    const baseline = comparison.baseline.trajectory[0].control;
    const first = comparison.mpc.trajectory[0].control;
    const moved =
      Math.abs(first.chwstSetpointC - baseline.chwstSetpointC) +
      Math.abs(first.dpSetpointPsi - baseline.dpSetpointPsi) +
      Math.abs(first.cwpSpeedPct - baseline.cwpSpeedPct) +
      Math.abs(first.ctFanSpeedPct - baseline.ctFanSpeedPct) +
      spread((s) => s.control.chwstSetpointC);
    assert.ok(moved > 0.1, 'the MPC returned the baseline unchanged on every axis');
  });

  test('every applied control obeys its configured band', () => {
    for (const s of comparison.mpc.trajectory) {
      const c = s.control;
      assert.ok(c.chwstSetpointC >= CFG.chiller.minChwstC - 1e-9 && c.chwstSetpointC <= CFG.chiller.maxChwstC + 1e-9);
      assert.ok(c.dpSetpointPsi >= CFG.chwp.minDpPsi - 1e-9 && c.dpSetpointPsi <= CFG.chwp.maxDpPsi + 1e-9);
      assert.ok(c.chwpSpeedPct >= CFG.chwp.minSpeedPct - 1e-9 && c.chwpSpeedPct <= CFG.chwp.maxSpeedPct + 1e-9);
      assert.ok(c.cwpSpeedPct >= CFG.cwp.minSpeedPct - 1e-9 && c.cwpSpeedPct <= CFG.cwp.maxSpeedPct + 1e-9);
      assert.ok(c.ctFanSpeedPct >= CFG.tower.minFanSpeedPct - 1e-9 && c.ctFanSpeedPct <= CFG.tower.maxFanSpeedPct + 1e-9);
      assert.ok(c.runningChillers >= CFG.system.minRunningChillers && c.runningChillers <= CFG.system.maxRunningChillers);
    }
  });

  test('no step moves a setpoint further than its per-cycle rate limit', () => {
    const t = comparison.mpc.trajectory;
    for (let i = 1; i < t.length; i++) {
      const dChwst = Math.abs(t[i].control.chwstSetpointC - t[i - 1].control.chwstSetpointC);
      const dDp = Math.abs(t[i].control.dpSetpointPsi - t[i - 1].control.dpSetpointPsi);
      assert.ok(dChwst <= CFG.system.maxChwstChangePerCycleC + 1e-6, `step ${i} moved CHWST by ${dChwst} K`);
      assert.ok(dDp <= CFG.system.maxDpChangePerCyclePsi + 1e-6, `step ${i} moved DP by ${dDp} psi`);
    }
  });

  test('the whole-plant objective is the sum of the four blocks', () => {
    for (const s of comparison.mpc.trajectory) {
      const parts = s.result.chillerKw + s.result.chwpKw + s.result.cwpKw + s.result.towerKw;
      assert.ok(Math.abs(parts - s.result.totalPlantKw) < 0.2, `${parts} vs ${s.result.totalPlantKw}`);
      assert.ok(Math.abs(s.result.pumpKw - (s.result.chwpKw + s.result.cwpKw)) < 0.2);
    }
    const t = comparison.mpc.totals;
    assert.ok(Math.abs(t.chillerKwh + t.pumpKwh + t.towerKwh - t.totalPlantKwh) < 1);
  });

  test('the solver reports what it did, including the cost breakdown', () => {
    const d = comparison.mpc.trajectory[0].diagnostics;
    assert.ok(['OPTIMAL', 'FEASIBLE'].includes(d.solverStatus));
    assert.ok(d.nodesExpanded > 0);
    assert.ok(d.plannedStaging.length > 1, 'the plan must reach past the applied step');
    assert.equal(d.plannedChwstC.length, d.plannedStaging.length);
    assert.equal(d.plannedDpPsi.length, d.plannedStaging.length);
    assert.ok(d.forecastLoadRt.length > 1);
    assert.ok(Number.isFinite(d.costBreakdownKw.energyKwh));
    assert.equal(d.fallbackUsed, false);
  });

  test('only the FIRST action of the plan is applied', () => {
    // Otherwise this is an open-loop schedule with an MPC's name on it.
    const t = comparison.mpc.trajectory;
    for (let i = 0; i + 1 < t.length; i++) {
      const planned = t[i].diagnostics.plannedStaging;
      assert.equal(t[i].control.runningChillers, planned[0], `step ${i} applied something other than its own first move`);
      // The plan is re-solved each step, so later planned steps are free to be
      // contradicted by what actually happens. Assert only that they exist.
      assert.ok(planned.length >= 2);
    }
  });

  test('the plan is re-solved against the measured loop, not its own prediction', () => {
    const t = comparison.mpc.trajectory;
    for (let i = 1; i < t.length; i++) {
      assert.ok(Math.abs(t[i].diagnostics.step - i) < 1e-9);
      // The loop state fed to step i is the one step i-1 produced.
      assert.ok(Number.isFinite(t[i].loop.chwrC));
    }
    const chwr = t.map((s) => s.loop.chwrC);
    assert.ok(new Set(chwr.map((v) => v.toFixed(3))).size > 1, 'the loop state never moved — this is not a feedback loop');
  });

  test('minimum runtime holds across the whole run', () => {
    const t = comparison.mpc.trajectory;
    const minOn = dwellRulesFrom(CFG, 15).minOnSteps;
    let runFor = 0;
    for (let i = 1; i < t.length; i++) {
      if (t[i].control.runningChillers === t[i - 1].control.runningChillers) runFor += 1;
      else {
        if (i > 1) assert.ok(runFor + 1 >= Math.min(minOn, i), `staging changed after only ${runFor + 1} steps`);
        runFor = 0;
      }
    }
  });
});

describe('constraints genuinely bind the search', { skip }, () => {
  test('a tighter CHWST band is respected', () => {
    const tight = designConstraints();
    tight.chiller.minChwstC = 7.4;
    tight.chiller.maxChwstC = 7.8;
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: tight });
    for (const s of c.mpc.trajectory) {
      assert.ok(s.control.chwstSetpointC >= 7.4 - 1e-9 && s.control.chwstSetpointC <= 7.8 + 1e-9,
        `CHWST ${s.control.chwstSetpointC} escaped the tightened band`);
    }
  });

  test('a tighter CT fan band is respected', () => {
    const tight = designConstraints();
    tight.tower.minFanSpeedPct = 65;
    tight.tower.maxFanSpeedPct = 75;
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: tight });
    for (const s of c.mpc.trajectory) {
      assert.ok(s.control.ctFanSpeedPct >= 65 - 1e-9 && s.control.ctFanSpeedPct <= 75 + 1e-9);
    }
  });

  test('a tighter CWP band is respected', () => {
    const tight = designConstraints();
    tight.cwp.minSpeedPct = 68;
    tight.cwp.maxSpeedPct = 72;
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: tight });
    for (const s of c.mpc.trajectory) {
      assert.ok(s.control.cwpSpeedPct >= 68 - 1e-9 && s.control.cwpSpeedPct <= 72 + 1e-9);
    }
  });

  test('a pinned staging count is respected', () => {
    const pinned = designConstraints();
    pinned.system.minRunningChillers = 4;
    pinned.system.maxRunningChillers = 4;
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: pinned });
    assert.ok(c.mpc.trajectory.every((s) => s.control.runningChillers === 4));
  });

  test('the per-cycle speed limits SHAPE the search, not just flag its result', () => {
    // A rate limit that is only checked afterwards lets the solver return a move
    // the plant cannot make and then call its own answer a violation. This runs
    // conditions that genuinely want the tower fan at its floor and asserts the
    // controller walks there instead of jumping.
    const c = runHorizonComparison({
      mode: 'manual',
      steps: 6,
      disturbance: { buildingLoadRt: 1800, wetBulbC: 27.5 },
    });
    const t = c.mpc.trajectory;
    const limitCt = CFG.system.maxCtFanSpeedChangePerCyclePct;
    const limitCwp = CFG.system.maxCwpSpeedChangePerCyclePct;
    assert.ok(
      Math.abs(t[0].control.ctFanSpeedPct - c.baseline.trajectory[0].control.ctFanSpeedPct) <= limitCt + 1e-6,
      `the first CT fan move was ${t[0].control.ctFanSpeedPct}% from the plant's ${c.baseline.trajectory[0].control.ctFanSpeedPct}%`
    );
    for (let i = 1; i < t.length; i++) {
      const dCt = Math.abs(t[i].control.ctFanSpeedPct - t[i - 1].control.ctFanSpeedPct);
      const dCwp = Math.abs(t[i].control.cwpSpeedPct - t[i - 1].control.cwpSpeedPct);
      assert.ok(dCt <= limitCt + 1e-6, `step ${i} moved the CT fan ${dCt}%`);
      assert.ok(dCwp <= limitCwp + 1e-6, `step ${i} moved the CWP ${dCwp}%`);
    }
    // ...and having obeyed the limit, no step reports a rate violation.
    const rate = t.flatMap((s) => s.violations).filter((v) => v.code.endsWith('rate-limit'));
    assert.deepEqual(rate, [], 'the search proposed a move it was not allowed to make');
  });

  test('a candidate sitting exactly on the tower approach floor is not a violation', () => {
    // A humid day pins the condenser temperature at wet bulb + minimum
    // approach. The floor is enforced by the engine; the validator only
    // cross-checks it, and it must not fire on the rounding of the two reported
    // numbers it differences — otherwise every step of a humid run reports
    // itself infeasible while being perfectly legal.
    const c = runHorizonComparison({
      mode: 'manual',
      steps: 4,
      disturbance: { buildingLoadRt: 1800, wetBulbC: 27.5 },
    });
    for (const arm of [c.baseline, c.mpc]) {
      const approach = arm.trajectory.flatMap((s) => s.violations).filter((v) => v.code === 'tower-approach');
      assert.deepEqual(approach, [], `${arm.label} reported a violation of a floor it was sitting on`);
    }
    assert.equal(c.mpc.totals.infeasibleSteps, 0);
    assert.equal(c.baseline.totals.infeasibleSteps, 0);
  });

  test('a genuinely impossible condenser temperature IS still rejected', () => {
    // The companion to the tolerance above: relaxing a check by rounding noise
    // must not relax it by anything more.
    const cold = designConstraints();
    // Demand a 6 K approach floor the tower cannot hold at these conditions.
    cold.tower.minApproachC = 6;
    const c = runHorizonComparison({
      mode: 'manual',
      steps: 3,
      disturbance: { buildingLoadRt: 3094, wetBulbC: 24.8 },
      constraints: cold,
    });
    const flagged = c.mpc.trajectory.flatMap((s) => s.violations).filter((v) => v.code === 'tower-approach');
    assert.ok(flagged.length > 0, 'a 6 K approach floor is unreachable here and must be reported');
  });

  test('the CHWR limit is what stops CHWST reset running away', () => {
    // Loosen the return limit and the optimiser should be willing to run the
    // loop warmer; tighten it and it must not. If this stops being true, CHWST
    // has become a free variable again.
    const warm = designConstraints();
    warm.system.maxChwrC = 17.5;
    const cold = designConstraints();
    cold.system.maxChwrC = 14.6;
    const a = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: warm });
    const b = runHorizonComparison({ mode: 'bms', day: DAY, steps: 6, constraints: cold });
    const last = (c) => c.mpc.trajectory[c.mpc.trajectory.length - 1];
    assert.ok(
      last(a).control.chwstSetpointC >= last(b).control.chwstSetpointC,
      'a tighter return limit must not permit a HIGHER supply setpoint'
    );
    assert.ok(b.mpc.totals.chwrMaxC <= a.mpc.totals.chwrMaxC + 1e-6);
  });
});

describe('failure behaviour', () => {
  test('a controller that throws falls back to what the plant was doing', () => {
    const mpc = new HorizonPlantMpc(DEFAULT_HORIZON_CONFIG);
    const baseline = {
      chwstSetpointC: 7.58, dpSetpointPsi: 15, runningChillers: 3, chillerIds: [],
      chwpSpeedPct: 70, cwpSpeedPct: 70, ctFanSpeedPct: 70,
    };
    const ctx = {
      step: 0,
      loop: initialLoopState(14.4, running3),
      disturbance: { buildingLoadRt: 3000, wetBulbC: 25 },
      // A forecast that throws is the cleanest way to force the solver to fail.
      forecast: { name: 'broken', steps: 12, stepMinutes: 15, meta: { kind: 'persistence', provenance: 'derived', caveat: '' }, at() { throw new Error('forecast feed down'); } },
      constraints: CFG,
      baseline,
      previous: baseline,
      dynamics: T1_LOOP_DYNAMICS,
      flowModel: stagedFlowModel(T1_LOOP_DYNAMICS),
    };
    const decision = mpc.act(ctx);
    assert.equal(decision.diagnostics.solverStatus, 'FALLBACK');
    assert.equal(decision.diagnostics.fallbackUsed, true);
    assert.ok(decision.diagnostics.fallbackReason.includes('forecast feed down'));
    // The fallback must be the plant's own state, not a half-searched candidate.
    assert.equal(decision.control.runningChillers, 3);
    assert.equal(decision.control.chwstSetpointC, baseline.chwstSetpointC);
    assert.equal(decision.provenance.runningChillers, 'baseline-derived');
  });

  test('the fallback control is still internally consistent', () => {
    const mpc = new HorizonPlantMpc();
    const baseline = {
      chwstSetpointC: 7.58, dpSetpointPsi: 18, runningChillers: 3, chillerIds: [],
      chwpSpeedPct: 41, cwpSpeedPct: 70, ctFanSpeedPct: 70,
    };
    const decision = mpc.act({
      step: 0, loop: initialLoopState(14.4, running3),
      disturbance: { buildingLoadRt: 3000, wetBulbC: 25 },
      forecast: { name: 'broken', steps: 12, stepMinutes: 15, meta: { kind: 'persistence', provenance: 'derived', caveat: '' }, at() { throw new Error('down'); } },
      constraints: CFG, baseline, previous: baseline,
      dynamics: T1_LOOP_DYNAMICS, flowModel: stagedFlowModel(T1_LOOP_DYNAMICS),
    });
    // The baseline named 18 psi and 41% together, which cannot both be true.
    // The fallback reconciles them rather than passing the contradiction on.
    assert.ok(Math.abs(decision.control.chwpSpeedPct - 79) < 0.11);
  });
});

/* ------------------------------------------------------- fairness guarantees */

describe('a saving is only reported when the comparison is fair', { skip }, () => {
  const comparison = runHorizonComparison({ mode: 'bms', day: DAY, steps: STEPS });

  test('both arms faced identical conditions', () => {
    assert.deepEqual(conditionDifferences(comparison.baseline.conditions, comparison.mpc.conditions), []);
    assert.equal(comparison.baseline.conditions.disturbanceKey, comparison.mpc.conditions.disturbanceKey);
    assert.equal(comparison.baseline.conditions.constraintKey, comparison.mpc.conditions.constraintKey);
    assert.deepEqual(comparison.baseline.conditions.initialLoop, comparison.mpc.conditions.initialLoop);
  });

  test('a mismatched comparison throws instead of returning a caveated number', () => {
    const scenario = buildScenario({ mode: 'bms', day: DAY, steps: STEPS });
    const shared = {
      constraints: scenario.constraints, forecast: scenario.forecast,
      baselineControl: scenario.baselineControl, initialLoop: scenario.initialLoop,
      dynamics: scenario.dynamics, flowModel: scenario.flowModel,
      source: 'bms', day: scenario.day, timestamps: scenario.timestamps,
    };
    const a = runClosedLoop({ label: 'A', controller: fixedStagingBaseline({ count: 3 }), disturbances: scenario.disturbances, ...shared });
    // Same controller, different weather.
    const hotter = scenario.disturbances.map((d) => ({ ...d, wetBulbC: d.wetBulbC + 1 }));
    const b = runClosedLoop({ label: 'B', controller: fixedStagingBaseline({ count: 3 }), disturbances: hotter, ...shared });

    assert.throws(() => compareRuns(a, b), ConditionMismatchError);
    try {
      compareRuns(a, b);
    } catch (err) {
      assert.ok(err.message.includes('disturbance series differs'));
      assert.equal(err.status, 409);
    }
  });

  test('changing a constraint changes the key, so the two arms cannot be crossed', () => {
    const other = designConstraints();
    other.chiller.maxChwstC = 9;
    assert.notEqual(constraintKey(CFG), constraintKey(other));
    assert.equal(constraintKey(CFG), constraintKey(designConstraints()));
  });

  test('the headline switches to kW/RT whenever the two arms served different loads', () => {
    const s = comparison.savings;
    const equal = Math.abs(s.deliveredRtHoursDeltaPct) <= 0.5;
    assert.equal(s.basis, equal ? 'equal-delivery' : 'unequal-delivery');
    assert.equal(s.headline, equal ? 'totalPlantPct' : 'kwPerRtPct');
    if (!equal) {
      assert.ok(comparison.caveats.some((c) => c.includes('did not deliver the same cooling')));
    }
  });

  test('every reason to distrust the number is returned, not hidden', () => {
    const m = comparison.mpc.totals;
    const b = comparison.baseline.totals;
    if (m.unmetRtHours > b.unmetRtHours) {
      assert.ok(comparison.caveats.some((c) => c.includes('unmet')), 'unserved load must be declared');
    }
    if (m.chwrMaxC > b.chwrMaxC + 0.05) {
      assert.ok(comparison.caveats.some((c) => c.includes('CHWR')), 'a warmer loop must be declared');
    }
    const extrapolated = comparison.mpc.trajectory.filter((s) => s.result.calibration.status === 'extrapolated');
    if (extrapolated.length) {
      assert.ok(comparison.caveats.some((c) => c.includes('calibration envelope')));
    }
  });

  test('perfect foresight is always flagged as an upper bound', () => {
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, forecast: 'perfect' });
    assert.ok(c.caveats.some((x) => x.includes('upper bound')));
  });

  test('the same request twice gives the same answer', () => {
    const a = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, seed: 11 });
    const b = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, seed: 11 });
    assert.equal(a.savings.totalPlantKwh, b.savings.totalPlantKwh);
    assert.deepEqual(a.mpc.trajectory.map((s) => s.control), b.mpc.trajectory.map((s) => s.control));
  });

  test('the score-cache bucket is an optimisation, not a modelling choice', () => {
    // The claim being protected is that bucketing does not change the QUALITY
    // of the answer — not that it always picks the identical plan.
    //
    // It cannot guarantee the latter, and requiring it would be requiring the
    // wrong thing. The search is discrete, so at an operating point where two
    // branches are almost exactly tied (say DP 13.5 vs 15 psi for one step) a
    // rounding of a fraction of a kW tips which one wins. Both plans then run
    // to different kWh totals while costing the same, which is a property of
    // the tie, not of the cache.
    //
    // Efficiency is the like-for-like measure — it divides out the difference
    // in cooling served — so that is what is held.
    const exact = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, horizon: { scoreLoadBucketRt: 0.5 } });
    const shipped = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4 });

    const drift =
      Math.abs(shipped.mpc.totals.plantKwPerRt - exact.mpc.totals.plantKwPerRt) /
      exact.mpc.totals.plantKwPerRt;
    assert.ok(
      drift < 0.005,
      `the shipped bucket (${DEFAULT_HORIZON_CONFIG.scoreLoadBucketRt} RT) moved efficiency by ${(drift * 100).toFixed(3)}%`
    );

    // And the saving it reports must not move by anything like the saving itself.
    const savingDrift = Math.abs(shipped.savings.kwPerRtPct - exact.savings.kwPerRtPct);
    assert.ok(
      savingDrift < 0.5,
      `the reported saving moved ${savingDrift.toFixed(2)} percentage points with the cache bucket`
    );
  });
});

/* ------------------------------------------------------------------- modes */

describe('the three run modes stay separate', () => {
  test('BMS mode is driven by measurement and says so field by field', { skip }, () => {
    const s = buildScenario({ mode: 'bms', day: DAY, steps: 4 });
    assert.equal(s.mode, 'bms');
    assert.equal(s.day, DAY);
    assert.ok(s.provenance.wetBulbC.startsWith('MEASURED'));
    assert.ok(s.provenance.buildingLoadRt.startsWith('DERIVED'));
    assert.ok(s.provenance.dpSetpointPsi.includes('NOT TRENDED'));
    assert.ok(s.timestamps.every((t) => typeof t === 'string'));
    assert.equal(s.baselineKind, 'recorded');
  });

  test('manual mode holds the operator input flat and never touches the workbook', () => {
    const s = buildScenario({ mode: 'manual', steps: 6, disturbance: { buildingLoadRt: 2500, wetBulbC: 26 } });
    assert.equal(s.mode, 'manual');
    assert.equal(s.day, null);
    assert.ok(s.disturbances.every((d) => d.buildingLoadRt === 2500 && d.wetBulbC === 26));
    assert.ok(s.provenance.buildingLoadRt.startsWith('OPERATOR INPUT'));
    assert.ok(s.timestamps.every((t) => t === null));
  });

  test('synthetic mode generates a shape and labels it GENERATED', () => {
    const s = buildScenario({ mode: 'synthetic', steps: 96 });
    assert.equal(s.mode, 'synthetic');
    assert.ok(s.provenance.buildingLoadRt.includes('GENERATED'));
    const loads = s.disturbances.map((d) => d.buildingLoadRt);
    assert.ok(Math.max(...loads) - Math.min(...loads) > 100, 'a diurnal profile has to actually vary');
  });

  test('a manual run completes and returns a comparison', () => {
    const c = runHorizonComparison({
      mode: 'manual', steps: 6,
      disturbance: { buildingLoadRt: 2600, wetBulbC: 25.5 },
    });
    assert.equal(c.scenario.mode, 'manual');
    assert.ok(c.mpc.totals.totalPlantKwh > 0);
    assert.ok(c.baseline.totals.totalPlantKwh > 0);
    assert.equal(c.mpc.trajectory.length, 6);
  });

  test('the baseline is the incumbent, and never claims to be optimised', () => {
    const c = runHorizonComparison({ mode: 'manual', steps: 4, disturbance: { buildingLoadRt: 2600, wetBulbC: 25.5 } });
    for (const s of c.baseline.trajectory) {
      assert.ok(Object.values(s.provenance).every((p) => p === 'baseline-derived'));
    }
  });
});

/* --------------------------------------------------------------------- API */

describe('the HTTP surface', () => {
  test('the request coercer rejects nonsense rather than ignoring it', () => {
    assert.throws(() => coerceRequest({ mode: 'wishful' }), /mode/);
    assert.throws(() => coerceRequest({ forecast: 'crystal-ball' }), /forecast/);
    assert.throws(() => coerceRequest({ day: '14-12-2025' }), /YYYY-MM-DD/);
    assert.throws(() => coerceRequest({ steps: 0 }), /steps/);
    assert.throws(() => coerceRequest({ steps: 100000 }), /steps/);
    assert.throws(() => coerceRequest({ horizon: { madeUp: 1 } }), /unknown horizon option/);
    assert.throws(() => coerceRequest({ horizon: { beamWidth: 'wide' } }), /must be a number/);
    assert.throws(() => coerceRequest({ dynamics: { madeUp: 1 } }), /unknown dynamics option/);
    assert.throws(() => coerceRequest({ constraints: [] }), /must be an object/);
    assert.throws(() => coerceRequest({ simulationInput: { buildingLoadRt: -5 } }), /positive/);
  });

  test('an invalid constraint set is a 400 with the reason, not a silent default', () => {
    try {
      coerceRequest({ constraints: { chiller: { minChwstC: 12, maxChwstC: 6 } } });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes('CHWST'));
    }
  });

  test('a partial constraint patch merges over the design defaults', () => {
    const req = coerceRequest({ constraints: { tower: { minFanSpeedPct: 45 } } });
    assert.equal(req.constraints.tower.minFanSpeedPct, 45);
    assert.equal(req.constraints.chiller.units.length, 5, 'the rest of the tree must survive');
  });

  test('the config endpoint advertises what is actually available', { skip }, () => {
    const c = getHorizonConfig();
    assert.deepEqual(c.modes, ['bms', 'manual', 'synthetic']);
    assert.deepEqual(c.forecasts, ['perfect', 'degraded', 'persistence']);
    assert.equal(c.bms.available, true);
    assert.ok(c.bms.days.length > 20);
    assert.equal(c.horizon.horizonSteps, DEFAULT_HORIZON_CONFIG.horizonSteps);
  });

  test('the compare endpoint returns everything the UI needs, already assembled', { skip }, () => {
    const r = compareHorizon({ mode: 'bms', day: DAY, steps: 4 });
    assert.equal(r.status, 'COMPLETED');
    for (const key of ['scenario', 'savings', 'optimisedControls', 'caveats', 'baseline', 'mpc', 'solver', 'modelStatus', 'appliedControl', 'baselineControl']) {
      assert.ok(r[key] != null, `response is missing ${key}`);
    }
    assert.ok(r.solver.steps > 0);
    assert.ok(Number.isFinite(r.solver.meanSolveMs));
    assert.ok(r.appliedControl.runningChillers > 0);
    assert.ok(Array.isArray(r.solver.activeConstraints));
    assert.ok(Number.isFinite(r.solver.firstStepCostKw.energyKwh));
  });

  test('model status names every uncalibrated model and what it is missing', () => {
    const { models } = getModelStatus();
    const byId = Object.fromEntries(models.map((m) => [m.id, m]));
    assert.equal(byId['dp-hydraulics'].status, 'default');
    assert.ok(byId['dp-hydraulics'].missingInputs.includes('chw_dp_kpa'));
    assert.equal(byId['condenser-flow-lift'].status, 'default');
    assert.equal(byId['tower-fan'].status, 'default');
    assert.equal(byId['chiller-power'].status, 'site-calibrated');
    assert.equal(byId['chiller-part-load'].status, 'site-calibrated');
    assert.equal(byId['tower-approach'].status, 'site-calibrated');
    // Every model must say something about how it was arrived at.
    for (const m of models) assert.ok(m.note.length > 30, `${m.id} has no explanation`);
  });
});

/* -------------------------------------------------------------- regression */

describe('the search does not silently degrade', { skip }, () => {
  test('a wider beam does not produce a worse plan', () => {
    // A beam search that improves when narrowed is mis-pruning.
    const narrow = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, horizon: { beamWidth: 2 } });
    const wide = runHorizonComparison({ mode: 'bms', day: DAY, steps: 4, horizon: { beamWidth: 24 } });
    assert.ok(
      wide.mpc.totals.plantKwPerRt <= narrow.mpc.totals.plantKwPerRt + 0.005,
      `beam 24 (${wide.mpc.totals.plantKwPerRt}) is worse than beam 2 (${narrow.mpc.totals.plantKwPerRt})`
    );
  });

  test('the MPC beats the incumbent on efficiency, or the exercise is pointless', () => {
    const c = runHorizonComparison({ mode: 'bms', day: DAY, steps: STEPS });
    assert.ok(c.savings.kwPerRtMpc < c.savings.kwPerRtBaseline, 'no efficiency gain at all');
    assert.ok(c.savings.kwPerRtPct < 25, `${c.savings.kwPerRtPct}% is too large to be credible — check the model`);
  });

  test('a solve stays inside a usable time budget', () => {
    const started = Date.now();
    runHorizonComparison({ mode: 'bms', day: DAY, steps: 4 });
    const perStep = (Date.now() - started) / 4;
    assert.ok(perStep < 4000, `${perStep.toFixed(0)} ms per step is too slow for an interactive run`);
  });
});
