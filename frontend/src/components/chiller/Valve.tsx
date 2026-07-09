import type { ValveEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';

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
  const status = equipment.status as EquipmentStatus;

  return (
    <g className="plant-equip scada-valve" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite href={EQUIP_IMG.valve} x={x} y={y} w={W} h={H} status={status} selected={selected} scale={2.0} />
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
