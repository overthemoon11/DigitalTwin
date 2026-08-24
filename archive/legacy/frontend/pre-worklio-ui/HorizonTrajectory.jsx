import React from "react";

/**
 * The three trajectories a horizon run produces, drawn as inline sparklines.
 *
 *   FORECAST      the disturbances both arms faced. One series, not two —
 *                 drawing it once is the visual form of the fairness guarantee.
 *   CONTROL       what each arm did. Baseline above, MPC below, same scale, so
 *                 "the MPC moved this and the incumbent did not" is visible
 *                 rather than asserted.
 *   PLANT STATE   what came out: plant power and the loop temperature that the
 *                 whole horizon exists to manage.
 *
 * Hand-rolled SVG rather than a charting dependency: these are 8-96 points in a
 * 60px strip, and a library would be more code than the paths.
 */

const PAD = 2;
const W = 240;
const H = 34;

function path(values, min, max) {
  const finite = values.map((v) => (Number.isFinite(v) ? v : null));
  const span = max - min || 1;
  const dx = finite.length > 1 ? (W - PAD * 2) / (finite.length - 1) : 0;
  let d = "";
  finite.forEach((v, i) => {
    if (v == null) return;
    const x = PAD + i * dx;
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    d += `${d ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return d;
}

function Spark({ label, unit, series, decimals = 1 }) {
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const last = (s) => {
    const v = [...s.values].reverse().find((x) => Number.isFinite(x));
    return Number.isFinite(v) ? v.toFixed(decimals) : "—";
  };

  return (
    <div className="mpc-spark">
      <div className="mpc-spark-head">
        <span className="mpc-spark-label">{label}</span>
        <span className="mpc-spark-range">
          {min.toFixed(decimals)}–{max.toFixed(decimals)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mpc-spark-svg" preserveAspectRatio="none" role="img"
        aria-label={`${label}: ${min.toFixed(decimals)} to ${max.toFixed(decimals)} ${unit}`}>
        {series.map((s) => (
          <path key={s.name} d={path(s.values, min, max)} className={`mpc-spark-line mpc-spark-line--${s.kind}`} />
        ))}
      </svg>
      <div className="mpc-spark-legend">
        {series.map((s) => (
          <span key={s.name} className={`mpc-spark-key mpc-spark-key--${s.kind}`}>
            {s.name} {last(s)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Chillers running at each step, as a row of cells. */
function StagingStrip({ label, trajectory, kind }) {
  return (
    <div className="mpc-strip-row">
      <span className={`mpc-strip-label mpc-strip-label--${kind}`}>{label}</span>
      <div className="mpc-strip">
        {trajectory.map((s) => (
          <span
            key={s.step}
            className={`mpc-strip-cell mpc-strip-cell--n ${s.starts || s.stops ? "mpc-strip-cell--switch" : ""}`}
            title={`${s.t ?? `step ${s.step + 1}`} — ${s.control.runningChillers} chillers, ${Math.round(
              s.disturbance.buildingLoadRt
            )} RT, ${Math.round(s.result.totalPlantKw)} kW`}
          >
            {s.control.runningChillers}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HorizonTrajectory({ run }) {
  if (!run) return null;
  const base = run.baseline.trajectory;
  const mpc = run.mpc.trajectory;
  const pick = (t, f) => t.map(f);

  return (
    <section className="vsp-section mpc-section">
      <h4>Trajectories</h4>

      <div className="mpc-subhead">Forecast — the conditions BOTH arms faced</div>
      <Spark
        label="Building load"
        unit="RT"
        decimals={0}
        series={[{ name: "load", kind: "disturbance", values: pick(mpc, (s) => s.disturbance.buildingLoadRt) }]}
      />
      <Spark
        label="Wet bulb"
        unit="°C"
        series={[{ name: "wet bulb", kind: "disturbance", values: pick(mpc, (s) => s.disturbance.wetBulbC) }]}
      />

      <div className="mpc-subhead">Control — what each arm did</div>
      <StagingStrip label="Baseline" trajectory={base} kind="baseline" />
      <StagingStrip label="MPC" trajectory={mpc} kind="mpc" />
      <Spark
        label="CHWST setpoint"
        unit="°C"
        decimals={2}
        series={[
          { name: "baseline", kind: "baseline", values: pick(base, (s) => s.control.chwstSetpointC) },
          { name: "MPC", kind: "mpc", values: pick(mpc, (s) => s.control.chwstSetpointC) },
        ]}
      />
      <Spark
        label="DP setpoint"
        unit="psi"
        series={[
          { name: "baseline", kind: "baseline", values: pick(base, (s) => s.control.dpSetpointPsi) },
          { name: "MPC", kind: "mpc", values: pick(mpc, (s) => s.control.dpSetpointPsi) },
        ]}
      />
      <Spark
        label="CWP / CT fan speed"
        unit="%"
        series={[
          { name: "CWP", kind: "mpc", values: pick(mpc, (s) => s.control.cwpSpeedPct) },
          { name: "CT fan", kind: "alt", values: pick(mpc, (s) => s.control.ctFanSpeedPct) },
        ]}
      />

      <div className="mpc-subhead">Plant state — what came out</div>
      <Spark
        label="Total plant power"
        unit="kW"
        decimals={0}
        series={[
          { name: "baseline", kind: "baseline", values: pick(base, (s) => s.result.totalPlantKw) },
          { name: "MPC", kind: "mpc", values: pick(mpc, (s) => s.result.totalPlantKw) },
        ]}
      />
      <Spark
        label="Loop return (CHWR)"
        unit="°C"
        decimals={2}
        series={[
          { name: "baseline", kind: "baseline", values: pick(base, (s) => s.loop.chwrC) },
          { name: "MPC", kind: "mpc", values: pick(mpc, (s) => s.loop.chwrC) },
        ]}
      />
      <Spark
        label="Cooling delivered"
        unit="RT"
        decimals={0}
        series={[
          { name: "baseline", kind: "baseline", values: pick(base, (s) => s.deliveredRt) },
          { name: "MPC", kind: "mpc", values: pick(mpc, (s) => s.deliveredRt) },
        ]}
      />
    </section>
  );
}
