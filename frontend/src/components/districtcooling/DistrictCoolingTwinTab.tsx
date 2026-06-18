import React from 'react';
import HeatExchangeViewer from '../heatexchange/HeatExchangeViewer';
import SimulationOutputSummary from '../SimulationOutputSummary';

/**
 * Full District Cooling Digital Twin tab — 3-column workflow from mockup.
 */
function DistrictCoolingTwinTab({
  districtState,
  selectedAsset,
  onSelectAsset,
  onUpdateControl,
  onRunSimulation,
  onReset,
}) {
  if (!districtState) {
    return (
      <div className="loading" style={{ flex: 1 }}>
        <h2>Initializing district cooling twin…</h2>
      </div>
    );
  }

  const { headers, controls, kpis, alerts, recommendedActions, scenarioComparison, simulation } = districtState;
  const demandPct = Math.min(100, (headers.coolingDemandRt / headers.contractDemandRt) * 100);
  const activeAlerts = alerts.filter((a) => !a.resolved);

  return (
    <div className="dc-twin-tab">
      {/* Column 1 — Physical system */}
      <section className="dc-col dc-col-physical">
        <div className="dc-col-header">
          <span className="dc-step">①</span>
          <div>
            <h2>Physical System</h2>
            <p>District cooling plant + plate heat exchanger + building secondary loop</p>
          </div>
        </div>
        <HeatExchangeViewer
          headers={headers}
          buildings={districtState.buildings}
          selectedId={selectedAsset}
          onSelect={onSelectAsset}
        />
        <div className="dc-how-it-works">
          <strong>How this works:</strong> Adjust controls → run simulation → review outputs and recommended actions.
          All values are physics-calculated (offline twin, not live BMS).
        </div>
      </section>

      {/* Column 2 — Adjust controls */}
      <section className="dc-col dc-col-controls">
        <div className="dc-col-header">
          <span className="dc-step">②</span>
          <div>
            <h2>Adjust Controls</h2>
            <p>Setpoints, staging, and scenario inputs</p>
          </div>
        </div>
        <div className="dc-controls-scroll">
          {controls.map((control) => (
            <div key={control.id} className="dc-inline-control">
              <label>{control.label}</label>
              <div className="dc-inline-row">
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={control.value}
                  onChange={(e) => onUpdateControl(control.id, parseFloat(e.target.value))}
                />
                <span className="dc-inline-value">
                  <strong>{control.value}</strong> {control.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="dc-run-btn dc-run-btn-large" onClick={onRunSimulation}>
          ▶ Run Simulation
        </button>
        <p className="dc-run-hint">Estimated runtime ~30 seconds virtual time</p>
        <div className="dc-constraints">
          <h4>Operational constraints enforced</h4>
          <div className="dc-constraint-chips">
            {['Contractual', 'Comfort', 'IAQ', 'Humidity', 'Equipment', 'Scheduling'].map((c) => (
              <span key={c} className="dc-chip">{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Column 3 — Review outputs */}
      <section className="dc-col dc-col-outputs">
        <div className="dc-col-header">
          <span className="dc-step">③</span>
          <div>
            <h2>Review Outputs</h2>
            <p>Simulation results and recommendations</p>
          </div>
        </div>

        <SimulationOutputSummary
          buildingLoadRt={simulation?.lastOutput?.buildingLoadRt ?? headers.buildingLoadRt}
          primaryDeltaT={simulation?.lastOutput?.primaryDeltaT ?? headers.primaryDeltaT}
          secondaryDeltaT={simulation?.lastOutput?.secondaryDeltaT ?? headers.secondaryDeltaT}
        />

        <div className="dc-output-gauge">
          <h4>Cooling Demand vs Contract</h4>
          <div className="dc-gauge-bar">
            <div className="dc-gauge-fill" style={{ width: `${demandPct}%` }} />
          </div>
          <div className="dc-gauge-labels">
            <span>{headers.coolingDemandRt} RT demand</span>
            <span>{headers.contractDemandRt} RT contract</span>
          </div>
        </div>

        <div className="dc-output-tiles">
          {[
            { label: 'Building Load', value: `${headers.buildingLoadRt} RT` },
            { label: 'Pump Power', value: `${headers.pumpPowerKw} kW` },
            { label: 'Primary ΔT', value: `${headers.primaryDeltaT} °C` },
            { label: 'Secondary ΔT', value: `${headers.secondaryDeltaT} °C` },
            { label: 'HX Approach', value: `${headers.hxApproach} °C` },
            { label: 'CHWS / CHWR', value: `${headers.chws} / ${headers.chwr} °C` },
            { label: 'Efficiency', value: `${headers.kwPerRt} kW/RT` },
          ].map((t) => (
            <div key={t.label} className="dc-tile">
              <span className="dc-tile-label">{t.label}</span>
              <span className="dc-tile-value">{t.value}</span>
            </div>
          ))}
        </div>

        <div className="dc-output-section">
          <h4>IAQ &amp; Comfort</h4>
          <div className="dc-comfort-row">
            <span>Room {headers.roomTempC}°C</span>
            <span>RH {headers.rhPct}%</span>
            <span>CO₂ {headers.co2Ppm} ppm</span>
          </div>
        </div>

        <div className="dc-output-section">
          <h4>Condensation Risk</h4>
          <p>
            Dew point {headers.dewPointC}°C · Surface {headers.surfaceTempC}°C —{' '}
            <strong className={headers.surfaceTempC - headers.dewPointC < 2 ? 'dc-risk-high' : 'dc-risk-low'}>
              {headers.surfaceTempC - headers.dewPointC < 2 ? 'Elevated' : 'Low'}
            </strong>
          </p>
        </div>

        {activeAlerts.length > 0 && (
          <div className="dc-output-section">
            <h4>Faults / Alerts ({activeAlerts.length})</h4>
            <ul className="dc-alert-list">
              {activeAlerts.map((a) => (
                <li key={a.id} className={`dc-alert-${a.severity}`}>{a.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="dc-output-section">
          <h4>Recommended Actions</h4>
          <ul className="dc-rec-list">
            {recommendedActions.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>

        <div className="dc-output-section">
          <h4>Scenario Comparison</h4>
          <table className="dc-scenario-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Baseline</th>
                <th>Optimized</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {scenarioComparison.map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td>{row.baseline}</td>
                  <td>{row.optimized}</td>
                  <td className={row.improved ? 'dc-delta-good' : ''}>{row.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default DistrictCoolingTwinTab;
