import React from 'react';

/**
 * Shared before → after table. Reuses the app's existing domino-effect table
 * styling (`.vsp-cascade-table`), so changed rows get the same blue highlight
 * the rest of the simulator already uses.
 *
 * A row may carry `provenance`, and when it does the After cell says how the
 * value was arrived at. This is not decoration: only some of the six control
 * variables are actually searched by the optimiser, and a row that merely
 * inherited the plant's current setpoint must not read like a computed optimum.
 */
const PROVENANCE_LABEL = {
  optimized: 'Optimised',
  derived: 'Derived',
  'baseline-derived': 'Inherited baseline',
  fixed: 'Fixed',
  'not-available': 'Not available',
};

const PROVENANCE_TITLE = {
  optimized: 'The optimiser searched this variable and chose this value.',
  derived:
    'Computed from an optimised variable through a documented model — genuinely ' +
    'responsive and included in the energy result, but not searched independently.',
  'baseline-derived':
    "Not optimised in this run — carried over from the plant's current operation.",
  fixed: 'Pinned by configuration; the optimiser was not allowed to move it.',
  'not-available':
    "The plant model cannot represent this variable's effect yet, so no value is proposed.",
};
export default function ComparisonTable({ rows, emptyHint }) {
  if (!rows?.length) {
    return <p className="vsp-desc">{emptyHint}</p>;
  }

  return (
    <table className="vsp-cascade-table mpc-compare">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.changed ? 'changed' : ''}>
            <td className="vsp-ct-param" title={r.note ?? undefined}>
              {r.label}
              {r.note ? <span className="mpc-note-mark">*</span> : null}
            </td>
            <td className={`vsp-ct-before ${r.wrap ? 'mpc-c-wrap' : ''}`}>{r.before}</td>
            <td className={`vsp-ct-after ${r.wrap ? 'mpc-c-wrap' : ''}`}>
              {r.after}
              {r.direction ? <span className={`mpc-arrow mpc-arrow--${r.direction}`}>{r.direction === 'up' ? '↑' : '↓'}</span> : null}
              {r.provenance ? (
                <span
                  className={`mpc-prov mpc-prov--${r.provenance}`}
                  title={PROVENANCE_TITLE[r.provenance] ?? ''}
                >
                  {PROVENANCE_LABEL[r.provenance] ?? r.provenance}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
