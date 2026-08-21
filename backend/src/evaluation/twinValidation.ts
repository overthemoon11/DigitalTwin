/**
 * Digital-twin validation: replay the measured month through the twin and
 * score every channel against what the plant actually did.
 *
 * WHY THIS RUNS BEFORE ANY SAVING IS QUOTED
 * -----------------------------------------
 * An MPC saving is a difference between two runs of the same model. That
 * difference is only worth anything if the model tracks the real plant, so this
 * module answers the prior question — how far off is the twin, channel by
 * channel — and the API exposes it next to the saving rather than somewhere
 * else. A saving of 3% from a model with 8% error on plant power is not a
 * result, and the only way to know that is to publish both numbers together.
 *
 * WHAT IS AND IS NOT A FAIR TEST HERE
 * -----------------------------------
 * This is a REPLAY, not a held-out prediction. The twin's chiller-power
 * constants were least-squares fitted on this same December trend, so the plant
 * kW numbers below are in-sample and flattered by construction; the honest
 * out-of-sample figures live with each fit (`CALIBRATION_FIT.blockedCvMaePct`,
 * `TOWER_APPROACH_FIT.heldOut`, `GORDON_NG_FIT.heldOut`) and are reported
 * alongside. What a replay DOES test, and nothing else does, is whether the
 * whole assembled chain — weather inversion, staging, tower approach, condenser
 * correction, part-load shape, pump laws — reproduces the plant when driven
 * only by load, wet bulb and observed staging.
 *
 * Channels the twin cannot be scored on are listed with the reason rather than
 * omitted, so the coverage of this table is itself visible.
 */
import type { PlantRecord } from '../../../shared/types/bms';
import { isFittable, stagingOf } from '../../../shared/types/bms';
import { loadBmsHistory } from '../data/bmsLoader';
import { fitMetrics, type FitMetrics } from '../data/preprocessing';
import { designConstraints } from '../mpc/constraints/constraintConfig';
import { simulateCandidate } from '../mpc/simulator/chillerPlantSimulator';
import { chillerIdsFor } from '../mpc/optimizer/candidateGenerator';
import { dpSetpointFromChwpSpeed } from '../digital-twin/chiller/model/dpHydraulics';
import { REF_CHWP_SPEED, REF_CT_FAN, REF_CWP_SPEED } from '../digital-twin/chiller/model/plantPhysics';
import { CALIBRATION_FIT } from '../digital-twin/chiller/index';
import { TOWER_APPROACH_FIT } from '../digital-twin/chiller/calibration/towerApproachFit';
import { GORDON_NG_FIT } from '../digital-twin/chiller/calibration/gordonNgFit';

export interface ChannelValidation {
  id: string;
  label: string;
  unit: string;
  /** MEASURED / DERIVED / INFERRED — what the twin is being scored against. */
  reference: string;
  metrics: FitMetrics;
}

export interface UnscorableChannel {
  id: string;
  label: string;
  reason: string;
}

export interface TwinValidationReport {
  dataset: string;
  stepMinutes: number;
  /** Buckets that survived the fittable filter and drove the replay. */
  recordsScored: number;
  recordsAvailable: number;
  days: string[];
  basis: string;
  channels: ChannelValidation[];
  unscorable: UnscorableChannel[];
  /** Out-of-sample scores recorded by each individual fit. */
  heldOut: Record<string, unknown>;
  generatedAt: string;
}

const CONSTRAINTS = designConstraints();

/** Replays are deterministic, so one cached report serves every request. */
let cache: TwinValidationReport | null = null;

export function clearTwinValidationCache(): void {
  cache = null;
}

/**
 * Drive the twin from each measured bucket and collect predicted/actual pairs.
 *
 * The twin is given ONLY what a controller would know: cooling load, wet bulb
 * and how many machines were running. Everything else — flows, temperatures,
 * every kW — is the model's own output and is what gets scored. Feeding it the
 * measured flow or the measured condenser temperature would make several rows
 * below trivially perfect and the table meaningless.
 */
