/**
 * ChillerPlantSimulator — the MPC's plant model.
 *
 * This is a thin, well-typed adapter over the CALIBRATED T1 engine
 * (`controlEngine.evaluatePlant`), not a second physics implementation. Every
 * kW it reports comes from the same grey-box model that scores 0.83% blocked-CV
 * MAE against 43,026 minutes of real BMS trend, so an MPC result here is
 * comparable with the twin the rest of the app shows.
 *
 * Four mappings are non-obvious and are the whole reason this file exists.
 *
 * 1. WET BULB. The engine parameterises weather as dry-bulb + RH and derives
 *    wet bulb via Stull. The MPC's disturbance input is wet bulb directly, so
 *    we invert: hold dry-bulb, bisect RH to hit the requested wet bulb, and
 *    fall back to moving dry-bulb if RH alone cannot reach it. Because RH also
 *    scales latent load, the base load control is then back-solved so the
 *    DELIVERED demand equals the requested RT exactly.
 *
 * 2. CONDENSER TEMPERATURE. In the engine's static mode the achieved CWS is
 *    `max(CWS setpoint, wet bulb + min approach)`, so this file has to supply
 *    the approach. The LEVEL comes from the SITE FIT — approach against wet
 *    bulb and load, `towerApproachFit.ts`, MAE 0.103 K on held-out days — and
 *    the fan-speed SHAPE from the tower power law in `towerFanLaw.ts`. The
 *    multiplier is exactly 1.0 at the reference fan speed, so a run that does
 *    not command the fans reproduces the calibrated approach unchanged.
 *
 * 3. CONDENSER PUMP SPEED. The engine prices compressor lift off the SUPPLY
 *    temperature, which in static mode does not move with condenser flow — so
 *    without a correction, slowing the CW pumps would be free money. The
 *    equivalent lift shift from `condenserHydraulics.ts` is applied to chiller
 *    power here, outside the engine, and reported on the result so the
 *    trade-off is auditable. It is exactly zero at the reference speed.
 *
 * 4. PUMP AND TOWER STAGING. The MPC pins CHWP and CWP counts to the chiller
 *    count and towers to chillers+1, rather than letting the engine re-derive
 *    them from load. That is what T1 actually did (the same three pumps ran
 *    with the same three chillers for 99.6% of December), and it makes CHW flow
 *    an exact closed-form function of staging and pump speed — which the
 *    horizon loop model needs, because otherwise the loop and the plant
 *    disagree about how much water is moving and the pump-speed decision
 *    becomes unaccountable.
 */
import type {
  ConstraintConfig,
  ControlState,
  SimulationInput,
  SimulationResult,
} from '../../../../shared/types/mpc';
import type { PlantState } from '../../../../shared/types/plant';
import { evaluatePlant } from '../../digital-twin/chiller/model/controlEngine';
import { validateCandidate } from '../constraints/constraintValidator';
import {
  CHWP_COUNT,
  CT_COUNT,
  CWP_COUNT,
  MIN_CONDENSER_APPROACH_C,
  REF_CHWP_FLOW,
  REF_CHWP_SPEED,
  REF_CT_FAN,
  clamp,
  estimateWetBulbC,
  humidityLoadFactor,
  pumpFlowFromSpeed,
  round,
  weatherLoadFactor,
} from '../../digital-twin/chiller/model/plantPhysics';
import {
  condenserLiftMultiplier,
  condenserLiftShift,
} from '../../digital-twin/chiller/model/condenserHydraulics';
import { partLoadShapeFactor } from '../../digital-twin/chiller/model/chillerPartLoad';
import { towerApproachFanMultiplier } from '../../digital-twin/chiller/model/towerFanLaw';
import { fittedApproachC } from '../../digital-twin/chiller/calibration/towerApproachFit';
import { CHILLER_CONTROL_CONSTRAINTS } from '../../digital-twin/chiller/constraints/chillerConstraints';
import { chwpSpeedForDp, dpSetpointFromChwpSpeed } from '../../digital-twin/chiller/model/dpHydraulics';
import { dutyOrderFor, stagedCapacityRt } from '../optimizer/candidateGenerator';

