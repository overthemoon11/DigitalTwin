import type { CoolingTowerEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';

interface Props {
  equipment: CoolingTowerEquipment;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const W = 68;
const H = 70;

export function CoolingTower({ equipment, x, y, selected, onSelect }: Props) {
  const status = equipment.status as EquipmentStatus;

  return (
    <g className="plant-equip scada-tower" onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite href={EQUIP_IMG.coolingTower} x={x} y={y} w={W} h={H} status={status} selected={selected} scale={1.9} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={78}
        title={equipment.name}
        rows={[
          { label: 'VSD', value: `${equipment.frequencyHz.toFixed(1)} Hz` },
          { label: 'CWS-T', value: `${equipment.leavingTemp.toFixed(1)} °C` },
          { label: 'kW', value: equipment.powerKw.toFixed(1) },
        ]}
      />
    </g>
  );
}
