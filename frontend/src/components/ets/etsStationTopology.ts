/**
 * Geometry for the MBS A-B03-01 Energy Transfer Station P&ID.
 *
 * ASM return path (verified against SCADA sketch):
 *   From ASM → RP → RT on CHWR header → riser UP → splits into two vertical pipes:
 *     (left)  LT Bypass Valve
 *     (right) LT Bypass Flow / FETnk
 *   → merge into CHWSloop (light blue top header) → RIGHT → pump inlets (3× CHWP, flow DOWN)
 *     → CHWS bottom header → left through DP/ST/SP → To ASM
 *
 *   CHWR main continues RIGHT from the RT split toward HX (dark blue bottom header).
 *
 *   Far right: primary CHWS / CHWR spines to HX right side.
 *   HX secondary: supply out top-left → valve → merge → up → right → CHWSloop;
 *                 return in bottom-left → merge → CHWR header.
 */

export const STATION_W = 1320;
export const STATION_H = 720;
export const STATION_FOOTER_Y = 704;

/** Zone panels — drawn behind pipes, titles on top (chiller plant pattern) */
export const ETS_ZONE = {
  ASM: { x: 8, y: 88, w: 445, h: 410, titleY: 104 },
  PUMPS: { x: 460, y: 132, w: 420, h: 250, titleY: 148 },
  HX: { x: 910, y: 55, w: 405, h: 600, titleY: 72 },
  SIDESTREAM: { x: 8, y: 518, w: 700, h: 171, titleY: 534 },
} as const;

/** CHWSloop — merged LT-bypass risers + HX cold outlet (light blue) */
export const TOP_SUPPLY_Y = 168;
/** CHWS — pump discharge header to ASM (light blue) */
export const BOT_SUPPLY_Y = 348;
/** CHWR — return header ASM → HX (dark blue) */
export const RETURN_Y = 478;

/** @deprecated use TOP_SUPPLY_Y */
export const TOP_Y = TOP_SUPPLY_Y;
/** @deprecated use BOT_SUPPLY_Y */
export const BOT_Y = BOT_SUPPLY_Y;
/** @deprecated use RETURN_Y */
export const RET_Y = RETURN_Y;

export const LEFT_X = 138;
export const LEFT_END = 56;
export const RIGHT_END = 1260;
export const HX_RISE_X = 1100;
export const HX_OUT_X = 1128;
/** Shared left riser — HX secondary supply branches merge here */
export const HX_MERGE_X = 900;
/** Inline valve on each HX secondary supply branch */
export const HX_VALVE_X = 960;
export const HX_ST_X = 1070;
export const HX_RT_X = 1070;
/** CHWR riser after RT — meets tee before valve / flow legs */
export const RT_SPLIT_X = 280;
export const LT_VALVE_X = 260;
export const LT_FLOW_X = 300;
/** Inline elevation — valve & flow meter on parallel vertical legs */
export const LT_BYPASS_INLINE_Y = 240;
/** Horizontal tee elevation — below valve & flow meter */
export const LT_SPLIT_Y = 308;
/** Compact ISA tag width for inline SP/ST/RP/RT bubbles */
export const SENSOR_TAG_W = 45;

export const FETNK_X = 320;
export const FETNK_Y = 135;

