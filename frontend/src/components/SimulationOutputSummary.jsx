import React from 'react';

/**
 * Highlights key physics results after a simulation step.
 */
export default function SimulationOutputSummary({
  buildingLoadRt,
  primaryDeltaT,
  secondaryDeltaT,
  deltaT,
  compact = false,
}) {
  const hasDistrict = primaryDeltaT != null && secondaryDeltaT != null;
  const hasChiller = deltaT != null && !hasDistrict;

  if (buildingLoadRt == null && !hasDistrict && !hasChiller) return null;

  return (
    <div className={`sim-output-summary${compact ? ' sim-output-summary--compact' : ''}`}>
      <h4 className="sim-output-summary__title">Simulation output</h4>
      <div
        className={`sim-output-summary__grid${hasDistrict ? ' sim-output-summary__grid--cols-3' : ''}`}
      >
        {buildingLoadRt != null && (
          <div className="sim-output-summary__item">
            <span className="sim-output-summary__label">Building load</span>
            <span className="sim-output-summary__value">{buildingLoadRt} RT</span>
          </div>
        )}
        {hasDistrict && (
          <>
            <div className="sim-output-summary__item">
              <span className="sim-output-summary__label">Primary ΔT</span>
              <span className="sim-output-summary__value">{primaryDeltaT} °C</span>
            </div>
            <div className="sim-output-summary__item">
              <span className="sim-output-summary__label">Secondary ΔT</span>
              <span className="sim-output-summary__value">{secondaryDeltaT} °C</span>
            </div>
          </>
        )}
        {hasChiller && (
          <div className="sim-output-summary__item">
            <span className="sim-output-summary__label">CHW ΔT</span>
            <span className="sim-output-summary__value">{deltaT} °C</span>
          </div>
        )}
      </div>
    </div>
  );
}
