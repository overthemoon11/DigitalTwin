import React from 'react';

/**
 * Top-level plant asset buttons — switch middle viewer and right-panel controls.
 */
function PlantScenarioSwitcher({ activeScenario, onSelect }) {
  return (
    <div className="plant-scenario-switcher">
      <button
        type="button"
        className={`plant-scenario-btn plant-scenario-btn--chiller ${activeScenario === 'chiller' ? 'active' : ''}`}
        onClick={() => onSelect('chiller')}
      >
        <div className="plant-scenario-head">
          <span className="plant-scenario-icon">❄️</span>
          <span className="plant-scenario-label">Chiller Plant</span>
        </div>
      </button>
      <button
        type="button"
        className={`plant-scenario-btn plant-scenario-btn--heat ${activeScenario === 'heat_exchange' ? 'active' : ''}`}
        onClick={() => onSelect('heat_exchange')}
      >
        <div className="plant-scenario-head">
          <span className="plant-scenario-icon">🔄</span>
          <span className="plant-scenario-label">Heat Exchange Plant</span>
        </div>
      </button>
      <button
        type="button"
        className={`plant-scenario-btn plant-scenario-btn--ets ${activeScenario === 'ets' ? 'active' : ''}`}
        onClick={() => onSelect('ets')}
      >
        <div className="plant-scenario-head">
          <span className="plant-scenario-icon">🏢</span>
          <span className="plant-scenario-label">ETS Station (MBS)</span>
        </div>
      </button>
    </div>
  );
}

export default PlantScenarioSwitcher;
