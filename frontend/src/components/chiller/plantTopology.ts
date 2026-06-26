/**
 * P&ID layout — mTower L29 chiller plant.
 * Each train: CHWP (left) · CH (centre) · CWP (right). No separate CWP row.
 */

export const PLANT_WIDTH = 1060;
export const PLANT_HEIGHT = 820;
export const PLANT_FOOTER_Y = 782;

export const SLOT = {
  TOWER: 180,
} as const;

/** Per-train horizontal spacing — SLOT must clear CHWP + CH + CWP + below labels */
export const TRAIN = {
  LEFT: 24,
  SLOT: 288,
  CHWP_X: -4,
  CH_X: 92,
  CWP_X: 218,
  /** Standby CHWP-4 / CWP-4 after the three chiller trains */
  STANDBY_GAP: 36,
  STANDBY_SHIFT: -32,
} as const;

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

export const ZONE = {
  TOWERS: { x: 8, y: 34, w: 580, h: 128, titleY: 50 },
  MAKEUP: { x: 620, y: 34, w: 435, h: 128, titleY: 50 },
  CHILLERS: { x: 8, y: 245, w: 1044, h: 240, titleY: 263 },
  CHW_LOOP: { y: 495, h: 300, titleY: 560 },
} as const;

export const pumpCx = (x: number, w = PUMP_DIM.CHWP.w) => x + w / 2;
export const towerCx = (x: number) => x + 34;
export const chillerCx = (x: number) => x + 50;

/** Make-up — CWMUP-1/2 row, CWMUTnk right */
export const MAKEUP_SLOT = 132;
export const MAKEUP_PUMP_X = [648, 648 + MAKEUP_SLOT];
export const MAKEUP_PUMP_Y = 86;
export const MAKEUP_TANK = { x: 648 + MAKEUP_SLOT * 2, y: 78, w: 56, h: 72 };
export const MAKEUP_PIPE = { TOP: 74, BOTTOM: 146 } as const;

export const makeupPumpBottom = () => MAKEUP_PUMP_Y + 52;
export const makeupTankMidY = () => MAKEUP_TANK.y + 36;

/** Cooling towers — top-left cluster */
export const CT_X = [50, 50 + SLOT.TOWER, 50 + SLOT.TOWER * 2];
export const CT_Y = 80;

/** Chiller trains — CHWP | CH | CWP on one row */
export const CH_Y = 340;
export const PUMP_ROW_Y = CH_Y + 16;

function trainLeft(index: number) {
  return TRAIN.LEFT + index * TRAIN.SLOT;
}

export const CH_X = [0, 1, 2].map((i) => trainLeft(i) + TRAIN.CH_X);
export const CHWP_X = [0, 1, 2].map((i) => trainLeft(i) + TRAIN.CHWP_X);
export const CWP_X = [0, 1, 2].map((i) => trainLeft(i) + TRAIN.CWP_X);

const standbyLeft = trainLeft(3) + TRAIN.STANDBY_GAP + TRAIN.STANDBY_SHIFT;
export const STANDBY_CHWP_X = standbyLeft + TRAIN.CHWP_X;
export const STANDBY_CWP_X = standbyLeft + TRAIN.CH_X;

/** @deprecated use STANDBY_CHWP_X / per-index arrays */
export const CHWP_ALL_X = [...CHWP_X, STANDBY_CHWP_X];
export const CWP_ALL_X = [...CWP_X, STANDBY_CWP_X];
export const CHWP_Y = PUMP_ROW_Y;
export const CWP_Y = PUMP_ROW_Y;

/** Expansion tanks — left of High Rise, same row */
export const EXPTNK_Y = 545;
export const EXPTNK_SLOT = 72;
export const EXPTNK_X = [840, 870 + EXPTNK_SLOT];

/** Bypass valves — between M / H rise branches */
export const BYPASS_X = 780;
export const BYPASS_Y = [610, 655];