export function validateTwinAgainstBms(stepMinutes = 15): TwinValidationReport {
  if (cache && cache.stepMinutes === stepMinutes) return cache;

  const all = loadBmsHistory({ stepMinutes });
  const records = all.filter(
    (r) => isFittable(r) && stagingOf(r).chillers > 0 && r.loadRt != null && r.loadRt > 0
  );

  const pairs = {
    totalPlantKw: [[], []] as [number[], number[]],
    chillerKw: [[], []] as [number[], number[]],
    pumpKw: [[], []] as [number[], number[]],
    towerKw: [[], []] as [number[], number[]],
    plantKwPerRt: [[], []] as [number[], number[]],
    chwrC: [[], []] as [number[], number[]],
    chwFlowLs: [[], []] as [number[], number[]],
    cwsC: [[], []] as [number[], number[]],
    cwrC: [[], []] as [number[], number[]],
  };

  const push = (key: keyof typeof pairs, actual: number | null | undefined, predicted: number) => {
    if (actual == null || !Number.isFinite(actual)) return;
    pairs[key][0].push(actual);
    pairs[key][1].push(predicted);
  };

  for (const r of records) {
    const count = stagingOf(r).chillers;
    const result = simulateCandidate(
      { buildingLoadRt: r.loadRt as number, wetBulbC: r.wetBulbC as number },
      {
        chwstSetpointC: r.chwsC as number,
        dpSetpointPsi: dpSetpointFromChwpSpeed(REF_CHWP_SPEED),
        runningChillers: count,
        chillerIds: chillerIdsFor(CONSTRAINTS, count),
        chwpSpeedPct: REF_CHWP_SPEED,
        cwpSpeedPct: REF_CWP_SPEED,
        ctFanSpeedPct: REF_CT_FAN,
      },
      CONSTRAINTS,
      { baseline: null, dryBulbHintC: (r.wetBulbC as number) + 6 }
    );

    push('totalPlantKw', r.totalPlantKw, result.totalPlantKw);
    push('chillerKw', r.totalChillerKw, result.chillerKw);
    push('pumpKw', sumOrNull(r.chwpKw, r.cwpKw), result.pumpKw);
    push('towerKw', r.towerKw, result.towerKw);
    push('plantKwPerRt', r.plantKwPerRt, result.plantKwPerRt);
    push('chwrC', r.chwrC, result.chwrC);
    push('chwFlowLs', r.riserFlowLs, result.chwFlowLs);
    push('cwsC', r.cwsC, result.cwsC);
    push('cwrC', r.cwrC, result.cwrC);
  }

  const channel = (
    id: keyof typeof pairs,
    label: string,
    unit: string,
    reference: string
  ): ChannelValidation => ({
    id,
    label,
    unit,
    reference,
    metrics: fitMetrics(pairs[id][0], pairs[id][1]),
  });

  cache = {
    dataset: 't1_2025_12',
    stepMinutes,
    recordsScored: records.length,
    recordsAvailable: all.length,
    days: [...new Set(records.map((r) => r.t.slice(0, 10)))].sort(),
    basis:
      'In-sample replay. The twin is driven by measured cooling load, measured wet bulb and inferred staging only; every other quantity below is model output. The chiller-power constants were fitted on this same month, so these are not held-out scores — see `heldOut`.',
    channels: [
      channel('totalPlantKw', 'Total plant power', 'kW', 'MEASURED (sum of DPM meters)'),
      channel('chillerKw', 'Chiller power', 'kW', 'MEASURED (compressor DPM meters)'),
      channel('pumpKw', 'Pump power (CHWP + CWP)', 'kW', 'MEASURED (DPM meters)'),
      channel('towerKw', 'Cooling-tower power', 'kW', 'MEASURED (DPM meters)'),
      channel('plantKwPerRt', 'Plant efficiency', 'kW/RT', 'DERIVED (measured kW / derived RT)'),
      channel('chwrC', 'Header CHWR', '°C', 'MEASURED'),
      channel('chwFlowLs', 'CHW flow', 'L/s', 'MEASURED (sum of four riser meters)'),
      channel('cwsC', 'Condenser water supply', '°C', 'MEASURED'),
      channel('cwrC', 'Condenser water return', '°C', 'MEASURED'),
    ],
    unscorable: [
      {
        id: 'chwsC',
        label: 'Header CHWS',
        reason:
          'Not scorable: the achieved CHWS is fed to the twin as the setpoint proxy, because this site trends no setpoint. Comparing the output against its own input would be circular.',
      },
      {
        id: 'chwDpPsi',
        label: 'CHW differential pressure',
        reason: 'No DP channel of any kind exists in this dataset.',
      },
      {
        id: 'chwpSpeedPct',
        label: 'CHWP / CWP speed',
        reason: 'No pump speed or frequency channel — VSD kW only.',
      },
      {
        id: 'ctFanSpeedPct',
        label: 'CT fan speed',
        reason: 'No fan speed channel — fan VSD kW only.',
      },
      {
        id: 'buildingLoadRt',
        label: 'Plant RT',
        reason:
          'Not scorable as a twin output: RT is an INPUT to the replay. Its own reconstruction is validated separately in the dataset summary (rtValidation), where it scores 0.105% MAPE against the 133 measured rows.',
      },
    ],
    heldOut: {
      chillerPowerBlockedCvMaePct: CALIBRATION_FIT.blockedCvMaePct,
      chillerPowerInSampleMaePct: CALIBRATION_FIT.inSampleMaePct,
      towerApproach: TOWER_APPROACH_FIT.heldOut,
      gordonNgPartLoad: GORDON_NG_FIT.heldOut,
      gordonNgAffineComparison: GORDON_NG_FIT.affineHeldOut,
    },
    generatedAt: new Date().toISOString(),
  };
  return cache;
}

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}
