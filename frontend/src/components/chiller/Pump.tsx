import type { PumpEquipment, MakeupPumpEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { ScadaSpin } from './ScadaSpin';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: PumpEquipment | MakeupPumpEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const W = 60;
const H = 52;

export function Pump({ equipment, x, y, selected, onSelect, compact = false }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const running = status === 'running';
  const spd = 'speedPercent' in equipment ? equipment.speedPercent : 0;
  const hz = 'frequencyHz' in equipment ? equipment.frequencyHz : spd * 0.5;
  const cx = x + 30;
  const cy = y + 26;
  const spinDur = running ? Math.max(0.4, 2 - spd / 60) : 0;

  const lines = compact
    ? [{ text: equipment.name, variant: 'tag' as const }]
    : [
        { text: equipment.name, variant: 'tag' as const },
        { text: `${spd.toFixed(0)}% · ${hz.toFixed(0)} Hz`, variant: 'pv' as const },
        { text: `${equipment.powerKw.toFixed(0)} kW`, variant: 'muted' as const },
      ];

  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={W} height={H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <circle cx={cx} cy={cy} r={18} fill="#f1f5f9" stroke={fill} strokeWidth={2.5} />
      <path d={`M ${cx - 10} ${cy + 6} Q ${cx} ${cy + 14} ${cx + 10} ${cy + 6}`} fill="none" stroke={fill} strokeWidth={2} />
      <g transform={`translate(${cx}, ${cy})`}>
        <g>
          <polygon points="0,-10 8,6 -8,6" fill={running ? fill : SCADA.stopped} opacity={0.9} />
          <ScadaSpin durSec={spinDur} />
        </g>
      </g>
      <circle cx={x + 8} cy={y + 10} r={4} fill={running ? SCADA.running : SCADA.stopped} />
      <EquipLabel iconX={x} iconY={y} iconW={W} iconH={H} lines={lines} plateW={compact ? 72 : 92} />
    </g>
  );
}
