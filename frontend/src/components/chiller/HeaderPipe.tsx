import { LOOP, SCADA } from './scadaTheme';
import { ScadaTag } from './ScadaTag';

interface Props {
  x: number;
  y: number;
  label: string;
  temp: number;
  loop: 'chws' | 'chwr' | 'cws' | 'cwr';
  tagId?: string;
}

/** Header measurement — tag sits above pipe, not on it */
export function HeaderPipe({ x, y, label, temp, loop, tagId }: Props) {
  const color = LOOP[loop].stroke;
  const tag = tagId || label.replace(/\s/g, '_').toUpperCase();

  return (
    <g className="scada-header">
      <line x1={x} y1={y + 40} x2={x + 180} y2={y + 40} stroke={color} strokeWidth={12} strokeLinecap="round" opacity={0.35} />
      <ScadaTag x={x + 46} y={y} tag={tag} pv={temp.toFixed(1)} unit="°C" width={88} />
      <text x={x + 90} y={y + 56} textAnchor="middle" fill={color} fontSize={8} fontWeight="600" opacity={0.85}>
        {label}
      </text>
    </g>
  );
}
