/**
 * The incumbent controller — what the plant does WITHOUT the MPC.
 *
 * The saving figure is only as trustworthy as this file. Comparing an MPC
 * against a deliberately poor baseline manufactures a percentage, so the two
 * shipped baselines are both anchored on what T1 measurably did:
 *
 *   recordedStagingBaseline  replays the staging the plant actually ran that
 *                            day, inferred from metered compressor kW. Not a
 *                            rule at all — a MEASUREMENT. This is the default
 *                            for BMS-mode runs and is the fairest possible
 *                            reference, because it is the real operation.
 *
 *   fixedStagingBaseline     the three-machine lineup T1 held for 99.6% of
 *                            December, plus an add-only guard that starts a
 *                            fourth machine if the return temperature reaches
 *                            its limit. Used for synthetic and manual runs,
 *                            where there is no recording to replay. The guard
 *                            is an ASSUMPTION — the site trends no sequencing
 *                            logic — but it makes the baseline strictly better
 *                            than a fixed lineup, not worse.
 *
 * Both hold every continuous setpoint at the plant's own operating point, which
 * is also what the site did: T1 ran fixed CHWS, fixed pump speeds and auto
 * towers all month. So `baseline-derived` on those rows is a statement of fact
 * about the incumbent, not an admission that the baseline was under-modelled.
 */
import type { ControlState } from '../../../shared/types/mpc';
import type {
  ControlProvenanceMap,
  HorizonContext,
  HorizonController,
  HorizonDecision,
  SolverDiagnostics,
} from '../../../shared/types/horizon';
import type { PlantRecord } from '../../../shared/types/bms';
import { stagingOf } from '../../../shared/types/bms';
import { chillerIdsFor } from '../mpc/optimizer/candidateGenerator';
import { reconcileControl } from '../mpc/simulator/chillerPlantSimulator';
import { CHILLER_CONTROL_CONSTRAINTS } from '../digital-twin/chiller/constraints/chillerConstraints';

/**
 * Nothing the baseline does is optimised — that is the point of it. Marking
 * these honestly is what stops a before/after table from implying the
 * incumbent had also been tuned.
 */
export const BASELINE_PROVENANCE: ControlProvenanceMap = {
  runningChillers: 'baseline-derived',
  chwstSetpointC: 'baseline-derived',
  dpSetpointPsi: 'baseline-derived',
  chwpSpeedPct: 'baseline-derived',
  cwpSpeedPct: 'baseline-derived',
  ctFanSpeedPct: 'baseline-derived',
};

function baselineDiagnostics(step: number, count: number, note: string): SolverDiagnostics {
  return {
    step,
    solverStatus: 'FEASIBLE',
    solveMs: 0,
    objectiveKw: 0,
    nodesExpanded: 0,
    nodesKept: 0,
    forecastLoadRt: [],
    forecastWetBulbC: [],
    predictedChwrC: [],
    predictedPlantKw: [],
    plannedStaging: [count],
    plannedChwstC: [],
    plannedDpPsi: [],
    costBreakdownKw: {},
    activeConstraints: [],
    violations: [],
    fallbackUsed: false,
    fallbackReason: note,
  };
}

function decide(ctx: HorizonContext, count: number, note: string): HorizonDecision {
  const bounded = Math.max(
    Math.max(1, ctx.constraints.system.minRunningChillers),
    Math.min(count, ctx.constraints.system.maxRunningChillers)
  );
  const control: ControlState = reconcileControl(
    {
      ...ctx.baseline,
      runningChillers: bounded,
      chillerIds: chillerIdsFor(ctx.constraints, bounded),
    },
    ctx.constraints
  );
  return {
    control,
    provenance: BASELINE_PROVENANCE,
    diagnostics: baselineDiagnostics(ctx.step, bounded, note),
  };
}

/**
 * Replay the staging the plant actually ran, step by step.
 *
 * `stagingOf` counts machines whose metered compressor power exceeded the run
 * threshold, so this is inferred from measurement rather than read from a
 * status point — the site trends no run flags at all. A bucket with no running
 * machine (a meter gap, not a stopped plant) falls back to the last known good
 * count rather than shutting the plant down in the replay.
 */
export function recordedStagingBaseline(records: PlantRecord[]): HorizonController {
  const counts = records.map((r) => stagingOf(r).chillers);
  return {
    name: 'Recorded staging (replay of measured plant operation)',
    act(ctx) {
      let count = counts[ctx.step];
      if (!Number.isFinite(count) || count <= 0) {
        for (let i = Math.min(ctx.step, counts.length - 1); i >= 0; i--) {
          if (Number.isFinite(counts[i]) && counts[i] > 0) {
            count = counts[i];
            break;
          }
        }
      }
      return decide(ctx, count ?? 3, 'recorded staging replayed from BMS history (measured, not a rule)');
    },
  };
}

export interface FixedStagingOptions {
  count?: number;
  /** CHWR at which the guard starts an extra machine. */
  stageUpChwrC?: number;
  /** How far CHWR must fall before the extra machine is released. */
  releaseHysteresisK?: number;
}

/**
 * The observed lineup, with an add-only return-temperature guard.
 *
 * Add-only and hysteretic on purpose. A baseline that also SHED machines would
 * be doing half of what the MPC is being credited for, and one without
 * hysteresis would chatter around the threshold and lose energy to switching
 * that no real sequencer would lose.
 */
export function fixedStagingBaseline(opts: FixedStagingOptions = {}): HorizonController {
  const count = opts.count ?? 3;
  const limit = CHILLER_CONTROL_CONSTRAINTS['ctrl-chwr-sp'].max;
  const up = opts.stageUpChwrC ?? limit - 0.5;
  const release = opts.releaseHysteresisK ?? 1;
  let guarding = false;

  return {
    name: `Fixed ${count}-chiller lineup with add-only CHWR guard`,
    reset() {
      guarding = false;
    },
    act(ctx) {
      const chwr = ctx.loop.chwrC;
      if (!guarding && chwr >= up) guarding = true;
      else if (guarding && chwr <= up - release) guarding = false;
      return decide(
        ctx,
        guarding ? count + 1 : count,
        guarding
          ? `guard active: CHWR ${chwr.toFixed(2)} °C at/above ${up} °C, running one extra machine until CHWR falls below ${(up - release).toFixed(2)} °C (assumed rule)`
          : `fixed ${count}-chiller lineup (as observed all December)`
      );
    },
  };
}
