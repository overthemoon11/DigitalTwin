import type { ChillerEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { LOOP, SCADA, statusFill } from './scadaTheme';

interface Props {
  equipment: ChillerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
  labelSide?: 'left' | 'right' | 'below';
  labelW?: number;
}

const W = 100;
const H = 78;

export function Chiller({ equipment, x, y, selected, onSelect, labelSide = 'right', labelW = 120 }: Props) {
  const status = equipment.status as EquipmentStatus;
  const fill = statusFill(status);
  const alarm = status === 'alarm';
  const running = status === 'running';
  const cx = x + W / 2;
  const chwFill = running ? '#dbeafe' : '#f1f5f9';
  const chwStroke = running ? LOOP.chws.stroke : SCADA.faceplateBorder;
  const cwsFill = running ? '#dcfce7' : '#f1f5f9';
  const cwsStroke = running ? LOOP.cws.stroke : SCADA.faceplateBorder;
  const statusText = running || status === 'alarm' ? '#ffffff' : SCADA.pv;

  return (
    <g
      className={`plant-equip scada-chiller ${alarm ? 'scada-alarm-blink' : ''}`}
      onClick={() => onSelect(equipment.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect x={x} y={y} width={W} height={H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2.5 : 1} rx={3} />
      <rect x={x + 4} y={y + 4} width={W - 8} height={14} fill={fill} rx={2} opacity={0.9} />
      <text x={cx} y={y + 14} textAnchor="middle" fill={statusText} fontSize={9} fontWeight="700" fontFamily={SCADA.mono}>
        {equipment.status.toUpperCase()}
      </text>
      <rect x={x + 8} y={y + 22} width={28} height={48} fill={chwFill} stroke={chwStroke} strokeWidth={1} rx={2} />
      <rect x={x + 36} y={y + 22} width={28} height={48} fill={cwsFill} stroke={cwsStroke} strokeWidth={1} rx={2} />
      <rect x={x + 64} y={y + 22} width={28} height={48} fill={chwFill} stroke={chwStroke} strokeWidth={1} rx={2} />
      <circle cx={cx} cy={y + 2} r={4} fill={LOOP.cws.stroke} opacity={running ? 0.9 : 0.45} />
      <circle cx={cx} cy={y + H - 2} r={4} fill={LOOP.chws.stroke} opacity={running ? 0.9 : 0.45} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={labelW}
        side={labelSide}
        lines={[
          { text: equipment.name, variant: 'tag' },
          { text: `${equipment.powerKw.toFixed(0)} kW · ${equipment.flowRate.toFixed(0)} m³/h`, variant: 'pv' },
          { text: `${equipment.supplyTemp.toFixed(1)}°C · COP ${equipment.cop.toFixed(1)}`, variant: 'muted' },
        ]}
      />
    </g>
  );
}
