import React, { useEffect, useState } from 'react';
import { useTwinStore } from './hooks/useTwinStore';
import { usePlantTelemetry } from './hooks/usePlantTelemetry';
import ChillerPlant2DView from './components/chiller/ChillerPlant2DView';
import PlantAssetTree from './components/PlantAssetTree';
import ControlPanel from './components/ControlPanel';
import KPIPanel from './components/KPIPanel';
import AlertPanel from './components/AlertPanel';
import CopilotChat from './components/CopilotChat';
import ModelStatusBanner from './components/ModelStatusBanner';
import './App.css';

function App() {
  const { twinState, plantState, selectedAsset, loadTwinState, selectAsset, isConnected } = useTwinStore();
  const [activePanel, setActivePanel] = useState('controls');

  useEffect(() => {
    loadTwinState();
  }, [loadTwinState]);

  usePlantTelemetry();

  if (!twinState) {
    return (
      <div className="loading">
        <h2>Loading Digital Twin...</h2>
        <p>Connecting to backend server...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>❄️ Chiller Plant Digital Twin</h1>
        <div className="header-info">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
          <span className="sim-time">
            Simulation: {new Date(twinState.metadata.simulationTime).toLocaleTimeString()}
          </span>
        </div>
      </header>

      {/* Model download / loading status banner */}
      <ModelStatusBanner />

      <div className="main-content">
        {/* Left Panel - Asset Tree */}
        <aside className="left-panel">
          <h3>Chiller Plant Assets</h3>
          <PlantAssetTree
            equipment={plantState?.equipment || {}}
            selectedAsset={selectedAsset}
            onSelectAsset={selectAsset}
          />
        </aside>

        {/* Center - 2D Chiller Plant SCADA */}
        <main className="viewer chiller-plant-viewer">
          {plantState ? (
            <ChillerPlant2DView
              equipment={plantState.equipment}
              headers={plantState.headers}
              selectedId={selectedAsset}
              onSelect={selectAsset}
            />
          ) : (
            <div className="loading" style={{ height: '100%' }}>
              <h2>Initializing plant telemetry…</h2>
            </div>
          )}
        </main>

        {/* Right Panel - Controls, KPIs, Alerts, Copilot */}
        <aside className="right-panel">
          <div className="panel-tabs">
            <button
              className={activePanel === 'controls' ? 'active' : ''}
              onClick={() => setActivePanel('controls')}
            >
              Controls
            </button>
            <button
              className={activePanel === 'kpis' ? 'active' : ''}
              onClick={() => setActivePanel('kpis')}
            >
              KPIs
            </button>
            <button
              className={activePanel === 'alerts' ? 'active' : ''}
              onClick={() => setActivePanel('alerts')}
            >
              Alerts ({(plantState?.alerts || twinState.alerts).filter(a => !a.resolved).length})
            </button>
            <button
              className={activePanel === 'copilot' ? 'active' : ''}
              onClick={() => setActivePanel('copilot')}
            >
              🤖 Copilot
            </button>
          </div>

          <div className="panel-content">
            {activePanel === 'controls' && (
              <ControlPanel
                controls={plantState?.controls || twinState.controls}
                selectedAsset={selectedAsset}
                assets={twinState.assets}
                plantMode
              />
            )}
            {activePanel === 'kpis' && (
              <KPIPanel kpis={plantState?.kpis || twinState.kpis} />
            )}
            {activePanel === 'alerts' && (
              <AlertPanel
                alerts={plantState?.alerts || twinState.alerts}
                assets={twinState.assets}
                plantEquipment={plantState?.equipment}
                plantMode
              />
            )}
            {activePanel === 'copilot' && (
              <CopilotChat />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
