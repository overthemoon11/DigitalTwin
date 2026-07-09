import React, { useEffect, useState } from "react";
import { useTwinStore } from "./hooks/useTwinStore";
import { usePlantTelemetry } from "./hooks/usePlantTelemetry";
import ChillerPlant2DView from "./components/chiller/ChillerPlant2DView";
import PlantAssetTree from "./components/PlantAssetTree";
import HeatExchangeAssetTree from "./components/heatexchange/HeatExchangeAssetTree";
import HeatExchangeViewer from "./components/heatexchange/HeatExchangeViewer";
import EtsStationView from "./components/ets/EtsStationView";
import EtsAssetTree from "./components/ets/EtsAssetTree";
import EtsKPIPanel from "./components/ets/EtsKPIPanel";
import EtsControlPanel from "./components/ets/EtsControlPanel";
import Ahu01StationView from "./components/ahu/Ahu01StationView";
import AhuAssetTree from "./components/ahu/AhuAssetTree";
import AhuKPIPanel from "./components/ahu/AhuKPIPanel";
import AhuControlPanel from "./components/ahu/AhuControlPanel";
import ChillerPlantControlPanel from "./components/chiller/ChillerPlantControlPanel";
import ChillerScadaPanel from "./components/chiller/ChillerScadaPanel";
import ChillerKPIPanel from "./components/chiller/ChillerKPIPanel";
import LeftSidebarModeTabs from "./components/leftSidebar/LeftSidebarModeTabs";
import VirtualSimulatorPanel from "./components/leftSidebar/VirtualSimulatorPanel";
import DistrictCoolingControlPanel from "./components/districtcooling/DistrictCoolingControlPanel";
import DistrictCoolingTwinTab from "./components/districtcooling/DistrictCoolingTwinTab";
import KPIPanel from "./components/KPIPanel";
import AlertPanel from "./components/AlertPanel";
import CopilotChat from "./components/CopilotChat";
import ModelStatusBanner from "./components/ModelStatusBanner";
import "./App.css";

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
    applyEtsChanges,
    applyEtsScenario,
    resetEts,
    updateAhuControl,
    advanceAhu,
    applyAhuChanges,
    applyAhuScenario,
    resetAhu,
    resetPlant,
    triggerPlantFault,
    updatePlantControl,
    advancePlantSimulation,
    applyPlantChanges,
    applyChillerScenario,
    computeMpcMove,
    mpcAuto,
    setMpcAuto,
  } = useTwinStore();
  const [activePanel, setActivePanel] = useState("controls");
  const [leftSidebarMode, setLeftSidebarMode] = useState("assets");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
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
    selectAsset("dcs-plant");
  };

  const openPlantScenario = (scenario) => {
    setActiveAppTab("chiller_plant");
    setActivePlantScenario(scenario);
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

  const isChillerScenario = activePlantScenario === "chiller";
  const isEtsScenario = activePlantScenario === "ets";
  const isAhuScenario = activePlantScenario === "ahu";
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
          <button
            type="button"
            className="header-sidebar-open"
            onClick={() => setLeftSidebarOpen((open) => !open)}
            aria-label={leftSidebarOpen ? "Close left sidebar" : "Open left sidebar"}
            aria-expanded={leftSidebarOpen}
            title={leftSidebarOpen ? "Close left sidebar" : "Open left sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi bi-list"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"
              />
            </svg>
          </button>
          <h1>Digital Twin</h1>
          <div className="app-view-tabs">
            <button
              type="button"
              className={`app-view-tab ${activeAppTab === "chiller_plant" && isChillerScenario ? "active" : ""}`}
              onClick={() => openPlantScenario("chiller")}
            >
              Chiller Plant
            </button>
            <button
              type="button"
              className={`app-view-tab ${activeAppTab === "chiller_plant" && isEtsScenario ? "active" : ""}`}
              onClick={() => openPlantScenario("ets")}
            >
              ETS Station
            </button>
            <button
              type="button"
              className={`app-view-tab ${activeAppTab === "chiller_plant" && isAhuScenario ? "active" : ""}`}
              onClick={() => openPlantScenario("ahu")}
            >
              AHU
            </button>
          </div>
        </div>
        <div className="header-info">
          {/* <span className="plant-mode-badge">Physics · offline</span> */}
          <span
            className={`connection-status ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? "Chatbot API" : "API offline"}
          </span>
          <button
            type="button"
            className="header-right-sidebar-toggle"
            onClick={() => setRightSidebarOpen((open) => !open)}
            aria-label={rightSidebarOpen ? "Close right sidebar" : "Open right sidebar"}
            aria-expanded={rightSidebarOpen}
            title={rightSidebarOpen ? "Close right sidebar" : "Open right sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi bi-three-dots-vertical"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
            </svg>
          </button>
          {/* <span className="sim-time">
            {activeAppTab === "district_cooling" &&
            districtCoolingState?.simulation
              ? `Virtual t=${districtCoolingState.simulation.simTimeSec}s`
              : isAhuScenario && ahuState?.simulation
                ? `Virtual t=${ahuState.simulation.simTimeSec}s`
                : isEtsScenario && etsState?.simulation
                  ? `Virtual t=${etsState.simulation.simTimeSec}s`
                  : plantState?.simulation
                    ? `Virtual t=${plantState.simulation.simTimeSec}s`
                    : `Wall: ${new Date(twinState.metadata.simulationTime).toLocaleTimeString()}`}
          </span> */}
        </div>
      </header>

      <ModelStatusBanner />

      {activeAppTab === "district_cooling" ? (
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
          <aside className={`left-panel ${leftSidebarOpen ? "" : "left-panel--collapsed"}`}>
            {leftSidebarOpen && (
              <>
                <LeftSidebarModeTabs
                  mode={leftSidebarMode}
                  onModeChange={setLeftSidebarMode}
                />

                {leftSidebarMode === "assets" ? (
                  <>
                    <h3>
                      {isChillerScenario
                        ? "Chiller Plant Assets"
                        : isEtsScenario
                          ? "ETS Station Assets"
                          : isAhuScenario
                            ? "AHU01 Assets"
                            : "Heat Exchange Assets"}
                    </h3>
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
              </>
            )}
          </aside>

          <main
            className={`viewer ${isChillerScenario || isEtsScenario || isAhuScenario ? "chiller-plant-viewer" : "hx-plant-viewer"}`}
          >
            {isChillerScenario ? (
              plantState ? (
                <ChillerPlant2DView
                  equipment={plantState.equipment}
                  headers={plantState.headers}
                  kpis={plantState.kpis}
                  selectedId={selectedAsset}
                  onSelect={selectAsset}
                />
              ) : (
                <div className="loading" style={{ height: "100%" }}>
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
                <div className="loading" style={{ height: "100%" }}>
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
                <div className="loading" style={{ height: "100%" }}>
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
              <div className="loading" style={{ height: "100%" }}>
                <h2>Initializing heat exchange plant…</h2>
              </div>
            )}
          </main>

          <aside className={`right-panel ${isChillerScenario ? "right-panel--scada" : ""} ${rightSidebarOpen ? "" : "right-panel--collapsed"}`}>
            {rightSidebarOpen && (isChillerScenario ? (
              /* T1 SCADA control panel — replaces the Controls/KPIs/Alerts/Chatbot
                 tabs for the chiller plant (those panels are kept but hidden). */
              <div className="panel-content scada-panel-content">
                <ChillerScadaPanel
                  plantState={plantState}
                  onSet={updatePlantControl}
                />
              </div>
            ) : (
              <>
            <div className="panel-tabs">
              <button
                type="button"
                className={activePanel === "controls" ? "active" : ""}
                onClick={() => setActivePanel("controls")}
              >
                Controls
              </button>
              <button
                type="button"
                className={activePanel === "kpis" ? "active" : ""}
                onClick={() => setActivePanel("kpis")}
              >
                KPIs
              </button>
              <button
                type="button"
                className={activePanel === "alerts" ? "active" : ""}
                onClick={() => setActivePanel("alerts")}
              >
                Alerts ({activeAlertCount})
              </button>
              <button
                type="button"
                className={activePanel === "copilot" ? "active" : ""}
                onClick={() => setActivePanel("copilot")}
              >
                🤖 Chatbot
              </button>
            </div>

            <div className="panel-content">
              {activePanel === "controls" && isChillerScenario && (
                <ChillerPlantControlPanel
                  controls={plantState?.controls || []}
                  headers={plantState?.headers}
                  simulation={plantState?.simulation}
                  equipment={plantState?.equipment}
                  onApply={applyPlantChanges}
                  onApplyScenario={applyChillerScenario}
                  onReset={resetPlant}
                  onTriggerFault={triggerPlantFault}
                  onMpc={computeMpcMove}
                  mpcAuto={mpcAuto}
                  onToggleMpcAuto={setMpcAuto}
                />
              )}
              {activePanel === "controls" && isEtsScenario && (
                <EtsControlPanel
                  controls={etsState?.controls || []}
                  headers={etsState?.headers}
                  valves={etsState?.valves}
                  meter={etsState?.meter}
                  simulation={etsState?.simulation}
                  onApply={applyEtsChanges}
                  onApplyScenario={applyEtsScenario}
                  onReset={resetEts}
                />
              )}
              {activePanel === "controls" && isAhuScenario && (
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
                  onApply={applyAhuChanges}
                  onApplyScenario={applyAhuScenario}
                  onReset={resetAhu}
                />
              )}
              {activePanel === "controls" &&
                !isChillerScenario &&
                !isEtsScenario &&
                !isAhuScenario && (
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
              {activePanel === "kpis" &&
                (isChillerScenario ? (
                  <ChillerKPIPanel kpis={scenarioKpis} />
                ) : isEtsScenario ? (
                  <EtsKPIPanel kpis={scenarioKpis} />
                ) : isAhuScenario ? (
                  <AhuKPIPanel kpis={scenarioKpis} />
                ) : (
                  <KPIPanel kpis={scenarioKpis} />
                ))}
              {activePanel === "alerts" && (
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
              {activePanel === "copilot" && <CopilotChat />}
            </div>
              </>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
