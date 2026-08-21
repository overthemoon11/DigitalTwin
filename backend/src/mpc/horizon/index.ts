/**
 * Public surface of the receding-horizon MPC: build a scenario, run both arms
 * over it, compare them.
 *
 * THE THREE MODES, AND WHY THE SOURCE IS ALWAYS EXPLICIT
 * ------------------------------------------------------
 *   'bms'        real measured history. Disturbances, initial loop state,
 *                initial staging and the baseline all come from the recording.
 *   'synthetic'  a generated diurnal profile. The benchmark mode — no site data
 *                is involved and none is implied.
 *   'manual'     operator-entered load and wet bulb, held flat. The interactive
 *                what-if mode.
 *
 * `buildScenario` dispatches on the mode and nothing else. There is no path by
 * which a synthetic run quietly reads the workbook, and no path by which a BMS
 * run quietly generates a profile: `bmsScenario` cannot fabricate and
 * `syntheticScenario` cannot measure. Every scenario also carries a
 * `provenance` block naming, field by field, whether the number was MEASURED,
 * DERIVED, INFERRED, ASSUMED, GENERATED or NOT AVAILABLE — and that block is
 * returned to the UI rather than living in a comment here.
 */
import type { ConstraintConfig, ControlState } from '../../../../shared/types/mpc';
import type {
  Disturbance,
  DisturbanceForecast,
  DisturbanceProfile,
  FlowModel,
  HorizonComparison,
  LoopDynamicsConfig,
  LoopState,
} from '../../../../shared/types/horizon';
import type { PlantRecord } from '../../../../shared/types/bms';
import { designConstraints } from '../constraints/constraintConfig';
import { bmsDay, bmsDays } from '../../data/bmsLoader';
import { disturbanceProfile } from '../../data/preprocessing';
import { degradedForesight, perfectForesight, persistenceForecast } from './disturbanceForecast';
import {
  T1_LOOP_DYNAMICS,
  calibrationStatus,
  equivalentLoopVolumeM3,
  initialLoopState,
  measuredFlowModel,
  stagedFlowModel,
} from './loopDynamics';
import { DEFAULT_HORIZON_CONFIG, resolveHorizonConfig, type HorizonConfig } from './horizonConfig';
import { HorizonPlantMpc, withOperatingSchedule } from './plantMpc';
import { compareRuns, runClosedLoop } from './closedLoop';
import { fixedStagingBaseline, recordedStagingBaseline } from '../../control/baselineController';
import { REF_CHWP_SPEED, REF_CT_FAN, REF_CWP_SPEED, round } from '../../digital-twin/chiller/model/plantPhysics';
import { dpSetpointFromChwpSpeed } from '../../digital-twin/chiller/model/dpHydraulics';
import { DEFAULT_CHWS_SP } from '../../digital-twin/chiller/calibration/t1MonthCalibration';

export type HorizonMode = 'bms' | 'manual' | 'synthetic';
export type ForecastKind = 'perfect' | 'degraded' | 'persistence';

export interface HorizonRequest {
  mode?: HorizonMode;
  day?: string;
  steps?: number;
  forecast?: ForecastKind;
  seed?: number;
  baseline?: 'recorded' | 'fixed';
  disturbance?: Partial<Disturbance>;
  constraints?: ConstraintConfig;
  horizon?: Partial<HorizonConfig>;
  dynamics?: Partial<LoopDynamicsConfig>;
}

export interface Scenario {
  mode: HorizonMode;
  day: string | null;
  steps: number;
  disturbances: Disturbance[];
  timestamps: Array<string | null>;
  initialLoop: LoopState;
  baselineControl: ControlState;
  constraints: ConstraintConfig;
  dynamics: LoopDynamicsConfig;
  forecast: DisturbanceForecast;
  flowModel: FlowModel;
  baselineKind: 'recorded' | 'fixed';
  /** Field-by-field data provenance, rendered in the run report. */
  provenance: Record<string, string>;
  qualityFlags: string[];
}

/* -------------------------------------------------------------- scenarios */

export function buildScenario(req: HorizonRequest = {}): Scenario {
  const mode = req.mode ?? 'bms';
  const constraints = req.constraints ?? designConstraints();
  const dynamics: LoopDynamicsConfig = { ...T1_LOOP_DYNAMICS, ...req.dynamics };
  return mode === 'bms'
    ? bmsScenario(req, constraints, dynamics)
    : syntheticScenario(req, constraints, dynamics, mode);
}

