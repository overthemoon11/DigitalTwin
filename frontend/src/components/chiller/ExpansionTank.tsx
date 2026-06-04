import type { ExpansionTankEquipment } from '../../types/plant';
import { SCADA } from './scadaTheme';

interface Props {
  equipment: ExpansionTankEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function ExpansionTank({ equipment, x, y, selected, onSelect }: Props) {
  const h = 52;
  const lvl = (equipment.levelPercent / 100) * (h - 8);

  return (
    <g className="plant-equip scada-exp-tank" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <ellipse cx={x + 22} cy={y + 8} rx={20} ry={6} fill="#334155" stroke={selected ? SCADA.selected : '#475569'} />
      <rect x={x + 4} y={y + 8} width={36} height={h} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} rx={2} />
      <rect x={x + 8} y={y + h - lvl} width={28} height={lvl} fill="#0ea5e9" opacity={0.8} className="tank-level-anim" />
      <text x={x + 22} y={y + h + 16} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontFamily={SCADA.mono}>
        {equipment.name}
      </text>
      <text x={x + 22} y={y + h + 28} textAnchor="middle" fill={SCADA.pv} fontSize={9} fontFamily={SCADA.mono}>
        {equipment.levelPercent.toFixed(0)} %
      </text>
    </g>
  );
}
