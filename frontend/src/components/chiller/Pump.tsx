import type { PumpEquipment, MakeupPumpEquipment, EquipmentStatus } from '../../types/plant';
import { STATUS_COLORS } from '../../types/plant';

interface Props {
  equipment: PumpEquipment | MakeupPumpEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Pump({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = STATUS_COLORS[status];
  const isMakeup = equipment.type === 'makeup_pump';
  const spd = 'speedPercent' in equipment ? equipment.speedPercent : 0;
  const hz = 'frequencyHz' in equipment ? equipment.frequencyHz : spd * 0.5;

  return (
    <g
      className={`plant-equip ${status === 'running' ? 'pump-running' : ''}`}
      onClick={() => onSelect(equipment.id)}
      style={{ cursor: 'pointer' }}
    >
      <circle cx={x + 28} cy={y + 22} r={22} fill={fill} stroke={selected ? '#38bdf8' : '#334155'} strokeWidth={selected ? 2.5 : 1} />
      <text x={x + 28} y={y + 18} textAnchor="middle" fill="#0f172a" fontSize={8} fontWeight="700">
        {equipment.name.split('-').slice(-2).join('-') || equipment.name}
      </text>
      <text x={x + 28} y={y + 28} textAnchor="middle" fill="#0f172a" fontSize={7} fontFamily="monospace">
        {spd.toFixed(0)}%
      </text>
      <text x={x + 28} y={y + 52} textAnchor="middle" fill="#94a3b8" fontSize={8} fontFamily="monospace">
        {hz.toFixed(0)} Hz · {equipment.powerKw.toFixed(0)} kW
      </text>
      {isMakeup && (
        <text x={x + 28} y={y + 64} textAnchor="middle" fill="#64748b" fontSize={7}>
          {(equipment as MakeupPumpEquipment).runStatus ? 'RUN' : 'STOP'}
        </text>
      )}
    </g>
  );
}