function bmsScenario(
  req: HorizonRequest,
  constraints: ConstraintConfig,
  dynamics: LoopDynamicsConfig
): Scenario {
  const days = bmsDays(dynamics.stepMinutes);
  if (!days.length) throw new Error('BMS dataset contains no days.');
  const day = req.day ?? days[days.length - 1];
  if (!days.includes(day)) {
    throw new Error(`day ${day} is not in the dataset (${days[0]} … ${days[days.length - 1]})`);
  }

  const records = bmsDay(day, dynamics.stepMinutes);
  const profile = disturbanceProfile(records, dynamics.stepMinutes);
  const steps = Math.min(req.steps ?? records.length, records.length);
  const disturbances: Disturbance[] = [];
  for (let i = 0; i < steps; i++) {
    disturbances.push({ buildingLoadRt: profile.loadRt[i], wetBulbC: profile.wetBulbC[i] });
  }

  const first = records[0];
  const window = records.slice(0, steps);

  return {
    mode: 'bms',
    day,
    steps,
    disturbances,
    timestamps: window.map((r) => r.t),
    initialLoop: initialLoopState(
      first.chwrC ?? 14.4,
      first.chillerStatus.map((v) => !!v),
      { lastDeliveredRt: first.loadRt ?? 0 }
    ),
    baselineControl: baselineControlFrom(first, constraints),
    constraints,
    dynamics,
    forecast: buildForecast(req, profile, disturbances),
    flowModel: measuredFlowModel(
      window.map((r) => r.riserFlowLs),
      window.map((r) => r.chillerStatus.reduce((a, v) => a + (v ? 1 : 0), 0)),
      dynamics
    ),
    baselineKind: req.baseline ?? 'recorded',
    provenance: {
      buildingLoadRt:
        'DERIVED from the workbook (1.18892 x riser flow x header ΔT); only 133 of 44,640 raw minutes carry a measured RT',
      wetBulbC: 'MEASURED (mean of the five WST sensors)',
      chwstSetpointC:
        'PROXY: the measured achieved CHWS. This site trends no setpoints, so the setpoint is approximated by what the plant actually held',
      chwFlowLs:
        'MEASURED (sum of the four riser meters), scaled by commanded/observed chiller count and by commanded/reference pump speed',
      initialChwrC: 'MEASURED (header CHWR at the first bucket of the day)',
      initialStaging: 'INFERRED from metered compressor kW (> 50 kW = running)',
      chwpSpeedPct:
        'NOT TRENDED. The reference speed is the operating point the measured pump kW was calibrated at; the affinity response away from it is a physics default',
      cwpSpeedPct:
        'NOT TRENDED. Same as CHWP, plus the condenser-lift penalty for off-reference flow, which is a physics default (condenserHydraulics.ts)',
      ctFanSpeedPct:
        'NOT TRENDED — only fan VSD kW. The approach LEVEL is site-fitted; the fan-speed response is a tower power law (towerFanLaw.ts)',
      dpSetpointPsi:
        'NOT TRENDED — no DP measurement or setpoint of any kind. Back-solved from the observed pump operating point through the twin default DP↔speed map (dpHydraulics.ts)',
      chillerPower:
        'MEASURED per compressor. Part-load SHAPE from a Gordon-Ng fit to the same trend (held-out MAE 5.2 kW); LEVEL from the engine affine curve',
      loopCapacitance: `ASSUMED (${dynamics.loopRtPerKPerStep} RT/K/step, about ${equivalentLoopVolumeM3(dynamics)} m³ of loop water): ${calibrationStatus().note}`,
    },
    qualityFlags: profile.qualityFlags,
  };
}

