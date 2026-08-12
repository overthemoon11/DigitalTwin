/**
 * ChillerPlantSimulator — the MPC's plant model.
 *
 * This is a thin, well-typed adapter over the CALIBRATED T1 engine
 * (`controlEngine.evaluatePlant`), not a second physics implementation. Every
 * kW it reports comes from the same grey-box model that scores 0.97% MAE
 * against 43,026 minutes of real BMS trend, so an MPC result here is
 * comparable with the twin the rest of the app shows.
 *
 * Two mappings are non-obvious and are the whole reason this file exists.
 *
 * 1. WET BULB. The engine parameterises weather as dry-bulb + RH and derives
 *    wet bulb via Stull. The MPC's disturbance input is wet bulb directly, so
 *    we invert: hold dry-bulb, bisect RH to hit the requested wet bulb, and
 *    fall back to moving dry-bulb if RH alone cannot reach it. Because RH also
 *    scales latent load, the base load control is then back-solved so the
 *    DELIVERED demand equals the requested RT exactly.
 *
 * 2. TOWER FAN ↔ CONDENSER TEMPERATURE. In the engine's static mode the
 *    achieved CWS is `max(CWS setpoint, wet bulb + min approach)` — commanding
 *    a fan speed alone would change tower kW while leaving condenser
 *    temperature untouched, so an optimiser would drive the fan to its floor
 *    for free. That is not physics. We close the loop by INVERTING the engine's
 *    own fitted fan law (CT_FAN_SPEED_COEFF) to get the approach a commanded
 *    fan speed can actually hold, and feeding the resulting CWS back in. Slower
 *    fan ⇒ wider approach ⇒ warmer condenser water ⇒ more compressor lift. The
 *    tower/chiller trade-off the MPC exists to resolve is then real.
 */
import type {
  ConstraintConfig,
  ControlState,
  SimulationInput,
  SimulationResult,
} from '../../../types/mpc';
import type { PlantState } from '../../../types/plant';
import { evaluatePlant } from '../controlEngine';
import { validateCandidate } from './constraintValidator';
import {
  MIN_CONDENSER_APPROACH_C,
  REF_CT_FAN,
  clamp,
  estimateWetBulbC,
  humidityLoadFactor,
  round,
  weatherCondenserOffset,
  weatherLoadFactor,
} from '../plantPhysics';
import { CT_FAN_SPEED_COEFF } from '../t1MonthCalibration';
import { CHILLER_CONTROL_CONSTRAINTS } from '../chillerConstraints';
import { dutyOrderFor, stagedCapacityRt } from './candidateGenerator';

const AMBIENT = CHILLER_CONTROL_CONSTRAINTS['ctrl-ambient-temp'];
const HUMIDITY = CHILLER_CONTROL_CONSTRAINTS['ctrl-humidity'];
const LOAD = CHILLER_CONTROL_CONSTRAINTS['ctrl-building-load'];
const CWS = CHILLER_CONTROL_CONSTRAINTS['ctrl-cws-sp'];

