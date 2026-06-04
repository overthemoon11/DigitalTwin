import type { PumpEquipment, MakeupPumpEquipment, EquipmentStatus } from '../../types/plant';
import { ScadaSpin } from './ScadaSpin';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: PumpEquipment | MakeupPumpEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function Pump({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const running = status === 'running';
  const spd = 'speedPercent' in equipment ? equipment.speedPercent : 0;
  const hz = 'frequencyHz' in equipment ? equipment.frequencyHz : spd * 0.5;
  const cx = x + 30;
  const cy = y + 26;

  const spinDur = running ? Math.max(0.4, 2 - spd / 60) : 0;

  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={60} height={52} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <circle cx={cx} cy={cy} r={18} fill="#1e293b" stroke={fill} strokeWidth={2.5} />
      {/* Volute */}
      <path d={`M ${cx - 10} ${cy + 6} Q ${cx} ${cy + 14} ${cx + 10} ${cy + 6}`} fill="none" stroke={fill} strokeWidth={2} />
      {/* Impeller — SVG animateTransform, not CSS rotate (fixes top-left flyaway) */}
      <g transform={`translate(${cx}, ${cy})`}>
        <g>
          <polygon points="0,-10 8,6 -8,6" fill={running ? fill : SCADA.stopped} opacity={0.9} />
          <ScadaSpin durSec={spinDur} />
        </g>
      </g>
      <circle cx={x + 8} cy={y + 10} r={4} fill={running ? SCADA.running : SCADA.stopped} className={status === 'alarm' ? 'scada-alarm-blink' : undefined} />
      <text x={cx} y={y + 48} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.name}
      </text>
      <text x={cx} y={y + 68} textAnchor="middle" fill={SCADA.pv} fontSize={9} fontFamily={SCADA.mono}>
        {spd.toFixed(0)}% · {hz.toFixed(0)} Hz
      </text>
      <text x={cx} y={y + 80} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontFamily={SCADA.mono}>
        {equipment.powerKw.toFixed(0)} kW
      </text>
    </g>
  );
}
