/**
 * AHU01 BMS SCADA layout — positions calibrated to AHU01 P&ID reference.
 * Return box (top) is shorter than supply box (bottom); room bottom-right.
 */
export const AHU_W = 1080;
export const AHU_H = 620;

/** Return air housing — ends at fire damper; duct continues to room */
export const RA_BOX = { x: 120, y: 102, w: 598, h: 150 };
/** Supply air housing — longer, holds full SA train */
export const SA_BOX = { x: 50, y: 350, w: 758, h: 150 };

export const RA_CY = RA_BOX.y + RA_BOX.h / 2;
export const SA_CY = SA_BOX.y + SA_BOX.h / 2;

export const EXT_EA = { x: 45, y: 58, w: 80, h: 44 };
export const EXT_FA = { x: 50, y: 550, w: 80, h: 44 };

export const ROOM = { x: 900, y: 500, w: 150, h: 100 };
export const AMBIENT = { x: 872, y: 52 };

/** Recirc riser — above mixing box, in gap between RA/SA boxes */
export const RA_DAMPER = { x: 190, y: 290, w: 28, h: 38 };
export const RECIRC_X = RA_DAMPER.x + RA_DAMPER.w / 2;

export const DUCT = {
  raExitX: RA_BOX.x + RA_BOX.w,
  raDuctY: RA_CY,
  raHorizEnd: 928,
  raDropX: ROOM.x + ROOM.w - 22,
  saExitX: SA_BOX.x + SA_BOX.w,
  saDuctY: SA_CY,
  saHorizEnd: 828,
  saDropX: ROOM.x + 26,
  /** External FA: right edge → horizontal run → vertical riser into mixing box */
  faExitX: EXT_FA.x + EXT_FA.w,
  faDuctY: EXT_FA.y + EXT_FA.h / 2,
};

/** Component centre-lines (x) and sizes — order matches BMS left→right */
export const POS = {
  // Return: EA damper → RA fan → EU-7 → fire damper
  raEa: { x: 168, y: RA_CY },
  raFan: { x: 318, y: RA_CY },
  raEu7: { x: 518, y: RA_CY, w: 34, h: 70 },
  raFire: { x: 698, y: RA_CY },

  // Supply: FA damper → mixing → EU-4 → CHW → HW → SA fan → EU-7 → EU-13 → fire
  saFa: { x: 100, y: SA_CY },
  mixing: { x: 190, y: SA_CY, w: 92, h: 78 },
  saEu4: { x: 280, y: SA_CY, w: 34, h: 70 },
  chwCoil: { x: 365, y: SA_CY, w: 42, h: 74 },
  hwCoil: { x: 430, y: SA_CY, w: 42, h: 74 },
  saFan: { x: 530, y: SA_CY },
  saEu7: { x: 620, y: SA_CY, w: 34, h: 70 },
  saEu13: { x: 700, y: SA_CY, w: 34, h: 70 },
  saFire: { x: 785, y: SA_CY },

  extEa: { x: EXT_EA.x + EXT_EA.w / 2, y: EXT_EA.y + EXT_EA.h / 2 },
  extFa: { x: EXT_FA.x + EXT_FA.w / 2, y: EXT_FA.y + EXT_FA.h / 2 },

  // Return duct sensors (box → room): CFM, T&RH on horiz run; smoke on vertical drop
  raTrh: { x: 900, y: RA_CY - 40 },
  raCfm: { x: 780, y: RA_CY - 40 },

  saCfm: { x: 848, y: SA_CY + 18 },

  room: ROOM,
  ambient: AMBIENT,
};

export const MODE_LABELS = ['RECIRCULATION', 'MIN OA', 'ECONOMIZER', 'HEATING'];

