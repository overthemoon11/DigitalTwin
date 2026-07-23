/**
 * P&ID layout — T1 chiller plant (5 chillers · 6 CHWP · 6 CWP · 5 towers).
 * Each train: CHWP (left) · CH (centre) · CWP (right), with one standby CHWP /
 * CWP after the five duty trains. Positions are generated from the equipment
 * counts so the diagram scales with the inventory.
 */

export const TRAIN_COUNT = 5;
export const TOWER_COUNT = 5;

/** Per-train horizontal spacing — SLOT must clear CHWP + CH + CWP + below labels */
export const TRAIN = {
  LEFT: 24,
  SLOT: 288,
  CHWP_X: -4,
  CH_X: 92,
  CWP_X: 218,
  /** Standby CHWP-6 / CWP-6 after the duty trains */
  STANDBY_GAP: 36,
  STANDBY_SHIFT: -32,
} as const;

export const SLOT = {
  TOWER: 180,
} as const;

function trainLeft(index: number) {
  return TRAIN.LEFT + index * TRAIN.SLOT;
}

const idx = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Chiller trains — CHWP | CH | CWP on one row */
export const CH_X = idx(TRAIN_COUNT).map((i) => trainLeft(i) + TRAIN.CH_X);
export const CHWP_X = idx(TRAIN_COUNT).map((i) => trainLeft(i) + TRAIN.CHWP_X);
export const CWP_X = idx(TRAIN_COUNT).map((i) => trainLeft(i) + TRAIN.CWP_X);

const standbyLeft = trainLeft(TRAIN_COUNT) + TRAIN.STANDBY_GAP + TRAIN.STANDBY_SHIFT;
export const STANDBY_CHWP_X = standbyLeft + TRAIN.CHWP_X;
export const STANDBY_CWP_X = standbyLeft + TRAIN.CH_X;

/** Cooling towers — top-left cluster */
export const CT_X = idx(TOWER_COUNT).map((i) => 50 + SLOT.TOWER * i);
export const CT_Y = 80;

/** Overall canvas — sized to clear the widest row (chiller trains + standby). */
export const PLANT_WIDTH = Math.max(STANDBY_CWP_X + 80, CH_X[CH_X.length - 1] + 140, 1160);
export const PLANT_HEIGHT = 820;
export const PLANT_FOOTER_Y = 782;

export const PUMP_DIM = {
  CHWP: { w: 60, h: 52 },
  CWP: { w: 38, h: 46 },
} as const;

/** Horizontal pipe Y (centerline) */
export const PIPE = {
  CWS_CT_TOP: 56,
  CWR_HDR: 218,
  CWS_HDR: 232,
  CHWS: 478,
  CHWR: 438,
} as const;

const TOWERS_RIGHT = CT_X[CT_X.length - 1] + 100;

export const ZONE = {
  TOWERS: { x: 8, y: 34, w: TOWERS_RIGHT - 8, h: 128, titleY: 50 },
  MAKEUP: { x: TOWERS_RIGHT + 12, y: 34, w: 435, h: 128, titleY: 50 },
  CHILLERS: { x: 8, y: 245, w: PLANT_WIDTH - 16, h: 240, titleY: 263 },
  CHW_LOOP: { y: 495, h: 300, titleY: 560 },
} as const;

export const pumpCx = (x: number, w = PUMP_DIM.CHWP.w) => x + w / 2;
export const towerCx = (x: number) => x + 34;
export const chillerCx = (x: number) => x + 50;

/** Make-up — CWMUP-1/2 row, CWMUTnk right — placed in the top-right zone */
export const MAKEUP_SLOT = 132;
const MAKEUP_LEFT = ZONE.MAKEUP.x + 28;
export const MAKEUP_PUMP_X = [MAKEUP_LEFT, MAKEUP_LEFT + MAKEUP_SLOT];
export const MAKEUP_PUMP_Y = 86;
export const MAKEUP_TANK = { x: MAKEUP_LEFT + MAKEUP_SLOT * 2, y: 78, w: 56, h: 72 };
export const MAKEUP_PIPE = { TOP: 74, BOTTOM: 146 } as const;

export const makeupPumpBottom = () => MAKEUP_PUMP_Y + 52;
export const makeupTankMidY = () => MAKEUP_TANK.y + 36;

export const CH_Y = 340;
export const PUMP_ROW_Y = CH_Y + 16;

