import type { ChillerEquipment, EquipmentStatus } from '../../types/plant';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';

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
  const alarm = status === 'alarm';

  // Per-chiller cooling from evaporator energy balance: Ton = Q̇/3.517 (kW→RT).
  const dT = equipment.returnTemp - equipment.supplyTemp;
  const chwTon = (equipment.flowRate * dT * 1.163) / 3.517; // flow m³/h, ΔT °C
  const kwPerTon = chwTon > 0 ? equipment.powerKw / chwTon : 0;

  return (
    <g
      className={`plant-equip scada-chiller ${alarm ? 'scada-alarm-blink' : ''}`}
      onClick={() => onSelect(equipment.id)}
      style={{ cursor: 'pointer' }}
    >
      <EquipSprite href={EQUIP_IMG.chiller} x={x} y={y} w={W} h={H} status={status} selected={selected} scale={2.1} />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={Math.max(labelW, 96)}
        side={labelSide}
        title={`${equipment.name} · ${equipment.loadPercent.toFixed(0)}%`}
        rows={[
          { label: 'CHWS', value: `${equipment.supplyTemp.toFixed(1)} °C` },
          { label: 'CHWR', value: `${equipment.returnTemp.toFixed(1)} °C` },
          { label: 'CHWF', value: `${(equipment.flowRate / 3.6).toFixed(1)} L/s` },
          { label: 'CHW Ton', value: `${chwTon.toFixed(0)} RT` },
          { label: 'kW', value: `${equipment.powerKw.toFixed(0)}` },
          { label: 'kW/Ton', value: `${kwPerTon.toFixed(3)}` },
        ]}
      />
    </g>
  );
}
