import type { CoolingTowerEquipment, EquipmentStatus } from '../../types/plant';
import { ScadaSpin } from './ScadaSpin';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: CoolingTowerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function CoolingTower({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const running = status === 'running';
  const cx = x + 34;
  const fanDurSec = running ? Math.max(0.5, 2.5 - equipment.fanSpeedPercent / 50) : 0;
  const fanCy = y + 32;

  return (
    <g className="plant-equip scada-tower" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={68} height={88} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
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
      <text x={cx} y={y + 14} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.name}
      </text>
      <text x={cx} y={y + 96} textAnchor="middle" fill={SCADA.pv} fontSize={9} fontFamily={SCADA.mono}>
        FAN {equipment.fanSpeedPercent.toFixed(0)}%
      </text>
      <text x={cx} y={y + 108} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontFamily={SCADA.mono}>
        {equipment.frequencyHz.toFixed(0)} Hz · {equipment.leavingTemp.toFixed(1)}°C
      </text>
    </g>
  );
}
