/**
 * AHU01 BMS SCADA layout — calibrated to AHU01 P&ID reference.
 * Two exhaust boxes (return top, supply bottom), room bottom-right,
 * external FA/EA damper boxes with elbow ducts.
 */
export const AHU_W = 1080;
export const AHU_H = 620;

/** Return (exhaust) air box — top horizontal housing */
export const RA_BOX = { x: 118, y: 98, w: 668, h: 98 };
/** Supply air box — bottom horizontal housing */
export const SA_BOX = { x: 118, y: 228, w: 788, h: 98 };

export const RA_CY = RA_BOX.y + RA_BOX.h / 2;
export const SA_CY = SA_BOX.y + SA_BOX.h / 2;

/** External damper housings (outside main boxes) */
export const EXT_EA = { x: 42, y: 52, w: 72, h: 48 };
export const EXT_FA = { x: 42, y: 358, w: 72, h: 48 };

/** Room — bottom right */
export const ROOM = { x: 808, y: 398, w: 128, h: 168 };

/** Ambient readout — top right */
export const AMBIENT = { x: 868, y: 48 };

/** RA damper riser (return box → mixing box) */
export const RA_DAMPER = { x: 248, y: 196, w: 28, h: 36 };

/** Duct geometry */
export const DUCT = {
  /** Return duct: box right → room (horizontal then down) */
  raExitX: RA_BOX.x + RA_BOX.w,
  raDuctY: RA_CY,
  raHorizEnd: 962,
  raDropX: 948,
  /** Supply duct: box right → room */
  saExitX: SA_BOX.x + SA_BOX.w,
  saDuctY: SA_CY,
  saHorizEnd: 808,
  saDropX: 818,
};

/** In-box component slots — x is centerline, w/h for drawing */
export const POS = {
  /** Return box interior L→R: EA damper, RA fan, EU-7, fire */
  raEa: { x: 148, y: RA_CY },
  raFan: { x: 268, y: RA_CY },
  raEu7: { x: 468, y: RA_CY, w: 36, h: 72 },
  raFire: { x: 748, y: RA_CY },

  /** Supply box interior L→R: FA, mixing, EU-4, CHW, HW, SA fan, EU-7, EU-13, fire */
  saFa: { x: 148, y: SA_CY },
  mixing: { x: 248, y: SA_CY, w: 88, h: 76 },
  saEu4: { x: 348, y: SA_CY, w: 36, h: 72 },
  chwCoil: { x: 438, y: SA_CY, w: 44, h: 76 },
  hwCoil: { x: 528, y: SA_CY, w: 44, h: 76 },
  saFan: { x: 618, y: SA_CY },
  saEu7: { x: 708, y: SA_CY, w: 36, h: 72 },
  saEu13: { x: 788, y: SA_CY, w: 36, h: 72 },
  saFire: { x: 868, y: SA_CY },

  /** External dampers (centers) */
  extEa: { x: EXT_EA.x + EXT_EA.w / 2, y: EXT_EA.y + EXT_EA.h / 2 },
  extFa: { x: EXT_FA.x + EXT_FA.w / 2, y: EXT_FA.y + EXT_FA.h / 2 },

  /** Sensors on return duct (room → box, right to left) */
  raSmoke: { x: 952, y: RA_CY - 28 },
  raTrh: { x: 872, y: RA_CY - 38 },
  raCfm: { x: 792, y: RA_CY - 38 },

  /** Sensor on supply duct */
  saCfm: { x: 848, y: SA_CY + 22 },

  room: ROOM,
  ambient: AMBIENT,
};

export const MODE_LABELS = ['RECIRCULATION', 'MIN OA', 'ECONOMIZER', 'HEATING'];

