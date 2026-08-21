/**
 * Where the MPC's view of the future comes from.
 *
 * Load and wet bulb are DISTURBANCES: the plant must serve them and the
 * controller cannot move them. What the controller can do is see them coming,
 * and that is the only reason a horizon is worth solving at all.
 *
 * Everything here sits behind the `DisturbanceForecast` interface, which the
 * controller uses through exactly one method. That is what makes the provider
 * replaceable: a weather API, a DDMS feed, an operator-drawn profile or a
 * learned model all satisfy `at(nowIndex, lead)` and nothing else in the
 * pipeline changes.
 *
 * The three shipped providers span the honest range:
 *
 *   perfect-foresight   the recorded future, exactly. An UPPER BOUND on the
 *                       achievable saving, never a deployable controller.
 *   degraded-foresight  the recorded future plus synthetic error that grows
 *                       with lead time. The realistic middle, and the default.
 *   persistence         today's value held flat. A LOWER BOUND — it is what a
 *                       controller with no forecast at all would see.
 *
 * T1 trends no forecast of any kind, so none of these is site-calibrated and
 * each says so in its `caveat`, which the run report prints verbatim.
 */
import type {
  Disturbance,
  DisturbanceForecast,
  DisturbanceProfile,
} from '../../../../shared/types/horizon';

/** The next `steps` predictions from `nowIndex`, lead 1..steps. */
export function horizonOf(
  forecast: DisturbanceForecast,
  nowIndex: number,
  steps: number
): Disturbance[] {
  const out: Disturbance[] = [];
  for (let lead = 1; lead <= steps; lead++) out.push(forecast.at(nowIndex, lead));
  return out;
}

/** Hold the present flat. The no-forecast baseline. */
export function persistenceForecast(
  current: Disturbance,
  steps: number,
  stepMinutes = 15
): DisturbanceForecast {
  return {
    name: 'persistence',
    steps,
    stepMinutes,
    meta: {
      kind: 'persistence',
      provenance: 'derived',
      caveat:
        'No forecast model: the current load and wet bulb are held flat across the horizon. Understates the value of MPC on a rising load.',
    },
    at: () => ({ ...current }),
  };
}

/** The recorded future, exactly. An upper bound, not a controller. */
export function perfectForesight(
  profile: DisturbanceProfile,
  steps: number
): DisturbanceForecast {
  return {
    name: 'perfect-foresight',
    steps,
    stepMinutes: profile.stepMinutes,
    meta: {
      kind: 'perfect-foresight',
      provenance: 'measured',
      caveat:
        'The controller is given the exact recorded future. This is an upper bound on achievable saving, not a deployable forecast.',
    },
    at: (nowIndex, lead) => sample(profile, nowIndex + lead),
  };
}

export interface DegradedForesightOptions {
  wetBulbSigma0C?: number;
  wetBulbSigmaSlopeCPerHour?: number;
  loadSigma0Frac?: number;
  loadSigmaSlopeFracPerHour?: number;
  seed?: number;
}

/**
 * The recorded future, blurred by an error that grows with lead time.
 *
 * The error is deterministic in (seed, target index), NOT random per call.
 * That matters more than it looks: the closed loop asks for the same future
 * step many times as the horizon slides over it, and a fresh random draw each
 * time would let the controller average the noise away and behave as if it had
 * perfect foresight after all.
 */
export function degradedForesight(
  profile: DisturbanceProfile,
  steps: number,
  opts: DegradedForesightOptions = {}
): DisturbanceForecast {
  const wb0 = opts.wetBulbSigma0C ?? 0.3;
  const wbSlope = opts.wetBulbSigmaSlopeCPerHour ?? 0.08;
  const ld0 = opts.loadSigma0Frac ?? 0.03;
  const ldSlope = opts.loadSigmaSlopeFracPerHour ?? 0.015;
  const seed = opts.seed ?? 42;
  const stepH = profile.stepMinutes / 60;

  return {
    name: 'degraded-foresight',
    steps,
    stepMinutes: profile.stepMinutes,
    meta: {
      kind: 'degraded-foresight',
      provenance: 'derived',
      caveat: `Recorded history with synthetic forecast error growing with lead time (wet bulb ${wb0} K + ${wbSlope} K/h, load ${(ld0 * 100).toFixed(0)}% + ${(ldSlope * 100).toFixed(1)}%/h). The error model is an assumption: this site trends no forecast to calibrate it against.`,
    },
    at: (nowIndex, lead) => {
      const target = nowIndex + lead;
      const truth = sample(profile, target);
      if (lead <= 0) return truth;
      const leadH = lead * stepH;
      const [eWb, eLd] = twoNormals(seed, target);
      const wetBulbC = truth.wetBulbC + (wb0 + wbSlope * leadH) * eWb;
      const frac = 1 + (ld0 + ldSlope * leadH) * eLd;
      return { wetBulbC, buildingLoadRt: Math.max(0, truth.buildingLoadRt * frac) };
    },
  };
}

function sample(profile: DisturbanceProfile, index: number): Disturbance {
  const n = profile.loadRt.length;
  if (n === 0) return { buildingLoadRt: 0, wetBulbC: 0 };
  const i = Math.min(Math.max(index, 0), n - 1);
  return { buildingLoadRt: profile.loadRt[i], wetBulbC: profile.wetBulbC[i] };
}

/** Box-Muller over a hash, so the pair is reproducible from (seed, index). */
function twoNormals(seed: number, index: number): [number, number] {
  const u1 = Math.max(hash(seed, index, 1), 1e-12);
  const u2 = hash(seed, index, 2);
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

function hash(seed: number, index: number, salt: number): number {
  let x = (seed * 2654435761 + index * 2246822507 + salt * 3266489909) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 569420461) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 1935289751) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return x / 4294967296;
}

/**
 * A hash of a disturbance series.
 *
 * The fairness guard compares this between the baseline arm and the MPC arm.
 * If it differs, the two controllers did not face the same weather and no
 * saving can be attributed to either of them.
 */
export function disturbanceKey(series: Disturbance[]): string {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (const d of series) {
    const a = Math.round(d.buildingLoadRt * 1e3);
    const b = Math.round(d.wetBulbC * 1e3);
    h1 = Math.imul(h1 ^ a, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ b, 2246822507) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${series.length}`;
}
