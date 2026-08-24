import React from "react";

/**
 * Chiller staging is a discrete decision — three machines or four, never 3.4 —
 * so it is drawn as a per-step timeline rather than smoothed into a line. A
 * step chart would be defensible; a spline would be a lie about the plant.
 *
 * Cells outlined in amber are steps where a machine actually started or
 * stopped, which is the number the switching penalty in the objective exists to
 * control.
 */
export default function StagingTimeline({ run, onHover, hoverIndex }) {
  if (!run) return null;

  const mpc = run.mpc.trajectory;
  const baseline = run.baseline.trajectory;
  const labels = mpc.map((s, i) => s.t?.slice(11, 16) ?? `${i + 1}`);

  const arm = (name, trajectory, kind) => (
    <div className="stage-row" style={{ "--steps": trajectory.length }} key={name}>
      <strong>{name}</strong>
      {trajectory.map((s, i) => (
        <span
          key={s.step}
          className={s.starts || s.stops ? "is-switch" : ""}
          onMouseEnter={() => onHover?.(i)}
          onMouseLeave={() => onHover?.(null)}
          style={hoverIndex === i ? { outline: "2px solid var(--tw-primary)" } : undefined}
          title={`${s.t ?? `step ${s.step + 1}`} — ${s.control.runningChillers} chillers${
            s.control.chillerIds?.length ? ` (${s.control.chillerIds.join(", ")})` : ""
          }${s.starts ? `, ${s.starts} start` : ""}${s.stops ? `, ${s.stops} stop` : ""}`}
        >
          {s.control.runningChillers}
        </span>
      ))}
    </div>
  );

  return (
    <article className="tw-card tw-card--flush stage-timeline">
      <div className="tw-chart-head">
        <div>
          <h3>Chiller staging</h3>
          <p>Machines running at each control step — a discrete decision, drawn discretely.</p>
        </div>
      </div>
      <div className="stage-scroll">
        <div className="stage-row stage-row--time" style={{ "--steps": labels.length }}>
          <strong>Time</strong>
          {labels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        {arm("Baseline", baseline, "baseline")}
        {arm("MPC", mpc, "mpc")}
      </div>
      <div className="stage-legend">
        <span>
          <i className="base" /> Baseline arm
        </span>
        <span>
          <i /> MPC arm
        </span>
        <span>
          <i className="switch" /> Start or stop at this step
        </span>
        <span>
          MPC starts {run.mpc.totals.chillerStarts} · baseline {run.baseline.totals.chillerStarts}
        </span>
      </div>
    </article>
  );
}
