import type { ChillerEquipment, EquipmentStatus } from '../../types/plant';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: ChillerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Chiller({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const alarm = status === 'alarm';
  const w = 100;
  const h = 78;

  return (
    <g
      className={`plant-equip scada-chiller ${alarm ? 'scada-alarm-blink' : ''}`}
      onClick={() => onSelect(equipment.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect x={x} y={y} width={w} height={h} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2.5 : 1} rx={3} />
      <rect x={x + 4} y={y + 4} width={w - 8} height={14} fill={fill} rx={2} opacity={0.9} />
      <text x={x + w / 2} y={y + 14} textAnchor="middle" fill="#0f172a" fontSize={9} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.status.toUpperCase()}
      </text>
      {/* Evaporator / condenser bars */}
      <rect x={x + 8} y={y + 22} width={28} height={48} fill="#1e3a8a" stroke="#3b82f6" strokeWidth={1} rx={2} />
      <rect x={x + 36} y={y + 22} width={28} height={48} fill="#14532d" stroke="#22c55e" strokeWidth={1} rx={2} />
      <rect x={x + 64} y={y + 22} width={28} height={48} fill="#1e3a8a" stroke="#3b82f6" strokeWidth={1} rx={2} />
      <text x={x + w / 2} y={y + h + 14} textAnchor="middle" fill={SCADA.tag} fontSize={10} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.name}
      </text>
      <text x={x + w / 2} y={y + h + 26} textAnchor="middle" fill={SCADA.pv} fontSize={9} fontFamily={SCADA.mono}>
        {equipment.powerKw.toFixed(0)} kW · {equipment.flowRate.toFixed(0)} m³/h
      </text>
      <text x={x + w / 2} y={y + h + 38} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontFamily={SCADA.mono}>
        {equipment.supplyTemp.toFixed(1)}°C · COP {equipment.cop.toFixed(1)}
      </text>
    </g>
  );
}
