import type { EtsPump } from '../../types/ets';
import type { EquipmentStatus } from '../../types/plant';
import { EquipLabel } from '../chiller/EquipLabel';
import { EquipSprite } from '../chiller/EquipSprite';
import { ETS_IMG } from '../chiller/equipmentImages';
import { POS } from './etsStationTopology';

const W = 60;
const H = 52;

interface Props {
  pump: EtsPump;
  cx: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** CHWP — horizontal end-suction pump sprite. */
export function EtsChwpPump({ pump, cx, selected, onSelect }: Props) {
  const running = pump.running;
  const x = cx - W / 2;
  const y = POS.pumpIconY - H / 2;

  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(pump.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite
        href={ETS_IMG.pump}
        x={x}
        y={y}
        w={W}
        h={H}
        status={(running ? pump.status : 'stopped') as EquipmentStatus}
        selected={selected}
        scale={1.7}
      />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={W}
        iconH={H}
        plateW={108}
        side="below"
        lines={[
          { text: pump.name, variant: 'tag' },
          { text: `${pump.speedPct.toFixed(1)} % · ${pump.powerKw.toFixed(1)} kW`, variant: 'pv' },
          { text: running ? 'ON · WF' : 'OFF', variant: 'muted' },
        ]}
      />
    </g>
  );
}
