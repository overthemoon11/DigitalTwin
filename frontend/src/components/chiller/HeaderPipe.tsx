import { PIPE_COLORS } from '../../types/plant';

interface Props {
  x: number;
  y: number;
  label: string;
  temp: number;
  loop: 'chws' | 'chwr' | 'cws' | 'cwr';
  width?: number;
}

export function HeaderPipe({ x, y, label, temp, loop, width = 200 }: Props) {
  const color = PIPE_COLORS[loop];
  return (
    <g>
      <rect x={x} y={y} width={width} height={28} fill="#0f172a" stroke={color} strokeWidth={2} rx={3} />
      <text x={x + width / 2} y={y + 12} textAnchor="middle" fill={color} fontSize={10} fontWeight="700">
        {label}
      </text>
      <text x={x + width / 2} y={y + 24} textAnchor="middle" fill="#e2e8f0" fontSize={10} fontFamily="monospace">
        {temp.toFixed(1)}°C
      </text>
    </g>
  );
}
