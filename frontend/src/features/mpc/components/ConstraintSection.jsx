import React, { useState } from 'react';

/**
 * One constraint group.
 *
 * Two presentations, because the same fields are read in two very different
 * places. In a narrow drawer the full constraint set is far too long to show at
 * once, so groups collapse. In the Engineering workspace there is room to lay
 * them out as cards in a grid, and collapsing them there would hide the whole
 * point of giving constraints a workspace — so `alwaysOpen` drops the toggle
 * and renders a plain card heading instead.
 */
export default function ConstraintSection({
  title,
  defaultOpen = false,
  invalidCount = 0,
  alwaysOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (alwaysOpen) {
    return (
      <section className="tw-card tw-card--pad eng-constraint-card eng-fields">
        <h3>
          <span>{title}</span>
          {invalidCount > 0 && <span className="eng-invalid-badge">{invalidCount}</span>}
        </h3>
        <div>{children}</div>
      </section>
    );
  }

  return (
    <div className={`scada-box mpc-constraint-box ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="scada-box-title mpc-constraint-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mpc-chevron">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {invalidCount > 0 && <span className="mpc-invalid-badge">{invalidCount}</span>}
      </button>
      {open && <div className="scada-box-body">{children}</div>}
    </div>
  );
}
