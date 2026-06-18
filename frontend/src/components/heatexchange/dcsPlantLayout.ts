import {
  DCS_WIDTH,
  DCS_HEIGHT,
  boundsForDcsAsset,
  PLANT,
} from './dcsPlantTopology';

export { DCS_WIDTH, DCS_HEIGHT };

export const DCS_FULL_VIEW = { x: 0, y: 0, w: DCS_WIDTH, h: DCS_HEIGHT };

export function viewBoxString(v: { x: number; y: number; w: number; h: number }) {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

export function focusDcsViewport(
  b: { x: number; y: number; w: number; h: number },
  padding = 48
) {
  const x = Math.max(0, b.x - padding);
  const y = Math.max(0, b.y - padding);
  const w = Math.min(DCS_WIDTH - x, b.w + padding * 2);
  const h = Math.min(DCS_HEIGHT - y, b.h + padding * 2);
  return { x, y, w, h };
}

export function boundsForDcsEquipment(id: string) {
  return boundsForDcsAsset(id) ?? (id === 'dcs-plant' ? PLANT : null);
}

export function clampDcsView(v: { x: number; y: number; w: number; h: number }) {
  const w = Math.max(200, Math.min(DCS_WIDTH, v.w));
  const h = Math.max(150, Math.min(DCS_HEIGHT, v.h));
  const x = Math.max(0, Math.min(DCS_WIDTH - w, v.x));
  const y = Math.max(0, Math.min(DCS_HEIGHT - h, v.y));
  return { x, y, w, h };
}

export function panDcsView(v: { x: number; y: number; w: number; h: number }, dx: number, dy: number) {
  return clampDcsView({ ...v, x: v.x - dx, y: v.y - dy });
}

export function zoomDcsAt(
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
  return clampDcsView({
    x: nx - ((clientX - rect.left) / rect.width) * nw,
    y: ny - ((clientY - rect.top) / rect.height) * nh,
    w: nw,
    h: nh,
  });
}