const AMBIENT = CHILLER_CONTROL_CONSTRAINTS['ctrl-ambient-temp'];
const HUMIDITY = CHILLER_CONTROL_CONSTRAINTS['ctrl-humidity'];
const LOAD = CHILLER_CONTROL_CONSTRAINTS['ctrl-building-load'];
const CWS = CHILLER_CONTROL_CONSTRAINTS['ctrl-cws-sp'];

const M3H_TO_LS = 1 / 3.6;

/**
 * Widest approach the model will report. The site fit is clamped to the
 * OBSERVED band, but the fan term can legitimately leave it — December never
 * showed a fan speed at all, so a slow fan producing a 7 K approach is an
 * extrapolation, not an impossibility. 12 K is past any real tower.
 */
const MAX_MODELLED_APPROACH_C = 12;

/* ------------------------------------------------------- weather inversion */

/** Bisect a monotone increasing scalar function for `target`. */
function bisect(f: (x: number) => number, lo: number, hi: number, target: number, iters = 40): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    if (f(m) < target) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

export interface WeatherSolution {
  ambientTempC: number;
  humidityRh: number;
  /** Wet bulb the engine will actually compute from the pair above. */
  achievedWetBulbC: number;
  /** Base-load control value that yields the requested delivered RT. */
  baseLoadRt: number;
}

/**
 * Find the (dry-bulb, RH) pair that reproduces a requested wet bulb, and the
 * base-load control value that yields the requested delivered cooling load.
 * Wet bulb rises monotonically with both inputs, so RH is bisected first (it is
 * the weaker lever on sensible load) and dry-bulb only moves if RH saturates.
 */
export function solveWeather(input: SimulationInput, dryBulbHintC: number): WeatherSolution {
  const target = input.wetBulbC;
  let ambient = clamp(dryBulbHintC, AMBIENT.min, AMBIENT.max);

  const wbAt = (amb: number, rh: number) => estimateWetBulbC(amb, rh);
  let rh: number;

  if (target <= wbAt(ambient, HUMIDITY.min)) {
    // Too dry to reach even at the RH floor — cool the dry bulb instead.
    rh = HUMIDITY.min;
    ambient = bisect((a) => wbAt(a, rh), AMBIENT.min, ambient, target);
  } else if (target >= wbAt(ambient, HUMIDITY.max)) {
    // Saturating RH is not enough — warm the dry bulb.
    rh = HUMIDITY.max;
    ambient = bisect((a) => wbAt(a, rh), ambient, AMBIENT.max, target);
  } else {
    rh = bisect((h) => wbAt(ambient, h), HUMIDITY.min, HUMIDITY.max, target);
  }

  ambient = round(clamp(ambient, AMBIENT.min, AMBIENT.max), 2);
  rh = round(clamp(rh, HUMIDITY.min, HUMIDITY.max), 2);

  // The engine multiplies the base load by the weather factors, so invert them
  // to make the DELIVERED demand equal the RT the operator asked for.
  const factor = weatherLoadFactor(ambient) * humidityLoadFactor(rh);
  const baseLoadRt = round(clamp(input.buildingLoadRt / (factor || 1), LOAD.min, LOAD.max), 2);

  return { ambientTempC: ambient, humidityRh: rh, achievedWetBulbC: estimateWetBulbC(ambient, rh), baseLoadRt };
}

/* ------------------------------------------------- tower fan <-> CWS coupling */

/**
 * Approach the towers hold at these conditions, in K.
 *
 * LEVEL from the site fit (wet bulb + load), SHAPE from the tower power law.
 * The fan multiplier is 1.0 at `REF_CT_FAN`, so this reduces to the calibrated
 * fit whenever nothing commands the fans.
 */