/** All CHWP / CWP X positions including the standby unit */
export const CHWP_ALL_X = [...CHWP_X, STANDBY_CHWP_X];
export const CWP_ALL_X = [...CWP_X, STANDBY_CWP_X];
export const CHWP_Y = PUMP_ROW_Y;
export const CWP_Y = PUMP_ROW_Y;

/** Expansion tanks — left of High Rise, same row */
export const EXPTNK_Y = 545;
export const EXPTNK_SLOT = 72;
export const EXPTNK_X = [PLANT_WIDTH - 360, PLANT_WIDTH - 360 + 30 + EXPTNK_SLOT];

/** Bypass valves — between M / H rise branches */
export const BYPASS_X = PLANT_WIDTH - 420;
export const BYPASS_Y = [610, 655];

/** Medium / High rise */
export const M_RISE = { x: 248, y: 708, w: 128, h: 52, cx: 312 };
export const H_RISE = { x: PLANT_WIDTH - 200, y: 708, w: 128, h: 52, cx: PLANT_WIDTH - 136 };
/** CHWR above, CHWS below through M ↔ H gap */
export const RISE_CHWR_Y = M_RISE.y + 14;
export const RISE_CHWS_Y = M_RISE.y + M_RISE.h - 6;
export const HR_EXPORT_X = PLANT_WIDTH - 140;

/** Loop name tags — offset from pipe centerlines (SCADA: label beside header, not on pipe) */
export const PIPE_LOOP_LABELS = {
  cwsTower: { x: CT_X[0] - 8, y: PIPE.CWS_CT_TOP + 6, text: 'CWS', loop: 'cws' as const, anchor: 'end' as const },
  cwrMain: { x: TRAIN.LEFT + 48, y: PIPE.CWR_HDR - 10, text: 'CWR', loop: 'cwr' as const, anchor: 'start' as const },
  cwsUpper: { x: TRAIN.LEFT + 4, y: PIPE.CWS_HDR - 40 - 10, text: 'CWS', loop: 'cws' as const, anchor: 'start' as const },
  cwsLower: { x: TRAIN.LEFT + 142, y: PIPE.CWS_HDR + 55 - 10, text: 'CWS', loop: 'cws' as const, anchor: 'start' as const },
  chwsPrimary: { x: TRAIN.LEFT + 68, y: PIPE.CHWS + 5 - 10, text: 'CHWS', loop: 'chws' as const, anchor: 'start' as const },
  chwrMain: { x: TRAIN.LEFT + 135, y: PIPE.CHWR + 70 - 10, text: 'CHWR', loop: 'chwr' as const, anchor: 'start' as const },
  chwsSecondary: { x: TRAIN.LEFT + 18, y: PIPE.CHWS + 55 - 10, text: 'CHWS', loop: 'chws' as const, anchor: 'start' as const },
} as const;

/** @deprecated use M_RISE / H_RISE */
export const BUILDING = M_RISE;

export const CHWS_TAG = { x: 420, y: 428 };
export const CHWR_TAG = { x: 420, y: 388 };

export const chillerBottom = CH_Y + 78;
export const towerBottom = CT_Y + 80;

/** CT left-side CWS riser X (matches existing vertical at cx − 50) */
export const ctCwsRiserX = (tx: number) => towerCx(tx) - 50;

/** CWS only — each CT basin → left vertical CWS riser */
export function ctCwsLeftRiserPipes(): { d: string; loop: 'cws' }[] {
  const paths: { d: string; loop: 'cws' }[] = [];
  const tieY = towerBottom - 40;
  CT_X.forEach((tx) => {
    const riserX = ctCwsRiserX(tx);
    const tapX = tx + 10;
    paths.push({ d: `M ${tapX} ${tieY} L ${riserX} ${tieY}`, loop: 'cws' });
  });
  return paths;
}

