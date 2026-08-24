import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTwinStore } from "../store/useTwinStore";
import { usePlantTelemetry } from "../hooks/usePlantTelemetry";

import AppHeader from "../components/shell/AppHeader";
import WorkspaceRail, { WorkspaceTabBar } from "../components/shell/WorkspaceRail";
import SidePanel from "../components/shell/SidePanel";
import CommandPalette from "../components/shell/CommandPalette";

import PlantWorkspace from "../workspaces/PlantWorkspace";
import SimulationWorkspace from "../workspaces/SimulationWorkspace";
import OptimizationWorkspace from "../workspaces/OptimizationWorkspace";
import AnalyticsWorkspace from "../workspaces/AnalyticsWorkspace";
import EngineeringWorkspace from "../workspaces/EngineeringWorkspace";
import DomainWorkspace from "../workspaces/DomainWorkspace";

import PlantAssetTree from "../components/chiller/PlantAssetTree";
import EtsAssetTree from "../components/ets/EtsAssetTree";
import AhuAssetTree from "../components/ahu/AhuAssetTree";
import CopilotChat from "../components/common/CopilotChat";

import {
  AnalyticsIcon,
  AssetsIcon,
  EngineeringIcon,
  OptimizeIcon,
  PlantIcon,
  SimulationIcon,
} from "../components/ui/TwIcons";

import "./App.css";
import "../features/mpc/mpc.css";
import "./twin-ui.css";
import "./twin-legacy.css";

/**
 * Application shell.
 *
 * Two orthogonal axes, kept visually separate because they are conceptually
 * separate:
 *
 *   SYSTEM     which plant — chiller, district cooling, AHU. Header, centre.
 *   WORKSPACE  what you are doing with it — plant, simulation, optimization,
 *              analytics, engineering. Left rail.
 *
 * The old build folded both into one tab strip and then hung two permanent
 * sidebars off it, which is why the digital twin — the reason the product
 * exists — was rendering into whatever width was left over.
 *
 * Routing is the URL hash rather than a router dependency: `#/chiller/analytics`
 * or `#/chiller/engineering/solver`. Back/forward and deep links work, and no
 * package was added to get them.
 */

const SYSTEMS = [
  { id: "chiller", label: "Chiller Plant" },
  { id: "district-cooling", label: "District Cooling" },
  { id: "ahu", label: "AHU" },
];

/** Header system id ⇄ the store's `activePlantScenario`. */
const SCENARIO_OF = { chiller: "chiller", "district-cooling": "ets", ahu: "ahu" };

const CHILLER_WORKSPACES = [
  { id: "plant", label: "Plant", icon: <PlantIcon /> },
  { id: "simulation", label: "Simulation", icon: <SimulationIcon /> },
  { id: "optimization", label: "Optimization", icon: <OptimizeIcon /> },
  { id: "analytics", label: "Analytics", icon: <AnalyticsIcon /> },
  { id: "engineering", label: "Engineering", icon: <EngineeringIcon /> },
];

/** ETS and AHU have a twin and controls but no receding-horizon optimiser. */
const DOMAIN_WORKSPACES = [
  { id: "plant", label: "Plant", icon: <PlantIcon /> },
  { id: "simulation", label: "Controls", icon: <SimulationIcon /> },
  { id: "engineering", label: "Engineering", icon: <EngineeringIcon /> },
];

const ENGINEERING_TABS = ["constraints", "solver", "bms", "model", "manual"];

function parseHash() {
  const [, system, workspace, sub] = (window.location.hash || "").split("/");
  return {
    system: SYSTEMS.some((s) => s.id === system) ? system : "chiller",
    workspace: workspace || "plant",
    sub: sub || null,
  };
}

function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((system, workspace, sub) => {
    const next = `#/${system}/${workspace}${sub ? `/${sub}` : ""}`;
    if (window.location.hash === next) return;
    window.location.hash = next;
  }, []);

  return [route, navigate];
}

