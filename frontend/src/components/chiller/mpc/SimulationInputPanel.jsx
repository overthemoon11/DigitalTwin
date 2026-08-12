import React from 'react';
import NumberField from './NumberField';

/**
 * SECTION A — the disturbances. Building load and wet bulb are the conditions
 * the plant must serve and the MPC cannot manipulate; every controllable
 * quantity lives on the right (constraints) or in Optimal Control (results).
 */
export default function SimulationInputPanel({ input, onChange, disabled }) {
  const load = input?.buildingLoadRt;
  const wb = input?.wetBulbC;

  return (
    <section className="vsp-section mpc-section">
      <h4>Simulation Input</h4>
      <div className="scada-box-body mpc-input-body">
        <NumberField
          label="Building Load"
          value={load}
          unit="RT"
          step={10}
          decimals={0}
          disabled={disabled}
          onCommit={(v) => onChange({ buildingLoadRt: v })}
        />
        <NumberField
          label="Wet Bulb"
          value={wb}
          unit="°C"
          step={0.1}
          decimals={1}
          disabled={disabled}
          onCommit={(v) => onChange({ wetBulbC: v })}
        />
      </div>
      <p className="vsp-desc">
        Operating conditions the optimiser must serve. Not manipulated variables.
      </p>
    </section>
  );
}
