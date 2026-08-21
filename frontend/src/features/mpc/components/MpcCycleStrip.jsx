import React from "react";

/**
 * The receding-horizon cycle, as a compact status strip.
 *
 * Not decoration. The one thing an operator has to be able to see about an MPC
 * is that it re-plans against a MEASUREMENT every step and applies only the
 * first move of each plan — otherwise it is an open-loop schedule, and a
 * schedule that was optimal three hours ago is not a controller.
 *
 * Each stage therefore shows a real number from the run rather than a label:
 * the measured loop temperature, the forecast horizon length, the plan the
 * solver produced, and the single action it actually applied.
 */

const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");

export default function MpcCycleStrip({ run, stepIndex = 0 }) {
  if (!run) return null;
  const step = run.mpc.trajectory[Math.min(stepIndex, run.mpc.trajectory.length - 1)];
  if (!step) return null;
  const d = step.diagnostics;
  const stepMinutes = run.scenario.stepMinutes;
  const horizonSteps = d?.plannedStaging?.length ?? 0;

  const stages = [
    {
      key: "measure",
      title: "Measure current state",
      value: `CHWR ${n2(step.loop.chwrC)} °C`,
      detail: `${step.loop.running.filter(Boolean).length} chillers running, loop temperature fed back from the previous step`,
    },
    {
      key: "forecast",
      title: "Forecast load / wet bulb",
      value: `${horizonSteps} × ${stepMinutes} min`,
      detail: `${run.scenario.forecast} — ${n1(step.disturbance.buildingLoadRt)} RT and ${n1(step.disturbance.wetBulbC)} °C now, ${horizonSteps * stepMinutes} min ahead planned`,
    },
    {
      key: "predict",
      title: "Predict plant",
      value: `${d?.nodesExpanded?.toLocaleString() ?? "—"} states`,
      detail: `${d?.nodesKept ?? "—"} trajectories kept after dominance pruning`,
    },
    {
      key: "optimize",
      title: "Optimise horizon",
      value: `${Math.round(d?.objectiveKw ?? 0).toLocaleString()} kW`,
      detail: `mean plant power over the plan · ${d?.solveMs ?? 0} ms · ${d?.solverStatus ?? "—"}`,
    },
    {
      key: "apply",
      title: "Apply FIRST action only",
      value: `${step.control.runningChillers} ch · ${n2(step.control.chwstSetpointC)} °C · ${n1(step.control.dpSetpointPsi)} psi`,
      detail:
        horizonSteps > 1
          ? `the remaining ${horizonSteps - 1} planned steps are discarded and re-solved next cycle`
          : "single-step plan",
    },
    {
      key: "step",
      title: "Simulate next state",
      value: `${n1(step.deliveredRt)} RT delivered`,
      detail: `${n1(step.result.totalPlantKw)} kW · ${n1(step.unmetRt)} RT deferred into the loop`,
    },
  ];

  return (
    <section className="vsp-section mpc-section">
      <h4>MPC Cycle</h4>
      <ol className="mpc-cycle">
        {stages.map((s, i) => (
          <li key={s.key} className="mpc-cycle-stage" title={s.detail}>
            <span className="mpc-cycle-index">{i + 1}</span>
            <span className="mpc-cycle-body">
              <span className="mpc-cycle-title">{s.title}</span>
              <span className="mpc-cycle-value">{s.value}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="vsp-desc">
        Repeated every {stepMinutes} minutes for {run.mpc.trajectory.length} steps. Showing step{" "}
        {step.step + 1}
        {step.t ? ` (${step.t.slice(11, 16)})` : ""}.
        {run.solver.fallbacks > 0
          ? ` ${run.solver.fallbacks} step(s) fell back to the plant's own control.`
          : " No step needed the fallback."}
      </p>
    </section>
  );
}
