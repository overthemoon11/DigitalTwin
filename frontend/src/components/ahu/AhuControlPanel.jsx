import React, { useState } from 'react';
import { AHU_SCENARIOS } from '../../services/ahu/ahuScenarios';
import { MODE_LABELS } from './ahu01Topology';
import { useDraftControls } from '../../hooks/useDraftControls';
import { RangeSlider } from '../common/RangeSlider';
import {
  AHU_CONTROL_META,
  AHU_CORE_FORMULAS,
  AHU_DERIVED_LABELS,
  AHU_DERIVED_EXTRAS,
} from './ahuControlMeta';

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

function ControlMeta({ meta }) {
  return (
    <div className="ets-control-meta">
      <div className="ets-control-formula"><strong>ƒ</strong> {meta.formula}</div>
      <div className="ets-control-affects"><strong>Affects:</strong> {meta.affects.join(' · ')}</div>
      <p className="ets-control-desc">{meta.description}</p>
    </div>
  );
}

function ControlSlider({ control, draftValue, onDraft }) {
  const meta = AHU_CONTROL_META[control.id];
  const [showMeta, setShowMeta] = useState(false);
  const dirty = draftValue !== control.value;
  let tooltip = `${draftValue}${control.unit ? ` ${control.unit}` : ''}`;
  if (control.id === 'ahu-mode') tooltip = MODE_LABELS[Math.round(draftValue)] ?? `${draftValue}`;
  else if (control.controlType === 'saFanCmd' || control.controlType === 'raFanCmd') tooltip = draftValue >= 1 ? 'ON' : 'OFF';

  const labelBtn = meta ? (
    <button
      type="button"
      className="ets-control-label-btn"
      onClick={() => setShowMeta((s) => !s)}
      aria-expanded={showMeta}
      title={tooltip}
    >
      {control.label}
    </button>
  ) : (
    <label title={tooltip}>{control.label}</label>
  );

  if (control.id === 'ahu-mode') {
    const mode = Math.round(draftValue);
    return (
      <div className={`control-item ets-control-item ${dirty ? 'ctrl-dirty' : ''}`} title={tooltip}>
        {labelBtn}
        <div className="dc-toggle-row" style={{ flexWrap: 'wrap' }}>
          {MODE_LABELS.map((label, i) => (
            <button key={label} type="button" className={`dc-toggle-btn ${mode === i ? 'active' : ''}`} onClick={() => onDraft(control.id, i)}>
              {label}
            </button>
          ))}
        </div>
        {dirty && <div className="ctrl-pending-hint">{MODE_LABELS[Math.round(control.value)]} → {MODE_LABELS[mode]}</div>}
        {showMeta && meta && <ControlMeta meta={meta} />}
      </div>
    );
  }
  if (control.controlType === 'saFanCmd' || control.controlType === 'raFanCmd') {
    const on = draftValue >= 1;
    return (
      <div className={`control-item ets-control-item ${dirty ? 'ctrl-dirty' : ''}`} title={tooltip}>
        {labelBtn}
        <div className="dc-toggle-row">
          <button type="button" className={`dc-toggle-btn ${on ? 'active' : ''}`} onClick={() => onDraft(control.id, 1)}>ON</button>
          <button type="button" className={`dc-toggle-btn ${!on ? 'active' : ''}`} onClick={() => onDraft(control.id, 0)}>OFF</button>
        </div>
        {dirty && <div className="ctrl-pending-hint">{control.value >= 1 ? 'ON' : 'OFF'} → {on ? 'ON' : 'OFF'}</div>}
        {showMeta && meta && <ControlMeta meta={meta} />}
      </div>
    );
  }
  return (
    <div className={`control-item ets-control-item ${dirty ? 'ctrl-dirty' : ''}`} title={tooltip}>
      <div className="ctrl-label-row">
        {labelBtn}
        {dirty && (
          <span className="ctrl-prev-val" title="Current value — click Apply to commit the change">
            was {control.value}{control.unit ? ` ${control.unit}` : ''}
          </span>
        )}
      </div>
      <RangeSlider min={control.min} max={control.max} step={control.step} value={draftValue}
        unit={control.unit} title={tooltip}
        onChange={(e) => onDraft(control.id, parseFloat(e.target.value))} />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{draftValue}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
      {showMeta && meta && <ControlMeta meta={meta} />}
    </div>
  );
}

