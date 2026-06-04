import { LOOP, flowDuration } from './scadaTheme';

interface Props {
  d: string;
  loop: keyof typeof LOOP;
  /** 0–100 pump/fan speed for animation rate; 0 = static dashed */
  flowSpeed?: number;
  running?: boolean;
  width?: number;
}

export function ScadaPipe({ d, loop, flowSpeed = 0, running = true, width = 10 }: Props) {
  const { stroke } = LOOP[loop];
  const dur = flowDuration(flowSpeed, running);
  const animated = dur > 0;

  return (
    <g className="scada-pipe">
      <path
        d={d}
        fill="none"
        stroke="#020617"
        strokeWidth={width + 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? 'scada-pipe-flow' : 'scada-pipe-idle'}
        style={animated ? { ['--flow-dur' as string]: `${dur}s` } : undefined}
        opacity={running ? 0.95 : 0.45}
      />
    </g>
  );
}