/** Medium / High rise */
export const M_RISE = { x: 248, y: 708, w: 128, h: 52, cx: 312 };
export const H_RISE = { x: 880, y: 708, w: 128, h: 52, cx: 824 };
/** CHWR above, CHWS below through M ↔ H gap */
export const RISE_CHWR_Y = M_RISE.y + 14;
export const RISE_CHWS_Y = M_RISE.y + M_RISE.h - 6;
export const HR_EXPORT_X = 920;

/** Loop name tags — offset from pipe centerlines (SCADA: label beside header, not on pipe) */
export const PIPE_LOOP_LABELS = {
  /** CT supply header (top) */
  cwsTower: { x: CT_X[0] - 8, y: PIPE.CWS_CT_TOP + 6, text: 'CWS', loop: 'cws' as const, anchor: 'end' as const },
  /** Condenser return header — left of east–west run */
  cwrMain: { x: TRAIN.LEFT + 48, y: PIPE.CWR_HDR - 10, text: 'CWR', loop: 'cwr' as const, anchor: 'start' as const },
  /** Condenser supply (upper header) */
  cwsUpper: { x: TRAIN.LEFT + 4, y: PIPE.CWS_HDR - 40 - 10, text: 'CWS', loop: 'cws' as const, anchor: 'start' as const },
  /** Condenser supply (lower / chiller tie-in header) */
  cwsLower: { x: TRAIN.LEFT + 142, y: PIPE.CWS_HDR + 55 - 10, text: 'CWS', loop: 'cws' as const, anchor: 'start' as const },
  /** Primary CHWS header */
  chwsPrimary: { x: TRAIN.LEFT + 68, y: PIPE.CHWS + 5 - 10, text: 'CHWS', loop: 'chws' as const, anchor: 'start' as const },
  /** CHWR header */
  chwrMain: { x: TRAIN.LEFT + 135, y: PIPE.CHWR + 70 - 10, text: 'CHWR', loop: 'chwr' as const, anchor: 'start' as const },
  /** Secondary CHWS header (CHWP discharge) */
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

/** NEW CWS only — each CT basin → left vertical CWS riser (does not alter existing paths) */
export function ctCwsLeftRiserPipes(): { d: string; loop: 'cws' }[] {
  const paths: { d: string; loop: 'cws' }[] = [];
  const tieY = towerBottom - 40;
  const riserXs = CT_X.map(ctCwsRiserX);

  // Bottom manifold tying the three left CWS risers
  // paths.push({ d: `M ${riserXs[0]} ${tieY} L ${riserXs[riserXs.length - 1]} ${tieY}`, loop: 'cws' });

  CT_X.forEach((tx) => {
    const riserX = ctCwsRiserX(tx);
    const tapX = tx + 10;
    const basinY = CT_Y + 55;
    // Drop from CT basin to manifold
    // paths.push({ d: `M ${tapX} ${basinY} L ${tapX} ${tieY}`, loop: 'cws' });
    // Branch to left vertical CWS riser
    paths.push({ d: `M ${tapX} ${tieY} L ${riserX} ${tieY}`, loop: 'cws' });
  });

  return paths;
}

/** Condenser loop pipes */
export function condenserPipes() {
  const left = TRAIN.LEFT;
  const right = 940;
  const paths: { d: string; loop: 'cwr' | 'cws' }[] = [];
  const ctLeft = towerCx(CT_X[0]);
  const ctRight = towerCx(CT_X[2]);
  const cwpH = PUMP_DIM.CWP.h;

  // CWS header above cooling towers
  paths.push({ d: `M ${ctLeft} ${PIPE.CWS_CT_TOP + 10} L ${ctRight} ${PIPE.CWS_CT_TOP + 10}`, loop: 'cws' });
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${PIPE.CWS_CT_TOP + 10} L ${cx} ${CT_Y + 28}`, loop: 'cws' });
  });
  paths.push({ d: `M ${ctRight} ${PIPE.CWS_CT_TOP + 10} L ${pumpCx(MAKEUP_PUMP_X[0]) + 130} ${PIPE.CWS_CT_TOP + 10}`, loop: 'cws' });

  // CWR header
  paths.push({ d: `M ${left+60} ${PIPE.CWR_HDR} L ${right+90} ${PIPE.CWR_HDR}`, loop: 'cwr' });

  // CWR down into each tower
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${PIPE.CWR_HDR } L ${cx} ${CT_Y + 28}`, loop: 'cwr' });
  });

  // CWS up from tower basin
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx - 50} ${towerBottom - 40} L ${cx - 50} ${PIPE.CWS_HDR -40}`, loop: 'cws' });
  });

  // CWS header east–west
  paths.push({ d: `M ${left + 150} ${PIPE.CWS_HDR + 55} L ${right - 200} ${PIPE.CWS_HDR + 55}`, loop: 'cws' });
  paths.push({ d: `M ${left + 10} ${PIPE.CWS_HDR - 40} L ${right - 320} ${PIPE.CWS_HDR - 40}`, loop: 'cws' });
  paths.push({ d: `M ${left + 600} ${PIPE.CWS_HDR - 40} L ${left + 600} ${PIPE.CWS_HDR + 55}`, loop: 'cws' });

  // CWS from each chiller top to header
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${PIPE.CWR_HDR+70} L ${cx} ${CH_Y}`, loop: 'cws' });
  });

  // CWR through each CWP into chiller top
  const cwrCwpHdrY = PIPE.CWS_HDR + 90;
  const cwrCwpLeft = pumpCx(CWP_X[0], PUMP_DIM.CWP.w);
  const cwrCwpRight = pumpCx(CWP_X[2], PUMP_DIM.CWP.w);
  const pcx4 = pumpCx(STANDBY_CWP_X, PUMP_DIM.CWP.w);
  const cwrCwpHdrRight = Math.max(cwrCwpRight, pcx4);
  paths.push({ d: `M ${cwrCwpLeft} ${cwrCwpHdrY} L ${cwrCwpHdrRight} ${cwrCwpHdrY}`, loop: 'cwr' });
  paths.push({ d: `M ${cwrCwpLeft+400} ${PIPE.CWR_HDR} L ${cwrCwpLeft+400} ${cwrCwpHdrY}`, loop: 'cwr' });
  for (let i = 0; i < 3; i++) {
    const pcx = pumpCx(CWP_X[i], PUMP_DIM.CWP.w);
    const chx = chillerCx(CH_X[i]);
    paths.push({ d: `M ${pcx} ${cwrCwpHdrY} L ${pcx} ${CWP_Y}`, loop: 'cwr' });
    paths.push({ d: `M ${pcx} ${CWP_Y+30} L ${chx} ${CH_Y+45}`, loop: 'cwr' });
  }
  // Standby CWP-4 on CWR header
  paths.push({ d: `M ${pcx4} ${cwrCwpHdrY} L ${pcx4} ${CWP_Y}`, loop: 'cwr' });
  // Main CWR header → CWP-4: down at right end, then left along CWP trunk
  const cwrHdrRight = right + 90;
  paths.push({ d: `M ${cwrHdrRight} ${PIPE.CWR_HDR} L ${cwrHdrRight} ${cwrCwpHdrY+60} L ${pcx4} ${cwrCwpHdrY+60}`, loop: 'cwr' });

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

  
  paths.push({ d: `M ${left+75} ${PIPE.CHWS+5} L ${right-10} ${PIPE.CHWS+5}`, loop: 'chws' });
  paths.push({ d: `M ${left+142} ${PIPE.CHWR+70} L ${right-15} ${PIPE.CHWR+70}`, loop: 'chwr' });
  paths.push({ d: `M ${left+25} ${PIPE.CHWS+55} L ${right-62} ${PIPE.CHWS+55}`, loop: 'chws' });

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
  for (let i = 0; i < 3; i++) {
    const chwpRight = CHWP_X[i] + PUMP_DIM.CHWP.w;
    const chLeft = CH_X[i];
    const cx = chillerCx(CH_X[i]);
    paths.push({ d: `M ${chwpRight} ${chwsLinkY} L ${chLeft} ${chwsLinkY}`, loop: 'chws' });
    paths.push({ d: `M ${cx-70} ${chwsLinkY} L ${cx-70} ${chwsHdrY}`, loop: 'chws' });
  }

  // Medium / High rise branches
  const mRiseRight = M_RISE.x + M_RISE.w;
  const hRiseLeft = H_RISE.x;
  // M ↔ H bridge — CHWS + CHWR across gap (sketch)
  paths.push({ d: `M ${mRiseRight} ${RISE_CHWS_Y} L ${hRiseLeft} ${RISE_CHWS_Y}`, loop: 'chws' });
  paths.push({ d: `M ${mRiseRight} ${RISE_CHWR_Y} L ${hRiseLeft} ${RISE_CHWR_Y}`, loop: 'chwr' });
  // Bridge tap — vertical to main headers
  paths.push({ d: `M ${mRiseRight+400} ${chwrHdrY} L ${mRiseRight+400} ${RISE_CHWR_Y}`, loop: 'chwr' });
  paths.push({ d: `M ${mRiseRight+450} ${chwsHdrY} L ${mRiseRight+450} ${RISE_CHWS_Y}`, loop: 'chws' });
  // Short stubs into each rise box
  // paths.push({ d: `M ${M_RISE.cx} ${RISE_CHWS_Y} L ${mRiseRight} ${RISE_CHWS_Y}`, loop: 'chws' });
  // paths.push({ d: `M ${M_RISE.cx} ${RISE_CHWR_Y} L ${mRiseRight} ${RISE_CHWR_Y}`, loop: 'chwr' });
  // paths.push({ d: `M ${hRiseLeft} ${RISE_CHWS_Y} L ${H_RISE.cx} ${RISE_CHWS_Y}`, loop: 'chws' });
  // paths.push({ d: `M ${hRiseLeft} ${RISE_CHWR_Y} L ${H_RISE.cx} ${RISE_CHWR_Y}`, loop: 'chwr' });

  // CHWR trunk through CHWPs into each chiller (+ standby CHWP-4)
  CHWP_X.forEach((px, i) => {
    const pcx = pumpCx(px, PUMP_DIM.CHWP.w);
    // paths.push({ d: `M ${pcx} ${PIPE.CHWR} L ${pcx} ${CHWP_Y + chwpH}`, loop: 'chwr' });
    // paths.push({ d: `M ${pcx} ${CHWP_Y} L ${pcx} ${chillerBottom}`, loop: 'chwr' });
  });
  const pcx4 = pumpCx(STANDBY_CHWP_X, PUMP_DIM.CHWP.w);
  // CHWS header → CHWP-4: up at right end, then left along supply link row
  paths.push({
    d: `M ${right-10} ${chwsHdrY} L ${right-10} ${chwsLinkY} L ${pcx4} ${chwsLinkY}`,
    loop: 'chws',
  });

  // Expansion tanks — vertical drops to CHWR header
  EXPTNK_X.forEach((tx) => {
    const tcx = tx + 24;
    paths.push({ d: `M ${tcx} ${chwrHdrY} L ${tcx} ${EXPTNK_Y + 8}`, loop: 'chwr' });
  });

  // Bypass valves — bridge CHWR (above) / CHWS (below) rise branches
  const bx = BYPASS_X + 20;
  // paths.push({ d: `M ${bx} ${RISE_CHWR_Y} L ${bx} ${BYPASS_Y[0] + 16}`, loop: 'chwr' });
  // paths.push({ d: `M ${bx} ${BYPASS_Y[1] + 16} L ${bx} ${RISE_CHWS_Y}`, loop: 'chws' });

  return paths;
}