const M3H_TO_LS = 1 / 3.6;

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
export function solveWeather(
  input: SimulationInput,
  dryBulbHintC: number
): WeatherSolution {
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

/* ------------------------------------------------- tower fan ↔ CWS coupling */

/**
 * Invert the engine's fitted tower law: what approach (CWS − wet bulb) can a
 * commanded fan speed hold? Floored at the physical minimum approach, so a
 * high fan speed cannot conjure water colder than the tower can make.
 */
export function approachFromFanSpeed(fanSpeedPct: number, condenserOffsetC: number): number {
  const [c0, c1] = CT_FAN_SPEED_COEFF;
  const shaped = (fanSpeedPct - condenserOffsetC / 0.04) / REF_CT_FAN;
  const approach = (shaped - c0) / c1;
  if (!Number.isFinite(approach)) return MIN_CONDENSER_APPROACH_C;
  return Math.max(approach, MIN_CONDENSER_APPROACH_C);
}

/* ------------------------------------------------------------- simulation */

/** Engine control overrides for one candidate — exposed for debugging/tests. */
export function controlOverrides(
  input: SimulationInput,
  control: ControlState,
  weather: WeatherSolution
): Record<string, number> {
  const condenserOffset = weatherCondenserOffset(weather.ambientTempC, weather.humidityRh);
  const approach = approachFromFanSpeed(control.ctFanSpeedPct, condenserOffset);
  const cwsSp = clamp(weather.achievedWetBulbC + approach, CWS.min, CWS.max);

  return {
    'ctrl-building-load': weather.baseLoadRt,
    'ctrl-ambient-temp': weather.ambientTempC,
    'ctrl-humidity': weather.humidityRh,
    'ctrl-chws-sp': control.chwstSetpointC,
    'ctrl-dp-sp': control.dpSetpointPsi,
    'ctrl-cws-sp': cwsSp,
    'ctrl-pump-spd': control.chwpSpeedPct,
    'ctrl-cwp-spd': control.cwpSpeedPct,
    'ctrl-ct-fan': control.ctFanSpeedPct,
    'ctrl-ch-enable': 1,
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
    staging: { chiller: Math.round(control.runningChillers) },
    // Availability is expressed as a duty ORDER, not just a count — see
    // dutyOrderFor. Passing it here is what makes the machines named in the
    // sidebar the same ones lit on the schematic.
    duty: { chiller: dutyOrderFor(cfg) },
  });

  const chwFlowLs = ev.hydraulic.chwFlowM3h * M3H_TO_LS;
  const cwFlowLs = ev.hydraulic.cwFlowM3h * M3H_TO_LS;

  // The engine's steady state always delivers the demand — it does not model a
  // capacity shortfall. Delivered cooling is therefore capped here at what the
  // staged machines can physically produce, and the capacity CONSTRAINT (not
  // the physics) is what rejects an under-staged candidate.
  const coolingDeliveredRt = Math.min(ev.thermal.buildingLoadRt, stagedCapacityRt(cfg, control.runningChillers));

  const violations = validateCandidate(
    input,
    control,
    {
      chwsC: ev.thermal.chws,
      cwsC: ev.thermal.cws,
      wetBulbC: ev.thermal.wetBulb,
      chwFlowLs,
      cwFlowLs,
      chillerLoadPct: ev.hydraulic.chillerLoadPct,
      coolingRequiredRt: ev.thermal.buildingLoadRt,
      staging: ev.staging,
    },
    cfg,
    opts.baseline ?? null
  );

  const pumpKw = ev.power.chwpKw + ev.power.cwpKw;

  return {
    chillerKw: round(ev.power.chillerKw, 1),
    chwpKw: round(ev.power.chwpKw, 1),
    cwpKw: round(ev.power.cwpKw, 1),
    pumpKw: round(pumpKw, 1),
    towerKw: round(ev.power.ctKw, 1),
    totalPlantKw: round(ev.power.totalKw, 1),
    plantKwPerRt: ev.efficiency.kwPerRt,
    cop: ev.efficiency.cop,

    coolingRequiredRt: round(ev.thermal.buildingLoadRt, 0),
    coolingDeliveredRt: round(coolingDeliveredRt, 0),

    chwFlowLs: round(chwFlowLs, 1),
    cwFlowLs: round(cwFlowLs, 1),
    chwDeltaT: round(ev.thermal.deltaT, 2),
    cwDeltaT: round(ev.thermal.cwr - ev.thermal.cws, 2),

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

/** BMS / current twin state → the BEFORE control state. Reads the ACHIEVED
 *  speeds off the equipment cards rather than the override controls, which sit
 *  at 0 whenever the plant is running on its own loops. */
export function readBaselineControl(plantState: PlantState | null): ControlState {
  const controls = plantState?.controls ?? [];
  const equipment = plantState?.equipment ?? {};
  const cval = (id: string, fallback: number) => {
    const c = controls.find((x) => x.id === id);
    return typeof c?.value === 'number' ? c.value : fallback;
  };
  const runningOf = (category: string) =>
    Object.values(equipment).filter((e) => e.category === category && e.status === 'running');
  const meanSpeed = (category: string, fallback: number) => {
    const on = runningOf(category).filter(
      (e) => typeof (e as { speedPercent?: number }).speedPercent === 'number'
    );
    if (!on.length) return fallback;
    return round(on.reduce((s, e) => s + ((e as { speedPercent?: number }).speedPercent ?? 0), 0) / on.length, 1);
  };

  const chillers = runningOf('chiller');
  const tower = runningOf('cooling_tower')[0] as { fanSpeedPercent?: number } | undefined;

  return {
    chwstSetpointC: round(cval('ctrl-chws-sp', 7.5), 2),
    dpSetpointPsi: round(cval('ctrl-dp-sp', 15), 2),
    runningChillers: chillers.length,
    chillerIds: chillers.map((c) => c.name),
    chwpSpeedPct: meanSpeed('chwp', 70),
    cwpSpeedPct: meanSpeed('cwp', 70),
    ctFanSpeedPct: round(num(tower?.fanSpeedPercent, REF_CT_FAN), 1),
  };
}
