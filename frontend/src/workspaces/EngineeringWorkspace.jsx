import React, { useMemo, useState } from "react";
import ConstraintPanel from "../features/mpc/components/ConstraintPanel";
import ModelStatusPanel from "../features/mpc/components/ModelStatusPanel";
import ChillerScadaPanel from "../components/chiller/ChillerScadaPanel";
import BmsPointsTable from "../components/chiller/BmsPointsTable";
import { Card, CardHead, EmptyState, InfoHint, Metric, PageHead, SectionTitle, StatusPill, Tabs, fmt } from "../components/ui/Primitives";
import { EngineeringIcon, SolverIcon } from "../components/ui/TwIcons";
import { ACTIVE_CONSTRAINT, COST_LABEL, solverState } from "../features/mpc/horizonSelectors";
import { useTwinStore } from "../store/useTwinStore";

/**
 * ENGINEERING — advanced configuration and diagnostics.
 *
 * Everything an operator does not need in order to read the plant, and an
 * engineer cannot work without. Each tab is a workspace in its own right rather
 * than an accordion in a rail: the constraint set alone is forty-odd bounded
 * quantities, and it was previously being read through a 300px slot.
 */

const TABS = [
  { id: "constraints", label: "Constraints" },
  { id: "solver", label: "Solver" },
  { id: "bms", label: "BMS points" },
  { id: "model", label: "Model & calibration" },
  { id: "manual", label: "Manual control" },
];

const FAULTS = [
  { id: "chiller_fault", label: "Chiller trip (CH-3)", note: "Takes CH-3 offline and raises the alarm path." },
  { id: "pump_trip", label: "Pump trip (CHWP-2)", note: "Drops one chilled-water pump." },
  { id: "ct_fan", label: "Tower fan fault (CT-3)", note: "Fails one cooling-tower fan." },
  { id: "makeup_fail", label: "Make-up pump failure", note: "Stops condenser make-up water." },
];

