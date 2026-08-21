/**
 * HTTP surface of the receding-horizon MPC.
 *
 * Three jobs and no domain logic: coerce an untrusted body into a typed
 * request, call the horizon module, and trim the response to what a client can
 * actually use. Every number in the reply is produced by `mpc/horizon`; nothing
 * is computed here.
 *
 * The coercion is deliberately strict — an unknown horizon key or a
 * non-numeric constraint is a 400, not a silently ignored field. A tuning knob
 * that looks like it was applied but was not is worse than an error, because
 * the run still returns a plausible number.
 */
import type { ConstraintConfig } from '../../../../shared/types/mpc';
import type { HorizonRun, HorizonStep, SolverDiagnostics } from '../../../../shared/types/horizon';
import { ApiError } from './simulationController';
import { designConstraints, validateConstraintConfig } from '../../mpc/index';
import {
  DEFAULT_HORIZON_CONFIG,
  T1_LOOP_DYNAMICS,
  ConditionMismatchError,
  calibrationStatus,
  runHorizonComparison,
  type ForecastKind,
  type HorizonMode,
  type HorizonRequest,
} from '../../mpc/horizon/index';
import { bmsAvailable, bmsDays, loadBmsSummary, BmsArtifactError } from '../../data/bmsLoader';
import { validateTwinAgainstBms } from '../../evaluation/twinValidation';
import { CALIBRATION_BOUNDS } from '../../digital-twin/chiller/calibration/calibrationEnvelope';
import { CALIBRATION_FIT } from '../../digital-twin/chiller/index';
import { TOWER_APPROACH_FIT } from '../../digital-twin/chiller/calibration/towerApproachFit';
import { GORDON_NG_FIT } from '../../digital-twin/chiller/calibration/gordonNgFit';
import {
  COND_APPROACH_FLOW_EXPONENT,
  REF_COND_APPROACH_K,
} from '../../digital-twin/chiller/model/condenserHydraulics';
import { CT_APPROACH_AIRFLOW_EXPONENT } from '../../digital-twin/chiller/model/towerFanLaw';
import type { ModelStatus } from '../../../../shared/types/bms';

const MODES: HorizonMode[] = ['bms', 'manual', 'synthetic'];
const FORECASTS: ForecastKind[] = ['perfect', 'degraded', 'persistence'];

/** 288 x 15 min = 3 days. Past that a single request is a batch job. */
const MAX_STEPS = 288;

/* --------------------------------------------------------------- coercion */

/** Deep-merge a partial constraint patch over the design defaults, then validate. */
function coerceConstraints(patch: unknown): ConstraintConfig {
  const base = designConstraints();
  if (patch == null) return base;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, '`constraints` must be an object');
  }
  const merge = (a: any, b: any): any => {
    if (b == null) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      return b.map((item, i) => (typeof item === 'object' && item ? merge(a[i] ?? {}, item) : item));
    }
    if (typeof a === 'object' && a && typeof b === 'object') {
      const out: any = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
      return out;
    }
    return b;
  };
  const merged = merge(base, patch) as ConstraintConfig;
  const errors = validateConstraintConfig(merged);
  if (errors.length) {
    throw new ApiError(
      400,
      `invalid constraints: ${errors.map((e) => `${e.section}.${e.field} ${e.message}`).join(', ')}`
    );
  }
  return merged;
}

/** Only accept keys that exist on the reference object, and only as numbers. */
function coerceNumericPatch<T extends object>(
  raw: unknown,
  reference: T,
  name: string
): Partial<Record<keyof T, number>> {
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
    throw new ApiError(400, `\`${name}\` must be an object`);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in reference)) throw new ApiError(400, `unknown ${name} option \`${k}\``);
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ApiError(400, `${name}.${k} must be a number`);
    out[k] = n;
  }
  return out as Partial<Record<keyof T, number>>;
}

