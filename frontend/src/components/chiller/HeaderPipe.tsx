import { ScadaTag } from './ScadaTag';

interface Props {
  x: number;
  y: number;
  temp: number;
  tagId: string;
}

/** Header temperature faceplate (CHWS/CHWR main headers). */
export function HeaderPipe({ x, y, temp, tagId }: Props) {
  return (
    <g className="scada-header">
      <ScadaTag x={x} y={y} tag={tagId} pv={temp.toFixed(1)} unit="°C" width={92} />
    </g>
  );
}
