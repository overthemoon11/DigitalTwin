import React from 'react';

/**
 * Shared before → after table. Reuses the app's existing domino-effect table
 * styling (`.vsp-cascade-table`), so changed rows get the same blue highlight
 * the rest of the simulator already uses.
 */
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
            <td className="vsp-ct-param">{r.label}</td>
            <td className={`vsp-ct-before ${r.wrap ? 'mpc-c-wrap' : ''}`}>{r.before}</td>
            <td className={`vsp-ct-after ${r.wrap ? 'mpc-c-wrap' : ''}`}>
              {r.after}
              {r.direction ? <span className={`mpc-arrow mpc-arrow--${r.direction}`}>{r.direction === 'up' ? '↑' : '↓'}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