export default function AhuControlPanel({
  controls,
  headers,
  chwCoil,
  hwCoil,
  saFan,
  raFan,
  dampers,
  filters,
  simulation,
  onApply,
  onApplyScenario,
  onReset,
}) {
  const [showFormulas, setShowFormulas] = useState(false);
  const [showOutputs, setShowOutputs] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState(null);
  const { draft, setDraftValue, discardDrafts, pending } = useDraftControls(controls);
  const activeScenarioId = simulation?.scenarioId ?? null;
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  const derivedState = { headers, chwCoil, hwCoil, saFan, raFan, dampers, filters };
  const hasPending = pending.length > 0;

  return (
    <div className="dc-control-panel ets-control-panel">
      <div className="control-group">
        <h4>AHU01 Controls</h4>
        <button
          type="button"
          className="ets-formula-toggle"
          onClick={() => setShowFormulas((s) => !s)}
        >
          {showFormulas ? '▾ Hide core formulas' : '▸ Show core formulas'}
        </button>
        {showFormulas && (
          <ul className="ets-core-formulas">
            {AHU_CORE_FORMULAS.map((f) => (
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
                <div className="ets-derived-row"><span>Mode</span><strong>{headers.mode.toUpperCase()}</strong></div>
                <div className="ets-derived-row"><span>RA T / RH</span><strong>{headers.ratC}°C / {headers.raRhPct}%</strong></div>
                {AHU_DERIVED_LABELS.map(({ key, label, unit, fmt }) => (
                  <div key={key} className="ets-derived-row">
                    <span>{label}</span>
                    <strong>{fmt ? fmt(headers[key]) : `${headers[key]}${unit ? ` ${unit}` : ''}`}</strong>
                  </div>
                ))}
                {AHU_DERIVED_EXTRAS.map(({ id, label, get, unit }) => {
                  const val = get(derivedState);
                  if (val == null) return null;
                  return (
                    <div key={id} className="ets-derived-row">
                      <span>{label}</span>
                      <strong>{typeof val === 'number' ? val.toFixed(1) : val}{unit ? ` ${unit}` : ''}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {!showOutputs && headers && (
          <div className="ets-derived-grid">
            <div className="ets-derived-row"><span>SA / RA CFM</span><strong>{headers.saCfm} / {headers.raCfm}</strong></div>
            <div className="ets-derived-row"><span>SAT / MAT</span><strong>{headers.satC}°C / {headers.matC}°C</strong></div>
            <div className="ets-derived-row"><span>Cooling / Fans</span><strong>{headers.coolingKw} kW / {headers.fanPowerKw} kW</strong></div>
          </div>
        )}
        <p className="ets-scenario-hint" style={{ marginTop: '0.5rem' }}>
          Adjust controls, then click <strong>Apply Changes</strong> to run the simulation. Hover a slider for its formula; click a label to expand details.
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.key} className="control-group">
          <h4>{g.label}</h4>
          {g.items.map((control) => (
            <ControlSlider key={control.id} control={control} draftValue={draft[control.id] ?? control.value} onDraft={setDraftValue} />
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

      <div className="control-group ctrl-apply-group" style={{ marginTop: '1.5rem' }}>
        <h4>Simulation</h4>
        {hasPending && (
          <div className="ctrl-pending-summary">
            <strong>{pending.length}</strong> pending change{pending.length > 1 ? 's' : ''}:
            <ul>
              {pending.map((c) => (
                <li key={c.controlId}>{c.label}: {c.oldValue} → {c.newValue}{c.unit ? ` ${c.unit}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          className={`dc-run-btn ${hasPending ? 'has-pending' : ''}`}
          onClick={() => onApply(pending)}
        >
          {hasPending ? `▶ Apply ${pending.length} Change${pending.length > 1 ? 's' : ''} & Run` : '▶ Run Simulation'}
        </button>
        {hasPending && (
          <button type="button" className="dc-reset-btn ctrl-discard-btn" onClick={discardDrafts}>
            ✕ Discard pending
          </button>
        )}
        <p className="dc-run-hint">Staged edits apply only when you click Apply · advances physics ~30s virtual time.</p>
        <button type="button" className="dc-reset-btn" onClick={onReset}>🔄 Reset to Baseline</button>
      </div>
    </div>
  );
}
