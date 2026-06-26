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
  /** Smaller CWP icon beside chiller */
  mini?: boolean;
  /** Override tag plate width (default: compact 72 / full 92) */
  labelW?: number;
  labelSide?: 'left' | 'right' | 'below';
}

const NORMAL = { w: 60, h: 52, r: 18 };
const MINI = { w: 38, h: 46, r: 13 };

export function Pump({ equipment, x, y, selected, onSelect, compact = false, mini = false, labelW, labelSide = 'right' }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const running = status === 'running';
  const spd = 'speedPercent' in equipment ? equipment.speedPercent : 0;
  const hz = 'frequencyHz' in equipment ? equipment.frequencyHz : spd * 0.5;
  const dim = mini ? MINI : NORMAL;
  const cx = x + dim.w / 2;
  const cy = y + dim.h / 2;
  const spinDur = running ? Math.max(0.4, 2 - spd / 60) : 0;

  const lines = compact || mini
    ? [{ text: equipment.name, variant: 'tag' as const }]
    : [
        { text: equipment.name, variant: 'tag' as const },
        { text: `${spd.toFixed(0)}% · ${hz.toFixed(0)} Hz`, variant: 'pv' as const },
        { text: `${equipment.powerKw.toFixed(0)} kW`, variant: 'muted' as const },
      ];

  const stroke = mini ? '#1e293b' : selected ? SCADA.selected : SCADA.faceplateBorder;

  return (
    <g className={`plant-equip scada-pump${mini ? ' scada-pump-mini' : ''}`} onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={dim.w} height={dim.h} fill={SCADA.faceplate} stroke={stroke} strokeWidth={selected ? 2 : 1} rx={3} />
      <circle cx={cx} cy={cy} r={dim.r} fill={mini ? '#f8fafc' : '#f1f5f9'} stroke={fill} strokeWidth={mini ? 2 : 2.5} />
      {!mini && (
        <path d={`M ${cx - 10} ${cy + 6} Q ${cx} ${cy + 14} ${cx + 10} ${cy + 6}`} fill="none" stroke={fill} strokeWidth={2} />
      )}
      <g transform={`translate(${cx}, ${cy})`}>
        <g>
          <polygon points={`0,${mini ? -8 : -10} ${mini ? 6 : 8},${mini ? 5 : 6} ${mini ? -6 : -8},${mini ? 5 : 6}`} fill={running ? fill : SCADA.stopped} opacity={0.9} />
          <ScadaSpin durSec={spinDur} />
        </g>
      </g>
      <circle cx={x + 8} cy={y + 10} r={mini ? 3 : 4} fill={running ? SCADA.running : SCADA.stopped} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={dim.w}
        iconH={dim.h}
        lines={lines}
        plateW={labelW ?? (mini ? 58 : compact ? 72 : 92)}
        side={labelSide}
      />
    </g>
  );
}
