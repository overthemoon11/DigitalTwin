import { SCADA } from './scadaTheme';

interface Props {
  x: number;
  y: number;
  tag: string;
  pv: string;
  unit?: string;
  alarm?: boolean;
  width?: number;
}

/** ISA-style point label (tag + process value) */
export function ScadaTag({ x, y, tag, pv, unit = '', alarm = false, width = 88 }: Props) {
  return (
    <g className={alarm ? 'scada-tag-alarm' : undefined}>
      <rect
        x={x}
        y={y}
        width={width}
        height={32}
        fill={SCADA.faceplate}
        stroke={alarm ? SCADA.alarm : SCADA.faceplateBorder}
        strokeWidth={1}
        rx={2}
      />
      <text x={x + 4} y={y + 11} fill={SCADA.tag} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>
        {tag}
      </text>
      <text x={x + width - 4} y={y + 24} textAnchor="end" fill={SCADA.pv} fontSize={11} fontWeight="700" fontFamily={SCADA.mono}>
        {pv}
        {unit ? ` ${unit}` : ''}
      </text>
    </g>
  );
}
