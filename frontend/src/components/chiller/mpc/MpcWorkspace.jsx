import React, { useEffect, useState } from 'react';
import SimulationInputPanel from './SimulationInputPanel';
import ConstraintPanel from './ConstraintPanel';
import MpcStatusPanel from './MpcStatusPanel';
import OptimalControlComparison from './OptimalControlComparison';
import SimulationResultComparison from './SimulationResultComparison';

const RUN_LABEL = {
  IDLE: 'Run MPC Simulation',
  VALIDATING: 'Validating…',
  RUNNING: 'Optimizing…',
  COMPLETED: 'Run Again',
  INFEASIBLE: 'Run Again',
  ERROR: 'Run MPC Simulation',
};

const STATE_LABEL = {
  IDLE: 'Ready',
  VALIDATING: 'Checking',
  RUNNING: 'Solving',
  COMPLETED: 'Solved',
  INFEASIBLE: 'No solution',
  ERROR: 'Error',
};

/**
 * Single-column MPC workspace: both former sidebars consolidated on the left.
 *
 *   SETUP     what you are allowed to do    (input + constraints)
 *   ── RUN ── the action that turns one into the other
 *   RESULTS   what you got                  (cycle trace, before/after)
 *   RIGHT     the plant itself
 *
 * The old three-column layout put constraints on the right and results on the
 * left, so evaluating "I tightened this limit, what did it cost?" meant looking
 * across the full width of the screen. Stacking them puts cause directly above
 * effect with the trigger on the seam between them.
 *
 * Merging the two 300px rails is also the only thing that actually gives the
 * schematic more room — relocating a sidebar does not change how much chrome
 * the viewport has to subtract.
 *
 * Each pane scrolls independently and either can be collapsed, because at a
 * 900px-tall viewport a fixed 50/50 split leaves ~420px each, which is tight
 * when several constraint groups are expanded.
 */
export default function MpcWorkspace({
  // simulation input + baseline
  input,
  baselineControl,
  onChangeInput,
  onInit,
  // constraints
  constraints,
  errors,
  onSet,
  onSetFleet,
  onSetAvailable,
  onReset,
  // run
  status,
  progress,
  result,
  error,
  onRun,
  onCancel,
  // apply / restore
  applied,
  onRestoreBaseline,
  onReapplyOptimum,
}) {
  const [collapsed, setCollapsed] = useState({ setup: false, results: false });

  useEffect(() => {
    onInit?.();
  }, [onInit]);

  const running = status === 'RUNNING' || status === 'VALIDATING';
  const invalid = (errors?.length ?? 0) > 0;
  const before = result?.baselineControl ?? baselineControl;
  const optimal = result?.optimalControl ?? null;

  // Collapsing both would leave nothing but the run dock, so the second toggle
  // re-opens the other pane instead of emptying the column.
  const toggle = (key) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      if (next.setup && next.results) next[key === 'setup' ? 'results' : 'setup'] = false;
      return next;
    });

  return (
    <div className="mpc-workspace">
      <header className="mpc-ws-head">
        <div className="mpc-ws-title">
          <strong>MPC Optimisation</strong>
          <span>T1 chiller plant</span>
        </div>
        <span className="mpc-state-chip" data-state={status}>
          {STATE_LABEL[status] ?? 'Ready'}
        </span>
      </header>

      {/* ---------------------------------------------------------- SETUP */}
      <section
        className={`mpc-pane ${collapsed.setup ? 'mpc-pane--collapsed' : ''}`}
        aria-label="Setup"
      >
        <button
          type="button"
          className="mpc-pane-head"
          onClick={() => toggle('setup')}
          aria-expanded={!collapsed.setup}
        >
          <span className="mpc-pane-caret">{collapsed.setup ? '▸' : '▾'}</span>
          <span className="mpc-pane-name">Setup</span>
          <span className="mpc-pane-hint">conditions &amp; limits</span>
        </button>
        {!collapsed.setup && (
          <div className="mpc-pane-body">
            <SimulationInputPanel input={input} onChange={onChangeInput} disabled={running} />
            <ConstraintPanel
              constraints={constraints}
              errors={errors}
              disabled={running}
              onSet={onSet}
              onSetFleet={onSetFleet}
              onSetAvailable={onSetAvailable}
              onReset={onReset}
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------- RUN (the seam) */}
      <div className="mpc-run-dock mpc-run-dock--seam">
        {invalid && (
          <p className="mpc-run-blocked">
            {errors.length} constraint {errors.length === 1 ? 'problem' : 'problems'} — fix before
            running
          </p>
        )}
        <button
          type="button"
          className="mpc-run-btn"
          onClick={onRun}
          disabled={running || invalid}
        >
          {RUN_LABEL[status] ?? RUN_LABEL.IDLE}
        </button>
        {running && (
          <button type="button" className="mpc-secondary-btn mpc-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {/* -------------------------------------------------------- RESULTS */}
      <section
        className={`mpc-pane ${collapsed.results ? 'mpc-pane--collapsed' : ''}`}
        aria-label="Results"
      >
        <button
          type="button"
          className="mpc-pane-head"
          onClick={() => toggle('results')}
          aria-expanded={!collapsed.results}
        >
          <span className="mpc-pane-caret">{collapsed.results ? '▸' : '▾'}</span>
          <span className="mpc-pane-name">Results</span>
          {result?.savingKw > 0 && status === 'COMPLETED' ? (
            <span className="mpc-pane-badge">−{result.savingKw.toFixed(0)} kW</span>
          ) : (
            <span className="mpc-pane-hint">before → after</span>
          )}
        </button>
        {!collapsed.results && (
          <div className="mpc-pane-body">
            <MpcStatusPanel
              status={status}
              progress={progress}
              result={result}
              error={error}
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
        )}
      </section>
    </div>
  );
}
