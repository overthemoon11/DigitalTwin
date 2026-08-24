import React, { useState } from "react";
import EtsStationView from "../components/ets/EtsStationView";
import EtsAssetTree from "../components/ets/EtsAssetTree";
import EtsKPIPanel from "../components/ets/EtsKPIPanel";
import EtsControlPanel from "../components/ets/EtsControlPanel";
import Ahu01StationView from "../components/ahu/Ahu01StationView";
import AhuAssetTree from "../components/ahu/AhuAssetTree";
import AhuKPIPanel from "../components/ahu/AhuKPIPanel";
import AhuControlPanel from "../components/ahu/AhuControlPanel";
import HeatExchangeViewer from "../components/heatexchange/HeatExchangeViewer";
import HeatExchangeAssetTree from "../components/heatexchange/HeatExchangeAssetTree";
import DistrictCoolingControlPanel from "../components/districtcooling/DistrictCoolingControlPanel";
import VirtualSimulatorPanel from "../components/leftSidebar/VirtualSimulatorPanel";
import AlertPanel from "../components/common/AlertPanel";
import KPIPanel from "../components/common/KPIPanel";
import { Card, CardHead, EmptyState, PageHead, StatusPill, Tabs } from "../components/ui/Primitives";

/**
 * District Cooling (ETS) and AHU in the same shell as the chiller plant.
 *
 * These domains have a twin, controls, scenarios and KPIs but no receding-
 * horizon MPC, so they get three of the five workspaces rather than a rail with
 * two dead entries — Plant (what is happening), Simulation (what-if controls
 * and the resulting cascade) and Engineering (assets and the full KPI set).
 *
 * The district network view is a sub-view of District Cooling → Plant rather
 * than a fourth system: the ETS station and the network it hangs off are the
 * same domain seen at two zoom levels, and drilling from a building into its
 * station is already how the renderer works.
 */

const DOMAIN_META = {
  ets: {
    eyebrow: "District cooling",
    title: "ETS station",
    subtitle: "Energy transfer station between the district loop and the building's secondary loop.",
    assetsTitle: "ETS station assets",
  },
  ahu: {
    eyebrow: "Air handling",
    title: "AHU-01",
    subtitle: "Air handling unit — coils, fans, dampers and filters, with the resulting supply conditions.",
    assetsTitle: "AHU-01 assets",
  },
};

