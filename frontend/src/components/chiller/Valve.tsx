import type { ValveEquipment, EquipmentStatus } from '../../types/plant';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: ValveEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Valve({ equipment, x, y, selected, onSelect }: Props) {
  const fill = statusFill(equipment.status as EquipmentStatus);
  const cx = x + 20;
  const cy = y + 16;
  const open = equipment.positionPercent;

  return (
    <g className="plant-equip scada-valve" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <line x1={x} y1={cy} x2={x + 40} y2={cy} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={14} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : fill} strokeWidth={selected ? 2.5 : 2} />
      <line
        x1={cx - 10}
        y1={cy}
        x2={cx + 10}
        y2={cy}
        stroke={fill}
        strokeWidth={3}
        strokeLinecap="round"
        transform={`rotate(${open * 0.9 - 45}, ${cx}, ${cy})`}
      />
      <text x={cx} y={y + 44} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontFamily={SCADA.mono}>
        {equipment.name}
      </text>
      <text x={cx} y={y + 56} textAnchor="middle" fill={SCADA.pv} fontSize={9} fontFamily={SCADA.mono}>
        {equipment.positionPercent.toFixed(0)} %
      </text>
    </g>
  );
}
