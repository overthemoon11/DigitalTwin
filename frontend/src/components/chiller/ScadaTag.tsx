import { SCADA } from './scadaTheme';

interface Props {
  x: number;
  y: number;
  tag: string;
  pv: string;
  unit?: string;
  alarm?: boolean;
  width?: number;
  height?: number;
  compact?: boolean;
}

/** ISA-style point label (tag + process value) */
export function ScadaTag({ x, y, tag, pv, unit = '', alarm = false, width, height, compact = false }: Props) {
  const w = width ?? (compact ? 52 : 88);
  const h = height ?? (compact ? 28 : 32);
  const tagSize = compact ? 7 : 8;
  const pvSize = compact ? 9 : 11;

  return (
    <g className={alarm ? 'scada-tag-alarm' : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={SCADA.faceplate}
        stroke={alarm ? SCADA.alarm : SCADA.faceplateBorder}
        strokeWidth={1}
        rx={2}
      />
      <text x={x + 4} y={y + (compact ? 9 : 11)} fill={SCADA.tag} fontSize={tagSize} fontWeight="600" fontFamily={SCADA.mono}>
        {tag}
      </text>
      <text x={x + w - 4} y={y + (compact ? 21 : 24)} textAnchor="end" fill={SCADA.pv} fontSize={pvSize} fontWeight="700" fontFamily={SCADA.mono}>
        {pv}
        {unit ? ` ${unit}` : ''}
      </text>
    </g>
  );
}