export function coerceRequest(body: any): HorizonRequest {
  const mode = (body?.mode ?? 'bms') as HorizonMode;
  if (!MODES.includes(mode)) throw new ApiError(400, `\`mode\` must be one of ${MODES.join(', ')}`);

  const forecast = (body?.forecast ?? 'degraded') as ForecastKind;
  if (!FORECASTS.includes(forecast)) {
    throw new ApiError(400, `\`forecast\` must be one of ${FORECASTS.join(', ')}`);
  }
  if (body?.day != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.day))) {
    throw new ApiError(400, '`day` must be YYYY-MM-DD');
  }
  const steps = body?.steps == null ? undefined : Number(body.steps);
  if (steps != null && (!Number.isFinite(steps) || steps < 1 || steps > MAX_STEPS)) {
    throw new ApiError(400, `\`steps\` must be between 1 and ${MAX_STEPS}`);
  }

  const req: HorizonRequest = {
    mode,
    forecast,
    day: body?.day,
    steps,
    constraints: coerceConstraints(body?.constraints),
    baseline: body?.baseline === 'fixed' ? 'fixed' : undefined,
    seed: body?.seed == null ? undefined : Number(body.seed),
  };

  // The left sidebar sends `simulationInput`; the API also accepts the domain
  // name `disturbance`. Same thing — these ARE the disturbances.
  const src = body?.simulationInput ?? body?.disturbance;
  if (src) {
    const load = Number(src.buildingLoadRt);
    const wb = Number(src.wetBulbC);
    if (src.buildingLoadRt != null && (!Number.isFinite(load) || load <= 0)) {
      throw new ApiError(400, 'buildingLoadRt must be a positive number');
    }
    if (src.wetBulbC != null && !Number.isFinite(wb)) {
      throw new ApiError(400, 'wetBulbC must be a number');
    }
    req.disturbance = {
      ...(src.buildingLoadRt != null ? { buildingLoadRt: load } : {}),
      ...(src.wetBulbC != null ? { wetBulbC: wb } : {}),
    };
  }

  if (body?.horizon != null) {
    req.horizon = coerceNumericPatch(body.horizon, DEFAULT_HORIZON_CONFIG, 'horizon');
  }
  if (body?.dynamics != null) {
    req.dynamics = coerceNumericPatch(body.dynamics, T1_LOOP_DYNAMICS, 'dynamics');
  }
  return req;
}

/* ---------------------------------------------------------------- trimming */

/**
 * Trim a run to the fields the UI renders.
 *
 * A 96-step detailed run is a few MB, most of it per-step constraint objects
 * the panel never opens. `detail: true` returns everything for anyone
 * debugging a specific step.
 */
function trimRun(run: HorizonRun, detail: boolean): HorizonRun {
  if (detail) return run;
  return {
    ...run,
    trajectory: run.trajectory.map((s): HorizonStep => ({
      step: s.step,
      t: s.t,
      minutesFromStart: s.minutesFromStart,
      disturbance: s.disturbance,
      control: s.control,
      provenance: s.provenance,
      deliveredRt: s.deliveredRt,
      unmetRt: s.unmetRt,
      starts: s.starts,
      stops: s.stops,
      loop: s.loop,
      result: {
        ...s.result,
        // The violation list is the only unbounded field; keep the codes.
        violations: s.result.violations,
      },
      violations: s.violations,
      diagnostics: s.diagnostics ? trimDiagnostics(s.diagnostics) : null,
    })),
  };
}

function trimDiagnostics(d: SolverDiagnostics): SolverDiagnostics {
  return { ...d, violations: d.violations.slice(0, 4) };
}

/* ------------------------------------------------------------- endpoints */

