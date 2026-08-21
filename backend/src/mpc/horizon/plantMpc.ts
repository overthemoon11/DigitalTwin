/**
 * The receding-horizon plant MPC.
 *
 * WHAT IT DECIDES
 * ---------------
 * All six manipulated variables, every step:
 *
 *   chiller staging   beam search over reachable counts, dwell-constrained
 *   CHWST setpoint    beam search over rate-limited offsets
 *   DP setpoint       beam search over rate-limited offsets
 *   CHWP speed        derived from the DP setpoint (dpHydraulics.ts) — one
 *                     physical decision, not two contradictory ones
 *   CWP speed         solved inside the score (plantScorer.ts)
 *   CT fan speed      solved inside the score (plantScorer.ts)
 *
 * HOW IT SOLVES
 * -------------
 * A beam search / dynamic program over trajectories. At each horizon step every
 * surviving trajectory is expanded by every admissible (staging, CHWST, DP)
 * transition; the loop is advanced; the resulting operating point is priced;
 * nodes that agree on (lineup, dwell signature, CHWR, CHWST, DP) are merged
 * keeping the cheapest; and the best `beamWidth` survive.
 *
 * Beam search rather than a gradient method because the problem is genuinely
 * mixed-integer and non-smooth: staging is discrete, the dwell timers are
 * combinatorial, the tower approach clamps, and the flow constraints bind. It
 * also always returns SOMETHING — every constraint is priced as a penalty
 * rather than a hard rejection inside the search, so a least-violation plan
 * exists even in a corner where nothing is strictly feasible. That is what the
 * `FALLBACK` path is a backstop for, not the normal route.
 *
 * RECEDING, NOT OPEN-LOOP
 * -----------------------
 * The plan spans `horizonSteps`, and exactly the FIRST action of it is applied.
 * The next step re-measures the loop, re-forecasts, and re-solves from scratch.
 * `plannedStaging` / `plannedChwstC` / `plannedDpPsi` in the diagnostics are the
 * rest of the plan, exposed so the UI can show what the controller intended —
 * they are never executed.
 */
import type {
  ConstraintConfig,
  ControlState,
} from '../../../../shared/types/mpc';
import type {
  ControlProvenanceMap,
  Disturbance,
  HorizonContext,
  HorizonController,
  HorizonDecision,
  LoopState,
  SolverDiagnostics,
} from '../../../../shared/types/horizon';
import { chillerIdsFor } from '../optimizer/candidateGenerator';
import { reconcileControl } from '../simulator/chillerPlantSimulator';
import { clamp, round } from '../../digital-twin/chiller/model/plantPhysics';
import { reachableDpBand } from '../../digital-twin/chiller/model/dpHydraulics';
import { horizonOf } from './disturbanceForecast';
import {
  applyStaging,
  capacityOf,
  cloneLoopState,
  countSwitches,
  dwellRulesFrom,
  reachableStaging,
  shutdownControl,
  stepLoop,
  withinOperatingHours,
} from './loopDynamics';
import { DEFAULT_HORIZON_CONFIG, type HorizonConfig } from './horizonConfig';
import { PlantScorer, type SpeedBand } from './plantScorer';
import { MEDIAN_PLANT_KW_PER_RT } from '../../digital-twin/chiller/calibration/t1MonthCalibration';

/**
 * What the controller genuinely searched, and how honest each answer is.
 *
 * CHWP speed is `derived`, not `optimized`, and that is deliberate: it is a
 * real, responsive, energy-carrying part of the answer, but the search variable
 * is the DP setpoint an operator can actually enter. Publishing both as
 * independently optimised would be publishing two numbers no BMS could execute
 * together.
 */
export const PLANT_MPC_PROVENANCE: ControlProvenanceMap = {
  runningChillers: 'optimized',
  chwstSetpointC: 'optimized',
  dpSetpointPsi: 'optimized',
  chwpSpeedPct: 'derived',
  cwpSpeedPct: 'optimized',
  ctFanSpeedPct: 'optimized',
};

