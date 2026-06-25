import { SCADA } from './scadaTheme';

export interface LabelLine {
  text: string;
  variant?: 'tag' | 'pv' | 'muted';
}

interface Props {
  /** Left edge of icon */
  iconX: number;
  iconY: number;
  iconW: number;
  iconH: number;
  lines: LabelLine[];
  /** Extra width for long names */
  plateW?: number;
  /** Default right; use left when symbol is on the right edge; below for vertical inline symbols */
  side?: 'left' | 'right' | 'below';
}

const VARIANT_STYLE = {
  tag: { fill: SCADA.tag, size: 8, weight: '700' },
  pv: { fill: SCADA.pv, size: 8, weight: '400' },
  muted: { fill: SCADA.textMuted, size: 7, weight: '400' },
} as const;

/** SCADA tag block beside or below the equipment symbol */
export function EquipLabel({ iconX, iconY, iconW, iconH, lines, plateW = 108, side = 'right' }: Props) {
  if (!lines.length) return null;

  const lineH = 12;
  const padY = 6;
  const plateH = lines.length * lineH + padY * 2;
  const labelOnly = iconW <= 0 && iconH <= 0;
  const plateY = labelOnly ? iconY : side === 'below' ? iconY + iconH + 4 : iconY + Math.max(4, (iconH - plateH) / 2);
  const plateX = labelOnly
    ? iconX
    : side === 'right'
      ? iconX + iconW + 4
      : side === 'below'
        ? iconX + (iconW - plateW) / 2
        : iconX - plateW - 4;
  const textAnchor = side === 'below' ? 'middle' : 'start';
  const lx = side === 'below' ? plateX + plateW / 2 : plateX + 4;

  return (
    <g className="scada-equip-label" pointerEvents="none">
      <rect
        x={plateX}
        y={plateY}
        width={plateW}
        height={plateH}
        fill={SCADA.faceplate}
        stroke={SCADA.faceplateBorder}
        strokeWidth={0.75}
        rx={2}
        opacity={0.94}
      />
      {lines.map((line, i) => {
        const v = VARIANT_STYLE[line.variant || (i === 0 ? 'tag' : 'pv')];
        return (
          <text
            key={i}
            x={lx}
            y={plateY + padY + 9 + i * lineH}
            textAnchor={textAnchor}
            fill={v.fill}
            fontSize={v.size}
            fontWeight={v.weight}
            fontFamily={SCADA.mono}
          >
            {line.text}
          </text>
        );
      })}
    </g>
  );
}
