/**
 * MPC tools — running the optimiser, and explaining what it did.
 *
 * The explanation half is the important one. An optimiser that reports "saved
 * 7.4%" and nothing else is not usable by an operator: the interesting question
 * is always *why*, and right behind it *should I believe it*. Both answers
 * exist in this repo already — the solver emits `SolverDiagnostics` per step,
 * the comparison emits `caveats`, and the twin emits a calibration verdict on
 * every evaluation. Nothing here computes any of that; it collects it into one
 * structure and hands it to the language model.
 *
 * The frontend is deliberately never given the job of inferring a reason. A
 * reason inferred from a before/after table is a guess dressed as a diagnosis,
 * and it will be wrong exactly when the run was unusual.
 */
import {
  designConstraints,
  defaultMpcOptimizer,
  readBaselineControl,
  readSimulationInput,
  simulateCandidate,
  applyOptimalControl,
  DEFAULT_MAX_CYCLES,
  VIOLATION_LABELS,
} from '../../mpc/index';
import { compareHorizon, getModelStatus } from '../../api/controllers/horizonController';
import type { ControlState, SimulationResult } from '../../../../shared/types/mpc';
import type { ToolDefinition } from '../types';
import { deltaPct, isNum, psiToKpa, round } from '../util';
import {
  getLastMpcRun,
  getLastRunOfKind,
  recordHorizonRun,
  recordSteadyStateRun,
  type HorizonRunRecord,
  type MpcRunRecord,
  type SteadyStateRunRecord,
} from '../mpcMemory';
import { livePlant } from './plantTools';

/* ──────────────────────────────────────────────────────────────── runMPC ── */

/**
 * Solve one steady-state operating point against the live conditions.
 *
 * `apply` defaults to false. The optimum is a proposal until someone says
 * otherwise — committing it moves the plant every other operator is looking at,
 * which is not a thing a sentence in a chat window should do on its own.
 */
export async function runMPC(args: { apply?: boolean; maxCycles?: number } = {}) {
  const plant = livePlant();
  const input = readSimulationInput(plant);
  const baselineControl = readBaselineControl(plant);
  const constraints = designConstraints();
  const dryBulbHintC = plant.headers?.ambientTemp ?? 31;
  const maxCycles = isNum(args.maxCycles) ? Math.max(20, Math.min(600, args.maxCycles)) : DEFAULT_MAX_CYCLES;

  const baselineResult = simulateCandidate(input, baselineControl, constraints, {
    baseline: null,
    dryBulbHintC,
  });
  const result = await defaultMpcOptimizer.optimize(
    { input, constraints, baselineControl, baselineResult, maxCycles, dryBulbHintC },
    {}
  );

  let applied = false;
  if (args.apply === true && result.solved && result.optimalControl) {
    applyOptimalControl(input, result.optimalControl, { dryBulbHintC, constraints });
    applied = true;
  }

  const record = recordSteadyStateRun(result, { applied, viaAssistant: true });

  return {
    runId: record.id,
    kind: 'steady-state',
    solver: defaultMpcOptimizer.name,
    solved: result.solved,
    applied,
    /** Explicitly stated so the answer never implies the plant moved. */
    committedToTwin: applied,
    input,
    maxCycles,
    evaluatedCandidates: result.evaluatedCandidates,
    feasibleCandidates: result.feasibleCandidates,
    rejectedCandidates: result.rejectedCandidates,
    rejectionsByCode: Object.fromEntries(
      Object.entries(result.rejectionsByCode).map(([code, n]) => [VIOLATION_LABELS[code] ?? code, n])
    ),
    savingKw: round(result.savingKw, 1),
    savingPct: round(result.savingPct, 2),
    before: summariseResult(baselineControl, result.baselineResult),
    after: result.optimalControl && result.optimalResult
      ? summariseResult(result.optimalControl, result.optimalResult)
      : null,
    changes: result.optimalControl ? controlDelta(baselineControl, result.optimalControl) : [],
    trust: assessTrust(record),
  };
}

/* ──────────────────────────────────────────────── compareBaselineVsMPC ──── */

/**
 * Baseline versus MPC over a time horizon, under identical conditions.
 *
 * This is the honest saving figure — the steady-state optimum ignores thermal
 * memory, so it can book a saving the loop pays for three steps later. The
 * comparison refuses to report anything unless both arms faced the same
 * weather, constraints and starting state, and it returns its own caveats,
 * which are passed through untouched.
 *
 * Kept short by default: each step is a full beam search and 12 of them is
 * about ten seconds, which is a long time to hold a chat turn open.
 */
