import React from 'react';

function ControlSlider({ control, onUpdate }) {
  if (control.controlType === 'occupancy') {
    const occupied = control.value >= 1;
    return (
      <div className="control-item">
        <label>{control.label}</label>
        <div className="dc-toggle-row">
          <button type="button" className={`dc-toggle-btn ${occupied ? 'active' : ''}`} onClick={() => onUpdate(control.id, 1)}>Occupied</button>
          <button type="button" className={`dc-toggle-btn ${!occupied ? 'active' : ''}`} onClick={() => onUpdate(control.id, 0)}>Unoccupied</button>
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
        onChange={(e) => onUpdate(control.id, parseFloat(e.target.value))}
      />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{control.value}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
    </div>
  );
}

const GROUP_ORDER = ['load', 'setpoints', 'primary', 'pumps', 'valves', 'weather'];
const GROUP_LABELS = {
  load: 'Building load',
  setpoints: 'Secondary setpoints',
  primary: 'Primary (DCS) & heat exchangers',
  pumps: 'Secondary pump staging',
  valves: 'Bypass valves',
  weather: 'Weather',
};

/** Right-sidebar controls for the MBS A-B03-01 Energy Transfer Station. */
function EtsControlPanel({ controls, headers, onUpdate, onRunSimulation, onReset, compact = false }) {
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="dc-control-panel">
      <div className="control-group">
        <h4>ETS A-B03-01 Controls</h4>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          Heat-exchange substation serving ASM. Adjust load, setpoints and staging; physics updates the HX approach, ΔT, pumping and energy meter.
        </p>
      </div>

      {headers && (
        <div className="control-group" style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
          <div>Thermal: <strong>{headers.coolingKw} kW</strong> · {headers.coolingDemandRt} RT</div>
          <div>Approach: <strong>{headers.approachC}°C</strong> · ε {(headers.effectiveness * 100).toFixed(0)}%</div>
          <div>Primary ΔT {headers.primaryDeltaT}°C · Secondary ΔT {headers.secondaryDeltaT}°C</div>
          <div>Pumping: {headers.pumpPowerKw} kW · {headers.pumpKwPerRt} kW/RT</div>
        </div>
      )}

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
          <button type="button" className="dc-run-btn" onClick={onRunSimulation}>▶ Run Simulation</button>
          <p className="dc-run-hint">Advances physics ~30s virtual time</p>
          <button type="button" className="dc-reset-btn" onClick={onReset}>🔄 Reset to Baseline</button>
        </div>
      )}
    </div>
  );
}

export default EtsControlPanel;