export const POS = {
  fetnk: { x: FETNK_X, y: FETNK_Y, w: 80, h: 48 },
  ltBypassValveIcon: { x: LT_VALVE_X, y: LT_BYPASS_INLINE_Y },
  ltBypassFlowMeter: { x: LT_FLOW_X, y: LT_BYPASS_INLINE_Y },
  pumps: [
    { id: 'chwp-a-b03-01', cx: 530 },
    { id: 'chwp-a-b03-02', cx: 670 },
    { id: 'chwp-a-b03-03', cx: 810 },
  ],
  pumpIconY: Math.round((TOP_SUPPLY_Y + BOT_SUPPLY_Y) / 2),
  pumpPlate: { y: Math.round((TOP_SUPPLY_Y + BOT_SUPPLY_Y) / 2) + 20, w: 150, h: 150 },
  hx: [
    { id: 'hx-a-b03-01', x: HX_OUT_X, y: 180, w: 120, h: 98 },
    { id: 'hx-a-b03-02', x: HX_OUT_X, y: 350, w: 120, h: 98 },
  ],
  hxValves: [
    { id: 'hx-01-valve', x: HX_VALVE_X, y: 202 },
    { id: 'hx-02-valve', x: HX_VALVE_X, y: 372 },
  ],
  /** Far-right primary spines — pipes only, no box */
  dcsChws: { x: 1278, yTop: 60, yBot: 548 },
  dcsChwr: { x: 1302, yTop: 60, yBot: 548 },
  fromDcs: { x: 1248, y: 548, w: 116, h: 40 },
  asm: { x: 20, y: 312, w: 90, h: 100 },
  dpGauge: { x: 402, y: Math.round((BOT_SUPPLY_Y + RETURN_Y) / 2), r: 24 },
  returnFlowMeter: { x: 850, y: RETURN_Y },
  minFlowBypass: { x: 410, y: Math.round((TOP_SUPPLY_Y + BOT_SUPPLY_Y) / 2) },
  sideStreamVessel: { x: 500, y: 565, w: 45, h: 100 },
  cycSpPumps: [
    { id: 'cycsp-a-b03-01', x: 280, y: 580 },
    { id: 'cycsp-a-b03-02', x: 280, y: 644 },
  ],
  sideStreamTapX: 220,
  /** Vessel return rejoin on CHWR — right of CycSP tap */
  sideStreamReturnHeaderX: 272,
  sensors: {
    sp: { x: 160, y: BOT_SUPPLY_Y, label: 'SP' },
    stSup: { x: 230, y: BOT_SUPPLY_Y, label: 'ST' },
    rp: { x: 110, y: RETURN_Y, label: 'RP' },
    rtRet: { x: 175, y: RETURN_Y, label: 'RT' },
    hx1St: { x: HX_ST_X, y: 206, label: 'ST' },
    hx1Rt: { x: HX_RT_X, y: 260, label: 'RT' },
    hx2St: { x: HX_ST_X, y: 376, label: 'ST' },
    hx2Rt: { x: HX_RT_X, y: 430, label: 'RT' },
  },
  tables: { energy: { x: 968, y: 588, w: 204, h: 70 } },
};

export interface EtsPipePath {
  d: string;
  loop: 'dcs' | 'dcr' | 'chwsAsm' | 'chwrAsm';
  dashed?: boolean;
}

