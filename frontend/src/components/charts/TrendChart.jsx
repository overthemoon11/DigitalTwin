import React, { useMemo, useState } from "react";

/**
 * The one chart in the product.
 *
 * Hand-rolled SVG rather than a charting dependency, for the same reason the
 * old sparklines were: these are 8–96 points and the whole renderer is smaller
 * than the wrapper a library would need. What is new is that it is now sized to
 * be read (260–320px of plot) instead of squeezed into a 300px sidebar.
 *
 * Series conventions, applied everywhere so a reader never has to check a
 * legend twice:
 *
 *   baseline   neutral grey, dashed  — what the plant's own control did
 *   mpc        primary blue, solid   — what the optimiser did
 *   forecast   slate, solid          — a disturbance BOTH arms faced
 *   chw / chwr / cond / alt          — physical channels, HVAC semantics
 *
 * `hoverIndex` / `onHover` are optional. Passing the pair from a parent makes a
 * whole grid of charts share one crosshair, which is what makes "the MPC pulled
 * DP down exactly when the load dropped" visible rather than asserted.
 */

const W = 720;
const PAD = { top: 22, right: 20, bottom: 34, left: 62 };

const finite = (v) => (Number.isFinite(v) ? v : null);
const fixed = (v, d) => (Number.isFinite(v) ? Number(v).toFixed(d) : "—");

/** Round a raw axis span out to a readable step so gridlines land on real numbers. */
function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(8)));
  return out.length >= 2 ? out : [min, max];
}

