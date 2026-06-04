import { SCADA } from './scadaTheme';

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  fill?: string;
}

export function ScadaZone({ x, y, width, height, title, fill = 'rgba(15,23,42,0.5)' }: Props) {
  return (
    <g className="scada-zone">
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={SCADA.panelBorder} strokeWidth={1} rx={4} />
      <text x={x + 10} y={y + 16} fill={SCADA.textMuted} fontSize={9} fontWeight="700" letterSpacing="0.08em">
        {title}
      </text>
    </g>
  );
}
