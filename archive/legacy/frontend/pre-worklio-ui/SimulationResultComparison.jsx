import React from 'react';
import ComparisonTable from './ComparisonTable';

const kw = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} kW` : '—');
const kwh = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} kWh` : '—');
const rt = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} RT` : '—');
const eff = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
const t1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const t2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/** Lower is better for every row here, so a fall is the improvement. */
function row(label, before, after, format, note) {
  const changed = Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) > 1e-6;
  return {
    label,
    before: format(before),
    after: Number.isFinite(after) ? format(after) : '—',
    changed,
    direction: changed ? (after > before ? 'up' : 'down') : null,
    note,
  };
}

/**
 * SECTION C — the simulated outcome, before vs after.
 *
 * Two things here are deliberate and easy to get wrong.
 *
 * WHICH PERCENTAGE IS THE HEADLINE. The server decides, not this component. If
 * the two arms did not deliver the same cooling then a kWh difference is partly
 * a difference in load served, and the honest figure is kW/RT. Overriding the
 * server's choice would let the UI quote whichever number looked better.
 *
 * EVERY CAVEAT IS RENDERED. Not truncated, not behind a disclosure. They are
 * the difference between a number and a claim.
 */
export default function SimulationResultComparison({ run }) {
  if (!run) {
    return (
      <section className="vsp-section mpc-section">
        <h4>Simulation Result</h4>
        <p className="vsp-desc">Run the MPC simulation to compare plant power.</p>
      </section>
    );
  }

  const b = run.baseline.totals;
  const m = run.mpc.totals;
  const s = run.savings;
  const first = { base: run.baseline.trajectory[0]?.result, mpc: run.mpc.trajectory[0]?.result };

  // Mean power over the run, which is the like-for-like way to compare two runs
  // of the same length. The per-block energies are shown beside it.
  const meanKw = (totals, pick) => (totals.hours > 0 ? pick(totals) / totals.hours : NaN);

  const rows = [
    row('Chiller kW', meanKw(b, (x) => x.chillerKwh), meanKw(m, (x) => x.chillerKwh), kw),
    row('Pump kW', meanKw(b, (x) => x.pumpKwh), meanKw(m, (x) => x.pumpKwh), kw,
      'CHWP + CWP. The split is in the detail grid below.'),
    row('Tower kW', meanKw(b, (x) => x.towerKwh), meanKw(m, (x) => x.towerKwh), kw),
    row('Total Plant kW', meanKw(b, (x) => x.totalPlantKwh), meanKw(m, (x) => x.totalPlantKwh), kw),
    row('Plant RT', b.rtHours / Math.max(b.hours, 1e-9), m.rtHours / Math.max(m.hours, 1e-9), rt,
      'Cooling actually DELIVERED, not demanded. A controller that defers cooling into the loop shows up here.'),
    row('Plant kW/RT', b.plantKwPerRt, m.plantKwPerRt, eff),
    row('Energy kWh', b.totalPlantKwh, m.totalPlantKwh, kwh),
  ];

  const headlinePct = s.headline === 'kwPerRtPct' ? s.kwPerRtPct : s.totalPlantPct;
  const headlineLabel =
    s.headline === 'kwPerRtPct' ? 'Efficiency improvement (kW/RT)' : 'Energy saving';
  const improved = headlinePct > 0;

  return (
    <section className="vsp-section mpc-section">
      <h4>Simulation Result</h4>
      <ComparisonTable rows={rows} emptyHint="Run the MPC simulation to compare plant power." />

      <div className={`mpc-saving ${improved ? 'mpc-saving--gain' : 'mpc-saving--flat'}`}>
        <span className="mpc-saving-label">
          {improved ? headlineLabel : 'No improvement found'}
        </span>
        <strong className="mpc-saving-value">
          {Math.abs(headlinePct).toFixed(2)} %
          <em>{Math.abs(s.totalPlantKwh).toFixed(0)} kWh</em>
        </strong>
      </div>

      {s.basis === 'unequal-delivery' && (
        <p className="mpc-warn">
          ▲ The two arms did not serve the same cooling ({s.deliveredRtHoursDeltaPct > 0 ? '+' : ''}
          {s.deliveredRtHoursDeltaPct.toFixed(2)}%), so the headline is kW/RT rather than kWh —
          a kWh difference here is partly a difference in load served.
        </p>
      )}

      <div className="mpc-detail-grid">
        <div className="mpc-detail">
          <span>CHWP / CWP kW</span>
          <strong>
            {kw(first.mpc?.chwpKw)} / {kw(first.mpc?.cwpKw)}
          </strong>
        </div>
        <div className="mpc-detail">
          <span>CHWS / CHWR</span>
          <strong>
            {t2(first.mpc?.chwsC)} / {t2(run.mpc.trajectory[0]?.loop?.chwrC)} °C
          </strong>
        </div>
        <div className="mpc-detail">
          <span>CHW flow</span>
          <strong>{t1(first.mpc?.chwFlowLs)} L/s</strong>
        </div>
        <div className="mpc-detail">
          <span>DP (measured)</span>
          <strong>{t1(first.mpc?.measuredDpPsi)} psi</strong>
        </div>
        <div className="mpc-detail">
          <span>Active chillers</span>
          <strong>{run.appliedControl?.runningChillers ?? '—'}</strong>
        </div>
        <div className="mpc-detail">
          <span>Chiller starts</span>
          <strong>
            {m.chillerStarts} <em className="mpc-detail-was">was {b.chillerStarts}</em>
          </strong>
        </div>
        <div className="mpc-detail">
          <span>Peak CHWR</span>
          <strong>
            {t2(m.chwrMaxC)} °C <em className="mpc-detail-was">was {t2(b.chwrMaxC)}</em>
          </strong>
        </div>
        <div className="mpc-detail">
          <span>Unmet cooling</span>
          <strong>
            {t1(m.unmetRtHours)} RT·h <em className="mpc-detail-was">was {t1(b.unmetRtHours)}</em>
          </strong>
        </div>
      </div>

      {run.caveats.length > 0 && (
        <>
          <div className="mpc-subhead">Read this number with these in mind</div>
          <ul className="mpc-caveats">
            {run.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      <p className="vsp-desc mpc-basis">
        Basis: {run.scenario.mode === 'bms' ? 'site-calibrated Digital Twin replaying real measured conditions' : run.scenario.mode === 'manual' ? 'site-calibrated Digital Twin at operator-entered conditions' : 'Digital Twin over a generated profile (benchmark, not this site)'}
        . Simulated result, not measured before/after data.
      </p>
    </section>
  );
}