export function etsPipes(): EtsPipePath[] {
  const p: EtsPipePath[] = [];
  const [hx1, hx2] = POS.hx;
  const asm = POS.asm;
  const ss = POS.sideStreamVessel;
  const hx1Sup = hx1.y + 22;
  const hx1Ret = hx1.y + hx1.h - 22;
  const hx2Sup = hx2.y + 22;
  const hx2Ret = hx2.y + hx2.h - 22;
  const lastCx = POS.pumps[POS.pumps.length - 1].cx;
  const fnkCx = POS.fetnk.x + POS.fetnk.w / 2;
  const retRight = RIGHT_END - 36;
  const rise = HX_RISE_X;
  const hxMergeX = HX_MERGE_X;
  const hxValveX = HX_VALVE_X;
  const hxRoutY = TOP_SUPPLY_Y - 36;
  const splitX = RT_SPLIT_X;
  const splitY = LT_SPLIT_Y;
  const ltvX = LT_VALVE_X;
  const flowX = LT_FLOW_X;
  const ltvY = POS.ltBypassValveIcon.y;
  const flowY = POS.ltBypassFlowMeter.y;
  const ltvPort = 14;
  const flowPort = 14;

  const asmRetX = asm.x + asm.w / 2;

  // ===== CHWR return header — From ASM through RP/RT, continues right toward HX =====
  p.push({ d: `M ${asmRetX} ${RETURN_Y} L ${HX_VALVE_X+50} ${RETURN_Y}`, loop: 'chwrAsm' });
  p.push({
    d: `M ${asmRetX} ${asm.y + asm.h} L ${asmRetX} ${RETURN_Y}`,
    loop: 'chwrAsm',
  });

  // After RT: CHWR riser UP → tee → LT Bypass Valve (left) & LT Bypass Flow (right)
  p.push({ d: `M ${splitX} ${RETURN_Y} L ${splitX} ${splitY}`, loop: 'chwrAsm' });
  p.push({ d: `M ${ltvX} ${splitY} L ${flowX} ${splitY}`, loop: 'chwrAsm' });
  // Left leg — dark blue below valve, light blue above → up → right on CHWSloop
  p.push({ d: `M ${ltvX} ${splitY} L ${ltvX} ${ltvY + ltvPort}`, loop: 'chwrAsm' });
  p.push({ d: `M ${ltvX} ${ltvY - ltvPort} L ${ltvX} ${TOP_SUPPLY_Y}`, loop: 'chwsAsm' });
  // Right leg — dark blue below flow meter, light blue above → up onto CHWSloop
  p.push({ d: `M ${flowX} ${splitY} L ${flowX} ${flowY + flowPort}`, loop: 'chwrAsm' });
  p.push({ d: `M ${flowX} ${flowY - flowPort} L ${flowX} ${TOP_SUPPLY_Y}`, loop: 'chwsAsm' });
  // LT bypass merge — tie valve & flow light-blue legs, then up → right → down to CHWSloop / FETnk
  const ltMergeY = TOP_SUPPLY_Y;
  const ltMergeCx = Math.round((ltvX + flowX) / 2);
  const ltRoutY = ltMergeY - 50;
  p.push({ d: `M ${ltvX} ${ltMergeY} L ${flowX} ${ltMergeY}`, loop: 'chwsAsm' });
  p.push({
    d: `M ${ltMergeCx} ${ltMergeY} L ${ltMergeCx} ${ltRoutY} L ${870} ${ltRoutY} L ${870} ${TOP_SUPPLY_Y}`,
    loop: 'chwsAsm',
  });
  // FETnk tapped on CHWSloop (light blue)
  p.push({ d: `M ${fnkCx} ${TOP_SUPPLY_Y} L ${fnkCx} ${POS.fetnk.y + 8}`, loop: 'chwsAsm' });

  // ===== CHWSloop top header (light blue) — HX / pumps → left toward FETnk & LT bypass =====
  p.push({ d: `M ${hxMergeX} ${TOP_SUPPLY_Y} L ${FETNK_X + 10} ${TOP_SUPPLY_Y}`, loop: 'chwsAsm' });

  // ===== HX secondary supply (chwsAsm) — top-left OUT → valve → merge → up → right → CHWSloop =====
  p.push({ d: `M ${hx1.x} ${hx1Sup} L ${hxValveX} ${hx1Sup}`, loop: 'chwsAsm' });
  p.push({ d: `M ${hxValveX} ${hx1Sup} L ${hxMergeX} ${hx1Sup}`, loop: 'chwsAsm' });
  p.push({ d: `M ${hx2.x} ${hx2Sup} L ${hxValveX} ${hx2Sup}`, loop: 'chwsAsm' });
  p.push({ d: `M ${hxValveX} ${hx2Sup} L ${hxMergeX} ${hx2Sup}`, loop: 'chwsAsm' });
  p.push({ d: `M ${hxMergeX} ${hx2Sup} L ${hxMergeX} ${TOP_SUPPLY_Y}`, loop: 'chwsAsm' });
  // p.push({
  //   d: `M ${hxMergeX} ${hx1Sup} L ${hxMergeX} ${hxRoutY} L ${rise} ${hxRoutY} L ${rise} ${TOP_SUPPLY_Y}`,
  //   loop: 'chwsAsm',
  // });

  // ===== Pumps — CHWSloop DOWN through each CHWP to CHWS bottom header =====
  POS.pumps.forEach((pp) => {
    p.push({ d: `M ${pp.cx} ${TOP_SUPPLY_Y} L ${pp.cx} ${BOT_SUPPLY_Y}`, loop: 'chwsAsm' });
  });
  // CHWS bottom header — pump discharge → left toward ASM (R→L, through SP/ST)
  p.push({ d: `M ${lastCx} ${BOT_SUPPLY_Y} L ${LEFT_X} ${BOT_SUPPLY_Y}`, loop: 'chwsAsm' });
  p.push({
    d: `M ${LEFT_X} ${BOT_SUPPLY_Y} L ${asm.x + asm.w} ${BOT_SUPPLY_Y}`,
    loop: 'chwsAsm',
  });

  // Min-flow bypass — CHWS bottom header ↑ CHWSloop (parallel around pumps)
  p.push({
    d: `M ${FETNK_X+90} ${BOT_SUPPLY_Y} L ${FETNK_X+90} ${TOP_SUPPLY_Y}`,
    loop: 'chwsAsm',
    // dashed: true,
  });

  // HX secondary return (chwrAsm) — bottom-left IN → merge riser → CHWR header
  p.push({ d: `M ${hx1.x} ${hx1Ret} L ${HX_VALVE_X+50} ${hx1Ret}`, loop: 'chwrAsm' });//hx1out
  p.push({ d: `M ${hx2.x} ${hx2Ret} L ${HX_VALVE_X+50} ${hx2Ret}`, loop: 'chwrAsm' });//hx2out
  p.push({ d: `M ${HX_VALVE_X+50} ${hx1Ret} L ${HX_VALVE_X+50} ${RETURN_Y}`, loop: 'chwrAsm' });//hx1in
  // p.push({ d: `M ${hxMergeX} ${RETURN_Y} L ${retRight}`, loop: 'chwrAsm' });
  // From DCS Plant — primary return rise (teal) onto ETS CHWR header
  const fromDcsCx = POS.fromDcs.x + POS.fromDcs.w / 2;
  // p.push({ d: `M ${fromDcsCx} ${POS.fromDcs.y} L ${fromDcsCx} ${RETURN_Y}`, loop: 'dcr' });
  // p.push({ d: `M ${fromDcsCx} ${RETURN_Y} L ${retRight} ${RETURN_Y}`, loop: 'dcr' });

  // CycSP side-stream — tap on CHWR after RT sensor
  const tap = POS.sideStreamTapX;
  const c0 = POS.cycSpPumps[0];
  const c1 = POS.cycSpPumps[1];
  const cycIn = (pp: { x: number; y: number }) => pp.x - 13;
  const cycOut = (pp: { x: number; y: number }) => pp.x + 13;
  p.push({ d: `M ${tap} ${RETURN_Y} L ${tap} ${c1.y + 0}`, loop: 'chwrAsm' });
  p.push({ d: `M ${tap} ${c0.y} L ${cycIn(c0)} ${c0.y}`, loop: 'chwrAsm' });
  p.push({ d: `M ${tap} ${c1.y} L ${cycIn(c1)} ${c1.y}`, loop: 'chwrAsm' });
  p.push({ d: `M ${cycOut(c0)} ${c0.y} L ${ss.x} ${c0.y}`, loop: 'chwrAsm' });
  p.push({ d: `M ${cycOut(c1)} ${c1.y} L ${ss.x} ${c1.y}`, loop: 'chwrAsm' });
  const ssReturnY = Math.round((c0.y + c1.y) / 2);
  const ssExitX = ss.x + ss.w;
  const ssReturnJunctionX = ssExitX + 48;
  const ssReturnMidY = c0.y - 40;
  const ssHeaderX = POS.sideStreamReturnHeaderX;
  p.push({
    d: `M ${ssExitX} ${ssReturnY} L ${ssReturnJunctionX} ${ssReturnY} L ${ssReturnJunctionX} ${ssReturnMidY} L ${ssHeaderX} ${ssReturnMidY} L ${ssHeaderX} ${RETURN_Y} L ${ssHeaderX + 28} ${RETURN_Y}`,
    loop: 'chwrAsm',
  });

  // ===== PRIMARY — two separate vertical spines (CHWS / CHWR), no box =====
  const supX = POS.dcsChws.x;
  const retX = POS.dcsChwr.x;
  const spineTop = POS.dcsChws.yTop + 18;
  const fromTop = POS.fromDcs.y;
  const hxR1 = hx1.x + hx1.w;
  const hxR2 = hx2.x + hx2.w;
  // CHWS primary spine (bottom → top)
  p.push({ d: `M ${supX} ${fromTop} L ${supX} ${spineTop}`, loop: 'dcs' });
  // p.push({ d: `M ${POS.fromDcs.x + POS.fromDcs.w / 2} ${fromTop} L ${supX} ${fromTop}`, loop: 'dcs' });
  p.push({ d: `M ${supX} ${hx1Sup} L ${HX_OUT_X} ${hx1Sup}`, loop: 'dcs' });
  p.push({ d: `M ${supX} ${hx2Sup} L ${HX_OUT_X} ${hx2Sup}`, loop: 'dcs' });
  // CHWR primary spine (top → bottom)
  p.push({ d: `M ${retX} ${spineTop} L ${retX} ${fromTop}`, loop: 'dcr' });
  p.push({ d: `M ${HX_OUT_X} ${hx1Ret} L ${retX} ${hx1Ret}`, loop: 'dcr' });
  p.push({ d: `M ${HX_OUT_X} ${hx2Ret} L ${retX} ${hx2Ret}`, loop: 'dcr' });

  return p;
}