interface Node {
  loop: LoopState;
  cost: number;
  /** The applied control at each planned step. */
  plan: Array<{ count: number; chwstC: number; dpPsi: number }>;
  chwrTrace: number[];
  kwTrace: number[];
  switches: number;
  active: Set<string>;
  /** Cost terms of the FIRST step only, for the diagnostics breakdown. */
  firstCost: Record<string, number> | null;
  previous: { chwstC: number; dpPsi: number };
}

export class HorizonPlantMpc implements HorizonController {
  readonly name = 'Receding-horizon whole-plant MPC (beam search)';

  /** Priced operating points, shared across every step of one run. */
  private scorer: PlantScorer | null = null;

  constructor(private readonly cfg: HorizonConfig = DEFAULT_HORIZON_CONFIG) {}

  reset(): void {
    this.scorer = null;
  }

  act(ctx: HorizonContext): HorizonDecision {
    const started = Date.now();
    try {
      return this.solve(ctx, started);
    } catch (err) {
      return this.fallback(ctx, started, `solver error: ${(err as Error).message}`);
    }
  }

  private scorerFor(ctx: HorizonContext): PlantScorer {
    if (!this.scorer) this.scorer = new PlantScorer(ctx.constraints, ctx.baseline, this.cfg);
    return this.scorer;
  }

  /* ------------------------------------------------------------- search */

