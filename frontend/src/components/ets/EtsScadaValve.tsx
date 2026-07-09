import type { EquipmentStatus } from '../../types/plant';
import { EquipLabel } from '../chiller/EquipLabel';
import { EquipSprite } from '../chiller/EquipSprite';
import { ETS_IMG } from '../chiller/equipmentImages';

interface Props {
  id: string;
  name: string;
  x: number;
  y: number;
  pct: number;
  status: string;
  selected: boolean;
  onSelect: (id: string) => void;
  /** vertical = inline on riser; horizontal = inline on header */
  orient?: 'vertical' | 'horizontal';
  compact?: boolean;
  labelSide?: 'left' | 'right' | 'below';
  plateW?: number;
}

const W = 40;
const H = 32;

/** Actuated ball valve sprite. */
export function EtsScadaValve({ id, name, x, y, pct, status, selected, onSelect, orient = 'vertical', compact = false, labelSide = 'right', plateW }: Props) {
  const cx = x;
  const cy = y;

  const iconX = cx - W / 2;
  const iconY = labelSide === 'below' ? cy - 14 : cy - H / 2 - 5;
  const iconH = labelSide === 'below' ? 28 : H;

  return (
    <g className="plant-equip scada-valve" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      {orient === 'vertical' ? (
        <line x1={cx} y1={cy - 14} x2={cx} y2={cy + 14} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      ) : (
        <line x1={cx - 14} y1={cy} x2={cx + 14} y2={cy} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      )}
      <EquipSprite
        href={ETS_IMG.valveGreen}
        x={cx - 22}
        y={cy - 18}
        w={44}
        h={36}
        status={status as EquipmentStatus}
        selected={selected}
        scale={1.7}
      />
      {!compact && (
        <EquipLabel
          iconX={iconX}
          iconY={iconY}
          iconW={W}
          iconH={iconH}
          plateW={plateW ?? Math.min(120, name.length * 5 + 18)}
          side={labelSide}
          lines={[
            { text: name, variant: 'tag' },
            { text: `${pct.toFixed(0)} %`, variant: 'pv' },
          ]}
        />
      )}
    </g>
  );
}