/** Condenser loop pipes */
export function condenserPipes() {
  const left = TRAIN.LEFT;
  const right = PLANT_WIDTH - 120;
  const paths: { d: string; loop: 'cwr' | 'cws' }[] = [];
  const ctLeft = towerCx(CT_X[0]);
  const ctRight = towerCx(CT_X[CT_X.length - 1]);

  // CWS header above cooling towers
  paths.push({ d: `M ${ctLeft} ${PIPE.CWS_CT_TOP + 10} L ${ctRight} ${PIPE.CWS_CT_TOP + 10}`, loop: 'cws' });
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${PIPE.CWS_CT_TOP + 10} L ${cx} ${CT_Y + 28}`, loop: 'cws' });
  });
  paths.push({ d: `M ${ctRight} ${PIPE.CWS_CT_TOP + 10} L ${pumpCx(MAKEUP_PUMP_X[0]) + 130} ${PIPE.CWS_CT_TOP + 10}`, loop: 'cws' });

  // CWR header
  paths.push({ d: `M ${left + 60} ${PIPE.CWR_HDR} L ${right + 90} ${PIPE.CWR_HDR}`, loop: 'cwr' });

  // CWR down into each tower
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${PIPE.CWR_HDR} L ${cx} ${CT_Y + 28}`, loop: 'cwr' });
  });

  // CWS up from tower basin
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx - 50} ${towerBottom - 40} L ${cx - 50} ${PIPE.CWS_HDR - 40}`, loop: 'cws' });
  });

  // CWS header east–west
  paths.push({ d: `M ${left + 150} ${PIPE.CWS_HDR + 55} L ${right - 200} ${PIPE.CWS_HDR + 55}`, loop: 'cws' });
  paths.push({ d: `M ${left + 10} ${PIPE.CWS_HDR - 40} L ${right - 765} ${PIPE.CWS_HDR - 40}`, loop: 'cws' });
  paths.push({ d: `M ${left + 600} ${PIPE.CWS_HDR - 40} L ${left + 600} ${PIPE.CWS_HDR + 55}`, loop: 'cws' });

  // CWS from each chiller top to header
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${PIPE.CWR_HDR + 70} L ${cx} ${CH_Y}`, loop: 'cws' });
  });

  // CWR through each CWP into chiller top
  const cwrCwpHdrY = PIPE.CWS_HDR + 90;
  const cwrCwpLeft = pumpCx(CWP_X[0], PUMP_DIM.CWP.w);
  const cwrCwpRight = pumpCx(CWP_X[CWP_X.length - 1], PUMP_DIM.CWP.w);
  const pcx4 = pumpCx(STANDBY_CWP_X, PUMP_DIM.CWP.w);
  const cwrCwpHdrRight = Math.max(cwrCwpRight, pcx4);
  paths.push({ d: `M ${cwrCwpLeft} ${cwrCwpHdrY} L ${cwrCwpHdrRight} ${cwrCwpHdrY}`, loop: 'cwr' });
  paths.push({ d: `M ${cwrCwpLeft + 400} ${PIPE.CWR_HDR} L ${cwrCwpLeft + 400} ${cwrCwpHdrY}`, loop: 'cwr' });
  for (let i = 0; i < CWP_X.length; i++) {
    const pcx = pumpCx(CWP_X[i], PUMP_DIM.CWP.w);
    const chx = chillerCx(CH_X[i]);
    paths.push({ d: `M ${pcx} ${cwrCwpHdrY} L ${pcx} ${CWP_Y}`, loop: 'cwr' });
    paths.push({ d: `M ${pcx} ${CWP_Y + 30} L ${chx} ${CH_Y + 45}`, loop: 'cwr' });
  }
  // Standby CWP on CWR header
  paths.push({ d: `M ${pcx4} ${cwrCwpHdrY} L ${pcx4} ${CWP_Y}`, loop: 'cwr' });
  const cwrHdrRight = right + 90;
  paths.push({ d: `M ${cwrHdrRight} ${PIPE.CWR_HDR} L ${cwrHdrRight} ${cwrCwpHdrY + 60} L ${pcx4} ${cwrCwpHdrY + 60}`, loop: 'cwr' });

  paths.push(...makeupPipes());
  paths.push(...ctCwsLeftRiserPipes());

  return paths;
}

/** Make-up water — routed on CWS */
export function makeupPipes(): { d: string; loop: 'cws' }[] {
  const paths: { d: string; loop: 'cws' }[] = [];
  const top = MAKEUP_PIPE.TOP;
  const bot = MAKEUP_PIPE.BOTTOM;
  const p1 = pumpCx(MAKEUP_PUMP_X[0]);
  const p2 = pumpCx(MAKEUP_PUMP_X[1]);
  const p2Right = MAKEUP_PUMP_X[1] + 60;
  const tankCx = MAKEUP_TANK.x + MAKEUP_TANK.w / 2;
  const tankBot = MAKEUP_TANK.y + MAKEUP_TANK.h;
  const tankMidY = makeupTankMidY();
  const pumpTop = MAKEUP_PUMP_Y;
  const pumpBot = makeupPumpBottom();

  paths.push({ d: `M ${p1} ${top} L ${p1} ${pumpTop}`, loop: 'cws' });
  paths.push({ d: `M ${p2} ${top} L ${p2} ${pumpTop}`, loop: 'cws' });
  paths.push({ d: `M ${p1} ${pumpBot + 30} L ${p1} ${bot}`, loop: 'cws' });
  paths.push({ d: `M ${p1} ${bot + 20} L ${tankCx} ${bot + 20}`, loop: 'cws' });
  paths.push({ d: `M ${tankCx} ${bot + 20} L ${tankCx} ${tankBot}`, loop: 'cws' });
  paths.push({ d: `M ${p2Right} ${tankMidY} L ${MAKEUP_TANK.x} ${tankMidY}`, loop: 'cws' });

  return paths;
}

