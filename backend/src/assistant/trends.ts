/**
 * Short-window trend memory for the assistant.
 *
 * "Why is CHWR high?" is not answerable from an instant — the operator means
 * "higher than it was". Nothing in the stack kept a history: the twin steps and
 * broadcasts, and every consumer renders the latest frame. This is the smallest
 * thing that fixes it — a ring buffer of scalar samples, fed by the same tick
 * that feeds the WebSocket, holding roughly the last half hour.
 *
 * It is explicitly NOT a historian. It is in-memory, it starts empty, and
 * `getTrend` reports how many samples it actually has so an answer can say "I
 * have four minutes of history" instead of implying a day of it. Real history
 * lives in the BMS artifact and is reached through `getPlantTrends(source:
 * 'bms')`.
 */
import type { PlantState } from '../../../shared/types/plant';
import { isNum, round } from './util';

/** 2 s tick x 900 = 30 minutes. Small enough to never matter for memory. */
const CAPACITY = 900;
/** Do not store two samples closer together than this. */
const MIN_SPACING_MS = 1500;

export type TrendChannel =
  | 'buildingLoadRt'
  | 'chwstC'
  | 'chwrtC'
  | 'chwDeltaT'
  | 'cwsC'
  | 'cwrC'
  | 'wetBulbC'
  | 'ambientTempC'
  | 'totalPlantKw'
  | 'chillerKw'
  | 'chwpKw'
  | 'cwpKw'
  | 'towerKw'
  | 'plantKwPerRt'
  | 'cop'
  | 'dpPsi'
  | 'ctFanPct'
  | 'runningChillers';

export interface TrendSample extends Partial<Record<TrendChannel, number>> {
  at: number;
  t: string;
}

const buffer: TrendSample[] = [];
let lastAt = 0;

function kpi(state: PlantState, id: string): number | null {
  const v = state.kpis?.find((k) => k.id === id)?.value;
  return isNum(v) ? v : null;
}

function put(sample: TrendSample, key: TrendChannel, value: number | null): void {
  if (value !== null) sample[key] = value;
}

/** Record one frame. Called from the plant channel tick and from the tools. */
export function recordPlantSample(state: PlantState | null): void {
  if (!state?.headers) return;
  const now = Date.now();
  if (now - lastAt < MIN_SPACING_MS) return;
  lastAt = now;

  const h = state.headers;
  const wb = Array.isArray(h.wetBulbSensors) && h.wetBulbSensors.length
    ? round(h.wetBulbSensors.reduce((a, b) => a + b, 0) / h.wetBulbSensors.length, 2)
    : kpi(state, 'kpi-wetbulb');

  const sample: TrendSample = { at: now, t: state.simulationTime };
  put(sample, 'buildingLoadRt', round(h.buildingLoadRt, 0));
  put(sample, 'chwstC', round(h.chws, 2));
  put(sample, 'chwrtC', round(h.chwr, 2));
  put(sample, 'chwDeltaT', round(h.chwr - h.chws, 2));
  put(sample, 'cwsC', round(h.cws, 2));
  put(sample, 'cwrC', round(h.cwr, 2));
  put(sample, 'ambientTempC', round(h.ambientTemp, 1));
  put(sample, 'wetBulbC', wb);
  put(sample, 'totalPlantKw', kpi(state, 'kpi-kw'));
  put(sample, 'chillerKw', kpi(state, 'kpi-ch-kw'));
  put(sample, 'chwpKw', kpi(state, 'kpi-chwp-kw'));
  put(sample, 'cwpKw', kpi(state, 'kpi-cwp-kw'));
  put(sample, 'towerKw', kpi(state, 'kpi-ct-kw'));
  put(sample, 'plantKwPerRt', kpi(state, 'kpi-eff'));
  put(sample, 'cop', kpi(state, 'kpi-cop'));
  put(sample, 'dpPsi', kpi(state, 'kpi-dp'));
  put(sample, 'ctFanPct', kpi(state, 'kpi-ct-fan'));
  put(sample, 'runningChillers', kpi(state, 'kpi-rch'));

  buffer.push(sample);
  if (buffer.length > CAPACITY) buffer.splice(0, buffer.length - CAPACITY);
}

export interface TrendSeries {
  channel: TrendChannel;
  samples: number;
  first: number | null;
  last: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  /** `rising` / `falling` / `steady`, decided against the channel's own spread
   *  rather than a fixed threshold, so a 0.2 K CHWS move is not "rising". */
  direction: 'rising' | 'falling' | 'steady' | 'unknown';
  changeOverWindow: number | null;
  points: Array<{ t: string; v: number }>;
}

export interface TrendWindow {
  windowMinutes: number;
  samples: number;
  from: string | null;
  to: string | null;
  series: TrendSeries[];
  /** Honest statement of how much history exists. */
  coverage: 'none' | 'thin' | 'ok';
}

/** Summarise the buffer for a set of channels over the last `minutes`. */
export function getTrend(channels: TrendChannel[], minutes = 15, maxPoints = 24): TrendWindow {
  const cutoff = Date.now() - minutes * 60_000;
  const window = buffer.filter((s) => s.at >= cutoff);
  const coverage = window.length === 0 ? 'none' : window.length < 5 ? 'thin' : 'ok';

  const series = channels.map((channel): TrendSeries => {
    const points = window
      .filter((s) => isNum(s[channel]))
      .map((s) => ({ t: s.t, v: s[channel] as number }));
    if (!points.length) {
      return {
        channel, samples: 0, first: null, last: null, min: null, max: null, mean: null,
        direction: 'unknown', changeOverWindow: null, points: [],
      };
    }
    const values = points.map((p) => p.v);
    const first = values[0];
    const last = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = max - min;
    const change = last - first;
    // A move smaller than a third of the observed spread is noise, not a trend.
    const direction =
      points.length < 3 || spread === 0 || Math.abs(change) < spread / 3
        ? 'steady'
        : change > 0
          ? 'rising'
          : 'falling';

    // Thin the series for the prompt: 24 points describe a shape, 900 do not.
    const step = Math.max(1, Math.ceil(points.length / maxPoints));
    const thinned = points.filter((_, i) => i % step === 0 || i === points.length - 1);

    return {
      channel,
      samples: points.length,
      first: round(first, 2),
      last: round(last, 2),
      min: round(min, 2),
      max: round(max, 2),
      mean: round(mean, 2),
      direction,
      changeOverWindow: round(change, 2),
      points: thinned.map((p) => ({ t: p.t, v: round(p.v, 2) as number })),
    };
  });

  return {
    windowMinutes: minutes,
    samples: window.length,
    from: window[0]?.t ?? null,
    to: window[window.length - 1]?.t ?? null,
    series,
    coverage,
  };
}

export function trendBufferSize(): number {
  return buffer.length;
}

/** Test hook. */
export function clearTrends(): void {
  buffer.length = 0;
  lastAt = 0;
}