/** Static grey duct paths + flow overlay paths */
export function ahuDuctPaths() {
  const r = ROOM;
  const mixCx = POS.mixing.x;
  const raDropX = RA_DAMPER.x + RA_DAMPER.w / 2;

  return {
    grey: [
      // External EA → return box EA damper
      `M ${POS.extEa.x} ${EXT_EA.y + EXT_EA.h} L ${POS.extEa.x} ${RA_CY} L ${POS.raEa.x - 20} ${RA_CY}`,
      // Return box → room duct
      `M ${DUCT.raExitX} ${DUCT.raDuctY} L ${DUCT.raHorizEnd} ${DUCT.raDuctY} L ${DUCT.raDropX} ${DUCT.raDuctY} L ${DUCT.raDropX} ${r.y}`,
      // RA recirc: return box bottom → RA damper → mixing
      `M ${raDropX} ${RA_BOX.y + RA_BOX.h} L ${raDropX} ${POS.mixing.y - POS.mixing.h / 2}`,
      // External FA → mixing box
      `M ${POS.extFa.x} ${EXT_FA.y} L ${POS.extFa.x} ${SA_CY + 40} L ${mixCx} ${SA_CY + 40} L ${mixCx} ${POS.mixing.y + POS.mixing.h / 2}`,
      // Supply box → room duct
      `M ${DUCT.saExitX} ${DUCT.saDuctY} L ${DUCT.saHorizEnd} ${DUCT.saDuctY} L ${DUCT.saDropX} ${DUCT.saDuctY} L ${DUCT.saDropX} ${r.y + 24}`,
    ],
    flow: [
      { d: `M ${DUCT.raHorizEnd} ${DUCT.raDuctY} L ${DUCT.raExitX} ${DUCT.raDuctY}`, loop: 'chwr' as const },
      { d: `M ${POS.raEa.x + 20} ${RA_CY} L ${POS.raFire.x - 20} ${RA_CY}`, loop: 'chwr' as const },
      { d: `M ${POS.saFa.x + 20} ${SA_CY} L ${POS.saFire.x - 20} ${SA_CY}`, loop: 'chws' as const },
      { d: `M ${DUCT.saExitX} ${SA_CY} L ${DUCT.saHorizEnd} ${SA_CY}`, loop: 'chws' as const },
      { d: `M ${POS.extFa.x} ${EXT_FA.y} L ${mixCx} ${POS.mixing.y + POS.mixing.h / 2}`, loop: 'cws' as const },
    ],
  };
}

export function focusAhuViewport(b: { x: number; y: number; w: number; h: number }, padding = 44) {
  const x = Math.max(0, b.x - padding);
  const y = Math.max(0, b.y - padding);
  return {
    x,
    y,
    w: Math.min(AHU_W - x, b.w + padding * 2),
    h: Math.min(AHU_H - y, b.h + padding * 2),
  };
}

export function boundsForAhuAsset(id: string): { x: number; y: number; w: number; h: number } | null {
  if (id === 'ahu01-sa-fan') return { x: POS.saFan.x - 30, y: POS.saFan.y - 40, w: 60, h: 80 };
  if (id === 'ahu01-ra-fan') return { x: POS.raFan.x - 30, y: POS.raFan.y - 40, w: 60, h: 80 };
  if (id === 'ahu01-chw-coil') return { x: POS.chwCoil.x - 30, y: POS.chwCoil.y - 50, w: 60, h: 100 };
  if (id === 'ahu01-hw-coil') return { x: POS.hwCoil.x - 30, y: POS.hwCoil.y - 50, w: 60, h: 100 };
  if (id === 'ahu01-mixing') return { x: POS.mixing.x - POS.mixing.w / 2, y: POS.mixing.y - POS.mixing.h / 2, w: POS.mixing.w, h: POS.mixing.h + 20 };
  if (id === 'room') return { ...ROOM };
  if (id.includes('eu4')) return { x: POS.saEu4.x - 24, y: POS.saEu4.y - 40, w: 48, h: 90 };
  if (id.includes('sa-eu7')) return { x: POS.saEu7.x - 24, y: POS.saEu7.y - 40, w: 48, h: 90 };
  if (id.includes('sa-eu13')) return { x: POS.saEu13.x - 24, y: POS.saEu13.y - 40, w: 48, h: 90 };
  if (id.includes('ra-eu7')) return { x: POS.raEu7.x - 24, y: POS.raEu7.y - 40, w: 48, h: 90 };
  if (id.includes('oa') || id.includes('fa')) return { x: EXT_FA.x - 8, y: EXT_FA.y - 8, w: EXT_FA.w + 80, h: EXT_FA.h + 16 };
  if (id.includes('ea')) return { x: EXT_EA.x - 8, y: EXT_EA.y - 8, w: EXT_EA.w + 80, h: EXT_EA.h + 16 };
  if (id.includes('ra-damper')) return { x: RA_DAMPER.x - 8, y: RA_DAMPER.y - 8, w: RA_DAMPER.w + 16, h: RA_DAMPER.h + 40 };
  return null;
}
