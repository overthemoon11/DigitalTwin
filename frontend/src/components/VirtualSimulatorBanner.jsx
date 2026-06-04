import React, { useState } from 'react';

/**
 * Clarifies that the chiller plant is an offline physics simulator — not live BMS points.
 */
export default function VirtualSimulatorBanner({ simulation }) {
  const [expanded, setExpanded] = useState(false);

  if (!simulation) return null;

  const { tick, dtSeconds, simTimeSec, lastTrigger, cascadeTrace, mode, dataSource } = simulation;

  return (
    <div className="virtual-simulator-banner" role="status">
      <div className="virtual-simulator-banner__main">
        <span className="virtual-simulator-banner__badge">Virtual Simulator</span>
        <span className="virtual-simulator-banner__detail">
          {mode} · {dataSource} · no live sensors
        </span>
        <span className="virtual-simulator-banner__time">
          t = {simTimeSec}s (tick {tick}, Δt {dtSeconds}s)
        </span>
        <button
          type="button"
          className="virtual-simulator-banner__toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide cascade' : 'Show domino effect'}
        </button>
      </div>
      <p className="virtual-simulator-banner__trigger">
        <strong>Last input:</strong> {lastTrigger}
      </p>
      {expanded && cascadeTrace?.length > 0 && (
        <ol className="virtual-simulator-banner__cascade">
          {cascadeTrace.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
