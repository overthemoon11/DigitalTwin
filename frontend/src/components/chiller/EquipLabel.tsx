import { SCADA } from './scadaTheme';

export interface LabelLine {
  text: string;
  variant?: 'tag' | 'pv' | 'muted';
}

/** A `LABEL   value` faceplate row (BMS mimic style). */
export interface LabelRow {
  label: string;
  value: string;
}

interface Props {
  /** Left edge of icon */
  iconX: number;
  iconY: number;
  iconW: number;
  iconH: number;
  /** Legacy single-column text lines. */
  lines?: LabelLine[];
  /** Faceplate header (equipment tag / status). */
  title?: string;
  /** Faceplate data rows (label left, value right). */
  rows?: LabelRow[];
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

/** SCADA faceplate beside / below the equipment symbol. */
export function EquipLabel({ iconX, iconY, iconW, iconH, lines, title, rows, plateW = 108, side = 'right' }: Props) {
  const isFaceplate = !!(rows && rows.length);
  if (!isFaceplate && !(lines && lines.length)) return null;

  const lineH = 12;
  const rowH = 10.5;
  const headerH = title ? 13 : 0;
  const padY = isFaceplate ? 5 : 6;
  const plateH = isFaceplate
    ? padY * 2 + headerH + rows!.length * rowH
    : lines!.length * lineH + padY * 2;

  const labelOnly = iconW <= 0 && iconH <= 0;
  const plateY = labelOnly ? iconY : side === 'below' ? iconY + iconH + 4 : iconY + Math.max(4, (iconH - plateH) / 2);
  const plateX = labelOnly
    ? iconX
    : side === 'right'
      ? iconX + iconW + 4
      : side === 'below'
        ? iconX + (iconW - plateW) / 2
        : iconX - plateW - 4;

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
        opacity={0.95}
      />

      {isFaceplate ? (
        <>
          {title && (
            <>
              <text
                x={plateX + plateW / 2}
                y={plateY + padY + 8}
                textAnchor="middle"
                fill={SCADA.tag}
                fontSize={8}
                fontWeight="700"
                fontFamily={SCADA.mono}
              >
                {title}
              </text>
              <line
                x1={plateX + 3}
                y1={plateY + padY + headerH - 2}
                x2={plateX + plateW - 3}
                y2={plateY + padY + headerH - 2}
                stroke={SCADA.faceplateBorder}
                strokeWidth={0.5}
              />
            </>
          )}
          {rows!.map((r, i) => {
            const ry = plateY + padY + headerH + 8 + i * rowH;
            return (
              <g key={r.label}>
                <text x={plateX + 4} y={ry} textAnchor="start" fill={SCADA.textMuted} fontSize={7} fontFamily={SCADA.mono}>
                  {r.label}
                </text>
                <text x={plateX + plateW - 4} y={ry} textAnchor="end" fill={SCADA.pv} fontSize={7.5} fontWeight="600" fontFamily={SCADA.mono}>
                  {r.value}
                </text>
              </g>
            );
          })}
        </>
      ) : (
        lines!.map((line, i) => {
          const v = VARIANT_STYLE[line.variant || (i === 0 ? 'tag' : 'pv')];
          const lx = side === 'below' ? plateX + plateW / 2 : plateX + 4;
          return (
            <text
              key={i}
              x={lx}
              y={plateY + padY + 9 + i * lineH}
              textAnchor={side === 'below' ? 'middle' : 'start'}
              fill={v.fill}
              fontSize={v.size}
              fontWeight={v.weight}
              fontFamily={SCADA.mono}
            >
              {line.text}
            </text>
          );
        })
      )}
    </g>
  );
}
