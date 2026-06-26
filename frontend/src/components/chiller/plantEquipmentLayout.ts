/** Bounding boxes for viewport focus — derived from plantTopology */
import {
  PLANT_WIDTH,
  PLANT_HEIGHT,
  MAKEUP_TANK,
  MAKEUP_PUMP_X,
  MAKEUP_PUMP_Y,
  CT_X,
  CT_Y,
  CWP_X,
  CWP_Y,
  CH_X,
  CH_Y,
  CHWP_X,
  CHWP_Y,
  STANDBY_CHWP_X,
  STANDBY_CWP_X,
  EXPTNK_X,
  EXPTNK_Y,
  BYPASS_X,
  BYPASS_Y,
  M_RISE,
  H_RISE,
  PUMP_DIM,
} from './plantTopology';

export { PLANT_WIDTH, PLANT_HEIGHT };

const CHILLER_W = 120;
const CHILLER_H = 88;
const TOWER_W = 180;
const TOWER_H = 88;
const EXPTNK_W = 100;
const EXPTNK_H = 60;
const VALVE_W = 148;
const VALVE_H = 40;

function box(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}

export function focusViewport(
  b: { x: number; y: number; w: number; h: number },
  padding = 48
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, b.x - padding);
  const y = Math.max(0, b.y - padding);
  const w = Math.min(PLANT_WIDTH - x, b.w + padding * 2);
  const h = Math.min(PLANT_HEIGHT - y, b.h + padding * 2);
  return { x, y, w, h };
}

export function boundsForEquipment(id: string): { x: number; y: number; w: number; h: number } | null {
  const staticMap: Record<string, ReturnType<typeof box>> = {
    'cwmutnk-41-1': box(MAKEUP_TANK.x, MAKEUP_TANK.y, MAKEUP_TANK.w + 78, MAKEUP_TANK.h),
    'cwmup-1': box(MAKEUP_PUMP_X[0], MAKEUP_PUMP_Y, 60 + 62, PUMP_DIM.CHWP.h),
    'cwmup-2': box(MAKEUP_PUMP_X[1], MAKEUP_PUMP_Y, 60 + 62, PUMP_DIM.CHWP.h),
    'exptnk-01': box(EXPTNK_X[0], EXPTNK_Y, EXPTNK_W, EXPTNK_H + 36),
    'exptnk-02': box(EXPTNK_X[1], EXPTNK_Y, EXPTNK_W, EXPTNK_H + 36),
    'bv-1': box(BYPASS_X, BYPASS_Y[0], VALVE_W + 20, VALVE_H),
    'bv-2': box(BYPASS_X, BYPASS_Y[1], VALVE_W + 20, VALVE_H),
    'm-rise': box(M_RISE.x, M_RISE.y, M_RISE.w, M_RISE.h),
    'h-rise': box(H_RISE.x, H_RISE.y, H_RISE.w, H_RISE.h),
    'building-load': box(M_RISE.x, M_RISE.y, M_RISE.w + H_RISE.w + (H_RISE.x - M_RISE.x - M_RISE.w), M_RISE.h),
  };
  if (staticMap[id]) return staticMap[id];

  let   m = id.match(/^cwp-29-(\d)$/);
  if (m) {
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < 3) {
      return box(CWP_X[i], CWP_Y, PUMP_DIM.CWP.w, PUMP_DIM.CWP.h + 28);
    }
    if (i === 3) return box(STANDBY_CWP_X, CWP_Y, PUMP_DIM.CWP.w, PUMP_DIM.CWP.h + 28);
  }

  m = id.match(/^chwp-29-(\d)$/);
  if (m) {
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < 3) {
      return box(CHWP_X[i], CHWP_Y, PUMP_DIM.CHWP.w, PUMP_DIM.CHWP.h + 28);
    }
    if (i === 3) return box(STANDBY_CHWP_X, CHWP_Y, PUMP_DIM.CHWP.w, PUMP_DIM.CHWP.h + 28);
  }

  m = id.match(/^ct-41-(\d)$/);
  if (m) {
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < CT_X.length) return box(CT_X[i], CT_Y, TOWER_W, TOWER_H);
  }

  m = id.match(/^ch-29-(\d)$/);
  if (m) {
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < CH_X.length) return box(CH_X[i], CH_Y, CHILLER_W, CHILLER_H + 56);
  }

  return null;
}

export const FULL_VIEW = { x: 0, y: 0, w: PLANT_WIDTH, h: PLANT_HEIGHT };
export const MIN_VIEW_W = 120;
export const MIN_VIEW_H = 80;

export function clampView(v: { x: number; y: number; w: number; h: number }) {
  let { x, y, w, h } = v;
  w = Math.max(MIN_VIEW_W, Math.min(PLANT_WIDTH, w));
  h = Math.max(MIN_VIEW_H, Math.min(PLANT_HEIGHT, h));
  x = Math.max(0, Math.min(PLANT_WIDTH - w, x));
  y = Math.max(0, Math.min(PLANT_HEIGHT - h, y));
  return { x, y, w, h };
}

export function zoomViewAt(
  view: { x: number; y: number; w: number; h: number },
  clientX: number,
  clientY: number,
  svgRect: DOMRect,
  zoomIn: boolean
) {
  const factor = zoomIn ? 0.88 : 1.12;
  const newW = view.w * factor;
  const newH = view.h * factor;
  const relX = (clientX - svgRect.left) / svgRect.width;
  const relY = (clientY - svgRect.top) / svgRect.height;
  const svgX = view.x + relX * view.w;
  const svgY = view.y + relY * view.h;
  return clampView({ x: svgX - relX * newW, y: svgY - relY * newH, w: newW, h: newH });
}

export function panView(
  view: { x: number; y: number; w: number; h: number },
  dxSvg: number,
  dySvg: number
) {
  return clampView({ x: view.x - dxSvg, y: view.y - dySvg, w: view.w, h: view.h });
}

export function viewBoxString(v: { x: number; y: number; w: number; h: number }) {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}
