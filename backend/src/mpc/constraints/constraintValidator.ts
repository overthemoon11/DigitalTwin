/**
 * Candidate constraint validation.
 *
 * This runs INSIDE the simulation step, on the simulated outcome of a candidate
 * — never as a post-filter on the winner. A candidate that violates anything
 * here is rejected outright and can never become the optimum, however low its
 * predicted power.
 *
 * Two kinds of check live here:
 *   • command checks — is the proposed setpoint inside its allowed band?
 *   • outcome checks — given what the plant actually did, is the result legal
 *     (machine loading, evaporator/condenser flow, tower approach, header flow)?
 * The second kind is why validation cannot precede simulation.
 */
import type {
  ConstraintConfig,
  ConstraintViolation,
  ControlState,
  SimulationInput,
} from '../../../../shared/types/mpc';
import { round } from '../../digital-twin/chiller/model/plantPhysics';
import { stagedCapacityRt, stagedUnits } from '../optimizer/candidateGenerator';

/** Physical / operational quantities the checks read off a simulated candidate. */
export interface ValidationSubject {
  chwsC: number;
  /** Achieved chilled-water RETURN — the limit that prices CHWST and DP reset. */
  chwrC: number;
  cwsC: number;
  wetBulbC: number;
  chwFlowLs: number;
  cwFlowLs: number;
  chillerLoadPct: number;
  coolingRequiredRt: number;
  /** Total plant demand, for the optional demand cap. */
  totalPlantKw: number;
  staging: { chillers: number; chwp: number; cwp: number; ct: number };
}

/** Human labels for the status panel's rejection tally. */
export const VIOLATION_LABELS: Record<string, string> = {
  'chwst-range': 'CHWST setpoint',
  'dp-range': 'DP setpoint',
  'chwp-speed': 'CHWP speed',
  'cwp-speed': 'CWP speed',
  'ct-speed': 'CT fan speed',
  'staging-range': 'chiller staging',
  'staging-availability': 'chiller availability',
  'standby': 'standby reserve',
  'capacity': 'chiller capacity',
  'chiller-load-max': 'chiller max load',
  'chiller-load-min': 'chiller min load',
  'chw-flow-min': 'CHW flow',
  'chw-flow-max': 'CHW flow',
  'cw-flow-min': 'CW flow',
  'cw-flow-max': 'CW flow',
  'tower-approach': 'tower approach',
  'cwst-max': 'max CWST',
  'chw-header-flow': 'CHW header flow',
  'cw-header-flow': 'CW header flow',
  'chwst-rate-limit': 'CHWST move limit',
  'dp-rate-limit': 'DP move limit',
  'cwp-rate-limit': 'CWP speed move limit',
  'ct-rate-limit': 'CT fan move limit',
  'chwr-max': 'CHWR return limit',
  'plant-demand-cap': 'plant demand cap',
};

/**
 * How far an OUTCOME check may be relaxed to absorb rounding in the numbers it
 * compares. Only ever applied where two independently-rounded reported values
 * are differenced — never to a commanded setpoint, which is exact.
 */
const REPORTING_TOLERANCE_K = 0.15;

function v(
  code: string,
  message: string,
  extra: { equipment?: string; actual?: number; limit?: number; unit?: string } = {}
): ConstraintViolation {
  return { code, message, ...extra };
}

function inRange(
  out: ConstraintViolation[],
  code: string,
  label: string,
  value: number,
  min: number,
  max: number,
  unit: string,
  equipment?: string
): void {
  if (value < min - 1e-9) {
    out.push(v(code, `${label} ${round(value, 2)}${unit} below minimum ${min}${unit}`, { actual: value, limit: min, unit, equipment }));
  } else if (value > max + 1e-9) {
    out.push(v(code, `${label} ${round(value, 2)}${unit} above maximum ${max}${unit}`, { actual: value, limit: max, unit, equipment }));
  }
}

/**
 * Validate one simulated candidate. `baseline` enables the per-cycle move
 * limits; pass null to skip them (the baseline itself is not rate-limited
 * against anything).
 */
