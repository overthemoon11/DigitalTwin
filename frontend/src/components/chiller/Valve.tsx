import type { ValveEquipment, EquipmentStatus } from '../../types/plant';
import { STATUS_COLORS } from '../../types/plant';

interface Props {
  equipment: ValveEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Valve({ equipment, x, y, selected, onSelect }: Props) {
  const fill = STATUS_COLORS[equipment.status as EquipmentStatus];
  return (
    <g className="plant-equip" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <polygon
        points={`${x},${y + 20} ${x + 18},${y} ${x + 36},${y + 20}`}
        fill={fill}
        stroke={selected ? '#38bdf8' : '#64748b'}
        strokeWidth={selected ? 2.5 : 1}
      />
      <text x={x + 18} y={y + 38} textAnchor="middle" fill="#cbd5e1" fontSize={9}>
        {equipment.name}
      </text>
      <text x={x + 18} y={y + 50} textAnchor="middle" fill="#94a3b8" fontSize={8} fontFamily="monospace">
        {equipment.positionPercent.toFixed(0)}%
      </text>
    </g>
  );
}
