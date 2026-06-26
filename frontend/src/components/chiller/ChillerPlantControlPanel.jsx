import React, { useState } from 'react';
import {
  CHILLER_CONTROL_META,
  CHILLER_CORE_FORMULAS,
  CHILLER_DERIVED_LABELS,
  CHILLER_GROUP_ORDER,
  CHILLER_GROUP_LABELS,
} from './chillerControlMeta';
import { CHILLER_SCENARIOS } from '../../services/chillerScenarios';

function ControlMeta({ meta }) {
  return (
    <div className="ets-control-meta">
      <div className="ets-control-formula"><strong>ƒ</strong> {meta.formula}</div>
      <div className="ets-control-affects"><strong>Affects:</strong> {meta.affects.join(' · ')}</div>
      <p className="ets-control-desc">{meta.description}</p>
    </div>
  );
}

function ControlSlider({ control, onUpdate }) {
  const meta = CHILLER_CONTROL_META[control.id];
  const [showMeta, setShowMeta] = useState(false);

  const labelBtn = meta ? (
    <button
      type="button"
      className="ets-control-label-btn"
      onClick={() => setShowMeta((s) => !s)}
      aria-expanded={showMeta}
    >
      {control.label}
    </button>
  ) : (
    <label>{control.label}</label>
  );

  if (control.controlType === 'chillerEnable' || control.controlType === 'optimizationMode') {
    const on = control.value >= 1;
    const offLabel = control.controlType === 'chillerEnable' ? 'Disabled' : 'Off';
    const onLabel = control.controlType === 'chillerEnable' ? 'Enabled' : 'On';
    return (
      <div className="control-item ets-control-item">
        {labelBtn}
        <div className="dc-toggle-row">
          <button type="button" className={`dc-toggle-btn ${!on ? 'active' : ''}`} onClick={() => onUpdate(control.id, 0)}>{offLabel}</button>
          <button type="button" className={`dc-toggle-btn ${on ? 'active' : ''}`} onClick={() => onUpdate(control.id, 1)}>{onLabel}</button>
        </div>
        {showMeta && meta && <ControlMeta meta={meta} />}
      </div>
    );
  }

  const displayValue = control.controlType.includes('Override') && control.value === 0 ? 'Auto' : control.value;

  return (
    <div className="control-item ets-control-item">
      {labelBtn}
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value ?? control.min}
        onChange={(e) => onUpdate(control.id, parseFloat(e.target.value))}
      />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{displayValue}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
      {showMeta && meta && <ControlMeta meta={meta} />}
    </div>
  );
}

/** Right-sidebar controls for L29 Chiller Plant Virtual Simulator. */
export default function ChillerPlantControlPanel({
  controls,
  headers,
  simulation,
  equipment,
  onUpdate,
  onRunSimulation,
  onApplyScenario,
  onReset,
  onTriggerFault,
}) {
  const [showFormulas, setShowFormulas] = useState(false);
  const [showOutputs, setShowOutputs] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState(null);

  const activeScenarioId = simulation?.scenarioId ?? null;

  const groups = CHILLER_GROUP_ORDER.map((key) => ({
    key,
    label: CHILLER_GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  const bv1 = equipment?.['bv-1'];
  const deltaT = headers
    ? Number((headers.chwr - headers.chws).toFixed(1))
    : simulation?.lastOutput?.deltaT;

  return (
    <div className="dc-control-panel ets-control-panel chiller-control-panel">
      <div className="control-group">
        <h4>Chiller Plant Controls</h4>
        <p className="ets-control-intro">
          L29 plant room — click a control label for <strong>ƒ</strong> formula and affected outputs.
          See <code>docs/chiller-plant-controls-and-physics.md</code>.
        </p>
        <button
          type="button"
          className="ets-formula-toggle"
          onClick={() => setShowFormulas((s) => !s)}
        >
          {showFormulas ? '▾ Hide core formulas' : '▸ Show core formulas'}
        </button>
        {showFormulas && (
          <ul className="ets-core-formulas">
            {CHILLER_CORE_FORMULAS.map((f) => (
              <li key={f.name}>
                <span className="ets-formula-name">{f.name}</span>
                <span className="ets-formula-eq">{f.eq}</span>
              </li>
            ))}
          </ul>
        )}
        {headers && (
          <>
            <button
              type="button"
              className="ets-formula-toggle"
              onClick={() => setShowOutputs((s) => !s)}
            >
              {showOutputs ? '▾ Hide schematic outputs' : '▸ Show schematic outputs'}
            </button>
            {showOutputs && (
              <div className="ets-derived-grid">
                {CHILLER_DERIVED_LABELS.map(({ key, label, unit }) => (
                  <div key={key} className="ets-derived-row">
                    <span>{label}</span>
                    <strong>{headers[key]}{unit ? ` ${unit}` : ''}</strong>
                  </div>
                ))}
                {deltaT != null && (
                  <div className="ets-derived-row">
                    <span>CHW ΔT</span>
                    <strong>{deltaT} °C</strong>
                  </div>
                )}
                {bv1 && (
                  <div className="ets-derived-row">
                    <span>Bypass valve</span>
                    <strong>{bv1.positionPercent.toFixed(0)} %</strong>
                  </div>
                )}
              </div>
            )}
          </>
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

      {onApplyScenario && (
        <div className="control-group" style={{ marginTop: '1.5rem' }}>
          <h4>Simulation scenarios</h4>
          <p className="ets-scenario-hint">Preset what-if cases — applies controls and fast-forwards virtual time.</p>
          <div className="ets-scenario-list">
            {CHILLER_SCENARIOS.map((scenario) => {
              const active = activeScenarioId === scenario.id;
              const open = expandedScenario === scenario.id;
              return (
                <div key={scenario.id} className={`ets-scenario-item ${active ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="ets-scenario-btn"
                    onClick={() => onApplyScenario(scenario.id)}
                    title={scenario.description}
                  >
                    {scenario.label}
                    {scenario.advanceSec > 0 ? (
                      <span className="ets-scenario-advance">+{scenario.advanceSec}s</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="ets-scenario-info-btn"
                    onClick={() => setExpandedScenario(open ? null : scenario.id)}
                    aria-expanded={open}
                    aria-label={`About ${scenario.label}`}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  {open && <p className="ets-scenario-desc">{scenario.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="control-group" style={{ marginTop: '1.5rem' }}>
        <h4>Simulation</h4>
        <button type="button" className="dc-run-btn" onClick={onRunSimulation}>▶ Run Simulation Step</button>
        <p className="dc-run-hint">Advances physics ~60s virtual time (30 × 2s ticks)</p>
        <button type="button" className="dc-reset-btn" onClick={onReset}>🔄 Reset to Baseline</button>
      </div>

      {onTriggerFault && (
        <div className="control-group">
          <h4>Fault injection</h4>
          <button type="button" className="dc-reset-btn" onClick={() => onTriggerFault('chiller_fault')}>
            ❄️ Chiller Fault (CH-29-3)
          </button>
          <button type="button" className="dc-reset-btn" onClick={() => onTriggerFault('pump_trip')}>
            💧 Pump Trip (CHWP-29-2)
          </button>
        </div>
      )}
    </div>
  );
}
