import React from 'react';
import ComparisonTable from './ComparisonTable';

const kw = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} kW` : '—');
const eff = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');

function row(label, before, after, format) {
  const changed = Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) > 1e-6;
  return {
    label,
    before: format(before),
    after: Number.isFinite(after) ? format(after) : '—',
    changed,
    direction: changed ? (after > before ? 'up' : 'down') : null,
  };
}

/**
 * SECTION C — the simulated outcome, before vs after.
 *
 * "Pump kW" is CHWP + CWP as the sidebar spec requires; both remain separately
 * available on the SimulationResult for anything that needs the split.
 * Savings are only shown for a feasible optimum — an infeasible candidate has
 * no legitimate saving to claim.
 */
export default function SimulationResultComparison({ baselineResult, optimalResult, savingKw, savingPct }) {
  const b = baselineResult;
  const a = optimalResult;

  const rows = b
    ? [
        row('Chiller kW', b.chillerKw, a?.chillerKw, kw),
        row('Pump kW', b.pumpKw, a?.pumpKw, kw),
        row('Tower kW', b.towerKw, a?.towerKw, kw),
        row('Total Plant kW', b.totalPlantKw, a?.totalPlantKw, kw),
        row('Plant kW/RT', b.plantKwPerRt, a?.plantKwPerRt, eff),
      ]
    : [];

  const showSaving = !!a && a.feasible && Number.isFinite(savingKw);
  const improved = showSaving && savingKw > 0;

  return (
    <section className="vsp-section mpc-section">
      <h4>Simulation Result</h4>
      <ComparisonTable rows={rows} emptyHint="Run the MPC simulation to compare plant power." />

      {showSaving && (
        <div className={`mpc-saving ${improved ? 'mpc-saving--gain' : 'mpc-saving--flat'}`}>
          <span className="mpc-saving-label">
            {improved ? 'Energy Improvement' : 'No improvement found'}
          </span>
          <strong className="mpc-saving-value">
            {Math.abs(savingKw).toFixed(1)} kW
            <em>{Math.abs(savingPct).toFixed(1)} %</em>
          </strong>
        </div>
      )}

      {b && (
        <div className="mpc-detail-grid">
          <div className="mpc-detail">
            <span>CHWP / CWP</span>
            <strong>
              {kw(a?.chwpKw ?? b.chwpKw)} / {kw(a?.cwpKw ?? b.cwpKw)}
            </strong>
          </div>
          <div className="mpc-detail">
            <span>Cooling delivered</span>
            <strong>{Math.round((a ?? b).coolingDeliveredRt).toLocaleString()} RT</strong>
          </div>
          <div className="mpc-detail">
            <span>CHWS / CHWR</span>
            <strong>
              {(a ?? b).chwsC?.toFixed(2)} / {(a ?? b).chwrC?.toFixed(2)} °C
            </strong>
          </div>
          <div className="mpc-detail">
            <span>CWS / CWR</span>
            <strong>
              {(a ?? b).cwsC?.toFixed(2)} / {(a ?? b).cwrC?.toFixed(2)} °C
            </strong>
          </div>
          <div className="mpc-detail">
            <span>Tower approach</span>
            <strong>{(a ?? b).towerApproachC?.toFixed(1)} °C</strong>
          </div>
          <div className="mpc-detail">
            <span>Chiller load</span>
            <strong>{(a ?? b).chillerLoadPct?.toFixed(1)} %</strong>
          </div>
        </div>
      )}

      {(a ?? b)?.calibration?.status === 'extrapolated' && (
        <p className="mpc-warn">
          ▲ Outside the T1 dataset&apos;s calibrated region — this result is a physics
          extrapolation, treat as low confidence.
        </p>
      )}
    </section>
  );
}
