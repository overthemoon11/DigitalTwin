import {
  ETS_WIDTH,
  ETS_HEIGHT,
  boundsForEtsAsset,
} from './etsDetailTopology';

export const ETS_FULL_VIEW = { x: 0, y: 0, w: ETS_WIDTH, h: ETS_HEIGHT };

export function viewBoxString(v: { x: number; y: number; w: number; h: number }) {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

export function focusEtsViewport(b: { x: number; y: number; w: number; h: number }, padding = 40) {
  const x = Math.max(0, b.x - padding);
  const y = Math.max(0, b.y - padding);
  const w = Math.min(ETS_WIDTH - x, b.w + padding * 2);
  const h = Math.min(ETS_HEIGHT - y, b.h + padding * 2);
  return { x, y, w, h };
}

export function boundsForEtsEquipment(id: string) {
  return boundsForEtsAsset(id);
}

function clamp(v: { x: number; y: number; w: number; h: number }) {
  const w = Math.max(180, Math.min(ETS_WIDTH, v.w));
  const h = Math.max(140, Math.min(ETS_HEIGHT, v.h));
  return {
    x: Math.max(0, Math.min(ETS_WIDTH - w, v.x)),
    y: Math.max(0, Math.min(ETS_HEIGHT - h, v.y)),
    w,
    h,
  };
}

export function panEtsView(v: { x: number; y: number; w: number; h: number }, dx: number, dy: number) {
  return clamp({ ...v, x: v.x - dx, y: v.y - dy });
}

export function zoomEtsAt(
  v: { x: number; y: number; w: number; h: number },
  clientX: number,
  clientY: number,
  rect: DOMRect,
  zoomIn: boolean
) {
  const factor = zoomIn ? 0.85 : 1.18;
  const nx = v.x + ((clientX - rect.left) / rect.width) * v.w;
  const ny = v.y + ((clientY - rect.top) / rect.height) * v.h;
  const nw = v.w * factor;
  const nh = v.h * factor;
  return clamp({
    x: nx - ((clientX - rect.left) / rect.width) * nw,
    y: ny - ((clientY - rect.top) / rect.height) * nh,
    w: nw,
    h: nh,
  });
}