export function ahuDuctPaths() {
  const r = ROOM;
  const mix = POS.mixing;
  const mixTop = mix.y - mix.h / 2;
  const mixBot = mix.y + mix.h / 2;
  const extEa = POS.extEa;

  return {
    grey: [
      // External EA → internal EA (elbow down then along RA centreline)
      `M ${extEa.x} ${EXT_EA.y + EXT_EA.h} L ${extEa.x} ${RA_CY} L ${POS.raEa.x - 24} ${RA_CY}`,
      // Return box exit → room top-right
      `M ${DUCT.raExitX} ${DUCT.raDuctY} L ${DUCT.raHorizEnd} ${DUCT.raDuctY} L ${DUCT.raDropX} ${DUCT.raDuctY} L ${DUCT.raDropX} ${r.y-10}`,
      // Recirc tap: RA box bottom → RA damper → mixing box top
      `M ${RECIRC_X} ${RA_BOX.y + RA_BOX.h + 10} L ${RECIRC_X} ${mixTop}`,
      // External FA → mixing box: exit right, run horizontal, riser up into mixing bottom
      `M ${DUCT.faExitX} ${DUCT.faDuctY} L ${mix.x} ${DUCT.faDuctY} L ${mix.x} ${mixBot}`,
      // Supply box exit → room top-left
      `M ${DUCT.saExitX} ${DUCT.saDuctY} L ${DUCT.saHorizEnd} ${DUCT.saDuctY} L ${DUCT.saDropX} ${DUCT.saDuctY} L ${DUCT.saDropX} ${r.y-10}`,
    ],
    flow: [
      // { d: `M ${DUCT.raHorizEnd} ${DUCT.raDuctY} L ${DUCT.raExitX} ${DUCT.raDuctY}`, loop: 'chwr' as const },
      { d: `M ${POS.raFire.x} ${RA_CY} L ${POS.raEa.x} ${RA_CY}`, loop: 'chwr' as const },//checked
      { d: `M ${POS.saFa.x} ${SA_CY} L ${POS.saFire.x} ${SA_CY}`, loop: 'chws' as const },//checked
      // { d: `M ${DUCT.saExitX} ${SA_CY} L ${DUCT.saHorizEnd} ${SA_CY}`, loop: 'chws' as const },
      { d: `M ${RECIRC_X} ${RA_BOX.y + RA_BOX.h} L ${RECIRC_X} ${mixTop}`, loop: 'chwr' as const },
      { d: `M ${DUCT.faExitX} ${DUCT.faDuctY} L ${mix.x} ${DUCT.faDuctY} L ${mix.x} ${mixBot}`, loop: 'cws' as const },
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
  if (id === 'ahu01-sa-fan') return { x: POS.saFan.x - 30, y: POS.saFan.y - 44, w: 60, h: 88 };
  if (id === 'ahu01-ra-fan') return { x: POS.raFan.x - 30, y: POS.raFan.y - 44, w: 60, h: 88 };
  if (id === 'ahu01-chw-coil') return { x: POS.chwCoil.x - 28, y: POS.chwCoil.y - 48, w: 56, h: 110 };
  if (id === 'ahu01-hw-coil') return { x: POS.hwCoil.x - 28, y: POS.hwCoil.y - 48, w: 56, h: 110 };
  if (id === 'ahu01-mixing') return { x: POS.mixing.x - POS.mixing.w / 2, y: POS.mixing.y - POS.mixing.h / 2, w: POS.mixing.w, h: POS.mixing.h + 16 };
  if (id === 'room') return { ...ROOM };
  if (id.includes('eu4')) return { x: POS.saEu4.x - 22, y: POS.saEu4.y - 38, w: 44, h: 88 };
  if (id.includes('sa-eu7')) return { x: POS.saEu7.x - 22, y: POS.saEu7.y - 38, w: 44, h: 88 };
  if (id.includes('sa-eu13')) return { x: POS.saEu13.x - 22, y: POS.saEu13.y - 38, w: 44, h: 88 };
  if (id.includes('ra-eu7')) return { x: POS.raEu7.x - 22, y: POS.raEu7.y - 38, w: 44, h: 88 };
  if (id === 'ahu01-fa-damper-01') return { x: EXT_FA.x - 8, y: EXT_FA.y - 8, w: EXT_FA.w + 60, h: 80 };
  if (id === 'ahu01-fa-damper-02') return { x: POS.saFa.x - 28, y: POS.saFa.y - 38, w: 56, h: 88 };
  if (id === 'ahu01-ea-damper-01') return { x: EXT_EA.x - 8, y: EXT_EA.y - 8, w: EXT_EA.w + 60, h: 80 };
  if (id === 'ahu01-ea-damper-02') return { x: POS.raEa.x - 28, y: POS.raEa.y - 38, w: 56, h: 88 };
  if (id.includes('oa') || id.includes('fa-damper')) return { x: EXT_FA.x - 8, y: EXT_FA.y - 8, w: EXT_FA.w + 60, h: 80 };
  if (id.includes('ea-damper')) return { x: EXT_EA.x - 8, y: EXT_EA.y - 8, w: EXT_EA.w + 60, h: 80 };
  if (id.includes('ra-damper')) return { x: RA_DAMPER.x - 10, y: RA_DAMPER.y - 24, w: RA_DAMPER.w + 20, h: RA_DAMPER.h + 48 };
  if (id === 'ahu01-ra-fire') return { x: POS.raFire.x - 28, y: POS.raFire.y - 38, w: 56, h: 88 };
  if (id === 'ahu01-sa-fire') return { x: POS.saFire.x - 28, y: POS.saFire.y - 38, w: 56, h: 88 };
  if (id === 'ahu01-ra-cfm') return { x: POS.raCfm.x - 44, y: RA_CY - 28, w: 88, h: 56 };
  if (id === 'ahu01-sa-cfm') return { x: POS.saCfm.x - 44, y: SA_CY - 28, w: 88, h: 56 };
  if (id === 'ahu01-ra-trh') return { x: POS.raTrh.x - 48, y: RA_CY - 58, w: 96, h: 56 };
  if (id === 'ahu01-ambient-trh') return { x: AMBIENT.x - 8, y: AMBIENT.y - 8, w: 126, h: 40 };
  if (id === 'ahu01-smoke-sensor') {
    const smokeY = (RA_CY + ROOM.y) / 2 - 15;
    return { x: DUCT.raDropX - 28, y: smokeY - 28, w: 56, h: 72 };
  }
  return null;
}
