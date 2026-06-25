import React from 'react';

/**
 * Plant scenario buttons — horizontal scroll row in the left sidebar.
 */
function PlantScenarioSwitcher({ activeScenario, onSelect, horizontal = false }) {
  return (
    <div className={`plant-scenario-switcher${horizontal ? ' plant-scenario-switcher--scroll' : ''}`}>
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
