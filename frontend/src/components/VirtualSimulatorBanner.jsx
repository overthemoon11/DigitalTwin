import React, { useState } from 'react';
import SimulationOutputSummary from './SimulationOutputSummary';

/**
 * Clarifies that the chiller plant is an offline physics simulator — not live BMS points.
 */
export default function VirtualSimulatorBanner({ simulation }) {
  const [expanded, setExpanded] = useState(false);

  if (!simulation) return null;

  const { lastTrigger, cascadeTrace, lastOutput } = simulation;

  return (
    <div className="virtual-simulator-banner" role="status">
      <div className="virtual-simulator-banner__main">
        <span className="virtual-simulator-banner__badge">Virtual Simulator</span>
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
      {lastOutput && (
        <SimulationOutputSummary
          compact
          buildingLoadRt={lastOutput.buildingLoadRt}
          primaryDeltaT={lastOutput.primaryDeltaT}
          secondaryDeltaT={lastOutput.secondaryDeltaT}
          deltaT={lastOutput.deltaT}
        />
      )}
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
