/**
 * Plant design constraints — the search boundaries the MPC must respect.
 *
 * Every default here is either (a) an existing operating bound already declared
 * in `chillerConstraints.ts`, or (b) derived from a MEASURED T1 reference in
 * `t1MonthCalibration.ts` by an explicitly stated turndown factor. Nothing is
 * invented, and there is no second source of truth for a limit the engine
 * already enforces — if you widen `ctrl-chws-sp` there, the design default here
 * follows automatically.
 *
 * Where a factor IS applied (evaporator/condenser flow turndown, pump head)
 * it is named and commented, because those limits are not observable in the
 * dataset: T1 runs its pumps at essentially fixed speed, so the data shows the
 * operating point, never the machine's limit.
 */
import type {
  ConstraintConfig,
  ConstraintConfigError,
  ChillerUnitConstraint,
} from '../../../../shared/types/mpc';
import { CHILLER_CONTROL_CONSTRAINTS } from '../../digital-twin/chiller/constraints/chillerConstraints';
import {
  CHILLER_CAPACITY_RT,
  CHILLER_COUNT,
  CHWP_COUNT,
  CWP_COUNT,
  MIN_CONDENSER_APPROACH_C,
  round,
} from '../../digital-twin/chiller/model/plantPhysics';
import {
  REF_CHWP_FLOW_MONTH,
  REF_CWP_FLOW_MONTH,
  REF_CHWP_KW_MONTH,
  REF_CWP_KW_MONTH,
} from '../../digital-twin/chiller/calibration/t1MonthCalibration';

const M3H_TO_LS = 1 / 3.6;

/** Measured month-median flow per RUNNING pump, in L/s. */
const CHWP_REF_FLOW_LS = REF_CHWP_FLOW_MONTH * M3H_TO_LS; // ≈ 126.3 L/s
const CWP_REF_FLOW_LS = REF_CWP_FLOW_MONTH * M3H_TO_LS; // ≈ 232.2 L/s

/* Turndown factors applied to the measured operating point to get machine
 * limits. These are ASSUMPTIONS (typical shell-and-tube evaporator/condenser
 * limits), not measurements — T1's pumps barely move, so the data cannot show
 * where the real limits are. Documented in the run report. */
const EVAP_MIN_FLOW_FRAC = 0.5;
const EVAP_MAX_FLOW_FRAC = 1.2;
const COND_MIN_FLOW_FRAC = 0.5;
const COND_MAX_FLOW_FRAC = 1.2;
/** Rated pump duty ≈ the measured operating point ÷ the 70% reference speed,
 *  i.e. what the pump would deliver at 100% on the same curve. */
const PUMP_REF_SPEED_PCT = 70;

function designChillerUnit(index: number): ChillerUnitConstraint {
  const unit = index + 1;
  return {
    id: `ch-${unit}`,
    name: `CH-${unit}`,
    available: true,
    ratedCapacityRt: CHILLER_CAPACITY_RT,
    // Centrifugal machines surge below roughly a quarter load; 100% is nameplate.
    minLoadPct: 25,
    maxLoadPct: 100,
    minChwFlowLs: round(CHWP_REF_FLOW_LS * EVAP_MIN_FLOW_FRAC, 1),
    maxChwFlowLs: round(CHWP_REF_FLOW_LS * EVAP_MAX_FLOW_FRAC, 1),
    minCwFlowLs: round(CWP_REF_FLOW_LS * COND_MIN_FLOW_FRAC, 1),
    maxCwFlowLs: round(CWP_REF_FLOW_LS * COND_MAX_FLOW_FRAC, 1),
  };
}

