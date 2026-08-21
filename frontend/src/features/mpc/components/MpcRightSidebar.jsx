import React, { useEffect, useRef } from 'react';
import ConstraintPanel from './ConstraintPanel';
import MpcStatusPanel from './MpcStatusPanel';

const BUTTON_LABEL = {
  IDLE: 'Run MPC',
  RUNNING: 'Running…',
  COMPLETED: 'Run MPC',
  ERROR: 'Run MPC',
};

/**
 * Right sidebar: what the plant is ALLOWED to do, plus the run.
 *
 * The button is the only place a run starts, and it takes its disturbances from
 * the left sidebar and its limits from the form above it — which is exactly the
 * division the two panels present, so there is no hidden third source of truth
 * for what a run was actually asked to do.
 *
 * It sticks to the bottom so it stays reachable however long the constraint
 * form gets, and is disabled while a run is in flight or while the
 * configuration is invalid. Running against an invalid constraint set would
 * either crash the solver or silently substitute a default, and a silently
 * substituted limit is a constraint the operator did not choose.
 */
export default function MpcRightSidebar({
  constraints,
  errors,
  status,
  run,
  error,
  onSet,
  onSetFleet,
  onSetAvailable,
  onReset,
  onRun,
}) {
  const running = status === 'RUNNING';
  const invalid = (errors?.length ?? 0) > 0;
  const statusRef = useRef(null);

  // Bring the solver status into view when a run starts or finishes — the
  // constraint form is long enough that it would otherwise happen below the
  // fold, which is exactly the part the operator wants to watch.
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
          <MpcStatusPanel status={status} run={run} error={error} />
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
        <p className="mpc-run-hint">
          Replays the same conditions twice — the plant&apos;s own control, then the
          horizon optimiser — and compares them.
        </p>
      </div>
    </div>
  );
}