export default function TrendChart({
  title,
  subtitle,
  unit,
  labels = [],
  series = [],
  decimals = 1,
  height = "std",
  step = false,
  emptyHint = "Run the MPC optimisation to populate this trajectory.",
  hoverIndex,
  onHover,
  headActions,
}) {
  const [localHover, setLocalHover] = useState(null);
  // `self` is what keeps a synchronised grid readable: every chart draws the
  // shared crosshair, but only the one under the pointer opens a tooltip.
  // Twelve simultaneous tooltips is not a synchronised view, it is confetti.
  const [self, setSelf] = useState(false);
  const controlled = hoverIndex !== undefined;
  const hovered = controlled ? hoverIndex : localHover;
  const setHovered = (index) => {
    setSelf(index != null);
    if (controlled) onHover?.(index);
    else setLocalHover(index);
  };

  const H = height === "tall" ? 330 : 276;

  const geometry = useMemo(() => {
    const values = series.flatMap((s) => s.values.map(finite)).filter((v) => v != null);
    if (!values.length) return null;

    let min = Math.min(...values);
    let max = Math.max(...values);
    const pad = Math.max((max - min) * 0.09, Math.abs(max || 1) * 0.012, 1e-3);
    min -= pad;
    max += pad;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const count = Math.max(labels.length, ...series.map((s) => s.values.length), 1);
    const x = (i) => PAD.left + (count <= 1 ? innerW / 2 : (i / (count - 1)) * innerW);
    const y = (v) => PAD.top + (1 - (v - min) / (max - min || 1)) * innerH;

    const paths = series.map((s) => {
      let d = "";
      let prevY = null;
      s.values.forEach((raw, i) => {
        const v = finite(raw);
        if (v == null) return;
        const px = x(i);
        const py = y(v);
        if (!d) {
          d = `M${px.toFixed(1)},${py.toFixed(1)}`;
        } else if (step) {
          d += `L${px.toFixed(1)},${prevY.toFixed(1)}L${px.toFixed(1)},${py.toFixed(1)}`;
        } else {
          d += `L${px.toFixed(1)},${py.toFixed(1)}`;
        }
        prevY = py;
      });
      return { ...s, d };
    });

    return { min, max, x, y, paths, count, innerH };
  }, [labels, series, step, H]);

  const head = (
    <div className="tw-chart-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="tw-chart-legend">
        {series.map((s) => (
          <span key={s.name} className={`tw-chart-key tw-chart-key--${s.kind || "mpc"}`}>
            {s.name}
          </span>
        ))}
        {headActions}
      </div>
    </div>
  );

  if (!geometry) {
    return (
      <article className={`tw-card tw-card--flush tw-chart tw-chart--${height}`}>
        {head}
        <div className="tw-chart-empty">{emptyHint}</div>
      </article>
    );
  }

  const ticks = niceTicks(geometry.min, geometry.max);
  const last = geometry.count - 1;
  // Evenly spaced ticks on a whole-step stride, plus the final step, so the
  // axis reads 00:00 / 01:00 / 02:00 rather than drifting to 02:45.
  const tickCount = geometry.count > 30 ? 6 : geometry.count > 12 ? 5 : 4;
  const stride = Math.max(1, Math.round(last / Math.max(tickCount - 1, 1)));
  const xIndexes = [...new Set([...Array.from({ length: tickCount }, (_, i) => i * stride).filter((i) => i < last), last])];

  return (
    <article className={`tw-card tw-card--flush tw-chart tw-chart--${height}`}>
      {head}
      <div className="tw-chart-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}${unit ? ` in ${unit}` : ""}`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={geometry.y(tick)}
                y2={geometry.y(tick)}
                className="tw-grid-line"
              />
              <text x={PAD.left - 11} y={geometry.y(tick) + 3.5} textAnchor="end" className="tw-axis-text">
                {fixed(tick, decimals)}
              </text>
            </g>
          ))}

          {unit && (
            <text x={8} y={PAD.top - 8} className="tw-axis-unit">
              {unit}
            </text>
          )}

          {xIndexes.map((i) => (
            <text
              key={i}
              x={geometry.x(i)}
              y={H - 11}
              textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
              className="tw-axis-text"
            >
              {labels[i] ?? `${i + 1}`}
            </text>
          ))}

          {geometry.paths.map((s) => (
            <path
              key={s.name}
              d={s.d}
              className={`tw-line tw-line--${s.kind || "mpc"} ${step ? "tw-step" : ""}`}
            />
          ))}

          {hovered != null && hovered >= 0 && hovered < geometry.count && (
            <>
              <line
                x1={geometry.x(hovered)}
                x2={geometry.x(hovered)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                className="tw-hover-line"
              />
              {series.map((s) => {
                const v = finite(s.values[hovered]);
                if (v == null) return null;
                return (
                  <circle
                    key={s.name}
                    cx={geometry.x(hovered)}
                    cy={geometry.y(v)}
                    r={4}
                    className="tw-hover-dot"
                    fill={`var(--tw-${
                      s.kind === "baseline"
                        ? "baseline"
                        : s.kind === "chw"
                          ? "chw"
                          : s.kind === "chwr"
                            ? "chwr"
                            : s.kind === "cond"
                              ? "cond"
                              : s.kind === "alt"
                                ? "cond-alt"
                                : "primary"
                    })`}
                  />
                );
              })}
            </>
          )}

          {Array.from({ length: geometry.count }, (_, i) => {
            const band = (W - PAD.left - PAD.right) / Math.max(geometry.count - 1, 1);
            return (
              <rect
                key={i}
                x={geometry.x(i) - band / 2}
                y={PAD.top}
                width={Math.max(band, 6)}
                height={geometry.innerH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {self && hovered != null && hovered >= 0 && hovered < geometry.count && (
          <div
            className="tw-chart-tip"
            style={{
              left: `${Math.min(Math.max((geometry.x(hovered) / W) * 100, 13), 87)}%`,
            }}
          >
            <strong>{labels[hovered] ?? `Step ${hovered + 1}`}</strong>
            {series.map((s) => (
              <span key={s.name}>
                <i className={`tw-dot tw-dot--${s.kind || "mpc"}`} />
                {s.name}
                <b>
                  {fixed(s.values[hovered], decimals)}
                  {unit ? ` ${unit}` : ""}
                </b>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
