import type { ExpansionTankEquipment, EquipmentStatus } from '../../types/plant';
import { STATUS_COLORS } from '../../types/plant';

interface Props {
  equipment: ExpansionTankEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function ExpansionTank({ equipment, x, y, selected, onSelect }: Props) {
  const h = 50;
  const lvl = (equipment.levelPercent / 100) * h;
  return (
    <g className="plant-equip" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={40} height={h} fill="#1e293b" stroke={selected ? '#38bdf8' : '#475569'} strokeWidth={selected ? 2 : 1} rx={3} />
      <rect x={x + 4} y={y + h - lvl} width={32} height={lvl} fill="#0ea5e9" opacity={0.75} className="tank-level-anim" />
      <text x={x + 20} y={y + h + 14} textAnchor="middle" fill="#cbd5e1" fontSize={9}>
        {equipment.name}
      </text>
      <text x={x + 20} y={y + h + 26} textAnchor="middle" fill="#7dd3fc" fontSize={8} fontFamily="monospace">
        {equipment.levelPercent.toFixed(0)}%
      </text>
    </g>
  );
}