/** Chilled water loop pipes */
export function chilledPipes() {
  const left = TRAIN.LEFT;
  const right = HR_EXPORT_X + 60;
  const paths: { d: string; loop: 'chws' | 'chwr' }[] = [];
  const chwpH = PUMP_DIM.CHWP.h;

  paths.push({ d: `M ${left + 75} ${PIPE.CHWS + 5} L ${right - 10} ${PIPE.CHWS + 5}`, loop: 'chws' });
  paths.push({ d: `M ${left + 142} ${PIPE.CHWR + 70} L ${right - 15} ${PIPE.CHWR + 70}`, loop: 'chwr' });
  paths.push({ d: `M ${left + 25} ${PIPE.CHWS + 55} L ${right - 62} ${PIPE.CHWS + 55}`, loop: 'chws' });

  const chwrHdrY = PIPE.CHWR + 70;
  const chwsHdr2Y = PIPE.CHWS + 55;
  CHWP_ALL_X.forEach((px) => {
    const pcx = pumpCx(px, PUMP_DIM.CHWP.w);
    paths.push({ d: `M ${pcx} ${CHWP_Y + chwpH} L ${pcx} ${chwsHdr2Y}`, loop: 'chws' });
  });

  // CHWR — each chiller return drops to header
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${chillerBottom} L ${cx} ${chwrHdrY}`, loop: 'chwr' });
  });

  // CHWS — horizontal link each CHWP to its chiller (supply)
  const chwsLinkY = chillerBottom - 35;
  const chwsHdrY = PIPE.CHWS + 5;
  for (let i = 0; i < CHWP_X.length; i++) {
    const chwpRight = CHWP_X[i] + PUMP_DIM.CHWP.w;
    const chLeft = CH_X[i];
    const cx = chillerCx(CH_X[i]);
    paths.push({ d: `M ${chwpRight} ${chwsLinkY} L ${chLeft} ${chwsLinkY}`, loop: 'chws' });
    paths.push({ d: `M ${cx - 70} ${chwsLinkY} L ${cx - 70} ${chwsHdrY}`, loop: 'chws' });
  }

  // Medium / High rise branches
  const mRiseRight = M_RISE.x + M_RISE.w;
  const hRiseLeft = H_RISE.x;
  paths.push({ d: `M ${mRiseRight} ${RISE_CHWS_Y} L ${hRiseLeft} ${RISE_CHWS_Y}`, loop: 'chws' });
  paths.push({ d: `M ${mRiseRight} ${RISE_CHWR_Y} L ${hRiseLeft} ${RISE_CHWR_Y}`, loop: 'chwr' });
  const bridgeMidR = (mRiseRight + hRiseLeft) / 2;
  paths.push({ d: `M ${bridgeMidR} ${chwrHdrY} L ${bridgeMidR} ${RISE_CHWR_Y}`, loop: 'chwr' });
  paths.push({ d: `M ${bridgeMidR + 50} ${chwsHdrY} L ${bridgeMidR + 50} ${RISE_CHWS_Y}`, loop: 'chws' });

  // CHWS header → standby CHWP: up at right end, then left along supply link row
  const pcx4 = pumpCx(STANDBY_CHWP_X, PUMP_DIM.CHWP.w);
  paths.push({
    d: `M ${right - 10} ${chwsHdrY} L ${right - 10} ${chwsLinkY} L ${pcx4} ${chwsLinkY}`,
    loop: 'chws',
  });

  // Expansion tanks — vertical drops to CHWR header
  EXPTNK_X.forEach((tx) => {
    const tcx = tx + 24;
    paths.push({ d: `M ${tcx} ${chwrHdrY} L ${tcx} ${EXPTNK_Y + 8}`, loop: 'chwr' });
  });

  return paths;
}
