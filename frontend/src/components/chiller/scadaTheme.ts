/** Light SCADA palette for the chiller plant P&ID */
export const SCADA = {
  bg: '#f8fafc',
  grid: '#e2e8f0',
  panel: '#f1f5f9',
  panelBorder: '#cbd5e1',
  faceplate: '#ffffff',
  faceplateBorder: '#94a3b8',
  text: '#1e293b',
  textMuted: '#64748b',
  tag: '#0369a1',
  pv: '#0f172a',
  sp: '#b45309',
  alarm: '#dc2626',
  running: '#16a34a',
  stopped: '#94a3b8',
  manual: '#ca8a04',
  selected: '#0284c7',
  font: '"Segoe UI", system-ui, sans-serif',
  mono: '"Consolas", "Cascadia Mono", monospace',
} as const;

export const LOOP = {
  makeup: { stroke: '#0284c7', fill: 'rgba(2,132,199,0.1)', label: 'MAKE-UP' },
  cws: { stroke: '#16a34a', fill: 'rgba(22,163,74,0.08)', label: 'CWS' },
  cwr: { stroke: '#15803d', strokeBright: '#166534', fill: 'rgba(21,128,61,0.1)', label: 'CWR' },
  chws: { stroke: '#2563eb', fill: 'rgba(37,99,235,0.08)', label: 'CHWS' },
  chwr: { stroke: '#1d4ed8', fill: 'rgba(29,78,216,0.1)', label: 'CHWR' },
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