export function validateCandidate(
  input: SimulationInput,
  control: ControlState,
  subject: ValidationSubject,
  cfg: ConstraintConfig,
  baseline: ControlState | null
): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  const units = cfg.chiller.units;
  const available = units.filter((u) => u.available);

  /* --- commanded setpoints ------------------------------------------- */
  inRange(out, 'chwst-range', 'CHWST setpoint', control.chwstSetpointC, cfg.chiller.minChwstC, cfg.chiller.maxChwstC, '°C');
  inRange(
    out, 'dp-range', 'DP setpoint', control.dpSetpointPsi,
    Math.max(cfg.chwp.minDpPsi, cfg.system.minChwDpPsi),
    Math.min(cfg.chwp.maxDpPsi, cfg.system.maxChwDpPsi),
    ' psi'
  );
  inRange(out, 'chwp-speed', 'CHWP speed', control.chwpSpeedPct, cfg.chwp.minSpeedPct, cfg.chwp.maxSpeedPct, '%');
  inRange(out, 'cwp-speed', 'CWP speed', control.cwpSpeedPct, cfg.cwp.minSpeedPct, cfg.cwp.maxSpeedPct, '%');
  inRange(out, 'ct-speed', 'CT fan speed', control.ctFanSpeedPct, cfg.tower.minFanSpeedPct, cfg.tower.maxFanSpeedPct, '%');

  /* --- staging --------------------------------------------------------- */
  const running = control.runningChillers;
  inRange(out, 'staging-range', 'Running chillers', running, cfg.system.minRunningChillers, cfg.system.maxRunningChillers, '');
  if (running > available.length) {
    out.push(v('staging-availability', `${running} chillers staged but only ${available.length} available`, { actual: running, limit: available.length }));
  }
  if (available.length - running < cfg.system.requiredStandbyChillers) {
    out.push(
      v('standby', `${available.length - running} chillers in reserve, ${cfg.system.requiredStandbyChillers} required`, {
        actual: available.length - running,
        limit: cfg.system.requiredStandbyChillers,
      })
    );
  }

  /* --- capacity: the running set must be able to carry the load --------
   * The staged set follows the plant's duty order, not the config's list
   * order, so a mixed fleet is scored on the machines that actually start. */
  const staged = stagedUnits(cfg, running);
  const capacityRt = stagedCapacityRt(cfg, running);
  if (subject.coolingRequiredRt > capacityRt + 1e-6) {
    out.push(
      v('capacity', `Load ${round(subject.coolingRequiredRt, 0)} RT exceeds staged capacity ${round(capacityRt, 0)} RT`, {
        actual: subject.coolingRequiredRt,
        limit: round(capacityRt, 0),
        unit: ' RT',
      })
    );
  }

  /* --- per-machine loading & flows ------------------------------------- */
  if (running > 0) {
    const chwPerChiller = subject.chwFlowLs / running;
    const cwPerChiller = subject.cwFlowLs / running;

    for (const u of staged) {
      if (subject.chillerLoadPct > u.maxLoadPct + 1e-9) {
        out.push(v('chiller-load-max', `${u.name} at ${round(subject.chillerLoadPct, 1)}% exceeds max load ${u.maxLoadPct}%`, { equipment: u.name, actual: subject.chillerLoadPct, limit: u.maxLoadPct, unit: '%' }));
      }
      if (subject.chillerLoadPct < u.minLoadPct - 1e-9) {
        out.push(v('chiller-load-min', `${u.name} at ${round(subject.chillerLoadPct, 1)}% below stable minimum ${u.minLoadPct}%`, { equipment: u.name, actual: subject.chillerLoadPct, limit: u.minLoadPct, unit: '%' }));
      }
      if (chwPerChiller < u.minChwFlowLs - 1e-9) {
        out.push(v('chw-flow-min', `${u.name} evaporator flow ${round(chwPerChiller, 1)} L/s below minimum ${u.minChwFlowLs} L/s`, { equipment: u.name, actual: chwPerChiller, limit: u.minChwFlowLs, unit: ' L/s' }));
      }
      if (chwPerChiller > u.maxChwFlowLs + 1e-9) {
        out.push(v('chw-flow-max', `${u.name} evaporator flow ${round(chwPerChiller, 1)} L/s above maximum ${u.maxChwFlowLs} L/s`, { equipment: u.name, actual: chwPerChiller, limit: u.maxChwFlowLs, unit: ' L/s' }));
      }
      if (cwPerChiller < u.minCwFlowLs - 1e-9) {
        out.push(v('cw-flow-min', `${u.name} condenser flow ${round(cwPerChiller, 1)} L/s below minimum ${u.minCwFlowLs} L/s`, { equipment: u.name, actual: cwPerChiller, limit: u.minCwFlowLs, unit: ' L/s' }));
      }
      if (cwPerChiller > u.maxCwFlowLs + 1e-9) {
        out.push(v('cw-flow-max', `${u.name} condenser flow ${round(cwPerChiller, 1)} L/s above maximum ${u.maxCwFlowLs} L/s`, { equipment: u.name, actual: cwPerChiller, limit: u.maxCwFlowLs, unit: ' L/s' }));
      }
    }
  }

  /* --- tower: the hard physical floor ----------------------------------
   * A CROSS-CHECK, not the enforcement point. The engine already floors the
   * achieved condenser temperature at wet bulb + minimum approach; this catches
   * a candidate that somehow escaped it.
   *
   * Two things about the comparison. It uses the ACHIEVED wet bulb rather than
   * the requested one, because the requested value is reproduced by inverting a
   * (dry-bulb, RH) pair and the two are not bit-identical. And it allows
   * REPORTING_TOLERANCE_K, because the two quantities being compared are
   * rounded independently: the engine reports condenser temperature to two
   * decimals but re-derives the wet bulb from headers already rounded to one,
   * which can shift it by ~0.06 K. Without the tolerance every candidate
   * sitting exactly ON the floor reported itself as violating it — which is
   * what happens on a humid day, when the floor is the binding constraint. A
   * real violation is a large one; 0.15 K is reporting noise. */
  const approachFloor = subject.wetBulbC + cfg.tower.minApproachC;
  if (subject.cwsC < approachFloor - REPORTING_TOLERANCE_K) {
    out.push(
      v('tower-approach', `CWST ${round(subject.cwsC, 2)}°C below wet bulb ${round(subject.wetBulbC, 2)}°C + approach ${cfg.tower.minApproachC}°C`, {
        actual: subject.cwsC,
        limit: round(approachFloor, 2),
        unit: '°C',
      })
    );
  }
  if (subject.cwsC > cfg.tower.maxCwstC + 1e-9) {
    out.push(v('cwst-max', `CWST ${round(subject.cwsC, 2)}°C above maximum ${cfg.tower.maxCwstC}°C`, { actual: subject.cwsC, limit: cfg.tower.maxCwstC, unit: '°C' }));
  }

  /* --- chilled-water return limit --------------------------------------
   * The single most important outcome constraint for setpoint optimisation.
   * Raising CHWST or slowing the CHW pumps both save power by letting the loop
   * run warmer; this is what says how much warmer is acceptable. Without it the
   * optimiser would take both to their bounds and call the difference a saving.
   */
  if (subject.chwrC > cfg.system.maxChwrC + 1e-9) {
    out.push(
      v('chwr-max', `CHWR ${round(subject.chwrC, 2)}°C above the ${cfg.system.maxChwrC}°C return limit`, {
        actual: subject.chwrC,
        limit: cfg.system.maxChwrC,
        unit: '°C',
      })
    );
  }

  /* --- plant demand cap (0 disables) ------------------------------------ */
  if (cfg.system.maxPlantKw > 0 && subject.totalPlantKw > cfg.system.maxPlantKw + 1e-9) {
    out.push(
      v('plant-demand-cap', `Plant demand ${round(subject.totalPlantKw, 0)} kW above the ${cfg.system.maxPlantKw} kW cap`, {
        actual: subject.totalPlantKw,
        limit: cfg.system.maxPlantKw,
        unit: ' kW',
      })
    );
  }

  /* --- header hydraulics ----------------------------------------------- */
  if (subject.chwFlowLs > cfg.system.maxChwHeaderFlowLs + 1e-9) {
    out.push(v('chw-header-flow', `CHW header flow ${round(subject.chwFlowLs, 0)} L/s above design ${cfg.system.maxChwHeaderFlowLs} L/s`, { actual: subject.chwFlowLs, limit: cfg.system.maxChwHeaderFlowLs, unit: ' L/s' }));
  }
  if (subject.cwFlowLs > cfg.system.maxCwHeaderFlowLs + 1e-9) {
    out.push(v('cw-header-flow', `CW header flow ${round(subject.cwFlowLs, 0)} L/s above design ${cfg.system.maxCwHeaderFlowLs} L/s`, { actual: subject.cwFlowLs, limit: cfg.system.maxCwHeaderFlowLs, unit: ' L/s' }));
  }

  /* --- move limits vs the baseline the plant is running now ------------- */
  if (baseline) {
    const dChwst = Math.abs(control.chwstSetpointC - baseline.chwstSetpointC);
    if (dChwst > cfg.system.maxChwstChangePerCycleC + 1e-9) {
      out.push(v('chwst-rate-limit', `CHWST move ${round(dChwst, 2)}°C exceeds ${cfg.system.maxChwstChangePerCycleC}°C per cycle`, { actual: dChwst, limit: cfg.system.maxChwstChangePerCycleC, unit: '°C' }));
    }
    const dDp = Math.abs(control.dpSetpointPsi - baseline.dpSetpointPsi);
    if (dDp > cfg.system.maxDpChangePerCyclePsi + 1e-9) {
      out.push(v('dp-rate-limit', `DP move ${round(dDp, 2)} psi exceeds ${cfg.system.maxDpChangePerCyclePsi} psi per cycle`, { actual: dDp, limit: cfg.system.maxDpChangePerCyclePsi, unit: ' psi' }));
    }
    const dCwp = Math.abs(control.cwpSpeedPct - baseline.cwpSpeedPct);
    if (dCwp > cfg.system.maxCwpSpeedChangePerCyclePct + 1e-9) {
      out.push(v('cwp-rate-limit', `CWP speed move ${round(dCwp, 1)}% exceeds ${cfg.system.maxCwpSpeedChangePerCyclePct}% per cycle`, { actual: dCwp, limit: cfg.system.maxCwpSpeedChangePerCyclePct, unit: '%' }));
    }
    const dCt = Math.abs(control.ctFanSpeedPct - baseline.ctFanSpeedPct);
    if (dCt > cfg.system.maxCtFanSpeedChangePerCyclePct + 1e-9) {
      out.push(v('ct-rate-limit', `CT fan move ${round(dCt, 1)}% exceeds ${cfg.system.maxCtFanSpeedChangePerCyclePct}% per cycle`, { actual: dCt, limit: cfg.system.maxCtFanSpeedChangePerCyclePct, unit: '%' }));
    }
  }

  return out;
}