export function compareBaselineVsMPC(
  args: { steps?: number; mode?: string; day?: string; forecast?: string } = {}
) {
  const steps = isNum(args.steps) ? Math.max(2, Math.min(24, Math.round(args.steps))) : 6;
  const comparison: any = compareHorizon({
    mode: args.mode ?? 'bms',
    steps,
    day: args.day,
    forecast: args.forecast ?? 'degraded',
  });
  const record = recordHorizonRun(comparison, { viaAssistant: true });

  return {
    runId: record.id,
    kind: 'horizon',
    solver: comparison.solver?.name ?? 'receding-horizon MPC',
    day: comparison.conditions?.day ?? null,
    steps: comparison.conditions?.steps ?? steps,
    stepMinutes: comparison.conditions?.stepMinutes ?? 15,
    hoursCovered: round(((comparison.conditions?.steps ?? steps) * (comparison.conditions?.stepMinutes ?? 15)) / 60, 2),
    forecast: comparison.conditions?.forecast ?? null,
    savings: comparison.savings,
    /** The comparison itself decides which percentage may be quoted. */
    headlineFigure:
      comparison.savings?.headline === 'kwPerRtPct'
        ? { metric: 'kW/RT', pct: comparison.savings?.kwPerRtPct, reason: 'the two arms did not deliver identical cooling, so the kWh figure is not a like-for-like saving' }
        : { metric: 'total plant kWh', pct: comparison.savings?.totalPlantPct, reason: 'both arms delivered the same cooling' },
    baselineTotals: comparison.baseline?.totals ?? null,
    mpcTotals: comparison.mpc?.totals ?? null,
    baselineControl: comparison.baselineControl,
    appliedControl: comparison.appliedControl,
    changes: comparison.baselineControl && comparison.appliedControl
      ? controlDelta(comparison.baselineControl, comparison.appliedControl)
      : [],
    provenance: comparison.optimisedControls,
    caveats: comparison.caveats ?? [],
    solverStats: comparison.solver ?? null,
    trust: assessTrust(record),
  };
}

/* ─────────────────────────────────────────────────────────  last results ── */

export function getMPCResult(args: { runId?: string } = {}) {
  const record = args.runId
    ? (getLastMpcRun()?.id === args.runId ? getLastMpcRun() : null)
    : getLastMpcRun();
  if (!record) {
    return {
      available: false,
      reason:
        'No MPC run has been performed in this session yet. Run the optimiser first — from the Optimization workspace or by asking me to run MPC.',
    };
  }
  return { available: true, ...summariseRun(record) };
}

export function getMPCDiagnostics() {
  const record = getLastMpcRun();
  if (!record) {
    return { available: false, reason: 'No MPC run has been performed in this session yet.' };
  }
  if (record.kind === 'steady-state') {
    return {
      available: true,
      kind: 'steady-state',
      runId: record.id,
      /** Steady-state search has no horizon, so these fields genuinely do not
       *  exist rather than being withheld. */
      solverStatus: record.solved ? 'OPTIMAL' : 'INFEASIBLE',
      candidatesEvaluated: record.evaluatedCandidates,
      candidatesFeasible: record.feasibleCandidates,
      rejectionsByConstraint: Object.fromEntries(
        Object.entries(record.rejectionsByCode).map(([c, n]) => [VIOLATION_LABELS[c] ?? c, n])
      ),
      objectiveComponents: null,
      objectiveComponentsNote:
        'The steady-state optimiser minimises total plant kW directly; there is no multi-term horizon objective to break down. Run a baseline-vs-MPC horizon comparison for that.',
      forecast: null,
      predictedChwrC: record.optimalResult ? [round(record.optimalResult.chwrC, 2)] : [],
      fallbackUsed: false,
      violations: record.optimalResult?.violations ?? [],
      calibration: record.optimalResult?.calibration ?? null,
    };
  }
  const d = record.firstDiagnostics;
  return {
    available: true,
    kind: 'horizon',
    runId: record.id,
    solverStatus: d?.solverStatus ?? 'unknown',
    solveMs: d?.solveMs ?? null,
    objectiveKw: d?.objectiveKw ?? null,
    nodesExpanded: d?.nodesExpanded ?? null,
    objectiveComponents: d?.costBreakdownKw ?? null,
    activeConstraints: d?.activeConstraints ?? [],
    plannedChwstC: d?.plannedChwstC ?? [],
    plannedDpPsi: d?.plannedDpPsi ?? [],
    plannedStaging: d?.plannedStaging ?? [],
    predictedChwrC: d?.predictedChwrC ?? [],
    predictedPlantKw: d?.predictedPlantKw ?? [],
    forecastLoadRt: d?.forecastLoadRt ?? [],
    forecastWetBulbC: d?.forecastWetBulbC ?? [],
    fallbackUsed: Boolean(d?.fallbackUsed),
    fallbackReason: d?.fallbackReason ?? null,
    violations: d?.violations ?? [],
    solverStats: record.solver,
    caveats: record.caveats,
  };
}

