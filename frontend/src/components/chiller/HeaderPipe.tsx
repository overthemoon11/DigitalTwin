import { LOOP } from './scadaTheme';
import { ScadaTag } from './ScadaTag';

interface Props {
  x: number;
  y: number;
  label: string;
  temp: number;
  loop: keyof typeof LOOP;
  tagId?: string;
  /** SVG Y of the pipe centerline */
  pipeY: number;
  pipeX1?: number;
  pipeX2?: number;
}

/** Header tag + pipe run — tag offset from pipe so text is never on the line */
export function HeaderPipe({
  x,
  y,
  label,
  temp,
  loop,
  tagId,
  pipeY,
  pipeX1 = 200,
  pipeX2 = 940,
}: Props) {
  const color = LOOP[loop].stroke;
  const tag = tagId || label.replace(/\s/g, '_').toUpperCase();

  return (
    <g className="scada-header">
      <ScadaTag x={x} y={y} tag={tag} pv={temp.toFixed(1)} unit="°C" width={92} />
      <text x={x + 46} y={y + 48} textAnchor="middle" fill={color} fontSize={8} fontWeight="600">
        {label}
      </text>
    </g>
  );
}
