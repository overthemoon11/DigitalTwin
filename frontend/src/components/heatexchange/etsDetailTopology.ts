export const ETS_WIDTH = 960;
export const ETS_HEIGHT = 620;
export const ETS_FOOTER_Y = 604;

export const LEGEND_POS = { x: 778, y: 0 };

export const PRIMARY_ZONE = { x: 12, y: 90, w: 936, h: 128 };
export const PHE = { x: 348, y: 260, w: 220, h: 96 };
export const SECONDARY_ZONE = { x: 12, y: 402, w: 936, h: 168 };

/** Primary district pipe centreline */
export const PRIMARY_Y = PRIMARY_ZONE.y + 72;
/** Secondary CHW pipe centreline */
export const SECONDARY_Y = SECONDARY_ZONE.y + 80;

export const EQUIP = {
  headerFrom: { x: 28, y: PRIMARY_Y - 26 },
  headerTo: { x: 768, y: PRIMARY_Y - 26 },
  flowMeter: { x: 168, y: PRIMARY_Y - 20 },
  valve: { x: 318, y: PRIMARY_Y - 14 },
  /** Below primary pipe, centre of zone — clear of headers & DCR tag */
  energyMeter: { x: 498, y: PRIMARY_Y + 22 },
  pump: { x: 128, y: SECONDARY_Y - 26 },
  ahu: { x: 548, y: SECONDARY_Y - 28, w: 76, h: 56, gap: 104 },
  pheInfo: { x: 584, y: 262, w: 148, h: 40 },
};

/** Bypass loop around CHW pump (discharge → suction parallel path) */
export const BYPASS = {
  y: SECONDARY_Y - 38,
  xOut: EQUIP.pump.x + 68,
  xIn: EQUIP.pump.x - 8,
  cx: (EQUIP.pump.x + 68 + EQUIP.pump.x - 8) / 2,
};

export interface EtsPipePath {
  d: string;
  loop: 'dcs' | 'dcr' | 'chws' | 'chwr';
  dashed?: boolean;
}

export function etsPipes(): EtsPipePath[] {
  const paths: EtsPipePath[] = [];
  const pheCx = PHE.x + PHE.w / 2;
  const pheTop = PHE.y;
  const pheBot = PHE.y + PHE.h;
  const py = PRIMARY_Y;
  const sy = SECONDARY_Y;

  // Primary: header → meter → valve → PHE top → return header
  paths.push({ d: `M 48 ${py} L ${EQUIP.flowMeter.x} ${py}`, loop: 'dcs' });
  paths.push({ d: `M ${EQUIP.flowMeter.x + 40} ${py} L ${EQUIP.valve.x} ${py}`, loop: 'dcs' });
  paths.push({ d: `M ${EQUIP.valve.x + 40} ${py} L ${pheCx - 22} ${py} L ${pheCx - 22} ${pheTop}`, loop: 'dcs' });
  paths.push({ d: `M ${pheCx + 22} ${pheTop} L ${pheCx + 22} ${py}`, loop: 'dcr' });
  paths.push({ d: `M ${pheCx + 22} ${py} L ${EQUIP.headerTo.x + 88} ${py}`, loop: 'dcr' });

  // Secondary: AHUs → PHE bottom → pump → CHWS rail
  const ahuEnd = EQUIP.ahu.x + 2 * EQUIP.ahu.gap + EQUIP.ahu.w;
  paths.push({ d: `M ${ahuEnd - 16} ${sy} L ${pheCx + 22} ${sy} L ${pheCx + 22} ${pheBot}`, loop: 'chwr' });
  paths.push({ d: `M ${pheCx - 22} ${pheBot} L ${pheCx - 22} ${sy}`, loop: 'chws' });
  paths.push({ d: `M ${pheCx - 22} ${sy} L ${EQUIP.pump.x + 60} ${sy}`, loop: 'chws' });
  paths.push({ d: `M ${EQUIP.pump.x} ${sy} L ${EQUIP.ahu.x} ${sy}`, loop: 'chws' });

  // Bypass — parallel loop around CHW pump (standard ETS min-flow / standby path)
  const by = BYPASS;
  paths.push({
    d: `M ${by.xOut} ${sy} L ${by.xOut} ${by.y} L ${by.xIn} ${by.y} L ${by.xIn} ${sy}`,
    loop: 'chws',
    dashed: true,
  });

  // Energy meter sense line (vertical tap to primary pipe)
  const em = EQUIP.energyMeter;
  paths.push({
    d: `M ${em.x + 36} ${em.y} L ${em.x + 36} ${py}`,
    loop: 'dcs',
    dashed: true,
  });

  return paths;
}

export function boundsForEtsAsset(assetId: string): { x: number; y: number; w: number; h: number } | null {
  if (!assetId.includes('mbs')) return null;

  if (assetId === 'flow-mbs') return { x: EQUIP.flowMeter.x, y: EQUIP.flowMeter.y, w: 40, h: 40 };
  if (assetId === 'dcv-mbs') return { x: EQUIP.valve.x, y: EQUIP.valve.y, w: 40, h: 32 };
  if (assetId === 'hx-mbs') return { ...PHE };
  if (assetId === 'meter-mbs') return { x: EQUIP.energyMeter.x, y: EQUIP.energyMeter.y, w: 72, h: 48 };
  if (assetId === 'pump-mbs') return { x: EQUIP.pump.x, y: EQUIP.pump.y, w: 60, h: 52 };
  if (assetId === 'bypass-mbs') return { x: BYPASS.cx - 24, y: BYPASS.y - 14, w: 48, h: 28 };
  if (assetId === 'mbs') return { x: 480, y: SECONDARY_Y - 40, w: 120, h: 56 };
  const ahuMatch = assetId.match(/^ahu-mbs-(\d)$/);
  if (ahuMatch) {
    const idx = Number(ahuMatch[1]) - 1;
    return { x: EQUIP.ahu.x + idx * EQUIP.ahu.gap, y: EQUIP.ahu.y, w: EQUIP.ahu.w, h: EQUIP.ahu.h };
  }
  if (assetId === 'ahu-mbs') return { x: EQUIP.ahu.x, y: EQUIP.ahu.y, w: EQUIP.ahu.w * 3 + EQUIP.ahu.gap * 2, h: EQUIP.ahu.h };
  return null;
}