export function approachFromConditions(
  wetBulbC: number,
  loadRt: number,
  fanSpeedPct: number
): number {
  const level = fittedApproachC(wetBulbC, loadRt);
  const shaped = level * towerApproachFanMultiplier(fanSpeedPct);
  return clamp(shaped, MIN_CONDENSER_APPROACH_C, MAX_MODELLED_APPROACH_C);
}

/* ------------------------------------------------------------ CHW hydraulics */

/**
 * Chilled-water flow, L/s, for a staging count and a commanded pump speed.
 *
 * Closed form on purpose: this is the SAME number the engine computes for the
 * same inputs (pumps are pinned to the chiller count in `stagingFor`, and the
 * engine's per-pump flow is the affinity law about the measured month median),
 * so the horizon loop model can size delivered cooling without first running a
 * plant evaluation it does not have yet.
 */
export function chwFlowLsFor(runningChillers: number, chwpSpeedPct: number): number {
  const pumps = clamp(Math.round(runningChillers), 0, CHWP_COUNT);
  if (pumps <= 0) return 0;
  return round(pumpFlowFromSpeed(REF_CHWP_FLOW, REF_CHWP_SPEED, chwpSpeedPct) * pumps * M3H_TO_LS, 2);
}

/**
 * Auxiliary staging that follows the chillers.
 *
 * MEASURED: T1 ran chiller / CHWP / CWP counts identical for 99.6% of December
 * (see `runningUnits` in the dataset summary), and floated 3-5 towers, which is
 * the engine's own chillers+1 rule inside its 5-cell limit.
 */
export function stagingFor(runningChillers: number): {
  chiller: number;
  chwp: number;
  cwp: number;
  ct: number;
} {
  const n = Math.max(0, Math.round(runningChillers));
  return {
    chiller: n,
    chwp: clamp(n, 0, CHWP_COUNT),
    cwp: clamp(n, 0, CWP_COUNT),
    ct: n > 0 ? clamp(n + 1, 1, CT_COUNT) : 0,
  };
}

/* ------------------------------------------------------------- simulation */

/** Engine control overrides for one candidate — exposed for debugging/tests. */
export function controlOverrides(
  input: SimulationInput,
  control: ControlState,
  weather: WeatherSolution
): Record<string, number> {
  const approach = approachFromConditions(
    weather.achievedWetBulbC,
    input.buildingLoadRt,
    control.ctFanSpeedPct
  );
  const cwsSp = clamp(weather.achievedWetBulbC + approach, CWS.min, CWS.max);

  return {
    'ctrl-building-load': weather.baseLoadRt,
    'ctrl-ambient-temp': weather.ambientTempC,
    'ctrl-humidity': weather.humidityRh,
    'ctrl-chws-sp': control.chwstSetpointC,
    'ctrl-dp-sp': control.dpSetpointPsi,
    'ctrl-cws-sp': cwsSp,
    // The pump speed is passed explicitly rather than left to the engine's own
    // DP loop. The two agree by construction — `chwpSpeedPct` is derived from
    // `dpSetpointPsi` through the same map the engine uses (dpHydraulics.ts) —
    // but passing it makes the commanded operating point unambiguous and lets
    // the flow the loop model assumes equal the flow the plant model uses.
    'ctrl-pump-spd': control.chwpSpeedPct,
    'ctrl-cwp-spd': control.cwpSpeedPct,
    'ctrl-ct-fan': control.ctFanSpeedPct,
    'ctrl-ch-enable': 1,
  };
}

/**
 * Force a control state to be internally consistent before it is simulated.
 *
 * DP setpoint and CHWP speed are one physical decision (see `dpHydraulics.ts`),
 * so a candidate that names both independently is not executable. The setpoint
 * wins — it is the number an operator enters — and the speed is recomputed from
 * it inside the configured pump band.
 */
export function reconcileControl(control: ControlState, cfg: ConstraintConfig): ControlState {
  return {
    ...control,
    chwpSpeedPct: chwpSpeedForDp(control.dpSetpointPsi, cfg.chwp.minSpeedPct, cfg.chwp.maxSpeedPct),
  };
}