export default function DomainWorkspace({
  system,
  workspace,
  state,
  districtState,
  twinState,
  selectedAsset,
  onSelectAsset,
  actions,
}) {
  const meta = DOMAIN_META[system];
  const [stationView, setStationView] = useState("station");
  const [hxEtsBuildingId, setHxEtsBuildingId] = useState(null);

  if (!state) {
    return (
      <div className="tw-page">
        <PageHead eyebrow={meta.eyebrow} title={meta.title} />
        <EmptyState title={`Initialising ${meta.title}…`}>
          <p>The simulator for this domain has not produced a state yet.</p>
        </EmptyState>
      </div>
    );
  }

  const isEts = system === "ets";
  const networkAvailable = isEts && !!districtState;
  // On the network view the right-hand column has to describe the NETWORK, not
  // the station hanging off it — otherwise the district's own indicators and
  // alarms have nowhere left to be read.
  const onNetwork = networkAvailable && stationView === "network";
  const scope = onNetwork ? districtState : state;
  const alerts = (scope.alerts ?? []).filter((a) => !a.resolved);

  const stage =
    isEts && stationView === "network" && districtState ? (
      <HeatExchangeViewer
        headers={districtState.headers}
        buildings={districtState.buildings}
        selectedId={selectedAsset}
        onSelect={onSelectAsset}
        etsBuildingId={hxEtsBuildingId}
        onDrillToEts={setHxEtsBuildingId}
        onExitEts={() => {
          setHxEtsBuildingId(null);
          onSelectAsset("dcs-plant");
        }}
      />
    ) : isEts ? (
      <EtsStationView state={state} selectedId={selectedAsset} onSelect={onSelectAsset} />
    ) : (
      <Ahu01StationView state={state} selectedId={selectedAsset} onSelect={onSelectAsset} />
    );

  if (workspace === "plant") {
    return (
      <div className="tw-page tw-page--fill">
        <PageHead
          eyebrow={meta.eyebrow}
          title={meta.title}
          subtitle={meta.subtitle}
          actions={
            <>
              {networkAvailable && (
                <Tabs
                  label="Twin scope"
                  value={stationView}
                  onChange={(v) => {
                    setStationView(v);
                    setHxEtsBuildingId(null);
                  }}
                  items={[
                    { id: "station", label: "Station" },
                    { id: "network", label: "District network" },
                  ]}
                />
              )}
              <StatusPill tone={alerts.length ? "warn" : "ok"}>
                {alerts.length ? `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}` : "No alerts"}
              </StatusPill>
            </>
          }
        />

        <div className="domain-grid">
          <article className="tw-card tw-card--flush domain-stage-card">
            <header className="plant-twin-head">
              <div>
                <span className="tw-eyebrow">Digital twin</span>
                <h3>{stationView === "network" ? "District cooling network" : meta.title}</h3>
              </div>
              <StatusPill tone="info" small>
                {selectedAsset
                  ? scope.equipment?.[selectedAsset]?.name ?? selectedAsset
                  : onNetwork
                    ? "Whole network"
                    : "Whole station"}
              </StatusPill>
            </header>
            <div className="domain-stage plant-twin-stage">{stage}</div>
          </article>

          <aside className="domain-side">
            <Card className="domain-host">
              <CardHead
                eyebrow="Performance"
                title="Key indicators"
                tight
                subtitle={onNetwork ? "District network" : undefined}
              />
              {onNetwork ? (
                <KPIPanel kpis={scope.kpis ?? []} />
              ) : isEts ? (
                <EtsKPIPanel kpis={scope.kpis ?? []} />
              ) : (
                <AhuKPIPanel kpis={scope.kpis ?? []} />
              )}
            </Card>

            <Card className="domain-host">
              <CardHead eyebrow="Alarms" title={`Alerts (${alerts.length})`} tight />
              <AlertPanel
                alerts={scope.alerts ?? []}
                assets={twinState?.assets}
                plantEquipment={scope.equipment}
                plantMode
              />
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  if (workspace === "simulation") {
    return (
      <div className="tw-page">
        <PageHead
          eyebrow={meta.eyebrow}
          title="Controls & scenarios"
          subtitle="Move a control, apply it, and read the resulting cascade through the rest of the system."
        />
        <div className="sim-grid">
          <Card className="sim-config domain-host">
            <CardHead eyebrow="Configuration" title="Controls" tight />
            {isEts ? (
              <EtsControlPanel
                controls={state.controls ?? []}
                headers={state.headers}
                valves={state.valves}
                meter={state.meter}
                simulation={state.simulation}
                onApply={actions.applyChanges}
                onApplyScenario={actions.applyScenario}
                onReset={actions.reset}
              />
            ) : (
              <AhuControlPanel
                controls={state.controls ?? []}
                headers={state.headers}
                chwCoil={state.chwCoil}
                hwCoil={state.hwCoil}
                saFan={state.saFan}
                raFan={state.raFan}
                dampers={state.dampers}
                filters={state.filters}
                simulation={state.simulation}
                onApply={actions.applyChanges}
                onApplyScenario={actions.applyScenario}
                onReset={actions.reset}
              />
            )}
          </Card>

          <div className="sim-preview">
            <Card className="domain-host">
              <CardHead
                eyebrow="Cascade"
                title="Domino effect"
                tight
                subtitle="What the last applied change propagated to, before → after."
              />
              <VirtualSimulatorPanel plantScenario={system} state={state} />
            </Card>

            {networkAvailable && (
              <Card className="domain-host">
                <CardHead
                  eyebrow="District network"
                  title="Primary loop controls"
                  tight
                  subtitle="The district side the station hangs off."
                />
                <DistrictCoolingControlPanel
                  controls={districtState.controls ?? []}
                  headers={districtState.headers}
                  simulation={districtState.simulation}
                  onUpdate={actions.updateDistrictControl}
                  onRunSimulation={() => actions.advanceDistrict(30)}
                  onReset={actions.resetDistrict}
                  compact
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-page">
      <PageHead
        eyebrow={meta.eyebrow}
        title="Engineering"
        subtitle="The asset hierarchy and the full indicator set for this system."
      />
      <div className="eng-grid eng-grid--two">
        <Card className="domain-host">
          <CardHead eyebrow="Hierarchy" title={meta.assetsTitle} tight />
          {isEts ? (
            <EtsAssetTree equipment={state.equipment ?? {}} selectedAsset={selectedAsset} onSelectAsset={onSelectAsset} />
          ) : (
            <AhuAssetTree equipment={state.equipment ?? {}} selectedAsset={selectedAsset} onSelectAsset={onSelectAsset} />
          )}
          {networkAvailable && (
            <>
              <CardHead eyebrow="District" title="Network assets" tight />
              <HeatExchangeAssetTree
                equipment={districtState.equipment ?? {}}
                selectedAsset={selectedAsset}
                onSelectAsset={onSelectAsset}
              />
            </>
          )}
        </Card>

        <Card className="domain-host">
          <CardHead eyebrow="Indicators" title="All KPIs" tight />
          {isEts ? <EtsKPIPanel kpis={state.kpis ?? []} /> : <AhuKPIPanel kpis={state.kpis ?? []} />}
        </Card>
      </div>
    </div>
  );
}
