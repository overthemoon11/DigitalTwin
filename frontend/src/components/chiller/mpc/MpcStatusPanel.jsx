import React from 'react';
import { VIOLATION_LABELS } from '../../../services/chiller/mpc';

const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const n3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
const kw = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} kW` : '—');

/**
 * Rejection counts grouped by their human label, biggest first. Codes are
 * finer-grained than labels (chw-flow-min and chw-flow-max are both "CHW
 * flow"), so grouping by code would print the same reason twice.
 */
function rejectionsByLabel(rejectionsByCode) {
  const merged = new Map();
  for (const [code, count] of Object.entries(rejectionsByCode ?? {})) {
    const label = VIOLATION_LABELS[code] ?? code;
    merged.set(label, (merged.get(label) ?? 0) + count);
  }
  return [...merged.entries()].sort((a, b) => b[1] - a[1]);
}

function CandidateRows({ control }) {
  if (!control) return null;
  return (
    <div className="mpc-cycle-rows">
      <div><span>CHWST-SP</span><strong>{n1(control.chwstSetpointC)} °C</strong></div>
      <div><span>DP-SP</span><strong>{n1(control.dpSetpointPsi)} psi</strong></div>
      <div><span>Chillers</span><strong>{control.runningChillers}</strong></div>
      <div><span>CHWP</span><strong>{n1(control.chwpSpeedPct)} %</strong></div>
      <div><span>CWP</span><strong>{n1(control.cwpSpeedPct)} %</strong></div>
      <div><span>CT</span><strong>{n1(control.ctFanSpeedPct)} %</strong></div>
    </div>
  );
}

/**
 * MPC execution panel: idle prompt, live cycle trace while searching, and the
 * completion summary with the rejection breakdown.
 *
 * The rejection tally counts CANDIDATES by their first violated constraint, so
 * the numbers add up to the rejected count rather than double-counting a
 * candidate that broke several rules at once.
 */
export default function MpcStatusPanel({ status, progress, result, error }) {
  if (status === 'RUNNING' || status === 'VALIDATING') {
    const pct = progress?.totalCycles
      ? Math.min(100, Math.round((progress.cycle / progress.totalCycles) * 100))
      : 0;
    return (
      <div className="mpc-status mpc-status--running">
        <div className="mpc-status-title">MPC Optimization</div>
        {status === 'VALIDATING' ? (
          <p className="mpc-status-line">Validating constraints…</p>
        ) : (
          <>
            <p className="mpc-status-line">
              Cycle {progress?.cycle ?? 0} / {progress?.totalCycles ?? '—'}
            </p>
            <div className="mpc-subhead">Current Candidate</div>
            <CandidateRows control={progress?.candidate} />
            <div className="mpc-subhead">Candidate Result</div>
            <div className="mpc-cycle-rows">
              <div><span>Plant kW</span><strong>{kw(progress?.result?.totalPlantKw)}</strong></div>
              <div><span>Plant kW/RT</span><strong>{n3(progress?.result?.plantKwPerRt)}</strong></div>
              <div>
                <span>Feasible</span>
                <strong className={progress?.result?.feasible ? 'ok' : 'bad'}>
                  {progress?.result?.feasible ? 'yes' : 'rejected'}
                </strong>
              </div>
            </div>
            <div className="mpc-subhead">Best So Far</div>
            <div className="mpc-cycle-rows">
              <div><span>Plant kW</span><strong>{kw(progress?.bestTotalKw)}</strong></div>
              <div><span>Plant kW/RT</span><strong>{n3(progress?.bestKwPerRt)}</strong></div>
            </div>
            <div className="mpc-progress"><div className="mpc-progress-bar" style={{ width: `${pct}%` }} /></div>
            <div className="mpc-progress-pct">{pct}%</div>
          </>
        )}
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="mpc-status mpc-status--error">
        <div className="mpc-status-title">MPC Error</div>
        <p className="mpc-status-line">{error || 'Optimisation could not start.'}</p>
      </div>
    );
  }

  if (status === 'INFEASIBLE') {
    const codes = rejectionsByLabel(result?.rejectionsByCode);
    return (
      <div className="mpc-status mpc-status--error">
        <div className="mpc-status-title">No Feasible Solution</div>
        <p className="mpc-status-line">
          No operating combination satisfies the current load and constraints.
        </p>
        {codes.length > 0 && (
          <>
            <div className="mpc-subhead">Limiting constraints</div>
            <ul className="mpc-reject-list">
              {codes.slice(0, 6).map(([label, count]) => (
                <li key={label}>
                  {count} × {label}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mpc-status-line mpc-status-line--muted">
          {result?.evaluatedCandidates ?? 0} candidates evaluated, all rejected.
        </p>
      </div>
    );
  }

  if (status === 'COMPLETED' && result) {
    const codes = rejectionsByLabel(result.rejectionsByCode);
    return (
      <div className="mpc-status mpc-status--done">
        <div className="mpc-status-title">MPC Complete</div>
        <div className="mpc-cycle-rows">
          <div><span>Evaluated</span><strong>{result.evaluatedCandidates}</strong></div>
          <div><span>Feasible</span><strong className="ok">{result.feasibleCandidates}</strong></div>
          <div><span>Rejected</span><strong className="bad">{result.rejectedCandidates}</strong></div>
        </div>
        <div className="mpc-subhead">Best Plant Power</div>
        <div className="mpc-cycle-rows">
          <div><span>Plant kW</span><strong>{kw(result.optimalResult?.totalPlantKw)}</strong></div>
          <div><span>Plant kW/RT</span><strong>{n3(result.optimalResult?.plantKwPerRt)}</strong></div>
          <div><span>Saving</span><strong className={result.savingKw > 0 ? 'ok' : ''}>{n1(result.savingKw)} kW · {n1(result.savingPct)} %</strong></div>
        </div>
        {codes.length > 0 && (
          <>
            <div className="mpc-subhead">Rejected</div>
            <ul className="mpc-reject-list">
              {codes.slice(0, 5).map(([label, count]) => (
                <li key={label}>
                  {count} × {label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mpc-status">
      <div className="mpc-status-title">MPC Status</div>
      <p className="mpc-status-line">Ready</p>
      <p className="mpc-status-line mpc-status-line--muted">Waiting for simulation</p>
    </div>
  );
}
