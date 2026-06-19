/**
 * District Cooling System (DCS) campus schematic topology.
 * Matches standard ETS layout: central plant → supply header → branch ETS (HX + building + AHU) → return header.
 * Reference: EMSD HK DCS guidelines (primary 5/13°C, secondary 6/14°C), IEA DHC Connection Handbook Fig 4.5.
 */

export const DCS_WIDTH = 1080;
/** Extra top band for horizontal loop legend above central plant column */
export const CONTENT_OFFSET_Y = 44;
export const DCS_HEIGHT = 620 + CONTENT_OFFSET_Y;
export const DCS_FOOTER_Y = 608 + CONTENT_OFFSET_Y;

/** Horizontal legend row — centred on PLANT_CX in the view */
export const LEGEND_ROW = { y: 8, h: 30 };

export const PLANT = { x: 400, y: 36 + CONTENT_OFFSET_Y, w: 280, h: 72 };
export const SUPPLY_Y = 132 + CONTENT_OFFSET_Y;
export const RETURN_Y = 492 + CONTENT_OFFSET_Y;
export const PLANT_CX = PLANT.x + PLANT.w / 2;

/** Single building branch centre X (MBS) */
export const BRANCH_X = [PLANT_CX] as const;

export const BUILDING_DEFS = [
  { id: 'mbs', name: 'MBS', hxId: 'hx-mbs', ahuId: 'ahu-mbs', valveId: 'dcv-mbs' },
] as const;

export const ZONE = {
  PLANT: { x: 8, y: 20 + CONTENT_OFFSET_Y, w: 1064, h: 100, titleY: 34 + CONTENT_OFFSET_Y },
  SUPPLY: { x: 8, y: 118 + CONTENT_OFFSET_Y, w: 1064, h: 28, titleY: 126 + CONTENT_OFFSET_Y },
  BRANCHES: { x: 8, y: 148 + CONTENT_OFFSET_Y, w: 1064, h: 330, titleY: 162 + CONTENT_OFFSET_Y },
  RETURN: { x: 8, y: 478 + CONTENT_OFFSET_Y, w: 1064, h: 28, titleY: 486 + CONTENT_OFFSET_Y },
};

const HX_Y = 188 + CONTENT_OFFSET_Y;
const BLD_Y = 288 + CONTENT_OFFSET_Y;
const AHU_Y = 388 + CONTENT_OFFSET_Y;

export function hxBox(cx: number) {
  return { x: cx - 54, y: HX_Y, w: 108, h: 72 };
}

export function buildingBox(cx: number) {
  return { x: cx - 64, y: BLD_Y, w: 128, h: 72 };
}

export function ahuBox(cx: number) {
  return { x: cx - 56, y: AHU_Y, w: 112, h: 64 };
}

export function valvePos(cx: number) {
  return { x: cx - 20, y: HX_Y - 36 };
}

export interface DcsPipePath {
  d: string;
  loop: 'dcs' | 'dcr' | 'chws' | 'chwr';
}

/** Primary DCS supply/return headers + per-branch secondary loops */
export function dcsPipes(): DcsPipePath[] {
  const paths: DcsPipePath[] = [];
  const left = 48;
  const right = DCS_WIDTH - 48;

  // Plant outlet → supply header
  paths.push({ d: `M ${PLANT_CX} ${PLANT.y + PLANT.h} L ${PLANT_CX} ${SUPPLY_Y}`, loop: 'dcs' });
  paths.push({ d: `M ${left} ${SUPPLY_Y} L ${right} ${SUPPLY_Y}`, loop: 'dcs' });

  BRANCH_X.forEach((bx) => {
    const primaryOutX = bx + 28;

    // Primary supply down to HX
    paths.push({ d: `M ${bx} ${SUPPLY_Y} L ${bx} ${HX_Y - 8}`, loop: 'dcs' });
    // Secondary CHWS to building / AHU
    paths.push({ d: `M ${bx} ${HX_Y + 72} L ${bx} ${BLD_Y}`, loop: 'chws' });
    paths.push({ d: `M ${bx} ${BLD_Y + 72} L ${bx} ${AHU_Y}`, loop: 'chws' });
    // Secondary CHWR return up through HX zone (left rail — separate from primary DCR on right)
    paths.push({ d: `M ${bx - 28} ${AHU_Y + 32} L ${bx - 28} ${HX_Y + 36}`, loop: 'chwr' });
    paths.push({ d: `M ${bx - 28} ${HX_Y + 36} L ${bx} ${HX_Y + 36}`, loop: 'chwr' });
    // Primary return: PHE outlet → DCR header → toward plant centre (no downward plant leg)
    paths.push({ d: `M ${primaryOutX} ${HX_Y + 36} L ${primaryOutX} ${RETURN_Y}`, loop: 'dcr' });
    if (primaryOutX !== PLANT_CX) {
      paths.push({ d: `M ${primaryOutX} ${RETURN_Y} L ${PLANT_CX} ${RETURN_Y}`, loop: 'dcr' });
    }
  });

  // DCR header rail (full width) + single riser back up to district plant
  paths.push({ d: `M ${left} ${RETURN_Y} L ${right} ${RETURN_Y}`, loop: 'dcr' });
  paths.push({ d: `M ${PLANT_CX} ${RETURN_Y} L ${PLANT_CX} ${PLANT.y + PLANT.h}`, loop: 'dcr' });

  return paths;
}

export function boundsForDcsAsset(id: string): { x: number; y: number; w: number; h: number } | null {
  if (id === 'dcs-plant') return { ...PLANT };
  const branch = BUILDING_DEFS.find((b) => b.hxId === id || b.ahuId === id || b.valveId === id || b.id === id);
  if (!branch) return null;
  const idx = BUILDING_DEFS.indexOf(branch);
  const cx = BRANCH_X[idx];
  if (id === branch.valveId) return { ...valvePos(cx), w: 40, h: 32 };
  if (id === branch.hxId) return { ...hxBox(cx) };
  if (id === branch.ahuId) return { ...ahuBox(cx) };
  return { ...buildingBox(cx) };
}