/* ────────────────────────────────────────── getMPCExplanationContext ────── */

/**
 * Everything needed to answer "why did the MPC do that", in one payload.
 *
 * Reads the LAST ACTUAL RUN. If there has not been one, it solves a fresh
 * steady-state point and says so in `basis` — explaining a run the operator
 * never saw, while implying it was theirs, would be worse than admitting the
 * substitution.
 */
export async function getMPCExplanationContext(args: { runId?: string } = {}) {
  let record: MpcRunRecord | null = args.runId
    ? (getLastMpcRun()?.id === args.runId ? getLastMpcRun() : null)
    : getLastMpcRun();
  let basis: 'last-run' | 'freshly-solved' = 'last-run';

  if (!record) {
    await runMPC({ apply: false });
    record = getLastRunOfKind('steady-state');
    basis = 'freshly-solved';
  }
  if (!record) {
    return { available: false, reason: 'The optimiser could not be run against the current plant state.' };
  }

  const models = getModelStatus();
  const uncalibrated = models.models
    .filter((m) => m.status !== 'site-calibrated')
    .map((m) => ({ id: m.id, label: m.label, status: m.status, missingInputs: m.missingInputs, note: m.note }));

  const common = {
    available: true,
    basis,
    basisNote:
      basis === 'freshly-solved'
        ? 'No MPC run existed in this session, so a fresh steady-state optimisation was solved against the current conditions to answer this.'
        : 'This explains the most recent MPC run.',
    runId: record.id,
    runKind: record.kind,
    ranAt: new Date(record.at).toISOString(),
    startedFrom: record.viaAssistant ? 'assistant' : 'optimization workspace',
    appliedToTwin: record.applied,
    modelCalibration: {
      siteCalibrated: models.models.filter((m) => m.status === 'site-calibrated').map((m) => m.label),
      notFullyCalibrated: uncalibrated,
      missingSignals: models.missingSignals,
    },
    trust: assessTrust(record),
  };

  if (record.kind === 'steady-state') {
    const b = record.baselineResult;
    const o = record.optimalResult;
    return {
      ...common,
      conditions: {
        buildingLoadRt: round(record.input.buildingLoadRt, 0),
        wetBulbC: round(record.input.wetBulbC, 2),
        predictedLoadRt: null,
        predictedLoadNote: 'A steady-state solve holds the load fixed; there is no load forecast in this run.',
      },
      controls: controlTable(record.baselineControl, record.optimalControl),
      power: {
        baselinePlantKw: round(b.totalPlantKw, 1),
        mpcPlantKw: o ? round(o.totalPlantKw, 1) : null,
        baselineKwPerRt: round(b.plantKwPerRt, 3),
        mpcKwPerRt: o ? round(o.plantKwPerRt, 3) : null,
        savingKw: round(record.savingKw, 1),
        savingPct: round(record.savingPct, 2),
        split: o
          ? {
              chillerKw: [round(b.chillerKw, 1), round(o.chillerKw, 1)],
              chwpKw: [round(b.chwpKw, 1), round(o.chwpKw, 1)],
              cwpKw: [round(b.cwpKw, 1), round(o.cwpKw, 1)],
              towerKw: [round(b.towerKw, 1), round(o.towerKw, 1)],
            }
          : null,
      },
      temperatures: {
        baselineChwrC: round(b.chwrC, 2),
        mpcChwrC: o ? round(o.chwrC, 2) : null,
        chwrLimitC: designConstraints().system.maxChwrC,
        baselineChwDeltaT: round(b.chwDeltaT, 2),
        mpcChwDeltaT: o ? round(o.chwDeltaT, 2) : null,
        baselineTowerApproachC: round(b.towerApproachC, 2),
        mpcTowerApproachC: o ? round(o.towerApproachC, 2) : null,
        condenserLiftShiftK: o ? round(o.condenserLiftShiftK, 3) : null,
      },
      cooling: {
        requiredRt: round(b.coolingRequiredRt, 0),
        baselineDeliveredRt: round(b.coolingDeliveredRt, 0),
        mpcDeliveredRt: o ? round(o.coolingDeliveredRt, 0) : null,
        unmetRt: o ? round(Math.max(0, o.coolingRequiredRt - o.coolingDeliveredRt), 1) : null,
      },
      solver: {
        name: 'Constrained coordinate search (steady state)',
        status: record.solved ? 'OPTIMAL' : 'INFEASIBLE',
        candidatesEvaluated: record.evaluatedCandidates,
        candidatesFeasible: record.feasibleCandidates,
        fallbackUsed: false,
        objectiveComponents: null,
      },
      bindingConstraints: bindingFrom(o, record.rejectionsByCode),
      calibrationEnvelope: {
        baseline: b.calibration,
        mpc: o?.calibration ?? null,
      },
    };
  }

  const rec = record as HorizonRunRecord;
  const d = rec.firstDiagnostics;
  return {
    ...common,
    conditions: {
      day: rec.day,
      steps: rec.steps,
      stepMinutes: rec.stepMinutes,
      forecastKind: rec.forecast,
      buildingLoadRt: d?.forecastLoadRt?.[0] ?? null,
      wetBulbC: d?.forecastWetBulbC?.[0] ?? null,
      predictedLoadRt: d?.forecastLoadRt ?? [],
      predictedWetBulbC: d?.forecastWetBulbC ?? [],
    },
    controls: controlTable(rec.baselineControl, rec.appliedControl),
    controlProvenance: rec.provenance,
    power: {
      baselinePlantKwh: (rec.baselineTotals as any)?.totalPlantKwh ?? null,
      mpcPlantKwh: (rec.mpcTotals as any)?.totalPlantKwh ?? null,
      baselineKwPerRt: rec.savings?.kwPerRtBaseline ?? null,
      mpcKwPerRt: rec.savings?.kwPerRtMpc ?? null,
      savingPctKwh: rec.savings?.totalPlantPct ?? null,
      savingPctKwPerRt: rec.savings?.kwPerRtPct ?? null,
      headline: rec.savings?.headline ?? null,
      basis: rec.savings?.basis ?? null,
    },
    temperatures: {
      baselineChwrMaxC: (rec.baselineTotals as any)?.chwrMaxC ?? null,
      mpcChwrMaxC: (rec.mpcTotals as any)?.chwrMaxC ?? null,
      baselineChwrMeanC: (rec.baselineTotals as any)?.chwrMeanC ?? null,
      mpcChwrMeanC: (rec.mpcTotals as any)?.chwrMeanC ?? null,
      chwrLimitC: designConstraints().system.maxChwrC,
      predictedChwrC: d?.predictedChwrC ?? [],
    },
    cooling: {
      baselineDeliveredRtHours: rec.savings?.deliveredRtHoursBaseline ?? null,
      mpcDeliveredRtHours: rec.savings?.deliveredRtHoursMpc ?? null,
      deliveryDeltaPct: rec.savings?.deliveredRtHoursDeltaPct ?? null,
      baselineUnmetRtHours: (rec.baselineTotals as any)?.unmetRtHours ?? null,
      mpcUnmetRtHours: (rec.mpcTotals as any)?.unmetRtHours ?? null,
    },
    solver: {
      name: (rec.solver as any)?.name ?? 'receding-horizon MPC',
      status: d?.solverStatus ?? 'unknown',
      steps: (rec.solver as any)?.steps ?? null,
      fallbacks: (rec.solver as any)?.fallbacks ?? 0,
      meanSolveMs: (rec.solver as any)?.meanSolveMs ?? null,
      fallbackUsed: Boolean(d?.fallbackUsed),
      fallbackReason: d?.fallbackReason ?? null,
      objectiveComponents: d?.costBreakdownKw ?? (rec.solver as any)?.firstStepCostKw ?? null,
    },
    bindingConstraints: [
      ...((rec.solver as any)?.activeConstraints ?? []).map((c: string) => ({ code: c, label: c, source: 'active in the horizon solve' })),
      ...(d?.violations ?? []).map((v) => ({ code: v.code, label: VIOLATION_LABELS[v.code] ?? v.code, source: 'violated', message: v.message })),
    ],
    caveats: rec.caveats,
  };
}