/** POST /api/mpc/horizon/compare — baseline vs MPC over identical conditions. */
export function compareHorizon(body: any) {
  const req = coerceRequest(body);
  const detail = body?.detail === true;
  try {
    const c = runHorizonComparison(req);
    const solves = c.mpc.trajectory.map((s) => s.diagnostics).filter((d): d is SolverDiagnostics => !!d);
    const first = solves[0] ?? null;

    return {
      status: 'COMPLETED' as const,
      scenario: c.scenario,
      conditions: c.conditions,
      savings: c.savings,
      optimisedControls: c.optimisedControls,
      caveats: c.caveats,
      baseline: trimRun(c.baseline, detail),
      mpc: trimRun(c.mpc, detail),
      /** The applied control at step 0, which is what the before/after table shows. */
      appliedControl: c.mpc.trajectory[0]?.control ?? null,
      baselineControl: c.baseline.trajectory[0]?.control ?? null,
      solver: {
        name: c.mpc.controller,
        steps: solves.length,
        fallbacks: solves.filter((d) => d.fallbackUsed).length,
        totalSolveMs: solves.reduce((a, d) => a + d.solveMs, 0),
        meanSolveMs: solves.length ? Math.round(solves.reduce((a, d) => a + d.solveMs, 0) / solves.length) : 0,
        statuses: countBy(solves.map((d) => d.solverStatus)),
        /** Objective terms of the FIRST applied step, in kW-equivalent. */
        firstStepCostKw: first?.costBreakdownKw ?? {},
        activeConstraints: [...new Set(solves.flatMap((d) => d.activeConstraints))].sort(),
      },
      modelStatus: getModelStatus(),
    };
  } catch (err) {
    if (err instanceof ConditionMismatchError) throw new ApiError(409, err.message);
    if (err instanceof BmsArtifactError) throw new ApiError(503, err.message);
    if (err instanceof Error && /not in the dataset|contains no days/.test(err.message)) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }
}

/** GET /api/mpc/horizon/config — solver defaults and what modes are available. */
export function getHorizonConfig() {
  return {
    horizon: DEFAULT_HORIZON_CONFIG,
    dynamics: T1_LOOP_DYNAMICS,
    dynamicsCalibration: calibrationStatus(),
    modes: MODES,
    forecasts: FORECASTS,
    maxSteps: MAX_STEPS,
    bms: bmsAvailable()
      ? { available: true, days: bmsDays(), stepMinutes: loadBmsSummary().stepMinutes }
      : { available: false, days: [] as string[], stepMinutes: 15 },
  };
}

/** GET /api/mpc/twin-validation — how close the twin is to the measured plant. */
export function getTwinValidation() {
  try {
    return validateTwinAgainstBms();
  } catch (err) {
    if (err instanceof BmsArtifactError) throw new ApiError(503, err.message);
    throw err;
  }
}

/**
 * GET /api/mpc/model-status — what each part of the model was fitted on.
 *
 * This is the frontend's source of truth for "is this number site-calibrated".
 * Each entry names the channels the site does NOT trend, because that is what
 * decides whether a control can honestly be called optimised.
 */
