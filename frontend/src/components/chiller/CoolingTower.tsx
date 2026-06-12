import type { CoolingTowerEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { ScadaSpin } from './ScadaSpin';
import { LOOP, SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: CoolingTowerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const W = 68;
const H = 88;

export function CoolingTower({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const running = status === 'running';
  const cx = x + 34;
  const fanDurSec = running ? Math.max(0.5, 2.5 - equipment.fanSpeedPercent / 50) : 0;
  const fanCy = y + 32;

  return (
    <g className="plant-equip scada-tower" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={W} height={H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <rect x={x + 10} y={y + 38} width={48} height={42} fill="#334155" stroke="#475569" rx={2} />
      <ellipse cx={cx} cy={y + 32} rx={26} ry={10} fill="#1e293b" stroke={fill} strokeWidth={2} />
      <g transform={`translate(${cx}, ${fanCy})`}>
        <g>
          {[0, 72, 144, 216, 288].map((deg) => (
            <line key={deg} x1={0} y1={0} x2={0} y2={-14} stroke={fill} strokeWidth={2.5} transform={`rotate(${deg})`} />
          ))}
          <ScadaSpin durSec={fanDurSec} />
        </g>
      </g>
      <circle cx={cx} cy={y + 28} r={3} fill={LOOP.cwr.stroke} />
      <circle cx={cx} cy={y + 80} r={3} fill={LOOP.cws.stroke} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={108}
        lines={[
          { text: equipment.name, variant: 'tag' },
          { text: `FAN ${equipment.fanSpeedPercent.toFixed(0)}%`, variant: 'pv' },
          { text: `${equipment.frequencyHz.toFixed(0)} Hz · ${equipment.leavingTemp.toFixed(1)}°C`, variant: 'muted' },
        ]}
      />
    </g>
  );
}
