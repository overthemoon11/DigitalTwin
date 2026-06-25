import React, { useState } from 'react';
import { AHU_SCENARIOS } from '../../services/ahuScenarios';
import { MODE_LABELS } from './ahu01Topology';

const GROUP_ORDER = ['mode', 'setpoints', 'coils', 'fans', 'dampers', 'load', 'weather'];
const GROUP_LABELS = {
  mode: 'Operating mode',
  setpoints: 'Setpoints',
  coils: 'Coils (boundary)',
  fans: 'Fans',
  dampers: 'Filters & dampers',
  load: 'Zone load',
  weather: 'Weather',
};

function ControlSlider({ control, onUpdate }) {
  if (control.id === 'ahu-mode') {
    const mode = Math.round(control.value);
    return (
      <div className="control-item ets-control-item">
        <label>{control.label}</label>
        <div className="dc-toggle-row" style={{ flexWrap: 'wrap' }}>
          {MODE_LABELS.map((label, i) => (
            <button key={label} type="button" className={`dc-toggle-btn ${mode === i ? 'active' : ''}`} onClick={() => onUpdate(control.id, i)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (control.controlType === 'saFanCmd' || control.controlType === 'raFanCmd') {
    const on = control.value >= 1;
    return (
      <div className="control-item ets-control-item">
        <label>{control.label}</label>
        <div className="dc-toggle-row">
          <button type="button" className={`dc-toggle-btn ${on ? 'active' : ''}`} onClick={() => onUpdate(control.id, 1)}>ON</button>
          <button type="button" className={`dc-toggle-btn ${!on ? 'active' : ''}`} onClick={() => onUpdate(control.id, 0)}>OFF</button>
        </div>
      </div>
    );
  }
  return (
    <div className="control-item ets-control-item">
      <label>{control.label}</label>
      <input type="range" min={control.min} max={control.max} step={control.step} value={control.value}
        onChange={(e) => onUpdate(control.id, parseFloat(e.target.value))} />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{control.value}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
    </div>
  );
}

export default function AhuControlPanel({
  controls,
  headers,
  simulation,
  onUpdate,
  onRunSimulation,
  onApplyScenario,
  onReset,
}) {
  const [expandedScenario, setExpandedScenario] = useState(null);
  const activeScenarioId = simulation?.scenarioId ?? null;
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="dc-control-panel ets-control-panel">
      <div className="control-group">
        <h4>AHU01 Controls</h4>
        {headers && (
          <div className="ets-derived-grid">
            <div className="ets-derived-row"><span>Mode</span><strong>{headers.mode.toUpperCase()}</strong></div>
            <div className="ets-derived-row"><span>SA / RA CFM</span><strong>{headers.saCfm} / {headers.raCfm}</strong></div>
            <div className="ets-derived-row"><span>RA T / RH</span><strong>{headers.ratC}°C / {headers.raRhPct}%</strong></div>
            <div className="ets-derived-row"><span>Fan power</span><strong>{headers.fanPowerKw} kW</strong></div>
          </div>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.key} className="control-group">
          <h4>{g.label}</h4>
          {g.items.map((control) => (
            <ControlSlider key={control.id} control={control} onUpdate={onUpdate} />
          ))}
        </div>
      ))}

      <div className="control-group" style={{ marginTop: '1.5rem' }}>
        <h4>Simulation scenarios</h4>
        <div className="ets-scenario-list">
          {AHU_SCENARIOS.map((scenario) => {
            const active = activeScenarioId === scenario.id;
            const open = expandedScenario === scenario.id;
            return (
              <div key={scenario.id} className={`ets-scenario-item ${active ? 'active' : ''}`}>
                <button type="button" className="ets-scenario-btn" onClick={() => onApplyScenario(scenario.id)} title={scenario.description}>
                  {scenario.label}
                  {scenario.advanceSec > 0 ? <span className="ets-scenario-advance">+{scenario.advanceSec}s</span> : null}
                </button>
                <button type="button" className="ets-scenario-info-btn" onClick={() => setExpandedScenario(open ? null : scenario.id)}>
                  {open ? '▾' : '▸'}
                </button>
                {open && <p className="ets-scenario-desc">{scenario.description}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="control-group" style={{ marginTop: '1.5rem' }}>
        <h4>Simulation</h4>
        <button type="button" className="dc-run-btn" onClick={onRunSimulation}>▶ Run Simulation</button>
        <p className="dc-run-hint">Advances physics ~60s virtual time (30 steps × 2s)</p>
        <button type="button" className="dc-reset-btn" onClick={onReset}>🔄 Reset to Baseline</button>
      </div>
    </div>
  );
}