export function getModelStatus(): { models: ModelStatus[]; missingSignals: Record<string, string> } {
  const summary = bmsAvailable() ? loadBmsSummary() : null;
  const loop = calibrationStatus();
  const envelope = `Valid inside the T1 envelope only (load ${CALIBRATION_BOUNDS['ctrl-building-load'].min}-${CALIBRATION_BOUNDS['ctrl-building-load'].max} RT, 3 chillers staged).`;

  const models: ModelStatus[] = [
    {
      id: 'chiller-power',
      label: 'Chiller power (level)',
      status: 'site-calibrated',
      trainedOn: 'bms',
      missingInputs: [],
      metrics: {
        rowsUsed: CALIBRATION_FIT.rowsUsed,
        blockedCvMaePct: CALIBRATION_FIT.blockedCvMaePct,
        inSampleMaePct: CALIBRATION_FIT.inSampleMaePct,
        inSampleBiasPct: CALIBRATION_FIT.inSampleBiasPct,
      },
      note: `Grey-box fit of the engine's own equations to the Dec-2025 trend. ${envelope}`,
    },
    {
      id: 'chiller-part-load',
      label: 'Chiller part-load shape (Gordon-Ng)',
      status: 'site-calibrated',
      trainedOn: 'bms',
      missingInputs: [],
      metrics: {
        heldOutMaeKw: GORDON_NG_FIT.heldOut.maeKw,
        heldOutMapePct: GORDON_NG_FIT.heldOut.mapePct,
        heldOutR2: GORDON_NG_FIT.heldOut.r2,
        affineHeldOutMaeKw: GORDON_NG_FIT.affineHeldOut.maeKw,
        observedPlrMinPct: GORDON_NG_FIT.observedPlrPct.p1,
        observedPlrMaxPct: GORDON_NG_FIT.observedPlrPct.p99,
      },
      note: `Gordon-Ng identified from per-machine BMS operating points; beats the affine curve on held-out days (${GORDON_NG_FIT.heldOut.maeKw} vs ${GORDON_NG_FIT.affineHeldOut.maeKw} kW MAE) and gives staging a positive no-load loss. The machines were never observed below ${GORDON_NG_FIT.observedPlrPct.p1}% load, so the low-load end is a physically-shaped extrapolation of a site-fitted model.`,
    },
    {
      id: 'tower-approach',
      label: 'Cooling-tower approach (level)',
      status: 'site-calibrated',
      trainedOn: 'bms',
      missingInputs: [],
      metrics: {
        heldOutMaeK: TOWER_APPROACH_FIT.heldOut.maeK,
        heldOutR2: TOWER_APPROACH_FIT.heldOut.r2,
        rowsUsed: TOWER_APPROACH_FIT.rowsUsed,
      },
      note: 'Approach against wet bulb and load, fitted on the December trend and scored on the last seven days, which the fit never saw.',
    },
    {
      id: 'tower-fan',
      label: 'Cooling-tower fan response',
      status: 'default',
      trainedOn: 'none',
      missingInputs: ['ct_fan_speed_pct'],
      metrics: { airflowExponent: CT_APPROACH_AIRFLOW_EXPONENT },
      note: `Approach scales as (reference speed / fan speed)^${CT_APPROACH_AIRFLOW_EXPONENT}, a standard counterflow-tower power law, anchored at the site-fitted approach so it is exactly neutral at the reference speed. The site trends fan VSD POWER but never fan SPEED, so the exponent cannot be fitted here. Fan POWER itself is the cube law about a measured reference kW.`,
    },
    {
      id: 'pump-power',
      label: 'Pump power (CHWP / CWP)',
      status: 'partially-calibrated',
      trainedOn: 'bms',
      missingInputs: ['chwp_speed_pct', 'cwp_speed_pct'],
      metrics: null,
      note: 'Power LEVEL is fitted to the measured pump kW at the observed operating point, but the workbook has no speed or frequency channel, so power-vs-speed is an affinity-law assumption. T1 also ran its pumps at an essentially fixed operating point all month, so the curve is unexercised by the data.',
    },
    {
      id: 'condenser-flow-lift',
      label: 'Condenser flow → compressor lift',
      status: 'default',
      trainedOn: 'none',
      missingInputs: ['cwp_speed_pct'],
      metrics: { bundleApproachK: REF_COND_APPROACH_K, flowExponent: COND_APPROACH_FLOW_EXPONENT },
      note: `Slowing the CW pumps raises the condenser water rise (measured reference 4.26 K) and degrades the tube-bundle approach as flow^-${COND_APPROACH_FLOW_EXPONENT} (Dittus-Boelter). The equivalent lift is priced with the engine's own calibrated lift slope. Exactly zero at the reference speed. Without it, slow condenser pumps would be free.`,
    },
    {
      id: 'dp-hydraulics',
      label: 'CHW differential pressure',
      status: 'default',
      trainedOn: 'none',
      missingInputs: ['chw_dp_kpa', 'dp_sp_kpa'],
      metrics: null,
      note: 'No DP channel of any kind exists in this dataset. DP-SP is optimised through the twin default DP↔pump-speed map (70% at 15 psi, +3 %/psi), so the resulting pump operating point and its energy are real, but the DP NUMBER attached to it rests on an uncalibrated relation. Its effect on the plant — flow, ΔT, return temperature, pump kW — is fully modelled.',
    },
    {
      id: 'loop-dynamics',
      label: 'CHW loop thermal dynamics',
      status: loop.status,
      trainedOn: 'none',
      missingInputs: ['independent load measurement'],
      metrics: null,
      note: loop.note,
    },
    {
      id: 'load-forecast',
      label: 'Building-load and wet-bulb forecast',
      status: 'default',
      trainedOn: 'none',
      missingInputs: ['forecast feed'],
      metrics: null,
      note: 'No forecast is trended at this site, so forecasts are generated from recorded history (perfect, lead-time-degraded, or persistence) behind the DisturbanceForecast interface. Swap in a real feed there.',
    },
  ];

  return { models, missingSignals: summary?.missingSignals ?? {} };
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