function App() {
  const store = useTwinStore();
  const {
    twinState,
    plantState,
    districtCoolingState,
    etsState,
    ahuState,
    plantConfig,
    activePlantScenario,
    selectedAsset,
    isConnected,
    loadTwinState,
    selectAsset,
    setActivePlantScenario,
  } = store;

  const [route, navigate] = useHashRoute();
  const [navOpen, setNavOpen] = useState(true);
  const [panel, setPanel] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  usePlantTelemetry();

  useEffect(() => {
    loadTwinState();
  }, [loadTwinState]);

  // Seed the MPC baseline and horizon configuration once, not per workspace —
  // switching pages must not re-fetch or reset a run in progress.
  useEffect(() => {
    store.initMpcFromPlant?.();
    store.initHorizon?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header selector and the store's scenario are one thing seen twice.
  const routeScenario = SCENARIO_OF[route.system];
  useEffect(() => {
    if (routeScenario && routeScenario !== activePlantScenario) {
      setActivePlantScenario(routeScenario);
    }
  }, [routeScenario, activePlantScenario, setActivePlantScenario]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isChiller = route.system === "chiller";
  const workspaces = isChiller ? CHILLER_WORKSPACES : DOMAIN_WORKSPACES;
  const workspace = workspaces.some((w) => w.id === route.workspace) ? route.workspace : "plant";
  const engineeringTab = ENGINEERING_TABS.includes(route.sub) ? route.sub : "constraints";

  const go = useCallback(
    (nextWorkspace, sub) => navigate(route.system, nextWorkspace, sub),
    [navigate, route.system]
  );

  const selectSystem = useCallback(
    (system) => {
      selectAsset(null);
      navigate(system, "plant");
    },
    [navigate, selectAsset]
  );

  const domainState = route.system === "ahu" ? ahuState : etsState;

  const searchGroups = useMemo(() => {
    const groups = [
      {
        title: "Workspaces",
        items: workspaces.map((w) => ({
          id: `ws-${w.id}`,
          label: w.label,
          hint: SYSTEMS.find((s) => s.id === route.system)?.label,
          icon: w.icon,
          run: () => go(w.id),
        })),
      },
      {
        title: "Systems",
        items: SYSTEMS.filter((s) => s.id !== route.system).map((s) => ({
          id: `sys-${s.id}`,
          label: s.label,
          hint: "Switch system",
          icon: <PlantIcon size={16} />,
          run: () => selectSystem(s.id),
        })),
      },
    ];

    const equipment = Object.values((isChiller ? plantState : domainState)?.equipment ?? {});
    if (equipment.length) {
      groups.push({
        title: "Equipment",
        items: equipment.slice(0, 60).map((eq) => ({
          id: `eq-${eq.id}`,
          label: eq.name,
          hint: eq.status,
          icon: <AssetsIcon size={16} />,
          run: () => {
            go("plant");
            selectAsset(eq.id);
          },
        })),
      });
    }

    if (isChiller) {
      groups.push({
        title: "Actions",
        items: [
          {
            id: "act-run",
            label: "Run MPC optimisation",
            hint: "Optimization",
            icon: <OptimizeIcon size={16} />,
            run: () => {
              go("optimization");
              store.runHorizonMpc();
            },
          },
          {
            id: "act-constraints",
            label: "Edit MPC constraints",
            hint: "Engineering",
            icon: <EngineeringIcon size={16} />,
            run: () => go("engineering", "constraints"),
          },
          {
            id: "act-bms",
            label: "BMS points",
            hint: "Engineering",
            icon: <EngineeringIcon size={16} />,
            run: () => go("engineering", "bms"),
          },
          {
            id: "act-solver",
            label: "Solver diagnostics",
            hint: "Engineering",
            icon: <EngineeringIcon size={16} />,
            run: () => go("engineering", "solver"),
          },
        ],
      });
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, route.system, isChiller, plantState, domainState, go, selectSystem, selectAsset]);

  if (!twinState) {
    return (
      <div className="loading">
        <h2>Loading Digital Twin…</h2>
        <p>Connecting to backend server…</p>
      </div>
    );
  }

  const chillerScenario = {
    mode: store.horizonMode,
    day: store.horizonDay,
    steps: store.horizonSteps,
    forecast: store.horizonForecast,
  };

  const renderChiller = () => {
    if (workspace === "simulation") {
      return (
        <SimulationWorkspace
          input={store.mpcInput}
          scenario={chillerScenario}
          config={store.horizonConfig}
          status={store.horizonStatus}
          error={store.horizonError}
          run={store.horizonRun}
          constraintErrors={store.mpcConstraintErrors}
          onChangeInput={store.setMpcInput}
          onChangeScenario={store.setHorizonScenario}
          onRun={store.runHorizonMpc}
          scenarios={plantConfig?.scenarios}
          activeScenarioId={plantState?.simulation?.scenarioId}
          onApplyScenario={store.applyChillerScenario}
          onNavigate={go}
        />
      );
    }
    if (workspace === "optimization") {
      return (
        <OptimizationWorkspace
          run={store.horizonRun}
          status={store.horizonStatus}
          error={store.horizonError}
          applied={store.mpcApplied}
          baselineControl={store.mpcBaselineControl}
          constraintErrors={store.mpcConstraintErrors}
          onRun={store.runHorizonMpc}
          onRestoreBaseline={store.restoreMpcBaseline}
          onReapplyOptimum={store.reapplyMpcOptimum}
          onNavigate={go}
        />
      );
    }
    if (workspace === "analytics") {
      return <AnalyticsWorkspace run={store.horizonRun} plantState={plantState} onNavigate={go} />;
    }
    if (workspace === "engineering") {
      return (
        <EngineeringWorkspace
          tab={engineeringTab}
          onTabChange={(tab) => go("engineering", tab)}
          plantState={plantState}
          constraints={store.mpcConstraints}
          constraintErrors={store.mpcConstraintErrors}
          onSetConstraint={store.setMpcConstraint}
          onSetFleet={store.setMpcChillerFleet}
          onSetAvailable={store.setMpcAvailableChillers}
          onResetConstraints={store.resetMpcConstraints}
          status={store.horizonStatus}
          run={store.horizonRun}
          error={store.horizonError}
          modelStatus={store.horizonModelStatus}
          twinValidation={store.twinValidation}
          onLoadValidation={store.loadTwinValidation}
          onUpdateControl={store.updatePlantControl}
          onToggleDuty={store.togglePlantDuty}
          onResetPlant={store.resetPlant}
          onTriggerFault={store.triggerPlantFault}
          onAdvance={store.advancePlantSimulation}
          onRun={store.runHorizonMpc}
        />
      );
    }
    return (
      <PlantWorkspace
        plantState={plantState}
        selectedAsset={selectedAsset}
        onSelectAsset={selectAsset}
        isConnected={isConnected}
        scenario={chillerScenario}
        config={store.horizonConfig}
        run={store.horizonRun}
        status={store.horizonStatus}
        error={store.horizonError}
        applied={store.mpcApplied}
        baselineControl={store.mpcBaselineControl}
        constraintErrors={store.mpcConstraintErrors}
        onRun={store.runHorizonMpc}
        onRestoreBaseline={store.restoreMpcBaseline}
        onReapplyOptimum={store.reapplyMpcOptimum}
        onNavigate={go}
        onOpenAssets={() => setPanel("assets")}
      />
    );
  };

  const renderDomain = () => (
    <DomainWorkspace
      system={SCENARIO_OF[route.system]}
      workspace={workspace}
      state={domainState}
      districtState={districtCoolingState}
      twinState={twinState}
      selectedAsset={selectedAsset}
      onSelectAsset={selectAsset}
      actions={
        route.system === "ahu"
          ? {
              applyChanges: store.applyAhuChanges,
              applyScenario: store.applyAhuScenario,
              reset: store.resetAhu,
            }
          : {
              applyChanges: store.applyEtsChanges,
              applyScenario: store.applyEtsScenario,
              reset: store.resetEts,
              updateDistrictControl: store.updateDistrictControl,
              advanceDistrict: store.advanceDistrictCooling,
              resetDistrict: store.resetDistrictCooling,
            }
      }
    />
  );

  const assetTree = isChiller ? (
    <PlantAssetTree
      equipment={plantState?.equipment || {}}
      selectedAsset={selectedAsset}
      onSelectAsset={(id) => {
        selectAsset(id);
        setPanel(null);
      }}
    />
  ) : route.system === "ahu" ? (
    <AhuAssetTree
      equipment={ahuState?.equipment || {}}
      selectedAsset={selectedAsset}
      onSelectAsset={(id) => {
        selectAsset(id);
        setPanel(null);
      }}
    />
  ) : (
    <EtsAssetTree
      equipment={etsState?.equipment || {}}
      selectedAsset={selectedAsset}
      onSelectAsset={(id) => {
        selectAsset(id);
        setPanel(null);
      }}
    />
  );

  return (
    <div className="app">
      <AppHeader
        systems={SYSTEMS}
        activeSystem={route.system}
        onSelectSystem={selectSystem}
        onToggleNav={() => setNavOpen((v) => !v)}
        navOpen={navOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenChat={() => setPanel(panel === "chat" ? null : "chat")}
        chatOpen={panel === "chat"}
        isConnected={isConnected}
      />

      <WorkspaceTabBar items={workspaces} value={workspace} onChange={go} visible={!navOpen} />

      <div className="tw-body">
        <WorkspaceRail items={workspaces} value={workspace} onChange={go} hidden={!navOpen} />
        <main className="tw-main" key={`${route.system}-${workspace}`}>
          {isChiller ? renderChiller() : renderDomain()}
        </main>
      </div>

      <SidePanel
        open={panel === "assets"}
        title="Plant assets"
        eyebrow="Digital twin"
        onClose={() => setPanel(null)}
      >
        {assetTree}
      </SidePanel>

      <SidePanel
        open={panel === "chat"}
        title="Plant chatbot"
        eyebrow="Assistant"
        onClose={() => setPanel(null)}
        flush
      >
        <CopilotChat />
      </SidePanel>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} groups={searchGroups} />
    </div>
  );
}

export default App;
