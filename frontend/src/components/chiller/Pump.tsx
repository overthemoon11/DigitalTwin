import type { PumpEquipment, MakeupPumpEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';

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
  const spd = 'speedPercent' in equipment ? equipment.speedPercent : 0;
  const hz = 'frequencyHz' in equipment ? equipment.frequencyHz : spd * 0.5;
  const dim = mini ? MINI : NORMAL;

  // Mini icon = condenser pump (horizontal); normal = chilled-water / make-up (vertical inline).
  const href = mini ? EQUIP_IMG.pumpHorizontal : EQUIP_IMG.pumpVertical;

  return (
    <g className={`plant-equip scada-pump${mini ? ' scada-pump-mini' : ''}`} onClick={() => onSelect(equipment.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite href={href} x={x} y={y} w={dim.w} h={dim.h} status={status} selected={selected} scale={mini ? 1.2 : 1.1} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={dim.w}
        iconH={dim.h}
        plateW={labelW ?? 62}
        side={labelSide}
        title={equipment.name}
        rows={[
          { label: 'Hz', value: hz.toFixed(1) },
          { label: 'kW', value: equipment.powerKw.toFixed(1) },
        ]}
      />
    </g>
  );
}
