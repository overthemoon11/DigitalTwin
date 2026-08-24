import React from 'react';
import { useTwinStore } from '../../../store/useTwinStore';

const n0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/**
 * Solver and constraint status for a receding-horizon run.
 *
 * Three things belong here and nowhere else.
 *
 * WHICH CONSTRAINTS BOUND THE ANSWER. An optimum sitting on a limit is a
 * different claim from one sitting in the interior: it says "this is as far as
 * you let me go", and the operator can widen the limit on the left. Reporting
 * the total without the active set hides that entirely.
 *
 * WHAT THE OBJECTIVE ACTUALLY WEIGHED. The cost breakdown for the applied step,
 * in kW-equivalent, so a surprising decision can be traced to energy, to the
 * return limit, or to a switching penalty instead of being taken on trust.
 *
 * WHETHER THE SOLVER SUCCEEDED. A fallback step is not an optimised step, and
 * the count of them is the first thing to check before believing a saving.
 */

/** Human labels for the constraint codes the solver reports as active. */
const ACTIVE_LABEL = {
  CHWR_LIMIT: 'CHWR return limit',
  CHWR_TERMINAL_LIMIT: 'CHWR limit at the horizon end',
  CAPACITY_SHORTFALL: 'staged capacity',
  LOOP_WARMING: 'cooling deferred into the loop',
  CHILLER_SWITCH: 'chiller switching penalty',
  OUTSIDE_OPERATING_HOURS: 'plant schedule',
};

const COST_LABEL = {
  energyKwh: 'Plant energy',
  unmetPenalty: 'Unservable cooling',
  loopCarryPenalty: 'Deferred cooling',
  chwrPenalty: 'CHWR overshoot',
  switchingPenalty: 'Chiller switching',
  movementPenalty: 'Setpoint movement',
  terminalStoragePenalty: 'Loop energy left behind',
  infeasiblePenalty: 'Constraint violation',
};

function StatusShell({ tone, title, children }) {
  return (
    <div className={`mpc-status ${tone}`}>
      <div className="mpc-status-title">{title}</div>
      {children}
    </div>
  );
}

export default function MpcStatusPanel({ status, run, error }) {
  const labels = useTwinStore((s) => s.mpcViolationLabels);

  if (status === 'RUNNING') {
    return (
      <StatusShell tone="mpc-status--running" title="MPC Optimisation">
        <p className="mpc-status-line">
          Solving the horizon at every step and replaying the baseline under identical
          conditions…
        </p>
        <div className="mpc-progress">
          <div className="mpc-progress-bar mpc-progress-bar--indeterminate" />
        </div>
        <p className="mpc-status-line mpc-status-line--muted">
          A longer run costs proportionally more: each step re-solves a full horizon.
        </p>
      </StatusShell>
    );
  }

  if (status === 'ERROR') {
    return (
      <StatusShell tone="mpc-status--error" title="MPC Error">
        <p className="mpc-status-line">{error || 'The run could not start.'}</p>
        <p className="mpc-status-line mpc-status-line--muted">
          A refused comparison is not a weak result — it means the two arms did not face
          identical conditions, so no saving could be attributed to the controller.
        </p>
      </StatusShell>
    );
  }

  if (!run) {
    return (
      <StatusShell tone="" title="MPC Status">
        <p className="mpc-status-line">Ready</p>
        <p className="mpc-status-line mpc-status-line--muted">
          Set the conditions on the left, the limits above, then run.
        </p>
      </StatusShell>
    );
  }

  const solver = run.solver;
  const failed = solver.fallbacks > 0;
  const infeasible = run.mpc.totals.infeasibleSteps;
  const cost = solver.firstStepCostKw ?? {};
  const violations = run.mpc.trajectory.flatMap((s) => s.violations ?? []);
  const byCode = new Map();
  for (const v of violations) byCode.set(v.code, (byCode.get(v.code) ?? 0) + 1);

  return (
    <StatusShell
      tone={failed || infeasible ? 'mpc-status--warn' : 'mpc-status--done'}
      title="Solver Status"
    >
      <div className="mpc-cycle-rows">
        <div><span>Solver</span><strong>{solver.name.replace(/ \(.*\)$/, '')}</strong></div>
        <div><span>Steps solved</span><strong>{solver.steps}</strong></div>
        <div>
          <span>Fallbacks</span>
          <strong className={failed ? 'bad' : 'ok'}>{solver.fallbacks}</strong>
        </div>
        <div><span>Mean solve time</span><strong>{n0(solver.meanSolveMs)} ms</strong></div>
        <div>
          <span>Statuses</span>
          <strong>
            {Object.entries(solver.statuses)
              .map(([k, v]) => `${v}× ${k}`)
              .join(', ')}
          </strong>
        </div>
        <div>
          <span>Infeasible steps</span>
          <strong className={infeasible ? 'bad' : 'ok'}>{infeasible}</strong>
        </div>
      </div>

      <div className="mpc-subhead">Objective, applied step (kW-equivalent)</div>
      <div className="mpc-cycle-rows">
        {Object.entries(cost)
          .filter(([, v]) => Number.isFinite(v))
          .map(([k, v]) => (
            <div key={k}>
              <span>{COST_LABEL[k] ?? k}</span>
              <strong className={v > 0 && k !== 'energyKwh' ? 'bad' : ''}>{n2(v)}</strong>
            </div>
          ))}
      </div>

      <div className="mpc-subhead">Constraints that bound the answer</div>
      {solver.activeConstraints.length === 0 ? (
        <p className="mpc-status-line mpc-status-line--muted">
          None — the optimum is interior, so widening a limit would not buy anything.
        </p>
      ) : (
        <ul className="mpc-reject-list">
          {solver.activeConstraints.map((code) => (
            <li key={code}>{ACTIVE_LABEL[code] ?? labels?.[code] ?? code}</li>
          ))}
        </ul>
      )}

      {byCode.size > 0 && (
        <>
          <div className="mpc-subhead">Violations recorded</div>
          <ul className="mpc-reject-list">
            {[...byCode.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <li key={code}>
                  {count} × {labels?.[code] ?? code}
                </li>
              ))}
          </ul>
        </>
      )}

      {failed && (
        <p className="mpc-warn">
          ▲ {solver.fallbacks} step(s) could not be solved and held the plant&apos;s own
          control instead. Those steps are not optimised, and the saving above includes them.
        </p>
      )}
    </StatusShell>
  );
}
