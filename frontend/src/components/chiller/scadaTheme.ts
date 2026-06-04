/** Honeywell-style SCADA palette for the chiller plant P&ID */
export const SCADA = {
  bg: '#060a10',
  grid: '#0f172a',
  panel: '#0c1220',
  panelBorder: '#1e3a5f',
  faceplate: '#111827',
  faceplateBorder: '#334155',
  text: '#e2e8f0',
  textMuted: '#64748b',
  tag: '#38bdf8',
  pv: '#f8fafc',
  sp: '#fbbf24',
  alarm: '#ef4444',
  running: '#22c55e',
  stopped: '#475569',
  manual: '#eab308',
  selected: '#38bdf8',
  font: '"Segoe UI", system-ui, sans-serif',
  mono: '"Consolas", "Cascadia Mono", monospace',
} as const;

export const LOOP = {
  makeup: { stroke: '#0ea5e9', fill: 'rgba(14,165,233,0.08)', label: 'MAKE-UP' },
  cws: { stroke: '#22c55e', fill: 'rgba(34,197,94,0.06)', label: 'CWS' },
  cwr: { stroke: '#14532d', strokeBright: '#166534', fill: 'rgba(20,83,45,0.08)', label: 'CWR' },
  chws: { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.06)', label: 'CHWS' },
  chwr: { stroke: '#1d4ed8', fill: 'rgba(29,78,216,0.08)', label: 'CHWR' },
} as const;

export function statusFill(status: string): string {
  if (status === 'running') return SCADA.running;
  if (status === 'alarm') return SCADA.alarm;
  if (status === 'manual') return SCADA.manual;
  return SCADA.stopped;
}

/** Animation duration (s) — faster flow when pumps run harder */
export function flowDuration(speedPercent: number, running: boolean): number {
  if (!running || speedPercent <= 0) return 0;
  return Math.max(0.35, 2.2 - (speedPercent / 100) * 1.6);
}