/**
 * Simulate one candidate and validate it in the same pass. `baseline` supplies
 * the per-cycle move limits; pass null when simulating the baseline itself.
 */
export function simulateCandidate(
  input: SimulationInput,
  control: ControlState,
  cfg: ConstraintConfig,
  opts: { baseline?: ControlState | null; dryBulbHintC?: number } = {}
): SimulationResult {
  const weather = solveWeather(input, opts.dryBulbHintC ?? 31);
  const overrides = controlOverrides(input, control, weather);

  const ev = evaluatePlant(overrides, {
    staging: stagingFor(control.runningChillers),
    // Availability is expressed as a duty ORDER, not just a count — see
    // dutyOrderFor. Passing it here is what makes the machines named in the
    // sidebar the same ones lit on the schematic.
    duty: { chiller: dutyOrderFor(cfg) },
  });

  const chwFlowLs = ev.hydraulic.chwFlowM3h * M3H_TO_LS;
  const cwFlowLs = ev.hydraulic.cwFlowM3h * M3H_TO_LS;
  const cwDeltaT = ev.thermal.cwr - ev.thermal.cws;

  // Two corrections, both applied outside the engine, both exactly 1.0 at the
  // calibrated operating point so no site-validated number moves:
  //
  //   1. CONDENSER FLOW. The engine prices lift off the supply temperature,
  //      which does not move with CW flow in static mode, so slow CW pumps
  //      would otherwise be free. See condenserHydraulics.ts.
  //   2. PART-LOAD SHAPE. The engine's affine curve has a negative intercept
  //      and therefore says staging up is always cheaper. The Gordon-Ng shape
  //      fitted to the same trend says otherwise, and is the better fit.
  //      See chillerPartLoad.ts.
  const shift = condenserLiftShift(control.cwpSpeedPct, cwDeltaT);
  const liftMult = condenserLiftMultiplier(ev.thermal.cws, shift.liftShiftK);
  const shapeMult = partLoadShapeFactor(ev.hydraulic.chillerLoadPct);
  const chillerKwUncorrected = ev.power.chillerKw;
  const chillerKw = chillerKwUncorrected * liftMult * shapeMult;
  const totalPlantKw = chillerKw + ev.power.chwpKw + ev.power.cwpKw + ev.power.ctKw;

  // The engine's steady state always delivers the demand — it does not model a
  // capacity shortfall. Delivered cooling is therefore capped here at what the
  // staged machines can physically produce, and the capacity CONSTRAINT (not
  // the physics) is what rejects an under-staged candidate.
  const coolingDeliveredRt = Math.min(
    ev.thermal.buildingLoadRt,
    stagedCapacityRt(cfg, control.runningChillers)
  );

  // Validation runs AFTER the power corrections, because two of the checks —
  // the demand cap and the return limit — are on the corrected outcome, not on
  // the raw engine numbers.
  const violations = validateCandidate(
    input,
    control,
    {
      chwsC: ev.thermal.chws,
      chwrC: ev.thermal.chwr,
      cwsC: ev.thermal.cws,
      wetBulbC: ev.thermal.wetBulb,
      chwFlowLs,
      cwFlowLs,
      chillerLoadPct: ev.hydraulic.chillerLoadPct,
      coolingRequiredRt: ev.thermal.buildingLoadRt,
      totalPlantKw,
      staging: ev.staging,
    },
    cfg,
    opts.baseline ?? null
  );

  const pumpKw = ev.power.chwpKw + ev.power.cwpKw;
  const deliveredKw = coolingDeliveredRt * 3.517;

  return {
    chillerKw: round(chillerKw, 1),
    chillerKwUncorrected: round(chillerKwUncorrected, 1),
    condenserLiftShiftK: round(shift.liftShiftK, 3),
    partLoadShapeFactor: round(shapeMult, 4),
    chwpKw: round(ev.power.chwpKw, 1),
    cwpKw: round(ev.power.cwpKw, 1),
    pumpKw: round(pumpKw, 1),
    towerKw: round(ev.power.ctKw, 1),
    totalPlantKw: round(totalPlantKw, 1),
    // Recomputed rather than read off the engine, because the condenser-flow
    // correction moved the numerator and a stale efficiency would understate
    // the cost of slow condenser pumps — the exact failure this guards.
    plantKwPerRt: round(totalPlantKw / Math.max(ev.thermal.buildingLoadRt, 1e-9), 3),
    cop: round(deliveredKw / Math.max(totalPlantKw, 1e-9), 2),

    coolingRequiredRt: round(ev.thermal.buildingLoadRt, 0),
    coolingDeliveredRt: round(coolingDeliveredRt, 0),

    chwFlowLs: round(chwFlowLs, 1),
    cwFlowLs: round(cwFlowLs, 1),
    chwDeltaT: round(ev.thermal.deltaT, 2),
    cwDeltaT: round(cwDeltaT, 2),

    chwsC: ev.thermal.chws,
    chwrC: ev.thermal.chwr,
    cwsC: ev.thermal.cws,
    cwrC: ev.thermal.cwr,

    chillerLoadPct: ev.hydraulic.chillerLoadPct,
    towerApproachC: ev.thermal.towerApproach,
    wetBulbC: ev.thermal.wetBulb,
    measuredDpPsi: ev.hydraulic.measuredDpPsi,

    staging: ev.staging,

    feasible: violations.length === 0,
    violations,
    calibration: ev.calibration,
  };
}

