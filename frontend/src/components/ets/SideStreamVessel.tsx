import { useId } from 'react';
import { EquipLabel } from '../chiller/EquipLabel';
import { LOOP } from '../chiller/scadaTheme';

interface Props {
  x: number;
  y: number;
  w: number;
  h: number;
  topPortY: number;
  bottomPortY: number;
  returnPortY: number;
}

const BODY_INSET = 5;
const DOME_RY = 9;
const BASE_H = 12;
const BULGE = 2.5;

function pipeStub(
  gradId: string,
  x0: number,
  y0: number,
  len: number,
  thick: number,
  dir: 'left' | 'right' | 'up',
) {
  if (dir === 'left') {
    return (
      <rect
        x={x0 - len}
        y={y0 - thick / 2}
        width={len}
        height={thick}
        fill={`url(#${gradId})`}
        stroke="#1e3a8a"
        strokeWidth={0.4}
        rx={thick / 2}
      />
    );
  }
  if (dir === 'right') {
    return (
      <rect
        x={x0}
        y={y0 - thick / 2}
        width={len}
        height={thick}
        fill={`url(#${gradId})`}
        stroke="#1e3a8a"
        strokeWidth={0.4}
        rx={thick / 2}
      />
    );
  }
  return (
    <rect
      x={x0 - thick / 2}
      y={y0 - len}
      width={thick}
      height={len}
      fill={`url(#${gradId})`}
      stroke="#1e3a8a"
      strokeWidth={0.4}
      rx={thick / 2}
    />
  );
}

/** Vertical air-separator / side-stream vessel — polished 2.5D SCADA symbol. */
export function SideStreamVessel({ x, y, w, h, topPortY, bottomPortY, returnPortY }: Props) {
  const uid = useId().replace(/:/g, '');
  const bodyGrad = `ss-body-${uid}`;
  const domeGrad = `ss-dome-${uid}`;
  const baseGrad = `ss-base-${uid}`;
  const pipeGradH = `ss-pipe-h-${uid}`;
  const pipeGradV = `ss-pipe-v-${uid}`;
  const glowId = `ss-glow-${uid}`;

  const bodyX = x + BODY_INSET;
  const bodyW = w - BODY_INSET * 2;
  const bodyTop = y + DOME_RY;
  const bodyH = h - DOME_RY * 2 - BASE_H;
  const bodyBottom = bodyTop + bodyH;
  const cx = x + w / 2;
  const rx = bodyW / 2;
  const midY = bodyTop + bodyH / 2;
  const pipeThick = 6;

  const bodyPath = [
    `M ${bodyX} ${bodyTop}`,
    `Q ${bodyX - BULGE} ${midY} ${bodyX} ${bodyBottom}`,
    `A ${rx} ${DOME_RY} 0 0 0 ${bodyX + bodyW} ${bodyBottom}`,
    `Q ${bodyX + bodyW + BULGE} ${midY} ${bodyX + bodyW} ${bodyTop}`,
    `A ${rx} ${DOME_RY} 0 0 0 ${bodyX} ${bodyTop}`,
    'Z',
  ].join(' ');

  return (
    <g className="scada-side-stream-vessel" pointerEvents="none">
      <defs>
        <linearGradient id={bodyGrad} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="18%" stopColor="#cbd5e1" />
          <stop offset="42%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#f1f5f9" />
          <stop offset="82%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <radialGradient id={domeGrad} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>
        <linearGradient id={baseGrad} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id={pipeGradH} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="35%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="65%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <linearGradient id={pipeGradV} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#172554" />
          <stop offset="35%" stopColor="#1d4ed8" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="65%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx={cx} cy={bodyBottom + BASE_H + 3} rx={rx + 10} ry={3.5} fill="#0f172a" opacity={0.12} />

      {/* Flared stand */}
      <polygon
        points={`${cx - rx - 1},${bodyBottom + 1} ${cx + rx + 1},${bodyBottom + 1} ${cx + rx + 10},${bodyBottom + BASE_H} ${cx - rx - 10},${bodyBottom + BASE_H}`}
        fill={`url(#${baseGrad})`}
        stroke="#1e293b"
        strokeWidth={0.6}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const bx = cx - rx + 3 + i * ((bodyW - 2) / 4);
        return (
          <line
            key={i}
            x1={bx}
            y1={bodyBottom + 3}
            x2={bx}
            y2={bodyBottom + BASE_H - 2}
            stroke="#1e293b"
            strokeWidth={0.5}
            opacity={0.45}
          />
        );
      })}

      {/* Pipe stubs (behind vessel rim) */}
      {pipeStub(pipeGradH, bodyX, topPortY, 14, pipeThick, 'left')}
      {pipeStub(pipeGradH, bodyX, bottomPortY, 14, pipeThick, 'left')}
      {pipeStub(pipeGradH, bodyX + bodyW, returnPortY, 12, pipeThick, 'right')}
      {pipeStub(pipeGradV, cx, bodyTop, 10, pipeThick - 1, 'up')}

      {/* Main shell */}
      <path d={bodyPath} fill={`url(#${bodyGrad})`} stroke="#64748b" strokeWidth={0.85} />

      {/* Dome caps — layered for depth */}
      <ellipse cx={cx} cy={bodyTop} rx={rx + 0.5} ry={DOME_RY} fill={`url(#${domeGrad})`} stroke="#94a3b8" strokeWidth={0.6} />
      <ellipse cx={cx} cy={bodyTop - 1} rx={rx * 0.55} ry={DOME_RY * 0.35} fill="#ffffff" opacity={0.55} />
      <ellipse cx={cx} cy={bodyBottom} rx={rx + 0.5} ry={DOME_RY * 0.85} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={0.6} />

      {/* Centre highlight streak */}
      <rect x={cx - 2} y={bodyTop + 6} width={4} height={bodyH - 12} fill="#ffffff" opacity={0.35} rx={2} />

      {/* Inlet glow — active flow indicator */}
      <circle
        cx={bodyX - 2}
        cy={topPortY}
        r={4.5}
        fill={LOOP.chwsAsm.stroke}
        opacity={0.35}
        filter={`url(#${glowId})`}
      />
      <circle cx={bodyX - 2} cy={topPortY} r={2} fill="#7dd3fc" opacity={0.9} />

      {/* Nozzle flanges */}
      {[
        [bodyX, topPortY],
        [bodyX, bottomPortY],
        [bodyX + bodyW, returnPortY],
      ].map(([nx, ny], i) => (
        <ellipse
          key={i}
          cx={nx}
          cy={ny}
          rx={i === 2 ? 3.5 : 3}
          ry={pipeThick / 2 + 0.5}
          fill="none"
          stroke="#475569"
          strokeWidth={0.8}
        />
      ))}

      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={w}
        iconH={h + BASE_H - 23}
        plateW={108}
        side="below"
        lines={[{ text: 'side-stream vessel', variant: 'tag' }]}
      />
    </g>
  );
}
