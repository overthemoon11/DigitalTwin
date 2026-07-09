import type { EquipmentStatus } from '../../types/plant';
import { SCADA, statusFill } from './scadaTheme';

interface Props {
  href: string;
  /** Layout box (kept equal to the old drawn-icon box so pipe anchors are unchanged). */
  x: number;
  y: number;
  w: number;
  h: number;
  status: EquipmentStatus;
  selected: boolean;
  /** Enlarge the sprite past its layout box to compensate for the PNG's padding. */
  scale?: number;
}

/**
 * Renders an equipment PNG sprite centred on its layout box, with a status dot
 * and a selection / alarm outline. Stopped equipment is dimmed so running state
 * still reads at a glance even though the artwork itself is static.
 */
export function EquipSprite({ href, x, y, w, h, status, selected, scale = 1.35 }: Props) {
  const iw = w * scale;
  const ih = h * scale;
  const ix = x + w / 2 - iw / 2;
  const iy = y + h / 2 - ih / 2;
  const running = status === 'running';
  const alarm = status === 'alarm';

  return (
    <g>
      {(selected || alarm) && (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          fill="none"
          stroke={alarm ? SCADA.alarm : SCADA.selected}
          strokeWidth={2}
          rx={5}
        />
      )}
      <image
        href={href}
        x={ix}
        y={iy}
        width={iw}
        height={ih}
        preserveAspectRatio="xMidYMid meet"
        opacity={running ? 1 : alarm ? 0.95 : 0.5}
      />
      <circle cx={x + 6} cy={y + 6} r={4} fill={statusFill(status)} stroke="#ffffff" strokeWidth={1} />
    </g>
  );
}
