import React, { useState } from 'react';
import { ETS_CONTROL_META, ETS_CORE_FORMULAS, ETS_DERIVED_LABELS } from './etsControlMeta';
import { ETS_SCENARIOS } from '../../services/ets/etsScenarios';
import { useDraftControls } from '../../hooks/useDraftControls';
import { RangeSlider } from '../common/RangeSlider';

function ControlSlider({ control, draftValue, onDraft }) {
  const meta = ETS_CONTROL_META[control.id];
  const [showMeta, setShowMeta] = useState(false);
  const dirty = draftValue !== control.value;
  let tooltip = `${draftValue}${control.unit ? ` ${control.unit}` : ''}`;
  if (control.controlType === 'occupancy') tooltip = draftValue >= 1 ? 'Occupied' : 'Unoccupied';

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

  if (control.controlType === 'occupancy') {
    const occupied = draftValue >= 1;
    return (
      <div className={`control-item ets-control-item ${dirty ? 'ctrl-dirty' : ''}`} title={tooltip}>
        {labelBtn}
        <div className="dc-toggle-row">
          <button type="button" className={`dc-toggle-btn ${occupied ? 'active' : ''}`} onClick={() => onDraft(control.id, 1)}>Occupied</button>
          <button type="button" className={`dc-toggle-btn ${!occupied ? 'active' : ''}`} onClick={() => onDraft(control.id, 0)}>Unoccupied</button>
        </div>
        {dirty && <div className="ctrl-pending-hint">{control.value >= 1 ? 'Occupied' : 'Unoccupied'} → {occupied ? 'Occupied' : 'Unoccupied'}</div>}
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
      <RangeSlider
        min={control.min}
        max={control.max}
        step={control.step}
        value={draftValue}
        unit={control.unit}
        title={tooltip}
        onChange={(e) => onDraft(control.id, parseFloat(e.target.value))}
      />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{draftValue}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
      {showMeta && meta && <ControlMeta meta={meta} />}
    </div>
  );
}

function ControlMeta({ meta }) {
  return (
    <div className="ets-control-meta">
      <div className="ets-control-formula"><strong>ƒ</strong> {meta.formula}</div>
      <div className="ets-control-affects"><strong>Affects:</strong> {meta.affects.join(' · ')}</div>
      <p className="ets-control-desc">{meta.description}</p>
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
function EtsControlPanel({
  controls,
  headers,
  valves,
  meter,
  simulation,
  onApply,
  onApplyScenario,
  onReset,
  compact = false,
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

  const ltBypass = valves?.find((v) => v.id === 'lt-bypass');
  const minFlow = valves?.find((v) => v.id === 'minflow-bypass');
  const hasPending = pending.length > 0;

  return (
    <div className="dc-control-panel ets-control-panel">
      <div className="control-group">
        <h4>ETS A-B03-01 Controls</h4>
        <button
          type="button"
          className="ets-formula-toggle"
          onClick={() => setShowFormulas((s) => !s)}
        >
          {showFormulas ? '▾ Hide core formulas' : '▸ Show core formulas'}
        </button>
        {showFormulas && (
          <ul className="ets-core-formulas">
            {ETS_CORE_FORMULAS.map((f) => (
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
                {ETS_DERIVED_LABELS.map(({ key, label, unit }) => (
                  <div key={key} className="ets-derived-row">
                    <span>{label}</span>
                    <strong>{headers[key]}{unit ? ` ${unit}` : ''}</strong>
                  </div>
                ))}
                {ltBypass && (
                  <div className="ets-derived-row">
                    <span>LT bypass valve</span>
                    <strong>{ltBypass.positionPct.toFixed(0)} %</strong>
                  </div>
                )}
                {minFlow && (
                  <div className="ets-derived-row">
                    <span>Min-flow bypass</span>
                    <strong>{minFlow.positionPct.toFixed(0)} %</strong>
                  </div>
                )}
                {meter && (
                  <>
                    <div className="ets-derived-row">
                      <span>Meter (live)</span>
                      <strong>{meter.kw.toFixed(1)} kW · {meter.ton.toFixed(1)} ton</strong>
                    </div>
                    <div className="ets-derived-row">
                      <span>Meter ε (HX)</span>
                      <strong>{(headers.effectiveness * 100).toFixed(0)} %</strong>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {!compact && (
          <p className="ets-scenario-hint" style={{ marginTop: '0.5rem' }}>
            Adjust controls, then click <strong>Apply Changes</strong> to run. Hover a slider for its formula; click a label for details.
          </p>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.key} className="control-group">
          <h4>{g.label}</h4>
          {g.items.map((control) => (
            <ControlSlider key={control.id} control={control} draftValue={draft[control.id] ?? control.value} onDraft={setDraftValue} />
          ))}
        </div>
      ))}

      {!compact && (
        <div className="control-group" style={{ marginTop: '1.5rem' }}>
          <h4>Simulation scenarios</h4>
          <p className="ets-scenario-hint">Preset what-if cases — applies controls and fast-forwards virtual time.</p>
          <div className="ets-scenario-list">
            {ETS_SCENARIOS.map((scenario) => {
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

      {!compact && (
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
      )}
    </div>
  );
}

export default EtsControlPanel;
