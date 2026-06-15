import React from 'react';
import { useTwinStore } from '../hooks/useTwinStore';

function ControlSlider({ control, onUpdate }) {
  const handleChange = (e) => {
    onUpdate(control.id, parseFloat(e.target.value));
  };
  
  const displayValue = control.value === null ? 'Auto' : control.value;
  
  return (
    <div className="control-item">
      <label>{control.label || control.controlType.replace(/([A-Z])/g, ' $1').trim()}</label>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value || control.min}
        onChange={handleChange}
      />
      <div className="value-display">
        <span>{control.min} {control.unit}</span>
        <span><strong>{displayValue}</strong> {control.unit}</span>
        <span>{control.max} {control.unit}</span>
      </div>
    </div>
  );
}

function ControlPanel({ controls, selectedAsset, assets, plantMode = false }) {
  const {
    updateControl,
    updatePlantControl,
    runSimulation,
    advancePlantSimulation,
    resetTwin,
    applyFault,
    resetPlant,
    triggerPlantFault,
  } = useTwinStore();
  
  const handleUpdate = async (controlId, value) => {
    if (plantMode) {
      updatePlantControl(controlId, value);
      return;
    }
    try {
      await updateControl(controlId, value);
    } catch (err) {
      console.error('Failed to update:', err);
    }
  };
  
  // Filter controls for selected asset or show global controls
  let displayControls = controls;
  let assetName = 'All Controls';
  
  if (selectedAsset && !plantMode) {
    displayControls = controls.filter(c => c.assetId === selectedAsset);
    const asset = assets.find(a => a.id === selectedAsset);
    assetName = asset?.name || selectedAsset;
  } else if (plantMode) {
    assetName = 'Chiller Plant Controls';
  }
  
  // Group controls by type
  const WATER_TEMP_TYPES = ['chwsSetpoint', 'chwrSetpoint', 'cwsSetpoint', 'cwrSetpoint'];
  const loadControls = displayControls.filter(c => c.controlType === 'buildingLoad');
  const envControls = displayControls.filter(c =>
    c.controlType === 'ambientTemperature' || c.controlType === 'humiditySetpoint'
  );
  const waterTempControls = WATER_TEMP_TYPES
    .map((type) => displayControls.find((c) => c.controlType === type))
    .filter(Boolean);
  const setpointControls = displayControls.filter(c => 
    c.controlType.includes('Setpoint') &&
    !c.controlType.includes('humidity') &&
    !WATER_TEMP_TYPES.includes(c.controlType)
  );
  const overrideControls = displayControls.filter(c => 
    c.controlType.includes('Override')
  );
  const otherControls = displayControls.filter(c => 
    c.controlType !== 'buildingLoad' &&
    c.controlType !== 'ambientTemperature' &&
    c.controlType !== 'humiditySetpoint' &&
    !WATER_TEMP_TYPES.includes(c.controlType) &&
    !c.controlType.includes('Setpoint') && !c.controlType.includes('Override')
  );
  
  return (
    <div>
      <div className="control-group">
        <h4>{assetName}</h4>
        {displayControls.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Select an asset to view its controls
          </p>
        )}
      </div>
      
      {loadControls.length > 0 && (
        <div className="control-group">
          <h4>Building load</h4>
          {loadControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {envControls.length > 0 && (
        <div className="control-group">
          <h4>Weather &amp; humidity</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Outdoor conditions scale effective cooling load and condenser difficulty.
          </p>
          {envControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {waterTempControls.length > 0 && (
        <div className="control-group">
          <h4>Water temperatures</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Supply and return setpoints for chilled and condenser water loops.
          </p>
          {waterTempControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {setpointControls.length > 0 && (
        <div className="control-group">
          <h4>Setpoints</h4>
          {setpointControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
      
      {overrideControls.length > 0 && (
        <div className="control-group">
          <h4>Overrides</h4>
          {overrideControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
      
      {otherControls.length > 0 && (
        <div className="control-group">
          <h4>Other</h4>
          {otherControls.map(control => (
            <ControlSlider
              key={control.id}
              control={control}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
      
      <div className="control-group" style={{ marginTop: '2rem' }}>
        <h4>Simulation</h4>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          {plantMode
            ? 'Advances the physics engine in 2s steps (temperatures lag over virtual time).'
            : 'Runs the building twin API simulation step.'}
        </p>
        <button
          onClick={() => (plantMode ? advancePlantSimulation(60) : runSimulation(60))}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: '0.5rem',
            background: 'var(--accent-light)',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          ⏩ Run Simulation Step
        </button>
        <button
          onClick={plantMode ? resetPlant : resetTwin}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: '0.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          🔄 Reset to Baseline
        </button>
      </div>
      
      <div className="control-group">
        <h4>Test Scenarios</h4>
        {plantMode ? (
          <>
            <button
              onClick={() => triggerPlantFault('chiller_fault')}
              style={scenarioBtnStyle}
            >
              ❄️ Chiller Fault (CH-29-3)
            </button>
            <button
              onClick={() => triggerPlantFault('pump_trip')}
              style={scenarioBtnStyle}
            >
              💧 Pump Trip (CHWP-29-2)
            </button>
            <button
              onClick={resetPlant}
              style={scenarioBtnStyle}
            >
              🔄 Reset Plant Controls
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => applyFault('high_occupancy', { zoneId: 'zone-meeting-001', occupancy: 12 })}
              style={scenarioBtnStyle}
            >
              📈 High Occupancy (Meeting A)
            </button>
            <button
              onClick={() => applyFault('filter_loading', { filterId: 'filter-ahu-001', loading: 0.8 })}
              style={scenarioBtnStyle}
            >
              🔲 Filter Loading (AHU-1)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const scenarioBtnStyle = {
  width: '100%',
  padding: '0.5rem',
  marginBottom: '0.25rem',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

export default ControlPanel;
