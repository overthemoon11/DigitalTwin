/**
 * P&ID layout — pipe lanes align to equipment connection ports (see reference P&ID).
 * Pump port: (x+30, y+26). Tower center: (x+34, y+32). Chiller center: (x+50, y+39).
 */

export const PLANT_WIDTH = 1060;
export const PLANT_HEIGHT = 770;
/** Footer caption — fixed Y so extra canvas height is padding below */
export const PLANT_FOOTER_Y = 732;

/** Icon + right label plate + gap to next symbol */
export const SLOT = {
  PUMP: 168,
  TOWER: 184,
  CHILLER: 228,
} as const;

const ROW_LEFT = 210;

/** Horizontal pipe Y (centerline) */
export const PIPE = {
  /** Hot condenser return → tower tops */
  CWR_HDR: 158,
  /** Cold condenser supply from tower basins */
  CWS_HDR: 172,
  /** CWS trunk through CWP impellers (below tower headers) */
  CWS_TRUNK: 238,
  /** Chilled water supply to building */
  CHWS: 500,
  /** Chilled water return header (above building load) */
  CHWR: 628,
} as const;

/** Layout zones (SVG y) — title Y is the badge position (above pipe lanes) */
export const ZONE = {
  MAKEUP: { y: 34, h: 128, titleY: 50 },
  TOWERS: { y: 34, h: 128, titleY: 50 },
  CWP_ROW: { y: 188, h: 92, titleY: 206 },
  CHILLERS: { y: 295, h: 125, titleY: 313 },
  CHW_LOOP: { y: 440, h: 275, titleY: 460 },
  HYDRONIC: { y: 295, h: 248, titleY: 313 },
} as const;

export const pumpCx = (x: number) => x + 30;
export const pumpCy = (y: number) => y + 26;
export const towerCx = (x: number) => x + 34;
export const chillerCx = (x: number) => x + 50;

/** Equipment left-edge X */
export const MAKEUP_TANK = { x: 28, y: 56 };
export const MAKEUP_PUMP_Y = [62, 118];
export const MAKEUP_PUMP_X = 128;

export const CT_X = [260, 260 + SLOT.TOWER, 260 + SLOT.TOWER * 2];
export const CT_Y = 64;

export const CWP_X = [ROW_LEFT, ROW_LEFT + SLOT.PUMP, ROW_LEFT + SLOT.PUMP * 2, ROW_LEFT + SLOT.PUMP * 3];
export const CWP_Y = 220;

export const CH_X = [210, 210 + SLOT.CHILLER, 210 + SLOT.CHILLER * 2];
export const CH_Y = 330;

export const CHWP_X = [...CWP_X];
export const CHWP_Y = 515;

export const EXPTNK_X = 22;
export const EXPTNK_Y = [334, 426];

export const BYPASS_X = 900;
export const BYPASS_Y = [376, 476];

/** Sits below CHWR header — supply drops from CHWS, return rises to CHWR */
export const BUILDING = { x: 430, y: 645, w: 140, h: 60 };

export const CHWS_TAG = { x: 420, y: 450 };
export const CHWR_TAG = { x: 420, y: 578 };

export const chillerBottom = CH_Y + 78;
export const towerBottom = CT_Y + 80;