/* -------------------------------------------- reading the live plant state */

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** BMS / current twin state → the MPC's disturbance input. */
export function readSimulationInput(plantState: PlantState | null): SimulationInput {
  const kpi = (id: string) => plantState?.kpis?.find((k) => k.id === id)?.value;
  return {
    buildingLoadRt: round(num(plantState?.headers?.buildingLoadRt, 3100), 0),
    wetBulbC: round(num(kpi('kpi-wetbulb'), 24.8), 1),
  };
}

/**
 * BMS / current twin state → the BEFORE control state.
 *
 * Reads the ACHIEVED speeds off the equipment cards rather than the override
 * controls, which sit at 0 whenever the plant is running on its own loops. The
 * DP setpoint is then back-solved from the achieved pump speed so the pair is
 * consistent — taking the `ctrl-dp-sp` slider instead would hand the optimiser
 * a baseline whose DP and pump speed contradict each other.
 */
export function readBaselineControl(plantState: PlantState | null): ControlState {
  const equipment = plantState?.equipment ?? {};
  const runningOf = (category: string) =>
    Object.values(equipment).filter((e) => e.category === category && e.status === 'running');
  const meanSpeed = (category: string, fallback: number) => {
    const on = runningOf(category).filter(
      (e) => typeof (e as { speedPercent?: number }).speedPercent === 'number'
    );
    if (!on.length) return fallback;
    return round(on.reduce((s, e) => s + ((e as { speedPercent?: number }).speedPercent ?? 0), 0) / on.length, 1);
  };
  const controls = plantState?.controls ?? [];
  const cval = (id: string, fallback: number) => {
    const c = controls.find((x) => x.id === id);
    return typeof c?.value === 'number' ? c.value : fallback;
  };

  const chillers = runningOf('chiller');
  const tower = runningOf('cooling_tower')[0] as { fanSpeedPercent?: number } | undefined;
  const chwpSpeedPct = meanSpeed('chwp', REF_CHWP_SPEED);

  return {
    chwstSetpointC: round(cval('ctrl-chws-sp', 7.5), 2),
    dpSetpointPsi: dpSetpointFromChwpSpeed(chwpSpeedPct),
    runningChillers: chillers.length,
    chillerIds: chillers.map((c) => c.name),
    chwpSpeedPct,
    cwpSpeedPct: meanSpeed('cwp', 70),
    ctFanSpeedPct: round(num(tower?.fanSpeedPercent, REF_CT_FAN), 1),
  };
}