export function focusEtsViewport(
  b: { x: number; y: number; w: number; h: number },
  padding = 48
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, b.x - padding);
  const y = Math.max(0, b.y - padding);
  const w = Math.min(STATION_W - x, b.w + padding * 2);
  const h = Math.min(STATION_H - y, b.h + padding * 2);
  return { x, y, w, h };
}

export function boundsForEtsAsset(id: string): { x: number; y: number; w: number; h: number } | null {
  const hx = POS.hx.find((h) => h.id === id);
  if (hx) return { x: hx.x - 8, y: hx.y, w: hx.w + 16, h: hx.h + 52 };
  const pIdx = POS.pumps.findIndex((pp) => pp.id === id);
  if (pIdx >= 0) {
    const iconW = 60;
    const iconH = 52;
    const labelH = 52;
    return {
      x: POS.pumps[pIdx].cx - iconW / 2,
      y: POS.pumpIconY - iconH / 2,
      w: iconW,
      h: iconH + 4 + labelH,
    };
  }
  const hxv = POS.hxValves.find((v) => v.id === id);
  if (hxv) return { x: hxv.x - 44, y: hxv.y - 16, w: 88, h: 56 };
  if (id === 'lt-bypass') {
    const v = POS.ltBypassValveIcon;
    return { x: v.x - 40, y: v.y - 16, w: 80, h: 56 };
  }
  if (id === 'minflow-bypass') {
    const v = POS.minFlowBypass;
    return { x: v.x - 40, y: v.y - 16, w: 80, h: 56 };
  }
  if (id === 'lt-bypass-flow') {
    const f = POS.ltBypassFlowMeter;
    return { x: f.x - 36, y: f.y - 40, w: 72, h: 88 };
  }
  if (id === 'flow-chwr') {
    const f = POS.returnFlowMeter;
    return { x: f.x - 40, y: f.y - 36, w: 120, h: 52 };
  }
  if (id === 'fetnk-a-04-01') {
    const t = POS.fetnk;
    return { x: t.x, y: t.y, w: t.w + 96, h: t.h + 36 };
  }
  if (id === 'side-stream-vessel') {
    const ss = POS.sideStreamVessel;
    return { x: ss.x - 30, y: ss.y, w: ss.w + 140, h: ss.h + 36 };
  }
  const cyc = POS.cycSpPumps.find((c) => c.id === id);
  if (cyc) return { x: cyc.x - 30, y: cyc.y - 26, w: 60, h: 78 };
  if (id === 'meter-cws-a-b03-01') return POS.tables.energy;
  if (id === 'asm') return POS.asm;
  return null;
}