  private solve(ctx: HorizonContext, started: number): HorizonDecision {
    const { cfg } = this;
    const rules = dwellRulesFrom(ctx.constraints, ctx.dynamics.stepMinutes);
    const scorer = this.scorerFor(ctx);
    const stepH = ctx.dynamics.stepMinutes / 60;

    // Setpoint candidates live on a fixed lattice anchored at the plant's own
    // starting setpoint, rather than floating relative to each node's history.
    // Two trajectories that arrive at the same setpoint by different routes
    // then land on the SAME value, so `prune` can merge them and they share a
    // cache entry. A floating grid produces a slightly different value per
    // route, and neither merging nor caching can see they are the same point.
    const chwstLattice = {
      anchor: ctx.baseline.chwstSetpointC,
      step: Math.min(cfg.chwstStepC, ctx.constraints.system.maxChwstChangePerCycleC),
      min: ctx.constraints.chiller.minChwstC,
      max: ctx.constraints.chiller.maxChwstC,
      decimals: 2,
    };
    const dpBand = reachableDpBand(
      Math.max(ctx.constraints.chwp.minDpPsi, ctx.constraints.system.minChwDpPsi),
      Math.min(ctx.constraints.chwp.maxDpPsi, ctx.constraints.system.maxChwDpPsi),
      ctx.constraints.chwp.minSpeedPct,
      ctx.constraints.chwp.maxSpeedPct
    );
    const dpLattice = {
      anchor: ctx.baseline.dpSetpointPsi,
      step: Math.min(cfg.dpStepPsi, ctx.constraints.system.maxDpChangePerCyclePsi),
      min: dpBand.min,
      max: dpBand.max,
      decimals: 1,
    };

    // How far the condenser-side speeds may move THIS cycle. Applied to every
    // horizon step rather than just the first: the plan is re-solved each step
    // anyway, so the controller still walks to a distant optimum, one legal
    // move at a time, which is what a rate limit is for.
    const speedBand = this.speedBandFor(ctx);

    const forecast = horizonOf(ctx.forecast, ctx.step, cfg.horizonSteps);
    // Step 0 is the MEASURED present, not a prediction. Only the rest is
    // forecast — using a predicted value for the step being executed would
    // throw away the measurement the whole feedback loop exists to use.
    const series: Disturbance[] = [ctx.disturbance, ...forecast.slice(1)];

    let beam: Node[] = [
      {
        loop: cloneLoopState(ctx.loop),
        cost: 0,
        plan: [],
        chwrTrace: [],
        kwTrace: [],
        switches: 0,
        active: new Set<string>(),
        firstCost: null,
        previous: { chwstC: ctx.previous.chwstSetpointC, dpPsi: ctx.previous.dpSetpointPsi },
      },
    ];
    let expanded = 0;

    for (let k = 0; k < cfg.horizonSteps; k++) {
      const d = series[Math.min(k, series.length - 1)];
      const isTerminal = k === cfg.horizonSteps - 1;
      const chwrLimit = cfg.chwrLimitC - (isTerminal ? cfg.terminalMarginK : 0);
      const next: Node[] = [];
      // What a kelvin of leftover loop warmth would cost to remove: the RT-hours
      // of cooling it represents, priced at the plant's median efficiency.
      const storageKwhPerK =
        ctx.dynamics.loopRtPerKPerStep * stepH * MEDIAN_PLANT_KW_PER_RT * cfg.terminalStorageWeight;

      for (const node of beam) {
        const chwstOptions = this.latticeOptions(node.previous.chwstC, cfg.chwstLevels, chwstLattice);
        const dpOptions = this.latticeOptions(node.previous.dpPsi, cfg.dpLevels, dpLattice);

        for (const count of reachableStaging(node.loop, ctx.constraints, rules)) {
          const running = applyStaging(node.loop, count, ctx.constraints, rules);
          const actualCount = running.filter(Boolean).length;
          const capacity = capacityOf(running, ctx.constraints);
          const switched = countSwitches(node.loop.running, running);

          for (const chwstC of chwstOptions) {
            for (const dpPsi of dpOptions) {
              expanded += 1;
              // Flow first, price second. Pump speed follows from the DP
              // setpoint alone, so the loop can be advanced without a
              // speculative plant evaluation, and the single evaluation that
              // does happen is charged at the cooling actually delivered.
              const advanced = stepLoop(ctx.dynamics, node.loop, {
                loadRt: d.buildingLoadRt,
                chwsC: chwstC,
                running,
                capacityRt: capacity,
                flowLs: ctx.flowModel.flowLs(ctx.step + k, actualCount, scorer.chwpSpeedFor(dpPsi)),
              });

              const priced = scorer.score(
                {
                  runningChillers: actualCount,
                  loadRt: Math.max(1, advanced.deliveredRt),
                  wetBulbC: d.wetBulbC,
                  chwstSetpointC: chwstC,
                  dpSetpointPsi: dpPsi,
                },
                speedBand
              );

              const terms = this.costTerms({
                cfg,
                stepH,
                result: priced.result,
                shortfallRt: advanced.capacityShortfallRt,
                carryRt: advanced.unmetRt - advanced.capacityShortfallRt,
                chwrOverK: advanced.next.chwrC - chwrLimit,
                switched,
                dChwst: Math.abs(chwstC - node.previous.chwstC),
                dDp: Math.abs(dpPsi - node.previous.dpPsi),
                dSpeed:
                  Math.abs(priced.control.cwpSpeedPct - ctx.previous.cwpSpeedPct) +
                  Math.abs(priced.control.ctFanSpeedPct - ctx.previous.ctFanSpeedPct),
                // Charged only at the horizon's end, against the loop
                // temperature this solve STARTED from. Anchoring on the current
                // state rather than the run's opening state keeps each plan
                // storage-neutral without forbidding the loop from drifting with
                // the weather over a whole day.
                terminalStorageKwh: isTerminal
                  ? storageKwhPerK * Math.max(0, advanced.next.chwrC - ctx.loop.chwrC)
                  : 0,
              });

              const active = new Set(node.active);
              if (terms.unmet > 0) active.add('CAPACITY_SHORTFALL');
              if (terms.carry > 0) active.add('LOOP_WARMING');
              if (terms.chwr > 0) active.add(isTerminal ? 'CHWR_TERMINAL_LIMIT' : 'CHWR_LIMIT');
              if (terms.switching > 0) active.add('CHILLER_SWITCH');
              if (!priced.result.feasible) priced.result.violations.forEach((v) => active.add(v.code));

              next.push({
                loop: advanced.next,
                cost: node.cost + terms.total,
                plan: [...node.plan, { count: actualCount, chwstC, dpPsi }],
                chwrTrace: [...node.chwrTrace, round(advanced.next.chwrC, 3)],
                kwTrace: [...node.kwTrace, round(priced.result.totalPlantKw, 1)],
                switches: node.switches + switched,
                active,
                firstCost: k === 0 ? terms.breakdown : node.firstCost,
                previous: { chwstC, dpPsi },
              });
            }
          }
        }
      }

      if (next.length === 0) break;
      beam = this.prune(next);
    }

    const best = beam.reduce((a, b) => (b.cost < a.cost ? b : a), beam[0]);
    if (!best || best.plan.length === 0) {
      return this.fallback(ctx, started, 'search produced no trajectory');
    }

    // Rebuild the applied control from the winning first move, so the control
    // that is published is the one that was priced.
    const head = best.plan[0];
    const applied = scorer.score(
      {
        runningChillers: head.count,
        loadRt: Math.max(1, this.deliveredAtHead(ctx, head, scorer)),
        wetBulbC: ctx.disturbance.wetBulbC,
        chwstSetpointC: head.chwstC,
        dpSetpointPsi: head.dpPsi,
      },
      speedBand
    );

    const diagnostics: SolverDiagnostics = {
      step: ctx.step,
      solverStatus: applied.result.feasible ? 'OPTIMAL' : 'FEASIBLE',
      solveMs: Date.now() - started,
      objectiveKw: round(best.cost / (cfg.horizonSteps * stepH), 2),
      nodesExpanded: expanded,
      nodesKept: beam.length,
      forecastLoadRt: series.map((d) => round(d.buildingLoadRt, 1)),
      forecastWetBulbC: series.map((d) => round(d.wetBulbC, 2)),
      predictedChwrC: best.chwrTrace,
      predictedPlantKw: best.kwTrace,
      plannedStaging: best.plan.map((p) => p.count),
      plannedChwstC: best.plan.map((p) => round(p.chwstC, 2)),
      plannedDpPsi: best.plan.map((p) => round(p.dpPsi, 1)),
      costBreakdownKw: best.firstCost ?? {},
      activeConstraints: [...best.active].sort(),
      violations: applied.result.violations,
      fallbackUsed: false,
      fallbackReason: null,
    };

    return { control: applied.control, provenance: PLANT_MPC_PROVENANCE, diagnostics };
  }

