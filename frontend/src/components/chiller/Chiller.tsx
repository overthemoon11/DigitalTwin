import type { ChillerEquipment, EquipmentStatus } from '../../types/plant';
import { STATUS_COLORS } from '../../types/plant';

interface Props {
  equipment: ChillerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Chiller({ equipment, x, y, selected, onSelect }: Props) {
  const fill = STATUS_COLORS[equipment.status as EquipmentStatus];
  return (
    <g className="plant-equip" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={88} height={72} rx={5} fill={fill} stroke={selected ? '#38bdf8' : '#475569'} strokeWidth={selected ? 3 : 1.5} />
      <text x={x + 44} y={y + 18} textAnchor="middle" fill="#0f172a" fontSize={11} fontWeight="700">
        {equipment.name}
      </text>
      <text x={x + 44} y={y + 32} textAnchor="middle" fill="#0f172a" fontSize={8} fontFamily="monospace">
        {equipment.status.toUpperCase()}
      </text>
      <text x={x + 44} y={y + 44} textAnchor="middle" fill="#0f172a" fontSize={8} fontFamily="monospace">
        {equipment.powerKw.toFixed(0)} kW
      </text>
      <text x={x + 44} y={y + 56} textAnchor="middle" fill="#0f172a" fontSize={8} fontFamily="monospace">
        {equipment.flowRate.toFixed(0)} m³/h
      </text>
      <text x={x + 44} y={y + 68} textAnchor="middle" fill="#0f172a" fontSize={8} fontFamily="monospace">
        {equipment.supplyTemp.toFixed(1)}°C COP {equipment.cop.toFixed(1)}
      </text>
    </g>
  );
}
