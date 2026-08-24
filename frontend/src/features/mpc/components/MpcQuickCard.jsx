import React from "react";
import { InfoHint, StatusPill } from "../../../components/ui/Primitives";
import { ArrowRightIcon, SpinIcon } from "../../../components/ui/TwIcons";
import { CONTROL_ROWS, controlText, solverState } from "../horizonSelectors";

/**
 * The MPC recommendation, as it appears beside the digital twin.
 *
 * Deliberately answers one question — what would the optimiser do differently
 * right now — and hands everything else (why, how much, over what horizon) to
 * the Optimization workspace. The old sidebar tried to answer all of them in
 * 300px and answered none of them legibly.
 */
export default function MpcQuickCard({
  baseline,
  optimal,
  status,
  run,
  error,
  applied,
  constraintErrors,
  onRun,
  onRestoreBaseline,
  onReapplyOptimum,
  onOpenOptimization,
}) {
  const running = status === "RUNNING";
  const invalid = (constraintErrors?.length ?? 0) > 0;
  const state = solverState(status, run);

  return (
    <section className="tw-card tw-card--flush mpc-quick">
      <header className="mpc-quick-head">
        <div>
          <span className="tw-eyebrow">MPC control</span>
          <h3>Recommended setpoints</h3>
          <p>Receding-horizon whole-plant optimiser</p>
        </div>
        <StatusPill tone={state.tone} small>
          {state.label}
        </StatusPill>
      </header>

      <div className="mpc-quick-cols">
        <span>Control</span>
        <span>Current</span>
        <span />
        <span>Optimal</span>
      </div>

      <div className="mpc-quick-rows">
        {CONTROL_ROWS.map((row) => {
          const before = controlText(baseline, row);
          const after = controlText(optimal, row);
          const changed = before !== "—" && after !== "—" && before !== after;
          const unit = row.unit && before !== "—" ? row.unit : "";
          return (
            <div className="mpc-quick-row" key={row.key}>
              <b title={row.label}>{row.short}</b>
              <span>
                {before}
                {unit && <em>{unit}</em>}
              </span>
              <i aria-hidden="true">→</i>
              <strong className={changed ? "is-changed" : ""}>
                {after}
                {after !== "—" && row.unit ? <em>{row.unit}</em> : null}
              </strong>
            </div>
          );
        })}
      </div>

      <div className="mpc-quick-foot">
        {error && (
          <p className="tw-alert" role="alert">
            {error}
          </p>
        )}
        {invalid && (
          <p className="tw-alert tw-alert--warn">
            {constraintErrors.length} constraint {constraintErrors.length === 1 ? "problem" : "problems"} must
            be fixed in Engineering → Constraints before a run.
          </p>
        )}

        <button type="button" className="tw-run-btn" onClick={onRun} disabled={running || invalid}>
          {running ? (
            <>
              <SpinIcon size={16} className="tw-spin" />
              Optimising…
            </>
          ) : (
            <>{run ? "Run MPC again" : "Run MPC optimisation"}</>
          )}
        </button>

        {run?.appliedControl && (
          <div className="mpc-quick-apply">
            <button
              type="button"
              className="tw-btn tw-btn--sm"
              onClick={onRestoreBaseline}
              disabled={running || !applied}
              title="Put the twin back on the pre-optimisation control state"
            >
              Restore current
            </button>
            <button
              type="button"
              className="tw-btn tw-btn--sm tw-btn--soft"
              onClick={onReapplyOptimum}
              disabled={running || applied}
              title="Re-apply the optimised control state to the twin"
            >
              Apply optimum
            </button>
          </div>
        )}

        <p className="mpc-quick-note">
          <button type="button" className="tw-btn tw-btn--ghost tw-btn--sm" onClick={onOpenOptimization}>
            Open Optimization
            <ArrowRightIcon size={14} />
          </button>
          <InfoHint title="What this card shows">
            The left column is the plant&apos;s live control state, delivered on the same telemetry frame as
            the plant itself. The right column is the move the optimiser applied at the first step of the
            most recent run. Provenance, savings, binding constraints and the full horizon live in the
            Optimization workspace.
          </InfoHint>
        </p>
      </div>
    </section>
  );
}