function syntheticScenario(
  req: HorizonRequest,
  constraints: ConstraintConfig,
  dynamics: LoopDynamicsConfig,
  mode: HorizonMode
): Scenario {
  const steps = req.steps ?? 96;
  const load = req.disturbance?.buildingLoadRt ?? 3100;
  const wb = req.disturbance?.wetBulbC ?? 24.8;

  const disturbances: Disturbance[] = [];
  for (let i = 0; i < steps; i++) {
    if (mode === 'manual') {
      disturbances.push({ buildingLoadRt: load, wetBulbC: wb });
    } else {
      // A generic diurnal shape peaking mid-afternoon. GENERATED, not T1's.
      const h = (i * dynamics.stepMinutes) / 60;
      const shape = 0.5 * (1 - Math.cos((2 * Math.PI * (h - 4)) / 24));
      disturbances.push({
        buildingLoadRt: load * (0.88 + 0.24 * shape),
        wetBulbC: wb + 1.6 * (shape - 0.5),
      });
    }
  }

  const profile: DisturbanceProfile = {
    day: '',
    stepMinutes: dynamics.stepMinutes,
    t: disturbances.map((_, i) => String(i)),
    loadRt: disturbances.map((d) => d.buildingLoadRt),
    wetBulbC: disturbances.map((d) => d.wetBulbC),
    gapSteps: 0,
    qualityFlags: [],
  };

  // The three-machine lineup T1 held all December, as the starting state.
  const running = [false, false, true, true, true];

  return {
    mode,
    day: null,
    steps,
    disturbances,
    timestamps: disturbances.map(() => null),
    initialLoop: initialLoopState(14.45, running, { lastDeliveredRt: load }),
    baselineControl: defaultBaselineControl(constraints),
    constraints,
    dynamics,
    forecast: buildForecast(req, profile, disturbances),
    flowModel: stagedFlowModel(dynamics),
    baselineKind: 'fixed',
    provenance: {
      buildingLoadRt:
        mode === 'manual'
          ? 'OPERATOR INPUT, held flat across the run'
          : 'GENERATED diurnal profile (assumed shape, not this site)',
      wetBulbC: mode === 'manual' ? 'OPERATOR INPUT, held flat' : 'GENERATED',
      initialChwrC: 'ASSUMED (the observed December median of 14.45 °C)',
      initialStaging: 'ASSUMED (the three-machine lineup observed all December)',
      chwFlowLs: `ASSUMED (${dynamics.flowPerPumpLs} L/s per running pump at ${REF_CHWP_SPEED}%, affinity-scaled)`,
      loopCapacitance: `ASSUMED (${dynamics.loopRtPerKPerStep} RT/K/step): ${calibrationStatus().note}`,
    },
    qualityFlags: [],
  };
}

function buildForecast(
  req: HorizonRequest,
  profile: DisturbanceProfile,
  disturbances: Disturbance[]
): DisturbanceForecast {
  const steps = req.horizon?.horizonSteps ?? DEFAULT_HORIZON_CONFIG.horizonSteps;
  switch (req.forecast ?? 'degraded') {
    case 'perfect':
      return perfectForesight(profile, steps);
    case 'persistence':
      return persistenceForecast(disturbances[0] ?? { buildingLoadRt: 3100, wetBulbC: 24.8 }, steps);
    default:
      return degradedForesight(profile, steps, { seed: req.seed ?? 42 });
  }
}

/**
 * The plant's own operating point at the start of a recorded day.
 *
 * CHWS is the achieved header temperature (this site has no setpoint channel);
 * staging is inferred from metered power; the DP setpoint is back-solved from
 * the reference pump speed so that DP and pump speed agree with each other.
 */
function baselineControlFrom(record: PlantRecord, cfg: ConstraintConfig): ControlState {
  const base = defaultBaselineControl(cfg);
  const running = record.chillerStatus.reduce((s, v) => s + (v ? 1 : 0), 0) || base.runningChillers;
  return { ...base, chwstSetpointC: record.chwsC ?? base.chwstSetpointC, runningChillers: running };
}

/**
 * The incumbent operating point.
 *
 * Every value is the measured December median or the reference the measured kW
 * was calibrated at — nothing here is a design guess. The DP setpoint in
 * particular is NOT the middle of its allowed band: it is the setpoint that
 * reproduces the observed pump speed, because a baseline whose DP and pump
 * speed contradict each other is not a baseline of anything.
 */
function defaultBaselineControl(_cfg: ConstraintConfig): ControlState {
  return {
    chwstSetpointC: DEFAULT_CHWS_SP,
    dpSetpointPsi: dpSetpointFromChwpSpeed(REF_CHWP_SPEED),
    runningChillers: 3,
    chillerIds: [],
    chwpSpeedPct: REF_CHWP_SPEED,
    cwpSpeedPct: REF_CWP_SPEED,
    ctFanSpeedPct: REF_CT_FAN,
  };
}

/* ---------------------------------------------------------------- the run */

