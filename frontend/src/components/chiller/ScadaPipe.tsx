import { LOOP, flowDuration } from './scadaTheme';

interface Props {
  d: string;
  loop: keyof typeof LOOP;
  /** 0–100 pump/fan speed for animation rate; 0 = static dashed */
  flowSpeed?: number;
  running?: boolean;
  width?: number;
  dashed?: boolean;
  /** Static pipe with directional arrowheads instead of the moving-dash flow. */
  arrows?: boolean;
  /** Flip arrow direction relative to the path's drawn order. */
  reverse?: boolean;
}

/** Parse an "M x y L x y L x y…" path into direction arrows at segment midpoints. */
function pipeArrows(d: string, reverse: boolean) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const out: { x: number; y: number; deg: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x1, y1] = pts[i];
    let [x2, y2] = pts[i + 1];
    if (reverse) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.hypot(dx, dy) < 40) continue; // skip short stubs
    out.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, deg: (Math.atan2(dy, dx) * 180) / Math.PI });
  }
  return out;
}

export function ScadaPipe({ d, loop, flowSpeed = 0, running = true, width = 10, dashed = false, arrows = false, reverse = false }: Props) {
  const { stroke } = LOOP[loop];

  if (arrows) {
    return (
      <g className="scada-pipe">
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={running ? 0.9 : 0.35}
        />
        {running &&
          (() => {
            const a = Math.max(width, 7); // keep arrowheads visible on thin pipes
            return pipeArrows(d, reverse).map((p, i) => (
              <polygon
                key={i}
                points={`0,${-a * 0.6} ${a} 0 0,${a * 0.6}`}
                fill={stroke}
                transform={`translate(${p.x} ${p.y}) rotate(${p.deg})`}
              />
            ));
          })()}
      </g>
    );
  }

  const dur = flowDuration(flowSpeed, running);
  const animated = dur > 0;

  return (
    <g className="scada-pipe">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? '8 6' : undefined}
        className={animated && !dashed ? 'scada-pipe-flow' : 'scada-pipe-idle'}
        style={animated ? { ['--flow-dur' as string]: `${dur}s` } : undefined}
        opacity={running ? 0.9 : 0.4}
      />
    </g>
  );
}