function SolverTab({ run, status, error, violationLabels }) {
  const state = solverState(status, run);

  if (!run) {
    return (
      <EmptyState glyph={<SolverIcon size={22} />} title="No solver output yet">
        <p>
          {status === "ERROR"
            ? error || "The last run could not start."
            : "Solver diagnostics are produced by a horizon run. Nothing here is populated until one has completed."}
        </p>
      </EmptyState>
    );
  }

  const solver = run.solver;
  const infeasible = run.mpc.totals.infeasibleSteps;
  const cost = solver.firstStepCostKw ?? {};

  const violations = run.mpc.trajectory.flatMap((s) => s.violations ?? []);
  const byCode = new Map();
  for (const v of violations) byCode.set(v.code, (byCode.get(v.code) ?? 0) + 1);

  return (
    <div className="an-stack">
      <div className="eng-grid eng-grid--two">
        <Card>
          <CardHead
            eyebrow="MPC solver"
            title={solver.name}
            subtitle="One horizon solved per control step, of which only the first move is applied."
            actions={<StatusPill tone={state.tone}>{state.label}</StatusPill>}
          />
          <div className="tw-metric-grid">
            <Metric label="Steps solved" value={`${solver.steps}`} note={`${run.scenario.stepMinutes} min each`} />
            <Metric label="Fallbacks" value={`${solver.fallbacks}`} note={solver.fallbacks ? "not optimised" : "none needed"} />
            <Metric label="Mean solve time" value={fmt(solver.meanSolveMs, 0)} unit="ms" />
            <Metric label="Total solve time" value={fmt(solver.totalSolveMs, 0)} unit="ms" />
            <Metric label="Infeasible steps" value={`${infeasible}`} />
            <Metric
              label="Statuses"
              value={Object.entries(solver.statuses)
                .map(([k, v]) => `${v}× ${k}`)
                .join(", ")}
            />
          </div>

          {solver.fallbacks > 0 && (
            <p className="tw-alert tw-alert--warn" style={{ marginTop: 14 }}>
              {solver.fallbacks} step(s) could not be solved and held the plant&apos;s own control instead. Those
              steps are not optimised, and the reported saving includes them.
            </p>
          )}
        </Card>

        <Card>
          <CardHead
            eyebrow="Objective"
            title="Applied step, kW-equivalent"
            tight
            subtitle="Every term the cost function evaluated for the move that was applied."
          />
          {Object.entries(cost)
            .filter(([, v]) => Number.isFinite(v))
            .map(([key, value]) => (
              <div className="tw-datarow" key={key}>
                <span>{COST_LABEL[key] ?? key}</span>
                <strong style={value > 0 && key !== "energyKwh" ? { color: "var(--tw-warning-ink)" } : undefined}>
                  {fmt(value, 2)}
                </strong>
              </div>
            ))}
        </Card>
      </div>

      <div className="eng-grid eng-grid--two">
        <Card>
          <CardHead
            eyebrow="Active set"
            title="Constraints that bound the answer"
            tight
            subtitle={
              solver.activeConstraints.length === 0
                ? "None — the optimum is interior, so widening a limit would not buy anything."
                : "Each of these is a limit the optimum is sitting on."
            }
          />
          {solver.activeConstraints.length > 0 && (
            <div className="opt-binding">
              {solver.activeConstraints.map((code) => (
                <div className="opt-binding-item" key={code}>
                  <i />
                  <span>
                    {ACTIVE_CONSTRAINT[code]?.label ?? violationLabels?.[code] ?? code}
                    {ACTIVE_CONSTRAINT[code]?.why && <small>{ACTIVE_CONSTRAINT[code].why}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            eyebrow="Violations"
            title="Recorded across the run"
            tight
            subtitle={byCode.size === 0 ? "No step recorded a violation." : "Counted over every step of the MPC arm."}
          />
          {[...byCode.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => (
              <div className="tw-datarow" key={code}>
                <span>{violationLabels?.[code] ?? code}</span>
                <strong>{count}</strong>
              </div>
            ))}
        </Card>
      </div>

      <SectionTitle
        title="Step-by-step diagnostics"
        note="What the solver did at every control step, exactly as it reported it."
      />
      <Card className="eng-table-card">
        <div className="eng-table-wrap eng-solver-table-wrap">
          <table className="tw-table eng-solver-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Time</th>
                <th>Status</th>
                <th className="num">Solve ms</th>
                <th className="num">Objective kW</th>
                <th className="num">Nodes expanded</th>
                <th className="num">Nodes kept</th>
                <th className="num">Chillers</th>
                <th className="num">CHWST °C</th>
                <th className="num">DP psi</th>
                <th>Fallback</th>
              </tr>
            </thead>
            <tbody>
              {run.mpc.trajectory.map((step) => {
                const d = step.diagnostics;
                return (
                  <tr key={step.step}>
                    <td className="num">{step.step + 1}</td>
                    <td className="muted">{step.t?.slice(11, 16) ?? "—"}</td>
                    <td>
                      <span
                        className={`tw-prov ${
                          d?.solverStatus === "OPTIMAL"
                            ? "tw-prov--optimized"
                            : d?.solverStatus === "FALLBACK"
                              ? "tw-prov--fixed"
                              : "tw-prov--derived"
                        }`}
                      >
                        {d?.solverStatus ?? "—"}
                      </span>
                    </td>
                    <td className="num">{fmt(d?.solveMs, 0)}</td>
                    <td className="num">{fmt(d?.objectiveKw, 1)}</td>
                    <td className="num">{d?.nodesExpanded?.toLocaleString() ?? "—"}</td>
                    <td className="num">{d?.nodesKept ?? "—"}</td>
                    <td className="num">{step.control.runningChillers}</td>
                    <td className="num">{fmt(step.control.chwstSetpointC, 2)}</td>
                    <td className="num">{fmt(step.control.dpSetpointPsi, 1)}</td>
                    <td className="muted">{d?.fallbackUsed ? d.fallbackReason || "yes" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle title="Run provenance" note="How the conditions this run replayed were established, field by field." />
      <div className="eng-grid">
        <Card>
          <CardHead eyebrow="Scenario" title="Conditions" tight />
          <div className="tw-datarow tw-datarow--wrap">
            <span>Source</span>
            <strong>{run.conditions.source}</strong>
          </div>
          <div className="tw-datarow">
            <span>Day</span>
            <strong>{run.conditions.day ?? "—"}</strong>
          </div>
          <div className="tw-datarow tw-datarow--wrap">
            <span>Baseline controller</span>
            <strong>{run.scenario.baselineKind}</strong>
          </div>
          <div className="tw-datarow">
            <span>Forecast</span>
            <strong>{run.scenario.forecast}</strong>
          </div>
          <div className="tw-datarow tw-datarow--wrap">
            <span>Flow model</span>
            <strong title={run.scenario.flowModel.provenance}>{run.scenario.flowModel.name}</strong>
          </div>
          {run.scenario.qualityFlags.length > 0 && (
            <p className="tw-alert tw-alert--warn" style={{ marginTop: 12 }}>
              Quality flags on the replayed buckets: {run.scenario.qualityFlags.join(", ")}
            </p>
          )}
        </Card>

        <Card>
          <CardHead
            eyebrow="Field provenance"
            title="Measured, derived, inferred or assumed"
            tight
            subtitle="Reported per field by the server, not classified by the interface."
          />
          {Object.entries(run.scenario.provenance ?? {}).map(([field, kind]) => (
            <div className="tw-datarow tw-datarow--wrap" key={field}>
              <span>{field}</span>
              <strong>{kind}</strong>
            </div>
          ))}
        </Card>

        <Card>
          <CardHead
            eyebrow="Loop dynamics"
            title="Thermal storage model"
            tight
            subtitle={run.scenario.loopDynamics.calibration.note}
          />
          <div className="tw-datarow">
            <span>Equivalent loop volume</span>
            <strong>
              {fmt(run.scenario.loopDynamics.equivalentVolumeM3, 1)}
              <em>m³</em>
            </strong>
          </div>
          <div className="tw-datarow tw-datarow--wrap">
            <span>Calibration</span>
            <strong>{run.scenario.loopDynamics.calibration.status}</strong>
          </div>
          {Object.entries(run.scenario.loopDynamics.config ?? {}).map(([key, value]) => (
            <div className="tw-datarow" key={key}>
              <span>{key}</span>
              <strong>{typeof value === "number" ? fmt(value, 3) : String(value)}</strong>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

export default function EngineeringWorkspace({
  tab,
  onTabChange,
  plantState,
  constraints,
  constraintErrors,
  onSetConstraint,
  onSetFleet,
  onSetAvailable,
  onResetConstraints,
  status,
  run,
  error,
  modelStatus,
  twinValidation,
  onLoadValidation,
  onUpdateControl,
  onToggleDuty,
  onResetPlant,
  onTriggerFault,
  onAdvance,
  onRun,
}) {
  const violationLabels = useTwinStore((s) => s.mpcViolationLabels);
  const running = status === "RUNNING";
  const invalid = (constraintErrors?.length ?? 0) > 0;
  const [confirmFault, setConfirmFault] = useState(null);

  const errorSummary = useMemo(() => {
    const bySection = new Map();
    for (const e of constraintErrors ?? []) bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
    return [...bySection.entries()];
  }, [constraintErrors]);

  return (
    <div className="tw-page">
      <PageHead
        eyebrow="Engineering"
        title="Configuration & diagnostics"
        subtitle="The limits the optimiser must respect, what the solver did with them, the measured points behind it all, and how far the model is actually calibrated."
        actions={<Tabs items={TABS} value={tab} onChange={onTabChange} label="Engineering view" />}
      />

      {tab === "constraints" && (
        <div className="an-stack">
          <div className="tw-page-head" style={{ marginBottom: 4 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>MPC constraint set</h3>
              <p style={{ margin: "5px 0 0", maxWidth: "70ch", color: "var(--tw-ink-2)", fontSize: "0.78rem" }}>
                Physical and operational limits the optimiser must respect. These bound the search — they are
                not commands, and nothing here writes a setpoint to the plant.
              </p>
            </div>
            <div className="tw-page-head-actions">
              {invalid ? (
                <StatusPill tone="bad" title={errorSummary.map(([s, n]) => `${s}: ${n}`).join(", ")}>
                  {constraintErrors.length} problem{constraintErrors.length === 1 ? "" : "s"}
                </StatusPill>
              ) : (
                <StatusPill tone="ok">Valid</StatusPill>
              )}
              <button type="button" className="tw-btn tw-btn--sm" onClick={onResetConstraints} disabled={running}>
                Reset to design
              </button>
              <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" onClick={onRun} disabled={running || invalid}>
                {running ? "Running…" : "Run MPC"}
              </button>
            </div>
          </div>

          <ConstraintPanel
            variant="workspace"
            constraints={constraints}
            errors={constraintErrors}
            disabled={running}
            onSet={onSetConstraint}
            onSetFleet={onSetFleet}
            onSetAvailable={onSetAvailable}
            onReset={onResetConstraints}
          />
        </div>
      )}

      {tab === "solver" && (
        <SolverTab run={run} status={status} error={error} violationLabels={violationLabels} />
      )}

      {tab === "bms" && (
        <BmsPointsTable plantState={plantState} onToggleDuty={onToggleDuty} onSetControl={onUpdateControl} />
      )}

      {tab === "model" && (
        <div className="an-stack">
          {modelStatus ? (
            <Card className="eng-host eng-host--padded">
              <ModelStatusPanel
                modelStatus={modelStatus}
                twinValidation={twinValidation}
                onLoadValidation={onLoadValidation}
              />
            </Card>
          ) : (
            <EmptyState glyph={<EngineeringIcon size={22} />} title="Model status not loaded">
              <p>The backend has not returned the model registry for this site yet.</p>
            </EmptyState>
          )}
        </div>
      )}

      {tab === "manual" && (
        <div className="an-stack">
          <SectionTitle
            title="Manual plant controls"
            note="These DO write to the twin. They are here, not on the Plant page, because a monitoring screen should not be one mis-click from moving a setpoint."
          />
          <Card className="eng-host eng-host--padded">
            <ChillerScadaPanel plantState={plantState} onSet={onUpdateControl} />
          </Card>

          <SectionTitle
            title="Simulator operations"
            note="Actions against the virtual plant. Nothing here reaches a real building."
          />
          <div className="eng-grid">
            <Card>
              <CardHead
                eyebrow="State"
                title="Reset & advance"
                tight
                subtitle="The twin ticks continuously on the backend; these are explicit operations on top of that."
              />
              <div className="plant-context-actions" style={{ justifyContent: "flex-start" }}>
                <button type="button" className="tw-btn tw-btn--sm" onClick={() => onAdvance(60)}>
                  Advance 60 s
                </button>
                <button type="button" className="tw-btn tw-btn--sm" onClick={onResetPlant}>
                  Reset plant to design
                </button>
              </div>
            </Card>

            <Card>
              <CardHead
                eyebrow="Fault injection"
                title="Exercise the alarm path"
                tight
                subtitle="Injects a simulated equipment failure so the alarm engine and the operator response can be tested. Reset the plant to clear."
                actions={
                  <InfoHint title="What these do">
                    Each fault sets a flag inside the twin&apos;s control engine — a tripped chiller, a dropped
                    pump, a failed tower fan or a stopped make-up pump. The physics then runs with that unit
                    unavailable and the alarm engine reacts. Resetting the plant clears every injected fault.
                  </InfoHint>
                }
              />
              <div className="eng-chips">
                {FAULTS.map((fault) => (
                  <button
                    key={fault.id}
                    type="button"
                    className="eng-chip"
                    title={fault.note}
                    aria-pressed={confirmFault === fault.id}
                    onClick={() => {
                      if (confirmFault === fault.id) {
                        onTriggerFault(fault.id);
                        setConfirmFault(null);
                      } else {
                        setConfirmFault(fault.id);
                      }
                    }}
                  >
                    {confirmFault === fault.id ? `Confirm — ${fault.label}` : fault.label}
                  </button>
                ))}
              </div>
              {confirmFault && (
                <p className="tw-alert tw-alert--warn" style={{ marginTop: 12 }}>
                  Click again to inject. This changes the live twin state.
                  <button
                    type="button"
                    className="tw-btn tw-btn--sm tw-btn--ghost"
                    onClick={() => setConfirmFault(null)}
                  >
                    Cancel
                  </button>
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
