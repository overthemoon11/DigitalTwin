import React, { useState } from 'react';

/**
 * Collapsible constraint group. The right sidebar is 300 px wide and the full
 * constraint set is long, so groups collapse; the ones an operator touches most
 * (chiller, system) default open.
 */
export default function ConstraintSection({ title, defaultOpen = false, invalidCount = 0, children }) {
  const [open, setOpen] = useState(defaultOpen);

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