/* ────────────────────────────────────────────────────────────── helpers ── */

function summariseResult(control: ControlState, r: SimulationResult) {
  return {
    control: {
      chwstC: round(control.chwstSetpointC, 2),
      dpPsi: round(control.dpSetpointPsi, 1),
      dpKpa: psiToKpa(control.dpSetpointPsi),
      runningChillers: control.runningChillers,
      chillerIds: control.chillerIds,
      chwpSpeedPct: round(control.chwpSpeedPct, 1),
      cwpSpeedPct: round(control.cwpSpeedPct, 1),
      ctFanSpeedPct: round(control.ctFanSpeedPct, 1),
    },
    totalPlantKw: round(r.totalPlantKw, 1),
    plantKwPerRt: round(r.plantKwPerRt, 3),
    cop: round(r.cop, 2),
    chillerKw: round(r.chillerKw, 1),
    chwpKw: round(r.chwpKw, 1),
    cwpKw: round(r.cwpKw, 1),
    towerKw: round(r.towerKw, 1),
    chwsC: round(r.chwsC, 2),
    chwrC: round(r.chwrC, 2),
    chwDeltaT: round(r.chwDeltaT, 2),
    coolingDeliveredRt: round(r.coolingDeliveredRt, 0),
    feasible: r.feasible,
    violations: r.violations.map((v) => ({ code: v.code, label: VIOLATION_LABELS[v.code] ?? v.code, message: v.message })),
    calibration: r.calibration,
  };
}

