import React from 'react';
import ComparisonTable from './ComparisonTable';

const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');

function stagingLabel(control) {
  if (!control) return '—';
  const ids = control.chillerIds;
  // Non-breaking hyphen: a soft wrap is allowed after an ordinary "-", so a
  // wrapped list would split "CH-4" across two lines as "CH-" / "4".
  if (ids?.length) return ids.map((id) => id.replace(/-/g, '‑')).join(', ');
  return String(control.runningChillers);
}

function direction(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  if (Math.abs(after - before) < 1e-6) return null;
  return after > before ? 'up' : 'down';
}

/**
 * Why each row carries a note as well as a provenance badge: "Optimised" says
 * the solver searched it, but it does not say how well the model underneath was
 * calibrated. DP-SP is genuinely searched AND rests on an uncalibrated
 * DP-to-speed relation, because this site trends no differential pressure at
 * all. Both facts have to be visible or the row overstates itself.
 */
const ROW_NOTE = {
  chwstSetpointC:
    'Site-calibrated chiller response. Bounded by the CHWR return limit on the right — that limit is what stops a reset running away.',
  dpSetpointPsi:
    'Searched, but this site trends NO differential pressure. The DP-to-pump-speed relation is a twin default, so the pump operating point and its energy are real while the DP number attached to them is not site-validated.',
  runningChillers:
    'Site-calibrated. Part-load shape from a Gordon-Ng fit to the same trend, which is what stops extra machines looking free.',
  chwpSpeedPct:
    'Follows the DP setpoint through one documented map, so the two can be executed together. Pump power level is measured; the affinity response away from it is physics.',
  cwpSpeedPct:
    'Searched. The condenser-flow penalty on compressor lift is physics-based, not site-calibrated — T1 ran its condenser pumps at a fixed point all month.',
  ctFanSpeedPct:
    'Searched. Approach LEVEL is site-fitted (0.10 K held-out MAE); the fan-speed response is a standard tower power law, since fan speed is not trended.',
};

/**
 * SECTION B — the six manipulated variables, before vs after.
 *
 * Chiller staging renders the individual duty machines when the model knows
 * them and falls back to the bare count otherwise; the underlying control state
 * always carries `chillerIds`, so per-unit selection needs no UI change later.
 */
export default function OptimalControlComparison({ baseline, optimal, provenance }) {
  // `provenance` is optional so the steady-state path (which optimises all six
  // at one operating point) renders exactly as before; the time-domain path
  // passes it and the table then states which rows were genuinely searched.
  const prov = (key) => provenance?.[key];
  const note = (key) => (provenance ? ROW_NOTE[key] : undefined);

  const numeric = (key, label, unit, decimals) => ({
    label,
    before: `${fmt(baseline?.[key], decimals)} ${unit}`,
    after: optimal ? `${fmt(optimal[key], decimals)} ${unit}` : '—',
    changed: !!optimal && Math.abs(optimal[key] - baseline[key]) > 1e-6,
    direction: optimal ? direction(baseline?.[key], optimal[key]) : null,
    provenance: prov(key),
    note: note(key),
  });

  const rows = baseline
    ? [
        numeric('chwstSetpointC', 'CHWST-SP', '°C', 2),
        numeric('dpSetpointPsi', 'DP-SP', 'psi', 1),
        {
          label: 'Chiller Staging',
          before: stagingLabel(baseline),
          after: optimal ? stagingLabel(optimal) : '—',
          changed: !!optimal && optimal.runningChillers !== baseline.runningChillers,
          direction: optimal ? direction(baseline.runningChillers, optimal.runningChillers) : null,
          provenance: prov('runningChillers'),
          note: note('runningChillers'),
          wrap: true,
        },
        numeric('chwpSpeedPct', 'CHWP Speed', '%', 1),
        numeric('cwpSpeedPct', 'CWP Speed', '%', 1),
        numeric('ctFanSpeedPct', 'CT Fan Speed', '%', 1),
      ]
    : [];

  return (
    <section className="vsp-section mpc-section">
      <h4>Optimal Control</h4>
      <ComparisonTable rows={rows} emptyHint="Run the MPC simulation to compare control setpoints." />
      {provenance && rows.length > 0 && (
        <p className="vsp-desc">
          Hover a parameter for how far its model is calibrated. The badge says whether the
          solver searched the value; the note says what the model behind it rests on.
        </p>
      )}
    </section>
  );
}