  /**
   * Delivered cooling under the winning first move, so the published control is
   * priced at the same operating point the closed loop is about to simulate.
   */
  private deliveredAtHead(
    ctx: HorizonContext,
    head: { count: number; chwstC: number; dpPsi: number },
    scorer: PlantScorer
  ): number {
    const rules = dwellRulesFrom(ctx.constraints, ctx.dynamics.stepMinutes);
    const running = applyStaging(ctx.loop, head.count, ctx.constraints, rules);
    const advanced = stepLoop(ctx.dynamics, ctx.loop, {
      loadRt: ctx.disturbance.buildingLoadRt,
      chwsC: head.chwstC,
      running,
      capacityRt: capacityOf(running, ctx.constraints),
      flowLs: ctx.flowModel.flowLs(ctx.step, head.count, scorer.chwpSpeedFor(head.dpPsi)),
    });
    return advanced.deliveredRt;
  }

  /**
   * The condenser-side speed band reachable in one cycle.
   *
   * Intersects the configured limits with the per-cycle move allowance around
   * whatever the plant is holding now, so the rate limit is a property of the
   * SEARCH SPACE. Checking it after the fact would let the solver return a move
   * the plant cannot make and then label its own answer a violation.
   */
  private speedBandFor(ctx: HorizonContext): SpeedBand {
    const c = ctx.constraints;
    const dCwp = c.system.maxCwpSpeedChangePerCyclePct;
    const dCt = c.system.maxCtFanSpeedChangePerCyclePct;
    return {
      cwpMinPct: Math.max(c.cwp.minSpeedPct, ctx.previous.cwpSpeedPct - dCwp),
      cwpMaxPct: Math.min(c.cwp.maxSpeedPct, ctx.previous.cwpSpeedPct + dCwp),
      ctMinPct: Math.max(c.tower.minFanSpeedPct, ctx.previous.ctFanSpeedPct - dCt),
      ctMaxPct: Math.min(c.tower.maxFanSpeedPct, ctx.previous.ctFanSpeedPct + dCt),
    };
  }

