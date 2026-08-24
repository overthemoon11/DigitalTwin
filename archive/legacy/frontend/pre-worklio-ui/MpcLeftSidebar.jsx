import React, { useEffect } from "react";
import SimulationInputPanel from "./SimulationInputPanel";
import OptimalControlComparison from "./OptimalControlComparison";
import SimulationResultComparison from "./SimulationResultComparison";
import MpcCycleStrip from "./MpcCycleStrip";
import HorizonTrajectory from "./HorizonTrajectory";
import ModelStatusPanel from "./ModelStatusPanel";

/**
 * Left sidebar for the chiller-plant MPC simulator.
 *
 *   LEFT   — what happened (input, before/after control, before/after result)
 *   CENTRE — what is happening physically (the digital twin)
 *   RIGHT  — what the plant is allowed to do (constraints + the run button)
 *
 * Deliberately contains NO operational controls. The only editable things here
 * are the two disturbances and the scenario they come from, because everything
 * else is either a constraint (right) or an optimiser output (read-only).
 *
 * The order is the order the numbers should be read in: what conditions, what
 * the controller did about them, what that cost, how it decided, how it moved
 * over time, and finally how far the model behind all of it is calibrated. The
 * calibration panel is last but not optional — it is what makes the saving
 * above it a measurement of a model rather than a claim about a plant.
 */
export default function MpcLeftSidebar({
  input,
  scenario,
  config,
  run,
  status,
  modelStatus,
  twinValidation,
  onInit,
  onInitHorizon,
  onChangeInput,
  onChangeScenario,
  onLoadValidation,
  onRestoreBaseline,
  onReapplyOptimum,
  applied,
}) {
  useEffect(() => {
    onInit?.();
    onInitHorizon?.();
  }, [onInit, onInitHorizon]);

  const running = status === "RUNNING";

  return (
    <div className="virtual-simulator-panel mpc-sidebar">
      <div className="vsp-header">
        <span className="vsp-badge">MPC Optimisation Simulator</span>
      </div>

      <SimulationInputPanel
        input={input}
        scenario={scenario}
        config={config}
        onChange={onChangeInput}
        onChangeScenario={onChangeScenario}
        disabled={running}
      />

      <OptimalControlComparison
        baseline={run?.baselineControl ?? null}
        optimal={run?.appliedControl ?? null}
        provenance={run?.optimisedControls}
      />

      <SimulationResultComparison run={run} />

      {run && (
        <>
          <MpcCycleStrip run={run} />
          <HorizonTrajectory run={run} />
        </>
      )}

      <ModelStatusPanel
        modelStatus={modelStatus}
        twinValidation={twinValidation}
        onLoadValidation={onLoadValidation}
      />

      {run?.appliedControl && (
        <div className="mpc-apply-row">
          <button
            type="button"
            className="mpc-secondary-btn"
            onClick={onRestoreBaseline}
            disabled={running || !applied}
            title="Put the twin back on the pre-optimisation control state"
          >
            Restore Before
          </button>
          <button
            type="button"
            className="mpc-secondary-btn"
            onClick={onReapplyOptimum}
            disabled={running || applied}
            title="Re-apply the optimised control state to the twin"
          >
            Apply After
          </button>
        </div>
      )}
    </div>
  );
}
