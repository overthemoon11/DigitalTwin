import type { ChillerEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: ChillerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const W = 100;
const H = 78;

export function Chiller({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const alarm = status === 'alarm';
  const cx = x + W / 2;

  return (
    <g
      className={`plant-equip scada-chiller ${alarm ? 'scada-alarm-blink' : ''}`}
      onClick={() => onSelect(equipment.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect x={x} y={y} width={W} height={H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2.5 : 1} rx={3} />
      <rect x={x + 4} y={y + 4} width={W - 8} height={14} fill={fill} rx={2} opacity={0.9} />
      <text x={cx} y={y + 14} textAnchor="middle" fill="#0f172a" fontSize={9} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.status.toUpperCase()}
      </text>
      <rect x={x + 8} y={y + 22} width={28} height={48} fill="#1e3a8a" stroke="#3b82f6" strokeWidth={1} rx={2} />
      <rect x={x + 36} y={y + 22} width={28} height={48} fill="#14532d" stroke="#22c55e" strokeWidth={1} rx={2} />
      <rect x={x + 64} y={y + 22} width={28} height={48} fill="#1e3a8a" stroke="#3b82f6" strokeWidth={1} rx={2} />
      <circle cx={cx} cy={y + 2} r={4} fill="#22c55e" opacity={0.8} />
      <circle cx={cx} cy={y + H - 2} r={4} fill="#3b82f6" opacity={0.8} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={120}
        lines={[
          { text: equipment.name, variant: 'tag' },
          { text: `${equipment.powerKw.toFixed(0)} kW · ${equipment.flowRate.toFixed(0)} m³/h`, variant: 'pv' },
          { text: `${equipment.supplyTemp.toFixed(1)}°C · COP ${equipment.cop.toFixed(1)}`, variant: 'muted' },
        ]}
      />
    </g>
  );
}
