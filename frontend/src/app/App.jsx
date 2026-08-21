import React, { useEffect, useState } from "react";
import { useTwinStore } from "../store/useTwinStore";
import { usePlantTelemetry } from "../hooks/usePlantTelemetry";
import ChillerPlant2DView from "../components/chiller/ChillerPlant2DView";
import PlantAssetTree from "../components/chiller/PlantAssetTree";
import HeatExchangeAssetTree from "../components/heatexchange/HeatExchangeAssetTree";
import HeatExchangeViewer from "../components/heatexchange/HeatExchangeViewer";
import EtsStationView from "../components/ets/EtsStationView";
import EtsAssetTree from "../components/ets/EtsAssetTree";
import EtsKPIPanel from "../components/ets/EtsKPIPanel";
import EtsControlPanel from "../components/ets/EtsControlPanel";
import Ahu01StationView from "../components/ahu/Ahu01StationView";
import AhuAssetTree from "../components/ahu/AhuAssetTree";
import AhuKPIPanel from "../components/ahu/AhuKPIPanel";
import AhuControlPanel from "../components/ahu/AhuControlPanel";
import ChillerScadaPanel from "../components/chiller/ChillerScadaPanel";
import ChillerPointsList from "../components/chiller/ChillerPointsList";
import ChillerKPIPanel from "../components/chiller/ChillerKPIPanel";
import VirtualSimulatorPanel from "../components/leftSidebar/VirtualSimulatorPanel";
import MpcLeftSidebar from "../features/mpc/components/MpcLeftSidebar";
import ChillerSidePanel from "../components/chiller/ChillerSidePanel";
import DistrictCoolingControlPanel from "../components/districtcooling/DistrictCoolingControlPanel";
import DistrictCoolingTwinTab from "../components/districtcooling/DistrictCoolingTwinTab";
import KPIPanel from "../components/common/KPIPanel";
import AlertPanel from "../components/common/AlertPanel";
import CopilotChat from "../components/common/CopilotChat";
import HeaderSidebarToggle from "../components/layout/HeaderSidebarToggle";
import SidebarModeRail from "../components/layout/SidebarModeRail";
import "./App.css";
import "../features/mpc/mpc.css";

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
    applyChillerScenarioPayload,
    togglePlantDuty,
    computeMpcMove,
    mpcAuto,
    setMpcAuto,
    mpcInput,
    mpcBaselineControl,
    mpcConstraints,
    mpcConstraintErrors,
    mpcResult,
    mpcStatus,
    mpcProgress,
    mpcError,
    mpcApplied,
    horizonConfig,
    horizonMode,
    horizonDay,
    horizonSteps,
    horizonForecast,
    horizonRun,
    horizonStatus,
    horizonError,
    horizonModelStatus,
    twinValidation,
    initHorizon,
    setHorizonScenario,
    loadTwinValidation,
    runHorizonMpc,
    initMpcFromPlant,
    setMpcInput,
    setMpcConstraint,
    setMpcChillerFleet,
    setMpcAvailableChillers,
    resetMpcConstraints,
    runMpcSimulation,
    cancelMpc,
    restoreMpcBaseline,
    reapplyMpcOptimum,
  } = useTwinStore();
  const [activePanel, setActivePanel] = useState("controls");
  const [leftSidebarMode, setLeftSidebarMode] = useState("mpc");
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

  const selectLeftSidebarMode = (nextMode) => {
    const isSameMode = nextMode === leftSidebarMode;
    setLeftSidebarMode(nextMode);
    setLeftSidebarOpen((open) => (isSameMode ? !open : true));
  };

  usePlantTelemetry();

  // The live BEFORE control state. Derived server-side and delivered on the
  // same WebSocket frame as the plant state, so the frontend never re-derives
  // it and the two can never disagree.
  const mpcLiveBaseline = mpcBaselineControl;

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
  // The MPC sidebar only exists for the chiller plant; other scenarios fall
  // back to their asset tree rather than showing an empty rail slot.
  const effectiveLeftMode =
    leftSidebarMode === "mpc" && !isChillerScenario ? "assets" : leftSidebarMode;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <HeaderSidebarToggle
            isOpen={leftSidebarOpen}
            onToggle={() => setLeftSidebarOpen((open) => !open)}
          />
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
              Distrinct Cooling
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
          {/* Status brief link hidden — page still served at /docs/status.html
          <a
            className="header-doc-link"
            href="/docs/status.html"
            target="_blank"
            rel="noreferrer"
            title="Digital twin status brief — calibration, validation & roadmap"
          >
            📊 Status
          </a> */}
          <a
            className="header-doc-link"
            href="/docs/user-guide.html"
            target="_blank"
            rel="noreferrer"
            title="User manual — how to use this app"
          >
            📖 Guide
          </a>
          <span
            className={`connection-status ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? "Chatbot API" : "API offline"}
          </span>
          <button
            type="button"
            className="header-right-sidebar-toggle"
            onClick={() => setRightSidebarOpen((open) => !open)}
            aria-label={
              isChillerScenario
                ? rightSidebarOpen
                  ? "Close constraints panel"
                  : "Open constraints panel"
                : rightSidebarOpen
                  ? "Close right sidebar"
                  : "Open right sidebar"
            }
            aria-expanded={rightSidebarOpen}
            title={
              rightSidebarOpen ? "Close right sidebar" : "Open right sidebar"
            }
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
          {leftSidebarOpen && (
            <SidebarModeRail
              mode={effectiveLeftMode}
              sidebarOpen={leftSidebarOpen}
              onModeSelect={selectLeftSidebarMode}
              showMpc={isChillerScenario}
            />
          )}
          <aside
            className={`left-panel ${leftSidebarOpen ? "" : "left-panel--collapsed"}`}
          >
            {leftSidebarOpen && (
              <>
                {effectiveLeftMode === "mpc" ? (
                  <MpcLeftSidebar
                    input={mpcInput}
                    scenario={{
                      mode: horizonMode,
                      day: horizonDay,
                      steps: horizonSteps,
                      forecast: horizonForecast,
                    }}
                    config={horizonConfig}
                    run={horizonRun}
                    status={horizonStatus}
                    modelStatus={horizonModelStatus}
                    twinValidation={twinValidation}
                    applied={mpcApplied}
                    onInit={initMpcFromPlant}
                    onInitHorizon={initHorizon}
                    onChangeInput={setMpcInput}
                    onChangeScenario={setHorizonScenario}
                    onLoadValidation={loadTwinValidation}
                    onRestoreBaseline={restoreMpcBaseline}
                    onReapplyOptimum={reapplyMpcOptimum}
                  />
                ) : effectiveLeftMode === "assets" ? (
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

          {/* Second docked panel. For the chiller plant both sidebars sit on
              the left, side by side: results rail, then this constraints/run
              rail, then the schematic. Mounted here rather than reordered with
              CSS so DOM order matches visual order for keyboard and screen
              readers. Other scenarios keep it on the right (below). */}
          {isChillerScenario && (
            <aside
              className={`right-panel right-panel--scada right-panel--docked-left ${
                rightSidebarOpen ? "" : "right-panel--collapsed"
              }`}
            >
              {rightSidebarOpen && (
                <ChillerSidePanel
                  plantState={plantState}
                  mpcConstraints={mpcConstraints}
                  mpcConstraintErrors={mpcConstraintErrors}
                  horizonStatus={horizonStatus}
                  horizonRun={horizonRun}
                  horizonError={horizonError}
                  onSetConstraint={setMpcConstraint}
                  onSetFleet={setMpcChillerFleet}
                  onSetAvailable={setMpcAvailableChillers}
                  onResetConstraints={resetMpcConstraints}
                  onRun={runHorizonMpc}
                  onUpdateControl={updatePlantControl}
                  onToggleDuty={togglePlantDuty}
                  onApplyScenario={applyChillerScenario}
                  onApplyScenarioPayload={applyChillerScenarioPayload}
                />
              )}
            </aside>
          )}

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

          {/* Non-chiller scenarios keep their right-hand panel. The chiller
              plant renders nothing here — `hidden` alone is not enough, since
              .right-panel sets display:flex and a class selector beats the UA
              [hidden] rule, leaving a 360px phantom column stealing width. */}
          {!isChillerScenario && (
          <aside
            className={`right-panel ${rightSidebarOpen ? "" : "right-panel--collapsed"}`}
          >
            {rightSidebarOpen && (
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
                    {/* The chiller plant no longer renders here: its panels live in
                        the left column. The former ChillerPlantControlPanel
                        block was unreachable anyway (it required
                        isChillerScenario inside the non-chiller arm of the same
                        ternary) and is archived under archive/legacy/. */}
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
            )}
          </aside>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
