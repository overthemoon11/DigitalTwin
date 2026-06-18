import React from 'react';

/**
 * Top-level plant asset buttons — switch middle viewer and right-panel controls.
 */
function PlantScenarioSwitcher({ activeScenario, onSelect }) {
  return (
    <div className="plant-scenario-switcher">
      <button
        type="button"
        className={`plant-scenario-btn ${activeScenario === 'chiller' ? 'active' : ''}`}
        onClick={() => onSelect('chiller')}
      >
        <span className="plant-scenario-icon">❄️</span>
        <span className="plant-scenario-label">Chiller Plant</span>
        <span className="plant-scenario-desc">On-site chillers &amp; towers</span>
      </button>
      <button
        type="button"
        className={`plant-scenario-btn ${activeScenario === 'heat_exchange' ? 'active' : ''}`}
        onClick={() => onSelect('heat_exchange')}
      >
        <span className="plant-scenario-icon">🔄</span>
        <span className="plant-scenario-label">Heat Exchange Plant</span>
        <span className="plant-scenario-desc">District cooling + plate HX</span>
      </button>
    </div>
  );
}

export default PlantScenarioSwitcher;
