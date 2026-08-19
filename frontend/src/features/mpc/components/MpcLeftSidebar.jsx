import React, { useEffect } from "react";
import SimulationInputPanel from "./SimulationInputPanel";
import OptimalControlComparison from "./OptimalControlComparison";
import SimulationResultComparison from "./SimulationResultComparison";

/**
 * Left sidebar for the chiller-plant MPC simulator.
 *
 *   LEFT   — what happened (input, before/after control, before/after result)
 *   CENTRE — what is happening physically (the digital twin)
 *   RIGHT  — what the plant is allowed to do (constraints + MPC execution)
 *
 * Deliberately contains NO operational controls: the only editable things here
 * are the two disturbances, because everything else is either a constraint
 * (right) or an optimiser output (read-only).
 */
export default function MpcLeftSidebar({
  input,
  baselineControl,
  result,
  status,
  onChangeInput,
  onInit,
  onRestoreBaseline,
  onReapplyOptimum,
  applied,
}) {
  useEffect(() => {
    onInit?.();
  }, [onInit]);

  const running = status === "RUNNING" || status === "VALIDATING";
  const before = result?.baselineControl ?? baselineControl;
  const optimal = result?.optimalControl ?? null;

  return (
    <div className="virtual-simulator-panel mpc-sidebar">
      <div className="vsp-header">
        <span className="vsp-badge">MPC Optimisation Simulator</span>
      </div>

      <SimulationInputPanel
        input={input}
        onChange={onChangeInput}
        disabled={running}
      />

      <OptimalControlComparison baseline={before} optimal={optimal} />

      <SimulationResultComparison
        baselineResult={result?.baselineResult ?? null}
        optimalResult={result?.optimalResult ?? null}
        savingKw={result?.savingKw}
        savingPct={result?.savingPct}
      />

      {result?.optimalControl && (
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