const CONTROL_LABELS: Array<{ key: keyof ControlState; label: string; unit: string; dp: number }> = [
  { key: 'chwstSetpointC', label: 'CHWST setpoint', unit: '°C', dp: 2 },
  { key: 'dpSetpointPsi', label: 'CHW DP setpoint', unit: 'psi', dp: 1 },
  { key: 'runningChillers', label: 'Chillers staged', unit: '', dp: 0 },
  { key: 'chwpSpeedPct', label: 'CHWP speed', unit: '%', dp: 1 },
  { key: 'cwpSpeedPct', label: 'CWP speed', unit: '%', dp: 1 },
  { key: 'ctFanSpeedPct', label: 'CT fan speed', unit: '%', dp: 1 },
];

/** Only the controls that actually moved, with the size of the move. */
export function controlDelta(before: ControlState, after: ControlState) {
  const rows = [];
  for (const { key, label, unit, dp } of CONTROL_LABELS) {
    const b = before[key] as number;
    const a = after[key] as number;
    if (!isNum(b) || !isNum(a)) continue;
    if (round(b, dp) === round(a, dp)) continue;
    rows.push({
      control: key,
      label,
      unit,
      before: round(b, dp),
      after: round(a, dp),
      delta: round(a - b, dp),
      deltaPct: deltaPct(b, a),
    });
  }
  // Chiller identity changes matter even when the count does not.
  const beforeIds = (before.chillerIds ?? []).join(',');
  const afterIds = (after.chillerIds ?? []).join(',');
  if (beforeIds !== afterIds) {
    rows.push({
      control: 'chillerIds',
      label: 'Chillers selected',
      unit: '',
      before: beforeIds || '—',
      after: afterIds || '—',
      delta: null,
      deltaPct: null,
    } as never);
  }
  return rows;
}

/** Before/after for every control, moved or not — the "why" answer needs both. */
function controlTable(before: ControlState | null, after: ControlState | null) {
  if (!before) return [];
  return CONTROL_LABELS.map(({ key, label, unit, dp }) => ({
    control: key,
    label,
    unit,
    before: round(before[key] as number, dp),
    after: after ? round(after[key] as number, dp) : null,
    changed: after ? round(before[key] as number, dp) !== round(after[key] as number, dp) : false,
  })).concat([
    {
      control: 'chillerIds' as never,
      label: 'Chillers selected',
      unit: '',
      before: (before.chillerIds ?? []).join(', ') as never,
      after: (after?.chillerIds ?? []).join(', ') as never,
      changed: (before.chillerIds ?? []).join(',') !== (after?.chillerIds ?? []).join(','),
    },
  ]);
}

