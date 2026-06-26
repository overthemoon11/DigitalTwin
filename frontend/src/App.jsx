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
import Ahu01StationView from './components/ahu/Ahu01StationView';
import AhuAssetTree from './components/ahu/AhuAssetTree';
import AhuKPIPanel from './components/ahu/AhuKPIPanel';
import AhuControlPanel from './components/ahu/AhuControlPanel';
import ChillerPlantControlPanel from './components/chiller/ChillerPlantControlPanel';
import ChillerKPIPanel from './components/chiller/ChillerKPIPanel';
import PlantScenarioSwitcher from './components/PlantScenarioSwitcher';
import LeftSidebarModeTabs from './components/leftSidebar/LeftSidebarModeTabs';
import VirtualSimulatorPanel from './components/leftSidebar/VirtualSimulatorPanel';
import DistrictCoolingControlPanel from './components/districtcooling/DistrictCoolingControlPanel';
import DistrictCoolingTwinTab from './components/districtcooling/DistrictCoolingTwinTab';
import KPIPanel from './components/KPIPanel';
import AlertPanel from './components/AlertPanel';
import CopilotChat from './components/CopilotChat';
import ModelStatusBanner from './components/ModelStatusBanner';
import './App.css';

function App() {
  const {
    twinState,
    plantState,
    districtCoolingState,
    etsState,
    ahuState,
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
    updateAhuControl,
    advanceAhu,
    applyAhuScenario,
    resetAhu,
    resetPlant,
    triggerPlantFault,
    updatePlantControl,
    advancePlantSimulation,
    applyChillerScenario,
  } = useTwinStore();
  const [activePanel, setActivePanel] = useState('controls');
  const [leftSidebarMode, setLeftSidebarMode] = useState('assets');
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
  const isAhuScenario = activePlantScenario === 'ahu';
  const scenarioState = isChillerScenario
    ? plantState
    : isEtsScenario
      ? etsState
      : isAhuScenario
        ? ahuState
        : districtCoolingState;
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
                  : isAhuScenario
                    ? '🌬️ AHU01 — Air Handling Unit (1F)'
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
              : isAhuScenario && ahuState?.simulation
                ? `Virtual t=${ahuState.simulation.simTimeSec}s`
                : isEtsScenario && etsState?.simulation
                  ? `Virtual t=${etsState.simulation.simTimeSec}s`
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
            <LeftSidebarModeTabs mode={leftSidebarMode} onModeChange={setLeftSidebarMode} />

            {leftSidebarMode === 'assets' ? (
              <>
                <PlantScenarioSwitcher
                  horizontal
                  activeScenario={activePlantScenario}
                  onSelect={setActivePlantScenario}
                />
                <h3>{isChillerScenario ? 'Chiller Plant Assets' : isEtsScenario ? 'ETS Station Assets' : isAhuScenario ? 'AHU01 Assets' : 'Heat Exchange Assets'}</h3>
                <div className="left-panel-assets">
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
                  ) : isAhuScenario ? (
                    <AhuAssetTree
                      equipment={ahuState?.equipment || {}}
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
                </div>
              </>
            ) : (
              <VirtualSimulatorPanel
                plantScenario={activePlantScenario}
                state={scenarioState}
              />
            )}
          </aside>

          <main className={`viewer ${isChillerScenario || isEtsScenario || isAhuScenario ? 'chiller-plant-viewer' : 'hx-plant-viewer'}`}>
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
            ) : isAhuScenario ? (
              ahuState ? (
                <Ahu01StationView
                  state={ahuState}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              ) : (
                <div className="loading" style={{ height: '100%' }}>
                  <h2>Initializing AHU01…</h2>
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
                <ChillerPlantControlPanel
                  controls={plantState?.controls || []}
                  headers={plantState?.headers}
                  simulation={plantState?.simulation}
                  equipment={plantState?.equipment}
                  onUpdate={updatePlantControl}
                  onRunSimulation={() => advancePlantSimulation(60)}
                  onApplyScenario={applyChillerScenario}
                  onReset={resetPlant}
                  onTriggerFault={triggerPlantFault}
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
              {activePanel === 'controls' && isAhuScenario && (
                <AhuControlPanel
                  controls={ahuState?.controls || []}
                  headers={ahuState?.headers}
                  chwCoil={ahuState?.chwCoil}
                  hwCoil={ahuState?.hwCoil}
                  saFan={ahuState?.saFan}
                  raFan={ahuState?.raFan}
                  dampers={ahuState?.dampers}
                  filters={ahuState?.filters}
                  simulation={ahuState?.simulation}
                  onUpdate={updateAhuControl}
                  onRunSimulation={() => advanceAhu(30)}
                  onApplyScenario={applyAhuScenario}
                  onReset={resetAhu}
                />
              )}
              {activePanel === 'controls' && !isChillerScenario && !isEtsScenario && !isAhuScenario && (
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
              {activePanel === 'kpis' && (isChillerScenario ? (
                <ChillerKPIPanel kpis={scenarioKpis} />
              ) : isEtsScenario ? (
                <EtsKPIPanel kpis={scenarioKpis} />
              ) : isAhuScenario ? (
                <AhuKPIPanel kpis={scenarioKpis} />
              ) : (
                <KPIPanel kpis={scenarioKpis} />
              ))}
              {activePanel === 'alerts' && (
                <AlertPanel
                  alerts={scenarioAlerts}
                  assets={twinState.assets}
                  plantEquipment={
                    isChillerScenario
                      ? plantState?.equipment
                      : isEtsScenario
                        ? etsState?.equipment
                        : isAhuScenario
                          ? ahuState?.equipment
                          : districtCoolingState?.equipment
                  }
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
