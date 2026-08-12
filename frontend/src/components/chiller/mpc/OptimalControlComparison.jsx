import React from 'react';
import ComparisonTable from './ComparisonTable';

const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');

function stagingLabel(control) {
  if (!control) return '—';
  const ids = control.chillerIds;
  if (ids?.length) return ids.join(', ');
  return String(control.runningChillers);
}

function direction(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  if (Math.abs(after - before) < 1e-6) return null;
  return after > before ? 'up' : 'down';
}

/**
 * SECTION B — the six manipulated variables, before vs after.
 *
 * Chiller staging renders the individual duty machines when the model knows
 * them and falls back to the bare count otherwise; the underlying ControlState
 * always carries `chillerIds`, so per-unit selection needs no UI change later.
 */
export default function OptimalControlComparison({ baseline, optimal }) {
  const rows = baseline
    ? [
        {
          label: 'CHWST-SP',
          before: `${fmt(baseline.chwstSetpointC, 2)} °C`,
          after: optimal ? `${fmt(optimal.chwstSetpointC, 2)} °C` : '—',
          changed: !!optimal && Math.abs(optimal.chwstSetpointC - baseline.chwstSetpointC) > 1e-6,
          direction: optimal ? direction(baseline.chwstSetpointC, optimal.chwstSetpointC) : null,
        },
        {
          label: 'DP-SP',
          before: `${fmt(baseline.dpSetpointPsi, 1)} psi`,
          after: optimal ? `${fmt(optimal.dpSetpointPsi, 1)} psi` : '—',
          changed: !!optimal && Math.abs(optimal.dpSetpointPsi - baseline.dpSetpointPsi) > 1e-6,
          direction: optimal ? direction(baseline.dpSetpointPsi, optimal.dpSetpointPsi) : null,
        },
        {
          label: 'Chiller Staging',
          before: stagingLabel(baseline),
          after: optimal ? stagingLabel(optimal) : '—',
          changed: !!optimal && optimal.runningChillers !== baseline.runningChillers,
          direction: optimal ? direction(baseline.runningChillers, optimal.runningChillers) : null,
        },
        {
          label: 'CHWP Speed',
          before: `${fmt(baseline.chwpSpeedPct, 1)} %`,
          after: optimal ? `${fmt(optimal.chwpSpeedPct, 1)} %` : '—',
          changed: !!optimal && Math.abs(optimal.chwpSpeedPct - baseline.chwpSpeedPct) > 1e-6,
          direction: optimal ? direction(baseline.chwpSpeedPct, optimal.chwpSpeedPct) : null,
        },
        {
          label: 'CWP Speed',
          before: `${fmt(baseline.cwpSpeedPct, 1)} %`,
          after: optimal ? `${fmt(optimal.cwpSpeedPct, 1)} %` : '—',
          changed: !!optimal && Math.abs(optimal.cwpSpeedPct - baseline.cwpSpeedPct) > 1e-6,
          direction: optimal ? direction(baseline.cwpSpeedPct, optimal.cwpSpeedPct) : null,
        },
        {
          label: 'CT Fan Speed',
          before: `${fmt(baseline.ctFanSpeedPct, 1)} %`,
          after: optimal ? `${fmt(optimal.ctFanSpeedPct, 1)} %` : '—',
          changed: !!optimal && Math.abs(optimal.ctFanSpeedPct - baseline.ctFanSpeedPct) > 1e-6,
          direction: optimal ? direction(baseline.ctFanSpeedPct, optimal.ctFanSpeedPct) : null,
        },
      ]
    : [];

  return (
    <section className="vsp-section mpc-section">
      <h4>Optimal Control</h4>
      <ComparisonTable rows={rows} emptyHint="Run the MPC simulation to compare control setpoints." />
    </section>
  );
}
