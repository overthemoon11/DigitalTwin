import type { ExpansionTankEquipment } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { SCADA } from './scadaTheme';

interface Props {
  equipment: ExpansionTankEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const W = 48;
const BODY_H = 52;

export function ExpansionTank({ equipment, x, y, selected, onSelect }: Props) {
  const lvl = (equipment.levelPercent / 100) * (BODY_H - 8);
  const cx = x + 24;
  const iconH = BODY_H + 8;

  return (
    <g className="plant-equip scada-exp-tank" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <ellipse cx={cx} cy={y + 8} rx={22} ry={6} fill="#e2e8f0" stroke={selected ? SCADA.selected : SCADA.faceplateBorder} />
      <rect x={x + 4} y={y + 8} width={40} height={BODY_H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} rx={2} />
      <rect x={x + 8} y={y + BODY_H - lvl} width={32} height={lvl} fill="#0ea5e9" opacity={0.8} className="tank-level-anim" />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={iconH}
        plateW={35}
        lines={[
          { text: equipment.name, variant: 'tag' },
          { text: `${equipment.levelPercent.toFixed(0)} %`, variant: 'pv' },
        ]}
      />
    </g>
  );
}