/** Condenser loop pipes */
export function condenserPipes() {
  const left = 200;
  const right = 940;
  const paths: { d: string; loop: 'cwr' | 'cws' | 'makeup' }[] = [];

  // CWR header (east–west)
  paths.push({ d: `M ${left} ${PIPE.CWR_HDR} L ${right} ${PIPE.CWR_HDR}`, loop: 'cwr' });

  // CWR down into each tower
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${PIPE.CWR_HDR} L ${cx} ${CT_Y + 28}`, loop: 'cwr' });
  });

  // CWS up from tower basin
  CT_X.forEach((tx) => {
    const cx = towerCx(tx);
    paths.push({ d: `M ${cx} ${towerBottom} L ${cx} ${PIPE.CWS_HDR}`, loop: 'cws' });
  });

  // CWS header east–west
  paths.push({ d: `M ${left} ${PIPE.CWS_HDR} L ${right} ${PIPE.CWS_HDR}`, loop: 'cws' });

  // CWS down to CWP row + trunk through pumps
  paths.push({ d: `M ${left} ${PIPE.CWS_HDR} L ${left} ${PIPE.CWS_TRUNK} L ${right} ${PIPE.CWS_TRUNK}`, loop: 'cws' });

  // CWS up to each chiller (condenser inlet, top) — CWPs are inline on CWS_TRUNK
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${PIPE.CWS_TRUNK} L ${cx} ${CH_Y}`, loop: 'cws' });
  });

  // CWR from chiller top back to header
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${CH_Y} L ${cx} ${PIPE.CWR_HDR}`, loop: 'cwr' });
  });

  // Makeup: tank → pumps → CWS header
  paths.push({
    d: `M ${MAKEUP_TANK.x + 56} ${MAKEUP_TANK.y + 36} L ${MAKEUP_PUMP_X} ${MAKEUP_TANK.y + 36} L ${MAKEUP_PUMP_X} ${MAKEUP_PUMP_Y[0] + 26}`,
    loop: 'makeup',
  });
  paths.push({
    d: `M ${MAKEUP_PUMP_X} ${MAKEUP_PUMP_Y[1] + 52} L ${MAKEUP_PUMP_X} ${PIPE.CWS_HDR} L ${240} ${PIPE.CWS_HDR}`,
    loop: 'makeup',
  });

  return paths;
}

/** Chilled water loop pipes */
export function chilledPipes() {
  const left = 200;
  const right = 940;
  const paths: { d: string; loop: 'chws' | 'chwr' }[] = [];

  // CHWS header
  paths.push({ d: `M ${left} ${PIPE.CHWS} L ${right} ${PIPE.CHWS}`, loop: 'chws' });

  // CHWS from each chiller evaporator (bottom) to header
  CH_X.forEach((hx) => {
    const cx = chillerCx(hx);
    paths.push({ d: `M ${cx} ${chillerBottom} L ${cx} ${PIPE.CHWS}`, loop: 'chws' });
  });

  // CHWR header (east–west, above building load)
  paths.push({ d: `M ${left} ${PIPE.CHWR} L ${right} ${PIPE.CHWR}`, loop: 'chwr' });

  const bldgCx = BUILDING.x + BUILDING.w / 2;
  // CHWS supply drop to building (below CHWR trunk)
  paths.push({ d: `M ${bldgCx} ${PIPE.CHWS} L ${bldgCx} ${BUILDING.y}`, loop: 'chws' });
  // CHWR return rise from building top up to header
  paths.push({ d: `M ${bldgCx} ${BUILDING.y} L ${bldgCx} ${PIPE.CHWR}`, loop: 'chwr' });

  // CHWR trunk through CHWP impellers (return to chillers)
  paths.push({ d: `M ${left} ${PIPE.CHWR} L ${left} ${pumpCy(CHWP_Y)} L ${right} ${pumpCy(CHWP_Y)}`, loop: 'chwr' });

  CHWP_X.forEach((px) => {
    const cx = pumpCx(px);
    paths.push({ d: `M ${cx} ${pumpCy(CHWP_Y)} L ${cx} ${chillerBottom}`, loop: 'chwr' });
  });

  // Expansion tank branch from CHWR (left side, clear of tank labels)
  const branchX = 88;
  paths.push({ d: `M ${left} ${PIPE.CHWR} L ${branchX} ${PIPE.CHWR}`, loop: 'chwr' });
  paths.push({ d: `M ${branchX} ${PIPE.CHWR} L ${branchX} ${EXPTNK_Y[0] + 40}`, loop: 'chwr' });
  paths.push({ d: `M ${branchX} ${EXPTNK_Y[0] + 40} L ${EXPTNK_X + 44} ${EXPTNK_Y[0] + 40}`, loop: 'chwr' });
  paths.push({ d: `M ${branchX} ${EXPTNK_Y[1] + 40} L ${EXPTNK_X + 44} ${EXPTNK_Y[1] + 40}`, loop: 'chwr' });
  paths.push({ d: `M ${branchX} ${EXPTNK_Y[0] + 40} L ${branchX} ${EXPTNK_Y[1] + 40}`, loop: 'chwr' });

  // Bypass valves (bridge CHWS ↔ CHWR on far right)
  const bx = BYPASS_X + 20;
  paths.push({ d: `M ${bx} ${PIPE.CHWS} L ${bx} ${BYPASS_Y[0] + 16}`, loop: 'chws' });
  paths.push({ d: `M ${bx} ${BYPASS_Y[1] + 44} L ${bx} ${PIPE.CHWR}`, loop: 'chwr' });

  return paths;
}
