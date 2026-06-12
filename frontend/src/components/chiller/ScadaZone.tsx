import { SCADA } from './scadaTheme';

interface PanelProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
}

interface TitleProps {
  x: number;
  y: number;
  title: string;
  width?: number;
}

/** Zone background only — draw before pipes */
export function ScadaZonePanel({ x, y, width, height, fill = 'rgba(15,23,42,0.5)' }: PanelProps) {
  return (
    <rect x={x} y={y} width={width} height={height} fill={fill} stroke={SCADA.panelBorder} strokeWidth={1} rx={4} />
  );
}

/** Zone title badge — draw after pipes so text is never covered */
export function ScadaZoneTitle({ x, y, title, width = 200 }: TitleProps) {
  const padX = 8;
  const h = 18;
  return (
    <g className="scada-zone-title">
      <rect x={x} y={y - 12} width={width} height={h} fill={SCADA.bg} stroke={SCADA.panelBorder} rx={3} opacity={0.96} />
      <text x={x + padX} y={y} fill={SCADA.textMuted} fontSize={9} fontWeight="700" letterSpacing="0.08em">
        {title}
      </text>
    </g>
  );
}

/** @deprecated use ScadaZonePanel + ScadaZoneTitle */
export function ScadaZone({ x, y, width, height, title, fill }: PanelProps & { title: string }) {
  return (
    <g className="scada-zone">
      <ScadaZonePanel x={x} y={y} width={width} height={height} fill={fill} />
      <ScadaZoneTitle x={x + 10} y={y + 16} title={title} width={width - 20} />
    </g>
  );
}
