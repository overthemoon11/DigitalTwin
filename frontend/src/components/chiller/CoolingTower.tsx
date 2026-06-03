import type { CoolingTowerEquipment, EquipmentStatus } from '../../types/plant';
import { STATUS_COLORS } from '../../types/plant';

interface Props {
  equipment: CoolingTowerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function CoolingTower({ equipment, x, y, selected, onSelect }: Props) {
  const fill = STATUS_COLORS[equipment.status as EquipmentStatus];
  return (
    <g className="plant-equip" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x + 8} y={y + 22} width={48} height={50} fill="#64748b" stroke={selected ? '#38bdf8' : '#334155'} strokeWidth={selected ? 2 : 1} rx={3} />
      <ellipse cx={x + 32} cy={y + 18} rx={30} ry={12} fill={fill} stroke="#334155" />
      <text x={x + 32} y={y + 82} textAnchor="middle" fill="#e2e8f0" fontSize={10} fontWeight="600">
        {equipment.name}
      </text>
      <text x={x + 32} y={y + 94} textAnchor="middle" fill="#94a3b8" fontSize={8} fontFamily="monospace">
        Fan {equipment.fanSpeedPercent.toFixed(0)}%
      </text>
      <text x={x + 32} y={y + 106} textAnchor="middle" fill="#94a3b8" fontSize={8} fontFamily="monospace">
        {equipment.frequencyHz.toFixed(0)} Hz · {equipment.leavingTemp.toFixed(1)}°C
      </text>
    </g>
  );
}
