import React, { useState } from "react";
import MpcRightSidebar from "../../features/mpc/components/MpcRightSidebar";
import ChillerScadaPanel from "./ChillerScadaPanel";
import ChillerPointsList from "./ChillerPointsList";

/**
 * The chiller plant's tabbed side panel: Constraints (MPC search boundaries +
 * run), Manual Controls, BMS Points.
 *
 * Extracted from App.jsx so it can be mounted on EITHER side of the viewer
 * without duplicating ~190 lines of JSX. With both sidebars docked left it
 * renders before the schematic in the DOM, which keeps tab order and
 * screen-reader landmark order matching what is on screen — a CSS `order`
 * flip would have moved it visually while leaving keyboard focus jumping
 * over the schematic and back.
 */
export default function ChillerSidePanel({
  plantState,
  // MPC
  mpcConstraints,
  mpcConstraintErrors,
  mpcStatus,
  mpcProgress,
  mpcResult,
  mpcError,
  onSetConstraint,
  onSetFleet,
  onSetAvailable,
  onResetConstraints,
  onRun,
  onCancel,
  // manual controls / points
  onUpdateControl,
  onToggleDuty,
  onApplyScenario,
  onApplyScenarioPayload,
}) {
  const [tab, setTab] = useState("constraints");

  return (
    <>
      <div className="panel-tabs">
        <button
          type="button"
          className={tab === "constraints" ? "active" : ""}
          onClick={() => setTab("constraints")}
        >
          Constraints
        </button>
        <button
          type="button"
          className={tab === "controls" ? "active" : ""}
          onClick={() => setTab("controls")}
        >
          Controls
        </button>
        <button
          type="button"
          className={tab === "points" ? "active" : ""}
          onClick={() => setTab("points")}
        >
          BMS Points
        </button>
      </div>
      <div
        className={`panel-content ${
          tab === "constraints" ? "mpc-panel-content" : "scada-panel-content"
        }`}
      >
        {tab === "constraints" ? (
          <MpcRightSidebar
            constraints={mpcConstraints}
            errors={mpcConstraintErrors}
            status={mpcStatus}
            progress={mpcProgress}
            result={mpcResult}
            error={mpcError}
            onSet={onSetConstraint}
            onSetFleet={onSetFleet}
            onSetAvailable={onSetAvailable}
            onReset={onResetConstraints}
            onRun={onRun}
            onCancel={onCancel}
          />
        ) : tab === "controls" ? (
          <ChillerScadaPanel plantState={plantState} onSet={onUpdateControl} />
        ) : (
          <ChillerPointsList
            plantState={plantState}
            onToggleDuty={onToggleDuty}
            onApplyScenario={onApplyScenario}
            onApplyScenarioPayload={onApplyScenarioPayload}
            onSetControl={onUpdateControl}
          />
        )}
      </div>
    </>
  );
}