  /* -------------------------------------------------------- the objective */

  /**
   * Every term of the objective for one step, in kW-equivalent.
   *
   * Returned as a breakdown rather than a scalar because the FIRST step's
   * breakdown is published in the diagnostics: an operator looking at a
   * surprising decision can see whether it was driven by power, by the return
   * limit, or by a switching penalty, instead of being told a total.
   */
  private costTerms(args: {
    cfg: HorizonConfig;
    stepH: number;
    result: { totalPlantKw: number; feasible: boolean };
    shortfallRt: number;
    carryRt: number;
    chwrOverK: number;
    switched: number;
    dChwst: number;
    dDp: number;
    dSpeed: number;
    terminalStorageKwh: number;
  }) {
    const { cfg, stepH } = args;
    const energy = args.result.totalPlantKw * stepH;
    const unmet = args.shortfallRt > 1e-6 ? cfg.unmetPenaltyKwPerRt * args.shortfallRt * stepH : 0;
    const carry = args.carryRt > 1e-6 ? cfg.carryPenaltyKwPerRt * args.carryRt * stepH : 0;
    const chwr = args.chwrOverK > 0 ? cfg.chwrPenaltyKwPerK * args.chwrOverK * stepH : 0;
    const switching = args.switched > 0 ? cfg.switchPenaltyKw * args.switched * stepH : 0;
    const movement =
      (cfg.chwstMovePenaltyKwPerK * args.dChwst +
        cfg.dpMovePenaltyKwPerPsi * args.dDp +
        cfg.speedMovePenaltyKwPerPct * args.dSpeed) *
      stepH;
    const infeasible = args.result.feasible ? 0 : cfg.infeasiblePenaltyKw * stepH;
    const storage = args.terminalStorageKwh;

    return {
      total: energy + unmet + carry + chwr + switching + movement + infeasible + storage,
      unmet,
      carry,
      chwr,
      switching,
      breakdown: {
        energyKwh: round(energy, 2),
        unmetPenalty: round(unmet, 2),
        loopCarryPenalty: round(carry, 2),
        chwrPenalty: round(chwr, 2),
        switchingPenalty: round(switching, 2),
        movementPenalty: round(movement, 3),
        terminalStoragePenalty: round(storage, 2),
        infeasiblePenalty: round(infeasible, 1),
      },
    };
  }

  /* ------------------------------------------------------------- helpers */

  /**
   * Candidate setpoints one lattice step either side of the current value.
   *
   * The move size is the SMALLER of the tuning step and the configured
   * per-cycle rate limit, so tightening the rate limit in the constraint panel
   * genuinely narrows what the controller may propose — the limit is not
   * merely checked afterwards, it shapes the search.
   *
   * Values are snapped to a lattice anchored at the plant's starting setpoint,
   * which keeps the reachable set finite and makes two routes to the same
   * setpoint identical. Nearest-first, so the beam spends its width on small
   * moves before large ones.
   */
  private latticeOptions(
    current: number,
    levels: number,
    lattice: { anchor: number; step: number; min: number; max: number; decimals: number }
  ): number[] {
    const { anchor, step, min, max, decimals } = lattice;
    const n = Math.max(1, Math.floor(levels));
    const snap = (v: number) =>
      round(clamp(anchor + Math.round((v - anchor) / step) * step, min, max), decimals);
    if (n === 1 || step <= 0) return [snap(current)];
    const half = Math.floor(n / 2);
    const out = new Set<number>();
    for (let i = -half; i <= half; i++) out.add(snap(current + i * step));
    return [...out].sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
  }

