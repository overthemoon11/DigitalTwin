import React, { useEffect, useRef } from 'react';
import ConstraintPanel from './ConstraintPanel';
import MpcStatusPanel from './MpcStatusPanel';

const BUTTON_LABEL = {
  IDLE: 'Run MPC Simulation',
  VALIDATING: 'Validating…',
  RUNNING: 'Optimizing…',
  COMPLETED: 'Run MPC Simulation',
  INFEASIBLE: 'Run MPC Simulation',
  ERROR: 'Run MPC Simulation',
};

/**
 * Right sidebar: what the plant is ALLOWED to do, plus the MPC execution.
 * The RUN button sticks to the bottom so it stays reachable however long the
 * constraint form gets, and is disabled while a run is in flight or while the
 * configuration is invalid.
 */
export default function MpcRightSidebar({
  constraints,
  errors,
  status,
  progress,
  result,
  error,
  onSet,
  onSetFleet,
  onSetAvailable,
  onReset,
  onRun,
  onCancel,
}) {
  const running = status === 'RUNNING' || status === 'VALIDATING';
  const invalid = (errors?.length ?? 0) > 0;
  const statusRef = useRef(null);

  // Bring the cycle trace into view when a run starts or finishes — the
  // constraint form is long enough that the search would otherwise happen
  // below the fold, which is exactly the part the operator wants to watch.
  useEffect(() => {
    if (status === 'IDLE') return;
    statusRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [status]);

  return (
    <div className="mpc-right">
      <div className="mpc-right-scroll">
        <ConstraintPanel
          constraints={constraints}
          errors={errors}
          disabled={running}
          onSet={onSet}
          onSetFleet={onSetFleet}
          onSetAvailable={onSetAvailable}
          onReset={onReset}
        />
        <div ref={statusRef}>
          <MpcStatusPanel status={status} progress={progress} result={result} error={error} />
        </div>
      </div>

      <div className="mpc-run-dock">
        {invalid && (
          <p className="mpc-run-blocked">
            {errors.length} constraint {errors.length === 1 ? 'problem' : 'problems'} — fix before running
          </p>
        )}
        <button
          type="button"
          className="mpc-run-btn"
          onClick={onRun}
          disabled={running || invalid}
        >
          {BUTTON_LABEL[status] ?? BUTTON_LABEL.IDLE}
        </button>
        {running && (
          <button type="button" className="mpc-secondary-btn mpc-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
