import React, { useState } from "react";
import {
  CHILLER_CONTROL_META,
  CHILLER_CORE_FORMULAS,
  CHILLER_DERIVED_LABELS,
  CHILLER_GROUP_ORDER,
  CHILLER_GROUP_LABELS,
} from "./chillerControlMeta";
import { CHILLER_SCENARIOS } from "../../services/chiller/chillerScenarios";
import { useDraftControls } from "../../hooks/useDraftControls";
import { RangeSlider } from "../common/RangeSlider";

function ControlMeta({ meta }) {
  return (
    <div className="ets-control-meta">
      <div className="ets-control-formula">
        <strong>ƒ</strong> {meta.formula}
      </div>
      <div className="ets-control-affects">
        <strong>Affects:</strong> {meta.affects.join(" · ")}
      </div>
      <p className="ets-control-desc">{meta.description}</p>
    </div>
  );
}

function ControlSlider({ control, draftValue, onDraft }) {
  const meta = CHILLER_CONTROL_META[control.id];
  const [showMeta, setShowMeta] = useState(false);
  const dirty = draftValue !== control.value;
  let tooltip;
  if (control.controlType === "chillerEnable")
    tooltip = draftValue >= 1 ? "Enabled" : "Disabled";
  else if (control.controlType === "optimizationMode")
    tooltip = draftValue >= 1 ? "On" : "Off";
  else if (control.controlType.includes("Override") && draftValue === 0)
    tooltip = "Auto";
  else tooltip = `${draftValue}${control.unit ? ` ${control.unit}` : ""}`;

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

  if (
    control.controlType === "chillerEnable" ||
    control.controlType === "optimizationMode"
  ) {
    const on = draftValue >= 1;
    const offLabel =
      control.controlType === "chillerEnable" ? "Disabled" : "Off";
    const onLabel = control.controlType === "chillerEnable" ? "Enabled" : "On";
    return (
      <div
        className={`control-item ets-control-item ${dirty ? "ctrl-dirty" : ""}`}
        title={tooltip}
      >
        {labelBtn}
        <div className="dc-toggle-row">
          <button
            type="button"
            className={`dc-toggle-btn ${!on ? "active" : ""}`}
            onClick={() => onDraft(control.id, 0)}
          >
            {offLabel}
          </button>
          <button
            type="button"
            className={`dc-toggle-btn ${on ? "active" : ""}`}
            onClick={() => onDraft(control.id, 1)}
          >
            {onLabel}
          </button>
        </div>
        {dirty && (
          <div className="ctrl-pending-hint">
            {control.value >= 1 ? onLabel : offLabel} →{" "}
            {on ? onLabel : offLabel}
          </div>
        )}
        {showMeta && meta && <ControlMeta meta={meta} />}
      </div>
    );
  }

  const fmtVal = (v) =>
    control.controlType.includes("Override") && v === 0 ? "Auto" : v;
  const displayValue = fmtVal(draftValue);

  return (
    <div
      className={`control-item ets-control-item ${dirty ? "ctrl-dirty" : ""}`}
      title={tooltip}
    >
      <div className="ctrl-label-row">
        {labelBtn}
        {dirty && (
          <span
            className="ctrl-prev-val"
            title="Current value — click Apply to commit the change"
          >
            was {fmtVal(control.value)}
            {control.unit ? ` ${control.unit}` : ""}
          </span>
        )}
      </div>
      <RangeSlider
        min={control.min}
        max={control.max}
        step={control.step}
        value={draftValue ?? control.min}
        unit={control.unit}
        title={tooltip}
        display={
          displayValue === "Auto"
            ? "Auto"
            : `${displayValue}${control.unit ? ` ${control.unit}` : ""}`
        }
        onChange={(e) => onDraft(control.id, parseFloat(e.target.value))}
      />
      <div className="value-display">
        <span>
          {control.min} {control.unit}
        </span>
        <span>
          <strong>{displayValue}</strong> {control.unit}
        </span>
        <span>
          {control.max} {control.unit}
        </span>
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
  onApply,
  onApplyScenario,
  onReset,
  onTriggerFault,
  onMpc,
  mpcAuto = false,
  onToggleMpcAuto,
}) {
  const [showFormulas, setShowFormulas] = useState(false);
  const [showOutputs, setShowOutputs] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState(null);
  const [mpcResult, setMpcResult] = useState(null);
  const { draft, setDraftValue, discardDrafts, pending } =
    useDraftControls(controls);

  const activeScenarioId = simulation?.scenarioId ?? null;
  const hasPending = pending.length > 0;

  // Compute the MPC move and stage its first move as pending drafts for review.
  const runMpc = () => {
    if (!onMpc) return;
    const res = onMpc();
    setMpcResult(res);
    for (const r of res.recommendations) {
      if (r.changed) setDraftValue(r.controlId, r.recommendedValue);
    }
  };
  const mpcChanges = mpcResult?.recommendations.filter((r) => r.changed) ?? [];

  const groups = CHILLER_GROUP_ORDER.map((key) => ({
    key,
    label: CHILLER_GROUP_LABELS[key],
    items: controls.filter((c) => c.group === key),
  })).filter((g) => g.items.length > 0);

  const bv1 = equipment?.["bv-1"];
  const deltaT = headers
    ? Number((headers.chwr - headers.chws).toFixed(1))
    : simulation?.lastOutput?.deltaT;

  return (
    <div className="dc-control-panel ets-control-panel chiller-control-panel">
      <div className="control-group">
        <h4>Chiller Plant Controls</h4>
        <p className="ets-control-intro">
          L29 plant room — adjust controls then click{" "}
          <strong>Apply Changes</strong>. Hover a slider for its
          <strong> ƒ</strong> formula; click a label for details. See{" "}
          <code>docs/chiller-plant-controls-and-physics.md</code>.
        </p>
        <button
          type="button"
          className="ets-formula-toggle"
          onClick={() => setShowFormulas((s) => !s)}
        >
          {showFormulas ? "▾ Hide core formulas" : "▸ Show core formulas"}
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
              {showOutputs
                ? "▾ Hide schematic outputs"
                : "▸ Show schematic outputs"}
            </button>
            {showOutputs && (
              <div className="ets-derived-grid">
                {CHILLER_DERIVED_LABELS.map(({ key, label, unit }) => (
                  <div key={key} className="ets-derived-row">
                    <span>{label}</span>
                    <strong>
                      {headers[key]}
                      {unit ? ` ${unit}` : ""}
                    </strong>
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
            <ControlSlider
              key={control.id}
              control={control}
              draftValue={draft[control.id] ?? control.value}
              onDraft={setDraftValue}
            />
          ))}
        </div>
      ))}

      {onApplyScenario && (
        <div className="control-group" style={{ marginTop: "1.5rem" }}>
          <h4>Simulation scenarios</h4>
          <p className="ets-scenario-hint">
            Preset what-if cases — applies controls and fast-forwards virtual
            time.
          </p>
          <div className="ets-scenario-list">
            {CHILLER_SCENARIOS.map((scenario) => {
              const active = activeScenarioId === scenario.id;
              const open = expandedScenario === scenario.id;
              return (
                <div
                  key={scenario.id}
                  className={`ets-scenario-item ${active ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="ets-scenario-btn"
                    onClick={() => onApplyScenario(scenario.id)}
                    title={scenario.description}
                  >
                    {scenario.label}
                    {scenario.advanceSec > 0 ? (
                      <span className="ets-scenario-advance">
                        +{scenario.advanceSec}s
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="ets-scenario-info-btn"
                    onClick={() =>
                      setExpandedScenario(open ? null : scenario.id)
                    }
                    aria-expanded={open}
                    aria-label={`About ${scenario.label}`}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                  {open && (
                    <p className="ets-scenario-desc">{scenario.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onMpc && (
        <div className="control-group" style={{ marginTop: "1.5rem" }}>
          <h4>Model-Predictive Control</h4>
          <p className="ets-control-intro">
            Optimises setpoints to minimise predicted{" "}
            <strong>Efficiency</strong> (kW/RT) over a{" "}
            {mpcResult ? mpcResult.horizonSec : 40}s horizon, then stages the
            first move for you to review and Apply.
          </p>
          <button type="button" className="dc-run-btn" onClick={runMpc}>
            Compute MPC Move (kW/RT)
          </button>
          {onToggleMpcAuto && (
            <div className="dc-toggle-row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className={`dc-toggle-btn ${!mpcAuto ? "active" : ""}`}
                onClick={() => onToggleMpcAuto(false)}
              >
                Manual
              </button>
              <button
                type="button"
                className={`dc-toggle-btn ${mpcAuto ? "active" : ""}`}
                onClick={() => onToggleMpcAuto(true)}
                title="Applies the first MPC move every 2s tick (receding horizon)"
              >
                Auto (closed-loop)
              </button>
            </div>
          )}
          <p className="mpc-mode-hint">
            {mpcAuto
              ? "Auto — MPC drives setpoints automatically every tick (closed loop)."
              : "Manual — click Compute, review the staged move, then Apply."}
          </p>
          {mpcResult && (
            <div className="mpc-result">
              <div className="mpc-headline">
                <div className="mpc-kwrt">
                  <span className="mpc-kwrt-label">Predicted kW/RT</span>
                  <span className="mpc-kwrt-vals">
                    <span className="mpc-before">
                      {mpcResult.before.kwPerRt}
                    </span>
                    <span className="mpc-arrow">→</span>
                    <span className="mpc-after">{mpcResult.after.kwPerRt}</span>
                  </span>
                </div>
                <span
                  className={`mpc-badge ${mpcResult.savingsPct >= 0 ? "good" : "bad"}`}
                >
                  {mpcResult.savingsPct >= 0 ? "▼" : "▲"}{" "}
                  {Math.abs(mpcResult.savingsPct)}%
                </span>
              </div>
              <div className="mpc-sub">
                Plant {mpcResult.before.totalKw} → {mpcResult.after.totalKw} kW
                · load {Math.round(mpcResult.buildingLoadRt)} RT ·{" "}
                {mpcResult.horizonSec}s horizon
              </div>
              {mpcChanges.length > 0 ? (
                <ul className="mpc-moves">
                  {mpcChanges.map((r) => (
                    <li key={r.controlId} className="mpc-move">
                      <span className="mpc-move-label">{r.label}</span>
                      <span className="mpc-move-vals">
                        {r.currentValue} <span className="mpc-arrow">→</span>{" "}
                        <strong>{r.recommendedValue}</strong>
                        {r.unit ? ` ${r.unit}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mpc-note">
                  Already at the MPC optimum for current load — no change.
                </div>
              )}
              {!mpcResult.feasible && (
                <div className="mpc-warn">
                  ⚠ Predicted horizon trips a critical alarm.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        className="control-group ctrl-apply-group"
        style={{ marginTop: "1.5rem" }}
      >
        <h4>Simulation</h4>
        {hasPending && (
          <div className="ctrl-pending-summary">
            <strong>{pending.length}</strong> pending change
            {pending.length > 1 ? "s" : ""}:
            <ul>
              {pending.map((c) => (
                <li key={c.controlId}>
                  {c.label}: {c.oldValue} → {c.newValue}
                  {c.unit ? ` ${c.unit}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          className={`dc-run-btn ${hasPending ? "has-pending" : ""}`}
          onClick={() => onApply(pending)}
        >
          {hasPending
            ? `▶ Apply ${pending.length} Change${pending.length > 1 ? "s" : ""} & Run`
            : "▶ Run Simulation Step"}
        </button>
        {hasPending && (
          <button
            type="button"
            className="dc-reset-btn ctrl-discard-btn"
            onClick={discardDrafts}
          >
            ✕ Discard pending
          </button>
        )}
        <p className="dc-run-hint">
          Staged edits apply only when you click Apply · advances physics ~60s
          virtual time.
        </p>
        <button type="button" className="dc-reset-btn" onClick={onReset}>
          🔄 Reset to Baseline
        </button>
      </div>

      {onTriggerFault && (
        <div className="control-group">
          <h4>Fault injection</h4>
          <button
            type="button"
            className="dc-reset-btn"
            onClick={() => onTriggerFault("chiller_fault")}
          >
            ❄️ Chiller Fault (CH-3)
          </button>
          <button
            type="button"
            className="dc-reset-btn"
            onClick={() => onTriggerFault("pump_trip")}
          >
            💧 Pump Trip (CHWP-2)
          </button>
        </div>
      )}
    </div>
  );
}
