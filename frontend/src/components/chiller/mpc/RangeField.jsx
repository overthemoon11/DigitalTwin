import React, { useState } from 'react';

/**
 * A min–max constraint on ONE quantity, rendered as one row.
 *
 * "Min Load" and "Max Load" are not two settings, they are the two ends of a
 * single allowed band, and splitting them across two rows made the panel twice
 * as long while hiding that relationship. Here the label is named once, the
 * unit is stated once, and the two bounds sit either side of a dash so the row
 * reads as the interval it is.
 *
 * Each input still carries its own accessible name — visually the label is
 * shared, but a screen reader needs to know which end it is on.
 */
function Bound({ value, decimals, step, disabled, invalid, onCommit, ariaLabel }) {
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
    <span className={`mpc-bound ${invalid ? 'mpc-bound--invalid' : ''}`}>
      <input
        className="scada-input"
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
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
  );
}

export default function RangeField({
  label,
  unit,
  step = 1,
  decimals = 1,
  disabled,
  minValue,
  maxValue,
  onCommitMin,
  onCommitMax,
  error,
}) {
  // A min > max error belongs to the pair, so it is reported once under the row
  // rather than duplicated against each end.
  const inverted = Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue > maxValue;
  const bad = !!error || inverted;

  return (
    <div className={`scada-row scada-row--range ${bad ? 'mpc-field--invalid' : ''}`}>
      <span className="scada-row-label">{label}</span>
      <span className="mpc-range">
        <Bound
          value={minValue}
          decimals={decimals}
          step={step}
          disabled={disabled}
          invalid={bad}
          onCommit={onCommitMin}
          ariaLabel={`${label} minimum`}
        />
        <span className="mpc-range-sep" aria-hidden="true">
          –
        </span>
        <Bound
          value={maxValue}
          decimals={decimals}
          step={step}
          disabled={disabled}
          invalid={bad}
          onCommit={onCommitMax}
          ariaLabel={`${label} maximum`}
        />
        {unit ? <span className="mpc-range-unit">{unit}</span> : null}
      </span>
      {bad ? (
        <span className="mpc-field-error">{error || 'minimum must be ≤ maximum'}</span>
      ) : null}
    </div>
  );
}
