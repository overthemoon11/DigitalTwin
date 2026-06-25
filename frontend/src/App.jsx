import React, { useEffect, useState } from 'react';
import { useTwinStore } from './hooks/useTwinStore';
import { usePlantTelemetry } from './hooks/usePlantTelemetry';
import ChillerPlant2DView from './components/chiller/ChillerPlant2DView';
import PlantAssetTree from './components/PlantAssetTree';
import HeatExchangeAssetTree from './components/heatexchange/HeatExchangeAssetTree';
import HeatExchangeViewer from './components/heatexchange/HeatExchangeViewer';
import EtsStationView from './components/ets/EtsStationView';
import EtsAssetTree from './components/ets/EtsAssetTree';
import EtsKPIPanel from './components/ets/EtsKPIPanel';
import EtsControlPanel from './components/ets/EtsControlPanel';
import PlantScenarioSwitcher from './components/PlantScenarioSwitcher';
import ControlPanel from './components/ControlPanel';
import DistrictCoolingControlPanel from './components/districtcooling/DistrictCoolingControlPanel';
import DistrictCoolingTwinTab from './components/districtcooling/DistrictCoolingTwinTab';
import KPIPanel from './components/KPIPanel';
import AlertPanel from './components/AlertPanel';
import CopilotChat from './components/CopilotChat';
import ModelStatusBanner from './components/ModelStatusBanner';
import VirtualSimulatorBanner from './components/VirtualSimulatorBanner';
import './App.css';