export interface HorizonComparisonResult extends HorizonComparison {
  scenario: {
    mode: HorizonMode;
    day: string | null;
    steps: number;
    stepMinutes: number;
    forecast: string;
    baselineKind: string;
    provenance: Record<string, string>;
    qualityFlags: string[];
    flowModel: { name: string; provenance: string };
    loopDynamics: {
      config: LoopDynamicsConfig;
      equivalentVolumeM3: number;
      calibration: ReturnType<typeof calibrationStatus>;
    };
    horizon: HorizonConfig;
  };
}

/**
 * Run the baseline and the MPC over the SAME scenario and compare them.
 *
 * The `shared` object is the fairness mechanism: both arms are constructed from
 * one set of conditions, so it is not possible to accidentally give the MPC a
 * different load, a different starting state or a different constraint set.
 * `compareRuns` then re-checks that at the end and throws if anything differs.
 */
export function runHorizonComparison(req: HorizonRequest = {}): HorizonComparisonResult {
  const scenario = buildScenario(req);
  const records =
    scenario.mode === 'bms' && scenario.day ? bmsDay(scenario.day, scenario.dynamics.stepMinutes) : [];

  const baselineController =
    scenario.baselineKind === 'recorded' && records.length
      ? recordedStagingBaseline(records)
      : fixedStagingBaseline({ count: scenario.baselineControl.runningChillers });

  const shared = {
    constraints: scenario.constraints,
    disturbances: scenario.disturbances,
    forecast: scenario.forecast,
    baselineControl: scenario.baselineControl,
    initialLoop: scenario.initialLoop,
    dynamics: scenario.dynamics,
    flowModel: scenario.flowModel,
    source: (scenario.mode === 'bms' ? 'bms' : scenario.mode === 'manual' ? 'manual' : 'synthetic') as
      | 'bms'
      | 'manual'
      | 'synthetic',
    day: scenario.day,
    timestamps: scenario.timestamps,
  };

  const horizonConfig = resolveHorizonConfig(req.horizon);
  const baseline = runClosedLoop({
    label: 'Baseline',
    controller: withOperatingSchedule(baselineController, scenario.timestamps),
    ...shared,
  });
  const mpc = runClosedLoop({
    label: 'MPC',
    controller: withOperatingSchedule(new HorizonPlantMpc(horizonConfig), scenario.timestamps),
    ...shared,
  });

  const comparison = compareRuns(baseline, mpc);
  const caveats = [...comparison.caveats, ...startCapCaveat(scenario.constraints, mpc.totals.chillerStarts)];

  return {
    ...comparison,
    caveats,
    scenario: {
      mode: scenario.mode,
      day: scenario.day,
      steps: scenario.steps,
      stepMinutes: scenario.dynamics.stepMinutes,
      forecast: scenario.forecast.name,
      baselineKind: scenario.baselineKind,
      provenance: scenario.provenance,
      qualityFlags: scenario.qualityFlags,
      flowModel: { name: scenario.flowModel.name, provenance: scenario.flowModel.provenance },
      loopDynamics: {
        config: scenario.dynamics,
        equivalentVolumeM3: equivalentLoopVolumeM3(scenario.dynamics),
        calibration: calibrationStatus(),
      },
      horizon: horizonConfig,
    },
  };
}

/**
 * The per-run start cap is a whole-run quantity, so it cannot be a per-step
 * constraint. It is reported as a caveat rather than silently ignored.
 */
function startCapCaveat(cfg: ConstraintConfig, starts: number): string[] {
  const cap = cfg.system.maxChillerStartsPerRun;
  if (cap > 0 && starts > cap) {
    return [`The MPC used ${starts} chiller starts against a configured cap of ${cap} for the run.`];
  }
  return [];
}

export { round };
export { ConditionMismatchError, compareRuns, runClosedLoop } from './closedLoop';
export { DEFAULT_HORIZON_CONFIG, resolveHorizonConfig } from './horizonConfig';
export type { HorizonConfig } from './horizonConfig';
export { HorizonPlantMpc, PLANT_MPC_PROVENANCE } from './plantMpc';
export {
  T1_LOOP_DYNAMICS,
  calibrationStatus,
  equivalentLoopVolumeM3,
  initialLoopState,
  measuredFlowModel,
  stagedFlowModel,
} from './loopDynamics';
export { degradedForesight, perfectForesight, persistenceForecast } from './disturbanceForecast';
export { fixedStagingBaseline, recordedStagingBaseline } from '../../control/baselineController';
