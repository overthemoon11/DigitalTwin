import { LOOP, SCADA } from './scadaTheme';

type LoopKey = keyof typeof LOOP;

interface Props {
  x: number;
  y: number;
  text: string;
  loop: LoopKey;
  anchor?: 'start' | 'middle' | 'end';
}

/** Loop ID tag beside a pipe run — halo stroke keeps text off the line */
export function PipeLoopLabel({ x, y, text, loop, anchor = 'start' }: Props) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={LOOP[loop].stroke}
      fontSize={8}
      fontWeight="700"
      fontFamily={SCADA.mono}
      paintOrder="stroke"
      stroke={SCADA.bg}
      strokeWidth={3}
    >
      {text}
    </text>
  );
}
