import type { EtsPump } from '../../types/ets';
import { EquipLabel } from '../chiller/EquipLabel';
import { ScadaSpin } from '../chiller/ScadaSpin';
import { SCADA, statusFill } from '../chiller/scadaTheme';
import { POS } from './etsStationTopology';

const W = 60;
const H = 52;

interface Props {
  pump: EtsPump;
  cx: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** CHWP on vertical pipe — same visual language as chiller Plant Pump. */
export function EtsChwpPump({ pump, cx, selected, onSelect }: Props) {
  const fill = statusFill(pump.status);
  const running = pump.running;
  const x = cx - W / 2;
  const y = POS.pumpIconY - H / 2;
  const icx = cx;
  const icy = POS.pumpIconY;
  const spinDur = running ? Math.max(0.4, 2 - pump.speedPct / 60) : 0;

  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(pump.id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={W} height={H} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <circle cx={icx} cy={icy} r={18} fill="#f1f5f9" stroke={fill} strokeWidth={2.5} />
      <path d={`M ${icx - 10} ${icy - 6} Q ${icx} ${icy - 14} ${icx + 10} ${icy - 6}`} fill="none" stroke={fill} strokeWidth={2} />
      <g transform={`translate(${icx}, ${icy})`}>
        <g>
          <polygon points="0,10 8,-6 -8,-6" fill={running ? fill : SCADA.stopped} opacity={0.9} />
          <ScadaSpin durSec={spinDur} />
        </g>
      </g>
      <circle cx={x + 8} cy={y + 10} r={4} fill={running ? SCADA.running : SCADA.stopped} />
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
