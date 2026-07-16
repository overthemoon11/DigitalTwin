import React from 'react';
import SimulationOutputSummary from '../common/SimulationOutputSummary';

function ControlSlider({ control, onUpdate }) {
  const handleChange = (e) => {
    onUpdate(control.id, parseFloat(e.target.value));
  };

  if (control.controlType === 'occupancy') {
    const occupied = control.value >= 1;
    return (
      <div className="control-item">
        <label>{control.label}</label>
        <div className="dc-toggle-row">
          <button
            type="button"
            className={`dc-toggle-btn ${occupied ? 'active' : ''}`}
            onClick={() => onUpdate(control.id, 1)}
          >
            Occupied
          </button>
          <button
            type="button"
            className={`dc-toggle-btn ${!occupied ? 'active' : ''}`}
            onClick={() => onUpdate(control.id, 0)}
          >
            Unoccupied
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="control-item">
      <label>{control.label}</label>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value}
        onChange={handleChange}
      />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{control.value}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
    </div>
  );
}

const GROUP_ORDER = ['load', 'weather', 'setpoints', 'contract', 'pumps', 'valves', 'comfort'];
const GROUP_LABELS = {
  load: 'Building load',
  weather: 'Weather & humidity',
  setpoints: 'Water & pressure setpoints',
  contract: 'Contractual limits',
  pumps: 'Pump staging',
  valves: 'Valves',
  comfort: 'Comfort & IAQ',
};

/**
 * District cooling / heat exchange plant controls (right sidebar in HX scenario).
 */
function DistrictCoolingControlPanel({
  controls,
  headers,
  simulation,
  onUpdate,
  onRunSimulation,
  onReset,
  compact = false,
}) {
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="dc-control-panel">
      <div className="control-group">
        <h4>Heat Exchange Plant Controls</h4>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          Adjust setpoints for district cooling interface, secondary loop, and building load scenario.
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.key} className="control-group">
          <h4>{g.label}</h4>
          {g.items.map((control) => (
            <ControlSlider key={control.id} control={control} onUpdate={onUpdate} />
          ))}
        </div>
      ))}

      {!compact && (
        <div className="control-group" style={{ marginTop: '1.5rem' }}>
          <h4>Simulation</h4>
          {(headers || simulation?.lastOutput) && (
            <SimulationOutputSummary
              compact
              buildingLoadRt={simulation?.lastOutput?.buildingLoadRt ?? headers?.buildingLoadRt}
              primaryDeltaT={simulation?.lastOutput?.primaryDeltaT ?? headers?.primaryDeltaT}
              secondaryDeltaT={simulation?.lastOutput?.secondaryDeltaT ?? headers?.secondaryDeltaT}
            />
          )}
          <button type="button" className="dc-run-btn" onClick={onRunSimulation}>
            ▶ Run Simulation
          </button>
          <p className="dc-run-hint">Advances physics ~30s virtual time</p>
          <button type="button" className="dc-reset-btn" onClick={onReset}>
            🔄 Reset to Baseline
          </button>
        </div>
      )}
    </div>
  );
}

export default DistrictCoolingControlPanel;