function bindingFrom(result: SimulationResult | null, rejections: Record<string, number>) {
  const out: Array<{ code: string; label: string; source: string; message?: string }> = [];
  for (const v of result?.violations ?? []) {
    out.push({ code: v.code, label: VIOLATION_LABELS[v.code] ?? v.code, source: 'violated by the optimum', message: v.message });
  }
  // A constraint that rejected candidates is what SHAPED the answer, even when
  // the winner does not violate it. That is the more useful "why".
  const ranked = Object.entries(rejections).sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [code, count] of ranked) {
    out.push({
      code,
      label: VIOLATION_LABELS[code] ?? code,
      source: `rejected ${count} candidate${count === 1 ? '' : 's'} during the search`,
    });
  }
  return out;
}

/* ───────────────────────────────────────────────────── trust assessment ── */

export interface TrustAssessment {
  verdict: 'verified' | 'qualified' | 'questionable';
  headline: string;
  caveats: string[];
}

/**
 * Whether a reported saving should be believed, and why not.
 *
 * Written as a checklist rather than a score because each item is a distinct,
 * nameable failure of a saving claim, and an operator needs to know WHICH one
 * applies. Silence here would be the most damaging thing the assistant could
 * do: an unverified percentage is how a plant ends up chasing a number.
 */
export function assessTrust(record: MpcRunRecord): TrustAssessment {
  const caveats: string[] = [];
  let questionable = false;

  if (record.kind === 'steady-state') {
    const r = record as SteadyStateRunRecord;
    if (!r.solved) {
      return {
        verdict: 'questionable',
        headline: 'No feasible operating point was found.',
        caveats: ['Every candidate violated at least one constraint, so there is no optimum to trust.'],
      };
    }
    const o = r.optimalResult;
    const b = r.baselineResult;
    if (o && b) {
      const shortfall = b.coolingDeliveredRt - o.coolingDeliveredRt;
      if (shortfall > 1) {
        questionable = true;
        caveats.push(
          `The optimum delivers ${round(shortfall, 0)} RT less cooling than the baseline (${round(o.coolingDeliveredRt, 0)} vs ${round(b.coolingDeliveredRt, 0)} RT), so part of the saving is unserved load rather than efficiency.`
        );
      }
      if (o.calibration.status === 'extrapolated') {
        caveats.push(
          `The optimum sits outside the twin's calibration envelope: ${o.calibration.reasons.join('; ')}. The direction of the change is modelled, but the magnitude is an extrapolation.`
        );
      }
      if (!o.feasible) {
        questionable = true;
        caveats.push(`The winning candidate still violates: ${o.violations.map((v) => v.message).join('; ')}.`);
      }
      if (o.chwrC > designConstraints().system.maxChwrC - 0.3) {
        caveats.push(
          `Predicted CHWR ${round(o.chwrC, 2)} °C is within 0.3 K of the ${designConstraints().system.maxChwrC} °C return limit, so there is little margin left for a load swing.`
        );
      }
    }
    // A steady-state optimum ignores thermal memory by construction.
    caveats.push(
      'This is a steady-state optimum: it holds load and weather fixed and ignores the loop\'s thermal memory. Run a baseline-vs-MPC horizon comparison before quoting the saving over a period.'
    );
  } else {
    const r = record as HorizonRunRecord;
    caveats.push(...r.caveats);
    if (r.savings?.basis === 'unequal-delivery') questionable = true;
    if (isNum((r.mpcTotals as any)?.unmetRtHours) && (r.mpcTotals as any).unmetRtHours > 1) questionable = true;
    if ((r.solver as any)?.fallbacks > 0) {
      questionable = true;
      caveats.push(`The solver fell back to a heuristic on ${(r.solver as any).fallbacks} step(s); those moves were not optimised.`);
    }
    if ((r.mpcTotals as any)?.infeasibleSteps > 0) {
      questionable = true;
      caveats.push(`${(r.mpcTotals as any).infeasibleSteps} step(s) had no feasible control.`);
    }
  }

  const verdict = questionable ? 'questionable' : caveats.length ? 'qualified' : 'verified';
  const headline =
    verdict === 'questionable'
      ? 'I would not treat the full reported saving as a verified efficiency improvement.'
      : verdict === 'qualified'
        ? 'The saving looks real, but read it with the caveats below.'
        : 'No caveats found against this result.';
  return { verdict, headline, caveats };
}