/** The plant's as-designed constraint set — the "Reset to Design" target. */
export function designConstraints(): ConstraintConfig {
  const chws = CHILLER_CONTROL_CONSTRAINTS['ctrl-chws-sp'];
  const chwr = CHILLER_CONTROL_CONSTRAINTS['ctrl-chwr-sp'];
  const dp = CHILLER_CONTROL_CONSTRAINTS['ctrl-dp-sp'];

  return {
    chiller: {
      units: Array.from({ length: CHILLER_COUNT }, (_, i) => designChillerUnit(i)),
      minChwstC: chws.min,
      maxChwstC: chws.max,
    },
    chwp: {
      minSpeedPct: 40,
      maxSpeedPct: 100,
      minFlowLs: round(CHWP_REF_FLOW_LS * 0.4, 1),
      maxFlowLs: round((CHWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100, 1),
      ratedPowerKw: round((REF_CHWP_KW_MONTH / PUMP_REF_SPEED_PCT ** 3) * 100 ** 3, 1),
      ratedFlowLs: round((CHWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100, 1),
      ratedHeadM: 32,
      minDpPsi: dp.min,
      maxDpPsi: dp.max,
    },
    cwp: {
      minSpeedPct: 40,
      maxSpeedPct: 100,
      minFlowLs: round(CWP_REF_FLOW_LS * 0.4, 1),
      maxFlowLs: round((CWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100, 1),
      ratedPowerKw: round((REF_CWP_KW_MONTH / PUMP_REF_SPEED_PCT ** 3) * 100 ** 3, 1),
      ratedFlowLs: round((CWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100, 1),
      ratedHeadM: 24,
    },
    tower: {
      minFanSpeedPct: 30,
      maxFanSpeedPct: 100,
      minApproachC: MIN_CONDENSER_APPROACH_C,
      maxCwstC: CHILLER_CONTROL_CONSTRAINTS['ctrl-cws-sp'].max,
      // Heat rejection = plant cooling + compressor work at full staging.
      ratedHeatRejectionRt: round(CHILLER_CAPACITY_RT * CHILLER_COUNT * 1.25, 0),
      ratedWaterFlowLs: round(CWP_REF_FLOW_LS * CWP_COUNT, 0),
    },
    system: {
      minChwDpPsi: dp.min,
      maxChwDpPsi: dp.max,
      maxChwHeaderFlowLs: round((CHWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100 * CHWP_COUNT, 0),
      maxCwHeaderFlowLs: round((CWP_REF_FLOW_LS / PUMP_REF_SPEED_PCT) * 100 * CWP_COUNT, 0),
      minRunningChillers: 1,
      maxRunningChillers: CHILLER_COUNT,
      requiredStandbyChillers: 0,
      // The engine's own CHWR operating bound. This is the limit that prices
      // CHWST reset and DP reset — see the field's comment in shared/types.
      maxChwrC: chwr.max,
      // No demand cap by default: T1 has no measured tariff or demand limit, so
      // inventing one would be a constraint the site never asked for.
      maxPlantKw: 0,
      maxChillerStartsPerRun: 0,
      // T1 ran 24/7 for every minute of December; an equal pair means no schedule.
      operatingHours: { startHour: 0, endHour: 0 },
      maxChwstChangePerCycleC: 2,
      maxDpChangePerCyclePsi: 5,
      maxCwpSpeedChangePerCyclePct: 15,
      maxCtFanSpeedChangePerCyclePct: 20,
      minChillerRuntimeMin: 30,
      minChillerOffTimeMin: 20,
    },
  };
}

/* ------------------------------------------------------------- validation */

function num(
  errors: ConstraintConfigError[],
  section: keyof ConstraintConfig,
  field: string,
  v: number
): boolean {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push({ section, field, message: 'must be a number' });
    return false;
  }
  return true;
}

function ordered(
  errors: ConstraintConfigError[],
  section: keyof ConstraintConfig,
  minField: string,
  maxField: string,
  min: number,
  max: number,
  label: string
): void {
  if (!num(errors, section, minField, min) || !num(errors, section, maxField, max)) return;
  if (min > max) {
    errors.push({ section, field: minField, message: `${label} min must be ≤ max` });
  }
}

/**
 * Form-level validation of the constraint configuration. This checks the
 * CONFIG is coherent (min ≤ max, positives positive, staging counts consistent)
 * — it says nothing about whether any candidate satisfies it. The MPC refuses
 * to run while this returns anything.
 */
export function validateConstraintConfig(cfg: ConstraintConfig): ConstraintConfigError[] {
  const errors: ConstraintConfigError[] = [];

  ordered(errors, 'chiller', 'minChwstC', 'maxChwstC', cfg.chiller.minChwstC, cfg.chiller.maxChwstC, 'CHWST');
  cfg.chiller.units.forEach((u, i) => {
    ordered(errors, 'chiller', `units.${i}.minLoadPct`, `units.${i}.maxLoadPct`, u.minLoadPct, u.maxLoadPct, `${u.name} load`);
    ordered(errors, 'chiller', `units.${i}.minChwFlowLs`, `units.${i}.maxChwFlowLs`, u.minChwFlowLs, u.maxChwFlowLs, `${u.name} CHW flow`);
    ordered(errors, 'chiller', `units.${i}.minCwFlowLs`, `units.${i}.maxCwFlowLs`, u.minCwFlowLs, u.maxCwFlowLs, `${u.name} CW flow`);
    if (num(errors, 'chiller', `units.${i}.ratedCapacityRt`, u.ratedCapacityRt) && u.ratedCapacityRt <= 0) {
      errors.push({ section: 'chiller', field: `units.${i}.ratedCapacityRt`, message: `${u.name} rated capacity must be > 0` });
    }
  });

  ordered(errors, 'chwp', 'minSpeedPct', 'maxSpeedPct', cfg.chwp.minSpeedPct, cfg.chwp.maxSpeedPct, 'CHWP speed');
  ordered(errors, 'chwp', 'minFlowLs', 'maxFlowLs', cfg.chwp.minFlowLs, cfg.chwp.maxFlowLs, 'CHWP flow');
  ordered(errors, 'chwp', 'minDpPsi', 'maxDpPsi', cfg.chwp.minDpPsi, cfg.chwp.maxDpPsi, 'DP');

  ordered(errors, 'cwp', 'minSpeedPct', 'maxSpeedPct', cfg.cwp.minSpeedPct, cfg.cwp.maxSpeedPct, 'CWP speed');
  ordered(errors, 'cwp', 'minFlowLs', 'maxFlowLs', cfg.cwp.minFlowLs, cfg.cwp.maxFlowLs, 'CWP flow');

  ordered(errors, 'tower', 'minFanSpeedPct', 'maxFanSpeedPct', cfg.tower.minFanSpeedPct, cfg.tower.maxFanSpeedPct, 'CT fan speed');
  if (num(errors, 'tower', 'minApproachC', cfg.tower.minApproachC) && cfg.tower.minApproachC <= 0) {
    errors.push({ section: 'tower', field: 'minApproachC', message: 'minimum tower approach must be > 0' });
  }

  ordered(errors, 'system', 'minChwDpPsi', 'maxChwDpPsi', cfg.system.minChwDpPsi, cfg.system.maxChwDpPsi, 'System DP');
  ordered(
    errors, 'system', 'minRunningChillers', 'maxRunningChillers',
    cfg.system.minRunningChillers, cfg.system.maxRunningChillers, 'Running chillers'
  );

  const available = cfg.chiller.units.filter((u) => u.available).length;
  if (cfg.system.maxRunningChillers + cfg.system.requiredStandbyChillers > available) {
    errors.push({
      section: 'system',
      field: 'requiredStandbyChillers',
      message: `${cfg.system.maxRunningChillers} running + ${cfg.system.requiredStandbyChillers} standby exceeds ${available} available chillers`,
    });
  }
  if (cfg.system.minRunningChillers < 1) {
    errors.push({ section: 'system', field: 'minRunningChillers', message: 'at least one chiller must run' });
  }

  if (num(errors, 'system', 'maxChwrC', cfg.system.maxChwrC) && cfg.system.maxChwrC <= cfg.chiller.maxChwstC) {
    errors.push({
      section: 'system',
      field: 'maxChwrC',
      message: `CHWR limit ${cfg.system.maxChwrC}°C must exceed the highest allowed CHWST ${cfg.chiller.maxChwstC}°C`,
    });
  }
  if (num(errors, 'system', 'maxPlantKw', cfg.system.maxPlantKw) && cfg.system.maxPlantKw < 0) {
    errors.push({ section: 'system', field: 'maxPlantKw', message: 'plant demand cap cannot be negative (0 disables it)' });
  }
  if (
    num(errors, 'system', 'maxChillerStartsPerRun', cfg.system.maxChillerStartsPerRun) &&
    cfg.system.maxChillerStartsPerRun < 0
  ) {
    errors.push({ section: 'system', field: 'maxChillerStartsPerRun', message: 'start cap cannot be negative (0 disables it)' });
  }
  for (const key of ['startHour', 'endHour'] as const) {
    const v = cfg.system.operatingHours?.[key];
    if (!num(errors, 'system', `operatingHours.${key}`, v) || v < 0 || v > 24) {
      errors.push({ section: 'system', field: `operatingHours.${key}`, message: 'must be an hour between 0 and 24' });
    }
  }

  return errors;
}