function App() {
  const {
    twinState,
    plantState,
    districtCoolingState,
    etsState,
    activeAppTab,
    activePlantScenario,
    selectedAsset,
    loadTwinState,
    selectAsset,
    setActiveAppTab,
    setActivePlantScenario,
    isConnected,
    updateDistrictControl,
    advanceDistrictCooling,
    resetDistrictCooling,
    updateEtsControl,
    advanceEts,
    applyEtsScenario,
    resetEts,
  } = useTwinStore();
  const [activePanel, setActivePanel] = useState('controls');
  const [hxEtsBuildingId, setHxEtsBuildingId] = useState(null);

  useEffect(() => {
    loadTwinState();
  }, [loadTwinState]);

  useEffect(() => {
    setHxEtsBuildingId(null);
  }, [activePlantScenario]);

  const selectHxSidebarAsset = (assetId) => {
    setHxEtsBuildingId(null);
    selectAsset(assetId);
  };

  const exitHxEts = () => {
    setHxEtsBuildingId(null);
    selectAsset('dcs-plant');
  };

  usePlantTelemetry();

  if (!twinState) {
    return (
      <div className="loading">
        <h2>Loading Digital Twin...</h2>
        <p>Connecting to backend server...</p>
      </div>
    );
  }

  const isChillerScenario = activePlantScenario === 'chiller';
  const isEtsScenario = activePlantScenario === 'ets';
  const scenarioState = isChillerScenario ? plantState : isEtsScenario ? etsState : districtCoolingState;
  const scenarioAlerts = scenarioState?.alerts || twinState.alerts;
  const scenarioKpis = scenarioState?.kpis || twinState.kpis;
  const activeAlertCount = scenarioAlerts.filter((a) => !a.resolved).length;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>
            {activeAppTab === 'district_cooling'
              ? '🏙️ District Cooling Digital Twin'
              : isChillerScenario
                ? '❄️ Chiller Plant Virtual Simulator'
                : isEtsScenario
                  ? '🏢 ETS Heat-Exchange Station — MBS A-B03-01'
                  : '🔄 Heat Exchange Plant Simulator'}
          </h1>
          <div className="app-view-tabs">
            <button
              type="button"
              className={`app-view-tab ${activeAppTab === 'chiller_plant' ? 'active' : ''}`}
              onClick={() => setActiveAppTab('chiller_plant')}
            >
              Chiller / HX Plant
            </button>
            <button
              type="button"
              className={`app-view-tab ${activeAppTab === 'district_cooling' ? 'active' : ''}`}
              onClick={() => setActiveAppTab('district_cooling')}
            >
              District Cooling Twin
            </button>
          </div>
        </div>
        <div className="header-info">
          <span className="plant-mode-badge">Physics · offline</span>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Chatbot API' : '○ API offline'}
          </span>
          <span className="sim-time">
            {activeAppTab === 'district_cooling' && districtCoolingState?.simulation
              ? `Virtual t=${districtCoolingState.simulation.simTimeSec}s`
              : plantState?.simulation
                ? `Virtual t=${plantState.simulation.simTimeSec}s`
                : `Wall: ${new Date(twinState.metadata.simulationTime).toLocaleTimeString()}`}
          </span>
        </div>
      </header>

      <ModelStatusBanner />

      {activeAppTab === 'district_cooling' ? (
        <DistrictCoolingTwinTab
          districtState={districtCoolingState}
          selectedAsset={selectedAsset}
          onSelectAsset={selectAsset}
          onUpdateControl={updateDistrictControl}
          onRunSimulation={() => advanceDistrictCooling(30)}
          onReset={resetDistrictCooling}
        />
      ) : (
        <div className="main-content">
          <aside className="left-panel">
            <VirtualSimulatorBanner simulation={scenarioState?.simulation} />
            <PlantScenarioSwitcher
              activeScenario={activePlantScenario}
              onSelect={setActivePlantScenario}
            />
            <h3>{isChillerScenario ? 'Chiller Plant Assets' : isEtsScenario ? 'ETS Station Assets' : 'Heat Exchange Assets'}</h3>
            {isChillerScenario ? (
              <PlantAssetTree
                equipment={plantState?.equipment || {}}
                selectedAsset={selectedAsset}
                onSelectAsset={selectAsset}
              />
            ) : isEtsScenario ? (
              <EtsAssetTree
                equipment={etsState?.equipment || {}}
                selectedAsset={selectedAsset}
                onSelectAsset={selectAsset}
              />
            ) : (
              <HeatExchangeAssetTree
                equipment={districtCoolingState?.equipment || {}}
                selectedAsset={selectedAsset}
                onSelectAsset={selectHxSidebarAsset}
              />
            )}
          </aside>

          <main className={`viewer ${isChillerScenario ? 'chiller-plant-viewer' : 'hx-plant-viewer'}`}>
            {isChillerScenario ? (
              plantState ? (
                <ChillerPlant2DView
                  equipment={plantState.equipment}
                  headers={plantState.headers}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              ) : (
                <div className="loading" style={{ height: '100%' }}>
                  <h2>Initializing chiller plant…</h2>
                </div>
              )
            ) : isEtsScenario ? (
              etsState ? (
                <EtsStationView
                  state={etsState}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              ) : (
                <div className="loading" style={{ height: '100%' }}>
                  <h2>Initializing ETS station…</h2>
                </div>
              )
            ) : districtCoolingState ? (
              <HeatExchangeViewer
                headers={districtCoolingState.headers}
                buildings={districtCoolingState.buildings}
                selectedId={selectedAsset}
                onSelect={selectAsset}
                etsBuildingId={hxEtsBuildingId}
                onDrillToEts={setHxEtsBuildingId}
                onExitEts={exitHxEts}
              />
            ) : (
              <div className="loading" style={{ height: '100%' }}>
                <h2>Initializing heat exchange plant…</h2>
              </div>
            )}
          </main>

          <aside className="right-panel">
            <div className="panel-tabs">
              <button
                type="button"
                className={activePanel === 'controls' ? 'active' : ''}
                onClick={() => setActivePanel('controls')}
              >
                Controls
              </button>
              <button
                type="button"
                className={activePanel === 'kpis' ? 'active' : ''}
                onClick={() => setActivePanel('kpis')}
              >
                KPIs
              </button>
              <button
                type="button"
                className={activePanel === 'alerts' ? 'active' : ''}
                onClick={() => setActivePanel('alerts')}
              >
                Alerts ({activeAlertCount})
              </button>
              <button
                type="button"
                className={activePanel === 'copilot' ? 'active' : ''}
                onClick={() => setActivePanel('copilot')}
              >
                🤖 Chatbot
              </button>
            </div>

            <div className="panel-content">
              {activePanel === 'controls' && isChillerScenario && (
                <ControlPanel
                  controls={plantState?.controls || twinState.controls}
                  selectedAsset={selectedAsset}
                  assets={twinState.assets}
                  plantMode
                />
              )}
              {activePanel === 'controls' && isEtsScenario && (
                <EtsControlPanel
                  controls={etsState?.controls || []}
                  headers={etsState?.headers}
                  valves={etsState?.valves}
                  meter={etsState?.meter}
                  simulation={etsState?.simulation}
                  onUpdate={updateEtsControl}
                  onRunSimulation={() => advanceEts(30)}
                  onApplyScenario={applyEtsScenario}
                  onReset={resetEts}
                />
              )}
              {activePanel === 'controls' && !isChillerScenario && !isEtsScenario && (
                <DistrictCoolingControlPanel
                  controls={districtCoolingState?.controls || []}
                  headers={districtCoolingState?.headers}
                  simulation={districtCoolingState?.simulation}
                  onUpdate={updateDistrictControl}
                  onRunSimulation={() => advanceDistrictCooling(30)}
                  onReset={resetDistrictCooling}
                  compact
                />
              )}
              {activePanel === 'kpis' && (isEtsScenario ? (
                <EtsKPIPanel kpis={scenarioKpis} />
              ) : (
                <KPIPanel kpis={scenarioKpis} />
              ))}
              {activePanel === 'alerts' && (
                <AlertPanel
                  alerts={scenarioAlerts}
                  assets={twinState.assets}
                  plantEquipment={isChillerScenario ? plantState?.equipment : isEtsScenario ? etsState?.equipment : districtCoolingState?.equipment}
                  plantMode
                />
              )}
              {activePanel === 'copilot' && <CopilotChat />}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
