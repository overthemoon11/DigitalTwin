import type { ExpansionTankEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';

interface Props {
  equipment: ExpansionTankEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Override sprite (e.g. the ETS white vessel). */
  href?: string;
  scale?: number;
}

const W = 48;
const BODY_H = 52;

export function ExpansionTank({ equipment, x, y, selected, onSelect, href = EQUIP_IMG.tank, scale = 1.5 }: Props) {
  const iconH = BODY_H + 8;
  const status = (equipment.status ?? 'running') as EquipmentStatus;

  return (
    <g className="plant-equip scada-exp-tank" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite href={href} x={x} y={y} w={W} h={iconH} status={status} selected={selected} scale={scale} />
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
