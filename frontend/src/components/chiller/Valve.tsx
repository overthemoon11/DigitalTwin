import type { ValveEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: ValveEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const W = 40;
const H = 32;

export function Valve({ equipment, x, y, selected, onSelect }: Props) {
  const fill = statusFill(equipment.status as EquipmentStatus);
  const cx = x + 20;
  const cy = y + 16;
  const open = equipment.positionPercent;

  return (
    <g className="plant-equip scada-valve" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <line x1={x} y1={cy} x2={x + W} y2={cy} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
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
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={100}
        lines={[
          { text: equipment.name, variant: 'tag' },
          { text: `${equipment.positionPercent.toFixed(0)} %`, variant: 'pv' },
        ]}
      />
    </g>
  );
}
