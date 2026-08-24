import React, { useState } from 'react';

/**
 * Compact numeric field matching the existing SCADA input styling
 * (`.scada-row--edit`). Commits on Enter/blur, reverts on Escape, and shows an
 * inline error message instead of a browser alert.
 */
export default function NumberField({
  label,
  value,
  unit,
  step = 1,
  decimals = 1,
  min,
  max,
  error,
  disabled,
  onCommit,
}) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;

  const shown =
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '';

  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    if (Number.isFinite(n)) onCommit(n);
    setDraft(null);
  };

  return (
    <div className={`scada-row scada-row--edit ${error ? 'mpc-field--invalid' : ''}`}>
      <span className="scada-row-label">{label}</span>
      <span className="scada-number-control">
        <span className="scada-input-wrap">
          <input
            className="scada-input"
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            disabled={disabled}
            value={editing ? draft : shown}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        </span>
        {unit ? <span className="scada-row-unit">{unit}</span> : null}
      </span>
      {error ? <span className="mpc-field-error">{error}</span> : null}
    </div>
  );
}