function summariseRun(record: MpcRunRecord) {
  if (record.kind === 'steady-state') {
    return {
      runId: record.id,
      kind: record.kind,
      ranAt: new Date(record.at).toISOString(),
      appliedToTwin: record.applied,
      solved: record.solved,
      input: record.input,
      savingKw: round(record.savingKw, 1),
      savingPct: round(record.savingPct, 2),
      before: summariseResult(record.baselineControl, record.baselineResult),
      after: record.optimalControl && record.optimalResult
        ? summariseResult(record.optimalControl, record.optimalResult)
        : null,
      changes: record.optimalControl ? controlDelta(record.baselineControl, record.optimalControl) : [],
      trust: assessTrust(record),
    };
  }
  return {
    runId: record.id,
    kind: record.kind,
    ranAt: new Date(record.at).toISOString(),
    appliedToTwin: false,
    day: record.day,
    steps: record.steps,
    savings: record.savings,
    baselineControl: record.baselineControl,
    appliedControl: record.appliedControl,
    changes: record.baselineControl && record.appliedControl
      ? controlDelta(record.baselineControl, record.appliedControl)
      : [],
    caveats: record.caveats,
    trust: assessTrust(record),
  };
}

/* ─────────────────────────────────────────────────────────── definitions ── */

export const MPC_TOOLS: ToolDefinition[] = [
  {
    name: 'runMPC',
    kind: 'simulate',
    sourceType: 'MPC_PREDICTION',
    description:
      'Solve the cheapest legal operating point for the current load and wet bulb across all six controls. Returns before/after power, the control changes and a trust assessment. Does NOT move the plant unless apply=true.',
    args: {
      apply: { type: 'boolean', default: false, description: 'Commit the optimum to the live twin. Requires operator confirmation upstream.' },
      maxCycles: { type: 'number', min: 20, max: 600, description: 'Search budget' },
    },
    costMs: 60,
    run: (a) => runMPC(a as any),
  },
  {
    name: 'compareBaselineVsMPC',
    kind: 'simulate',
    sourceType: 'MPC_PREDICTION',
    description:
      'Run baseline control and the receding-horizon MPC over the same recorded conditions and compare energy, kW/RT, delivered cooling and CHWR. Slow: about a second per step.',
    args: {
      steps: { type: 'number', min: 2, max: 24, default: 6, description: '15-minute steps to simulate' },
      mode: { type: 'string', enum: ['bms', 'manual', 'synthetic'], default: 'bms', description: 'Condition source' },
      day: { type: 'string', maxLength: 10, description: 'BMS day, YYYY-MM-DD' },
      forecast: { type: 'string', enum: ['perfect', 'degraded', 'persistence'], default: 'degraded', description: 'Forecast quality' },
    },
    costMs: 6000,
    run: (a) => compareBaselineVsMPC(a as any),
  },
  {
    name: 'getMPCResult',
    kind: 'read',
    sourceType: 'MPC_PREDICTION',
    description: 'Summary of the most recent MPC run in this session, whether it was started from the chat or from the Optimization workspace.',
    args: { runId: { type: 'string', maxLength: 40, description: 'Specific run id' } },
    costMs: 5,
    run: (a) => getMPCResult(a as any),
  },
  {
    name: 'getMPCDiagnostics',
    kind: 'read',
    sourceType: 'MPC_PREDICTION',
    description: 'Solver internals of the last run: status, objective terms, active constraints, planned trajectory, forecast, fallback state.',
    args: {},
    costMs: 5,
    run: () => getMPCDiagnostics(),
  },
  {
    name: 'getMPCExplanationContext',
    kind: 'read',
    sourceType: 'MPC_PREDICTION',
    description:
      'Everything needed to explain WHY the MPC chose what it chose: baseline vs MPC controls, conditions, power split, CHWR against its limit, binding constraints, objective components, unmet cooling, solver status, calibration warnings and a trust assessment.',
    args: { runId: { type: 'string', maxLength: 40, description: 'Specific run id' } },
    costMs: 60,
    run: (a) => getMPCExplanationContext(a as any),
  },
  {
    name: 'getModelCalibrationStatus',
    kind: 'read',
    sourceType: 'DIGITAL_TWIN',
    description: 'Which parts of the plant model are site-calibrated against measured BMS data and which are defaults, plus the channels this site does not trend.',
    args: {},
    costMs: 20,
    run: () => getModelStatus(),
  },
];