  /**
   * Merge trajectories that have arrived at the same plant state, keeping the
   * cheapest, then keep the best `beamWidth`.
   *
   * The dedup key is the full controller-visible state: lineup, dwell timers
   * (saturated, because a machine stopped for 40 steps behaves like one stopped
   * for 8), loop temperature, and the two setpoints — the setpoints belong in
   * the key because they are what the next step's rate limit is measured from.
   */
  private prune(nodes: Node[]): Node[] {
    const cfg = this.cfg;
    const bestByKey = new Map<string, Node>();
    for (const n of nodes) {
      const key = [
        n.loop.running.map((b) => (b ? 1 : 0)).join(''),
        n.loop.dwellSteps.map(clampDwell).join(','),
        Math.round(n.loop.chwrC / cfg.dedupeChwrK),
        Math.round(n.previous.chwstC / cfg.dedupeChwstC),
        Math.round(n.previous.dpPsi / cfg.dedupeDpPsi),
      ].join('|');
      const prev = bestByKey.get(key);
      if (!prev || n.cost < prev.cost) bestByKey.set(key, n);
    }
    return [...bestByKey.values()].sort((a, b) => a.cost - b.cost).slice(0, cfg.beamWidth);
  }

  /**
   * Safe control when the search cannot produce one.
   *
   * Holds the current lineup and the plant's own setpoints — never a partial or
   * mid-search result. An MPC that fails must fail to what the plant was
   * already doing, not to whatever the optimiser happened to be holding.
   */
  private fallback(ctx: HorizonContext, started: number, reason: string): HorizonDecision {
    const count = Math.max(1, ctx.loop.running.filter(Boolean).length);
    const control = reconcileControl(
      {
        ...ctx.previous,
        runningChillers: count,
        chillerIds: chillerIdsFor(ctx.constraints, count),
      },
      ctx.constraints
    );

    return {
      control,
      provenance: {
        runningChillers: 'baseline-derived',
        chwstSetpointC: 'baseline-derived',
        dpSetpointPsi: 'baseline-derived',
        chwpSpeedPct: 'derived',
        cwpSpeedPct: 'baseline-derived',
        ctFanSpeedPct: 'baseline-derived',
      },
      diagnostics: {
        step: ctx.step,
        solverStatus: 'FALLBACK',
        solveMs: Date.now() - started,
        objectiveKw: 0,
        nodesExpanded: 0,
        nodesKept: 0,
        forecastLoadRt: [],
        forecastWetBulbC: [],
        predictedChwrC: [],
        predictedPlantKw: [],
        plannedStaging: [count],
        plannedChwstC: [round(control.chwstSetpointC, 2)],
        plannedDpPsi: [round(control.dpSetpointPsi, 1)],
        costBreakdownKw: {},
        activeConstraints: [],
        violations: [],
        fallbackUsed: true,
        fallbackReason: reason,
      },
    };
  }
}

/**
 * Wraps a controller so it shuts the plant down outside its operating
 * schedule. A no-op when `operatingHours` start and end are equal, which is the
 * T1 default — the plant ran 24/7 for every minute of December.
 */
export function withOperatingSchedule(
  inner: HorizonController,
  timestamps: Array<string | null>
): HorizonController {
  return {
    name: inner.name,
    reset: () => inner.reset?.(),
    act(ctx) {
      if (withinOperatingHours(ctx.constraints, timestamps[ctx.step] ?? null)) return inner.act(ctx);
      const decision = inner.act(ctx);
      return {
        ...decision,
        control: shutdownControl(decision.control),
        provenance: { ...decision.provenance, runningChillers: 'fixed' },
        diagnostics: {
          ...decision.diagnostics,
          activeConstraints: [...decision.diagnostics.activeConstraints, 'OUTSIDE_OPERATING_HOURS'],
        },
      };
    },
  };
}

const clampDwell = (d: number): number => Math.max(-8, Math.min(8, d));
