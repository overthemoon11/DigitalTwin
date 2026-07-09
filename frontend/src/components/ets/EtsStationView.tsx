import { useState } from 'react';
import type { ExpansionTankEquipment, EquipmentStatus } from '../../types/plant';
import type { EtsState, EtsHeatExchanger } from '../../types/ets';
import { ExpansionTank } from '../chiller/ExpansionTank';
import { EquipSprite } from '../chiller/EquipSprite';
import { ETS_IMG } from '../chiller/equipmentImages';
import { EquipLabel } from '../chiller/EquipLabel';
import { ScadaPipe } from '../chiller/ScadaPipe';
import { ScadaTag } from '../chiller/ScadaTag';
import { ScadaZonePanel, ScadaZoneTitle } from '../chiller/ScadaZone';
import { LOOP, SCADA } from '../chiller/scadaTheme';
import { EtsChwpPump } from './EtsChwpPump';
import { SideStreamVessel } from './SideStreamVessel';
import { EtsScadaLegend } from './EtsScadaLegend';
import { EtsScadaValve } from './EtsScadaValve';
import { useStationViewport } from './useStationViewport';
import {
  STATION_W,
  STATION_H,
  STATION_FOOTER_Y,
  TOP_SUPPLY_Y,
  BOT_SUPPLY_Y,
  RETURN_Y,
  LEFT_X,
  LEFT_END,
  RIGHT_END,
  ETS_ZONE,
  POS,
  SENSOR_TAG_W,
  etsPipes,
} from './etsStationTopology';

interface Props {
  state: EtsState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function EtsPlateHx({ hx, x, y, w, h, supplyC, returnC, selected, onSelect }: {
  hx: EtsHeatExchanger; x: number; y: number; w: number; h: number;
  supplyC: number; returnC: number; selected: boolean; onSelect: (id: string) => void;
}) {
  return (
    <g className="plant-equip scada-hx" onClick={() => onSelect(hx.id)} style={{ cursor: 'pointer' }}>
      <EquipSprite
        href={ETS_IMG.hx}
        x={x}
        y={y}
        w={w}
        h={h}
        status={(hx.inService ? hx.status : 'stopped') as EquipmentStatus}
        selected={selected}
        scale={1.7}
      />
      <EquipLabel
        iconX={x}
        iconY={y}
        iconW={w}
        iconH={h}
        plateW={Math.max(w, 108)}
        side="below"
        lines={[
          { text: hx.name, variant: 'tag' },
          { text: `${hx.ratedTons} tR · ${supplyC.toFixed(1)}/${returnC.toFixed(1)} °C`, variant: 'pv' },
          { text: hx.inService ? `apr ${hx.approachC}° · ε ${(hx.effectiveness * 100).toFixed(0)}%` : 'standby', variant: 'muted' },
        ]}
      />
    </g>
  );
}

function ScadaInlineFlowMeter({
  x,
  y,
  tag,
  m3h,
  orient = 'vertical',
  tagWidth = 72,
  caption,
  onClick,
}: {
  x: number;
  y: number;
  tag: string;
  m3h: string;
  orient?: 'vertical' | 'horizontal';
  tagWidth?: number;
  caption?: string;
  onClick?: () => void;
}) {
  const bodyShort = 16;
  const bodyLong = 24;
  const isVert = orient === 'vertical';
  const bw = isVert ? bodyShort : bodyLong;
  const bh = isVert ? bodyLong : bodyShort;
  const bx = x - bw / 2;
  const by = y - bh / 2;

  const pipeStub = isVert ? (
    <>
      <line x1={x} y1={y - 18} x2={x} y2={by - 2} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <line x1={x} y1={by + bh + 2} x2={x} y2={y + 18} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <rect x={bx - 2} y={by - 2} width={bw + 4} height={2} fill={SCADA.faceplate} />
      <rect x={bx - 2} y={by + bh} width={bw + 4} height={2} fill={SCADA.faceplate} />
    </>
  ) : (
    <>
      <line x1={x - 18} y1={y} x2={bx - 2} y2={y} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <line x1={bx + bw + 2} y1={y} x2={x + 18} y2={y} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <rect x={bx - 2} y={by - 2} width={2} height={bh + 4} fill={SCADA.faceplate} />
      <rect x={bx + bw} y={by - 2} width={2} height={bh + 4} fill={SCADA.faceplate} />
    </>
  );

  const orifice = isVert ? (
    <path
      d={`M ${x - 4.5} ${y - 5} Q ${x} ${y - 8} ${x + 4.5} ${y - 5} L ${x + 2.5} ${y + 3} Q ${x} ${y + 6} ${x - 2.5} ${y + 3} Z`}
      fill="#1e293b"
    />
  ) : (
    <path
      d={`M ${x - 5} ${y - 4.5} Q ${x - 8} ${y} ${x - 5} ${y + 4.5} L ${x + 3} ${y + 2.5} Q ${x + 6} ${y} ${x + 3} ${y - 2.5} Z`}
      fill="#1e293b"
    />
  );

  const tagX = isVert ? x + 12 : x - tagWidth / 2;
  const tagY = isVert ? y - 14 : y - bh / 2 - 30;

  return (
    <g
      className="plant-equip scada-flow-meter"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : { pointerEvents: 'none' }}
    >
      {pipeStub}
      <rect x={bx} y={by} width={bw} height={bh} fill="#b8c4d0" stroke="#64748b" strokeWidth={0.75} rx={1} />
      {orifice}
      <ScadaTag x={tagX} y={tagY} tag={tag} pv={m3h} unit="m³/h" width={tagWidth} compact />
      {caption ? (
        <text x={x} y={(isVert ? tagY + 38 : tagY + 28)} textAnchor="middle" fill={SCADA.textMuted} fontSize={6.5}>
          {caption}
        </text>
      ) : null}
    </g>
  );
}

function LtBypassFlowMeter({ x, y, m3h, onSelect }: { x: number; y: number; m3h: string; onSelect: (id: string) => void }) {
  return (
    <ScadaInlineFlowMeter
      x={x}
      y={y}
      tag="LT Bypass Flow"
      m3h={m3h}
      orient="vertical"
      tagWidth={62}
      onClick={() => onSelect('lt-bypass-flow')}
    />
  );
}

function CycSpPump({
  id,
  x,
  y,
  name,
  on,
  selected,
  onSelect,
}: {
  id: string;
  x: number;
  y: number;
  name: string;
  on: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const px = x - 28;
  const py = y - 18;
  const w = 56;
  const h = 36;
  const status = (on ? 'running' : 'stopped') as EquipmentStatus;
  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <EquipSprite
        href={ETS_IMG.cycsp}
        x={px}
        y={py}
        w={w}
        h={h}
        status={status}
        selected={selected}
        scale={1.35}
      />
      <EquipLabel iconX={px} iconY={py} iconW={w} iconH={h} plateW={88} lines={[
        { text: name, variant: 'tag' },
        { text: on ? 'On' : 'Off', variant: 'pv' },
      ]} />
    </g>
  );
}

export default function EtsStationView({ state, selectedId, onSelect }: Props) {
  const { svgRef, viewBox, fitAll, handleWheel, handlePointerDown, handlePointerMove, handlePointerUp, zoomStep } =
    useStationViewport(STATION_W, STATION_H, selectedId);
  const [showPanels, setShowPanels] = useState(false);

  const h = state.headers;
  const pipes = etsPipes();
  const flowSpeed = h.loadPct;
  const valve = (id: string) => state.valves.find((v) => v.id === id);
  const ltv = valve('lt-bypass');
  const mfv = valve('minflow-bypass');
  const clearSelection = () => { onSelect(null); fitAll(); };

  const kvPanels: { title: string; rows: [string, string][] }[] = [
    { title: 'Remote Differential Pressure', rows: [
      ['A-B03-01 WDP01SP', '100 kPa'], ['A-B03-01 WDPH01', `${h.headerDpKpa} kPa`],
      ['A-04-WDP01HSP', '100 kPa'], ['A-04-WDP01HSP Enable', 'Disable'], ['A-04-WDP01', '50 kPa'],
    ] },
    { title: 'CHWP & CycSP', rows: [['Pmp Idle SP', '2160 hr']] },
    { title: 'CDS-A-B03-01', rows: [
      ['Pmp-1 Status', state.pumps[0]?.running ? 'On' : 'Off'], ['Pmp-2 Status', state.pumps[1]?.running ? 'On' : 'Off'],
      ['Flow Alarm-1', 'Normal'], ['Flow Alarm-2', 'Normal'],
    ] },
    { title: 'LT Bypass Valve', rows: [
      ['Status', `${ltv?.positionPct ?? 0} %`], ['Cmd', `${ltv?.cmdPct ?? 0} %`], ['CHWRT SP', '15.0 °C'],
    ] },
    { title: 'Min Flow Bypass Valve', rows: [
      ['Status', `${mfv?.positionPct ?? 0} %`], ['Cmd', `${mfv?.cmdPct ?? 0} %`], ['DP SP', `${h.headerDpKpa} kPa`],
    ] },
    { title: 'System Control', rows: [
      ['Current Stage', `${state.simulation.stage}`], ['Time Program', state.simulation.timeProgram], ['Control Mode', state.simulation.controlMode],
    ] },
    { title: 'HX-A-B03-01 Valve', rows: [['Cmd', 'Open'], ['Status', valve('hx-01-valve')?.status === 'alarm' ? 'Alarm' : 'Open']] },
    { title: 'HX-A-B03-02 Valve', rows: [
      ['Cmd', state.heatExchangers[1]?.inService ? 'Open' : 'Close'],
      ['Status', state.heatExchangers[1]?.inService ? 'Open' : 'Closed'],
    ] },
  ];
  const cycSp = {
    cols: ['CycSP-A-B03-01', 'CycSP-A-B03-02'],
    rows: [
      ['Run Hour', '0.1 hr', '34742.0 hr'], ['Mode Status', 'Remote', 'Remote'], ['Trip Status', 'Normal', 'Normal'],
      ['Time Program', 'Occupied', 'Occupied'], ['Cmd', 'Stop', 'Start'],
    ] as [string, string, string][],
  };

  const fetnk: ExpansionTankEquipment = {
    id: 'fetnk-a-04-01',
    name: 'FETnk-A-04-01',
    type: 'expansion_tank',
    category: 'hydronic',
    status: 'running',
    powerKw: 0,
    flowRate: 0,
    runtimeHours: 0,
    levelPercent: 72,
  };

  return (
    <div className="chiller-plant-2d ets-station-2d">
      <div className="scada-viewport-tools">
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit full schematic">⊡</button>
      </div>
      <p className="scada-viewport-hint">
        Scroll to zoom · drag background to pan · click equipment to focus · click again to unfocus · ETS {state.station}
      </p>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="chiller-plant-svg scada-viewport-svg"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={(e) => { if (!(e.target as Element).closest('.plant-equip')) clearSelection(); }}
      >
        <defs>
          <pattern id="scada-grid-ets" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SCADA.grid} strokeWidth={0.5} />
          </pattern>
        </defs>

        <rect width={STATION_W} height={STATION_H} fill={SCADA.bg} className="scada-viewport-bg" />
        <rect width={STATION_W} height={STATION_H} fill="url(#scada-grid-ets)" opacity={0.35} pointerEvents="none" />

        <EtsScadaLegend />

        <text x={14} y={44} fill={SCADA.tag} fontSize={13} fontWeight="700">A-B03-01 | Serves: {state.serves}</text>
        <text x={STATION_W - 14} y={44} textAnchor="end" fill={SCADA.textMuted} fontSize={9} fontFamily={SCADA.mono}>
          OAT {h.ambientTempC}°C · OARH {h.ambientRhPct}% · Stage {state.simulation.stage} · {state.simulation.timeProgram}
        </text>

        {/* Zone panels (behind pipes) */}
        <ScadaZonePanel x={ETS_ZONE.ASM.x} y={ETS_ZONE.ASM.y} width={ETS_ZONE.ASM.w} height={ETS_ZONE.ASM.h} fill={LOOP.chwrAsm.fill} />
        <ScadaZonePanel x={ETS_ZONE.PUMPS.x} y={ETS_ZONE.PUMPS.y} width={ETS_ZONE.PUMPS.w} height={ETS_ZONE.PUMPS.h} fill={LOOP.chwsAsm.fill} />
        <ScadaZonePanel x={ETS_ZONE.HX.x} y={ETS_ZONE.HX.y} width={ETS_ZONE.HX.w} height={ETS_ZONE.HX.h} fill={LOOP.dcs.fill} />
        <ScadaZonePanel x={ETS_ZONE.SIDESTREAM.x} y={ETS_ZONE.SIDESTREAM.y} width={ETS_ZONE.SIDESTREAM.w} height={ETS_ZONE.SIDESTREAM.h} fill="rgba(241,245,249,0.9)" />

        {/* Piping */}
        {pipes.map((p, i) => (
          <ScadaPipe key={i} d={p.d} loop={p.loop} running={flowSpeed > 0}
            width={p.loop.startsWith('dc') ? 3 : 4} arrows />
        ))}

        {/* Pipe loop labels — plain text on the line (MBS SCADA style, no HDR tags) */}
        <g pointerEvents="none" fontFamily={SCADA.mono} fontSize={8} fontWeight={600}>
          <text x={POS.pumps[2].cx + 24} y={TOP_SUPPLY_Y - 8} fill={LOOP.chwsAsm.stroke}>CHWS</text>
          <text x={POS.dpGauge.x - 28} y={BOT_SUPPLY_Y - 8} fill={LOOP.chwsAsm.stroke}>CHWS</text>
          <text x={POS.returnFlowMeter.x + 20} y={RETURN_Y + 14} fill={LOOP.chwrAsm.stroke}>CHWR</text>
        </g>
        <text x={POS.dcsChws.x} y={POS.dcsChws.yTop + 8} textAnchor="middle" fill={LOOP.dcs.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWS</text>
        <text x={POS.dcsChwr.x} y={POS.dcsChwr.yTop + 8} textAnchor="middle" fill={LOOP.dcr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWR</text>

        {/* Sensors — compact ISA tags centred on header tap points */}
        {([
          ['RP', POS.sensors.rp, h.returnPressureBar.toFixed(1), 'bar'],
          ['RT', POS.sensors.rtRet, h.chwrC.toFixed(1), '°C'],
          ['SP', POS.sensors.sp, h.supplyPressureBar.toFixed(1), 'bar'],
          ['ST', POS.sensors.stSup, h.chwsC.toFixed(1), '°C'],
        ] as const).map(([tag, pos, pv, unit]) => (
          <ScadaTag
            key={tag}
            x={pos.x - SENSOR_TAG_W / 2}
            y={pos.y - 20}
            tag={tag}
            pv={pv}
            unit={unit}
            compact
            width={SENSOR_TAG_W}
          />
        ))}
        {([
          ['hx1-st', 'ST', POS.sensors.hx1St, h.chwsC.toFixed(1)],
          ['hx1-rt', 'RT', POS.sensors.hx1Rt, h.chwrC.toFixed(1)],
          ['hx2-st', 'ST', POS.sensors.hx2St, (h.chwsC - 0.1).toFixed(1)],
          ['hx2-rt', 'RT', POS.sensors.hx2Rt, h.chwrC.toFixed(1)],
        ] as const).map(([key, tag, pos, pv]) => (
          <ScadaTag
            key={key}
            x={pos.x - SENSOR_TAG_W / 2}
            y={pos.y - 20}
            tag={tag}
            pv={pv}
            unit="°C"
            compact
            width={SENSOR_TAG_W}
          />
        ))}
        <g className="scada-header-dp-tap" pointerEvents="none">
          <line x1={POS.dpGauge.x - 11} y1={POS.dpGauge.y - 6} x2={POS.dpGauge.x - 11} y2={BOT_SUPPLY_Y} stroke="#94a3b8" strokeWidth={1.25} />
          <line x1={POS.dpGauge.x + 11} y1={POS.dpGauge.y + 6} x2={POS.dpGauge.x + 11} y2={RETURN_Y} stroke="#94a3b8" strokeWidth={1.25} />
        </g>
        <ScadaTag x={POS.dpGauge.x - 40} y={POS.dpGauge.y - 22} tag="DP" pv={h.headerDpKpa.toFixed(1)} unit="kPa" width={72} />
        <text x={POS.dpGauge.x} y={POS.dpGauge.y + 20} textAnchor="middle" fill={SCADA.textMuted} fontSize={6.5} pointerEvents="none">Header DP</text>

        {/* ASM building load */}
        <g className="scada-building-load plant-equip" onClick={() => onSelect('asm')} style={{ cursor: 'pointer' }}>
          <rect x={POS.asm.x} y={POS.asm.y} width={POS.asm.w} height={POS.asm.h} fill={SCADA.faceplate} stroke={selectedId === 'asm' ? SCADA.selected : LOOP.chwsAsm.stroke} strokeWidth={selectedId === 'asm' ? 2 : 1.5} rx={4} />
          <text x={POS.asm.x + POS.asm.w / 2} y={POS.asm.y + 18} textAnchor="middle" fill={SCADA.tag} fontSize={11} fontWeight="700">ASM</text>
          <text x={POS.asm.x + 10} y={POS.asm.y + 36} fill={SCADA.textMuted} fontSize={7}>To ASM</text>
          <text x={POS.asm.x + POS.asm.w - 8} y={POS.asm.y + 36} textAnchor="end" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>{h.chwsC} °C</text>
          <text x={POS.asm.x + 10} y={POS.asm.y + 58} fill={SCADA.textMuted} fontSize={7}>From ASM</text>
          <text x={POS.asm.x + POS.asm.w - 8} y={POS.asm.y + 58} textAnchor="end" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>{h.chwrC} °C</text>
          <text x={POS.asm.x + POS.asm.w / 2} y={POS.asm.y + POS.asm.h - 10} textAnchor="middle" fill={SCADA.pv} fontSize={12} fontWeight="700" fontFamily={SCADA.mono}>{h.coolingDemandRt} RT</text>
        </g>

        {/* LT bypass risers */}
        <EtsScadaValve id="lt-bypass" name="LT Bypass Valve" x={POS.ltBypassValveIcon.x} y={POS.ltBypassValveIcon.y}
          pct={ltv?.positionPct ?? 0} status={ltv?.status ?? 'running'} selected={selectedId === 'lt-bypass'} onSelect={onSelect} orient="vertical" labelSide="below" plateW={75} />
        <LtBypassFlowMeter x={POS.ltBypassFlowMeter.x} y={POS.ltBypassFlowMeter.y} m3h={h.ltBypassFlowM3h.toFixed(1)} onSelect={onSelect} />

        <ExpansionTank equipment={fetnk} x={POS.fetnk.x} y={POS.fetnk.y} selected={selectedId === fetnk.id} onSelect={onSelect} href={ETS_IMG.tank} scale={1.7} />

        <EtsScadaValve id="minflow-bypass" name="Min Flow Bypass" x={POS.minFlowBypass.x} y={POS.minFlowBypass.y}
          pct={mfv?.positionPct ?? 0} status={mfv?.status ?? 'running'} selected={selectedId === 'minflow-bypass'} onSelect={onSelect} orient="vertical" labelSide="below" plateW={75} />

        {/* Return flow meter */}
        <ScadaInlineFlowMeter
          x={POS.returnFlowMeter.x}
          y={POS.returnFlowMeter.y}
          tag="CHWR_FLOW"
          m3h={h.primaryFlowM3h.toFixed(1)}
          orient="horizontal"
          tagWidth={72}
          caption="Chilled Water Return Flow"
          onClick={() => onSelect('flow-chwr')}
        />

        {/* Side-stream vessel — vertical 2.5D separator */}
        <g
          className="plant-equip"
          onClick={() => onSelect('side-stream-vessel')}
          style={{ cursor: 'pointer' }}
        >
          {selectedId === 'side-stream-vessel' && (
            <rect
              x={POS.sideStreamVessel.x - 4}
              y={POS.sideStreamVessel.y - 4}
              width={POS.sideStreamVessel.w + 8}
              height={POS.sideStreamVessel.h + 28}
              fill="none"
              stroke={SCADA.selected}
              strokeWidth={2}
              rx={4}
              pointerEvents="none"
            />
          )}
          <SideStreamVessel
          x={POS.sideStreamVessel.x}
          y={POS.sideStreamVessel.y}
          w={POS.sideStreamVessel.w}
          h={POS.sideStreamVessel.h}
          topPortY={POS.cycSpPumps[0].y}
          bottomPortY={POS.cycSpPumps[1].y}
          returnPortY={Math.round((POS.cycSpPumps[0].y + POS.cycSpPumps[1].y) / 2)}
          />
        </g>
        {POS.cycSpPumps.map((c, i) => (
          <CycSpPump
            key={c.id}
            id={c.id}
            x={c.x}
            y={c.y}
            name={`CycSP-A-B03-0${i + 1}`}
            on={i === 1}
            selected={selectedId === c.id}
            onSelect={onSelect}
          />
        ))}

        {/* Primary spine labels */}
        <text x={POS.dcsChws.x} y={POS.dcsChws.yTop + 22} textAnchor="middle" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>{h.dcsSupplyC}°C</text>
        <text x={POS.dcsChwr.x} y={POS.dcsChwr.yTop + 22} textAnchor="middle" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>{h.dcrReturnC}°C</text>
        <text x={(POS.dcsChws.x + POS.dcsChwr.x) / 2} y={POS.dcsChws.yTop + 36} textAnchor="middle" fill={SCADA.textMuted} fontSize={7} fontFamily={SCADA.mono}>{h.primaryFlowM3h} m³/h · ΔT {h.primaryDeltaT}°C</text>
        <text x={POS.fromDcs.x + POS.fromDcs.w / 2 - 20} y={POS.fromDcs.y + 14} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight={700} pointerEvents="none">From DCS Plant</text>
        <text x={POS.fromDcs.x + POS.fromDcs.w / 2 - 20} y={POS.fromDcs.y + 28} textAnchor="middle" fill={SCADA.textMuted} fontSize={7} pointerEvents="none">primary source</text>

        {/* HX valves + heat exchangers */}
        {POS.hxValves.map((hv, i) => {
          const v = valve(hv.id);
          return (
            <EtsScadaValve key={hv.id} id={hv.id} name={`HX-A-B03-0${i + 1} Valve`}
              x={hv.x} y={hv.y} pct={v?.positionPct ?? 0} status={v?.status ?? 'running'}
              selected={selectedId === hv.id} onSelect={onSelect} orient="horizontal" labelSide="below" plateW={85} />
          );
        })}
        {state.heatExchangers.map((hx, i) => (
          <EtsPlateHx key={hx.id} hx={hx} x={POS.hx[i].x} y={POS.hx[i].y} w={POS.hx[i].w} h={POS.hx[i].h}
            supplyC={i === 0 ? h.chwsC : h.chwsC - 0.1} returnC={h.chwrC}
            selected={selectedId === hx.id} onSelect={onSelect} />
        ))}

        {/* CHWP pumps */}
        {state.pumps.map((pump, i) => (
          <EtsChwpPump key={pump.id} pump={pump} cx={POS.pumps[i].cx} selected={selectedId === pump.id} onSelect={onSelect} />
        ))}

        {/* Energy meter — data plate only (no empty icon box) */}
        <g className="plant-equip" onClick={() => onSelect('meter-cws-a-b03-01')} style={{ cursor: 'pointer' }}>
          <EquipLabel iconX={POS.tables.energy.x} iconY={POS.tables.energy.y} iconW={0} iconH={0}
            plateW={176} lines={[
              { text: 'CWS-A-B03-01', variant: 'tag' },
              { text: `${state.meter.kw.toFixed(1)} kW · ${state.meter.ton.toFixed(1)} ton`, variant: 'pv' },
              { text: `${state.meter.kwhCumulative.toLocaleString()} kWh`, variant: 'muted' },
            ]} />
        </g>

        {/* Zone titles on top */}
        <ScadaZoneTitle x={ETS_ZONE.ASM.x + 10} y={ETS_ZONE.ASM.titleY} title="ASM & LT BYPASS" width={200} />
        <ScadaZoneTitle x={ETS_ZONE.PUMPS.x + 10} y={ETS_ZONE.PUMPS.titleY} title="CHILLED WATER PUMPS (CHWP)" width={240} />
        <ScadaZoneTitle x={ETS_ZONE.HX.x + 10} y={ETS_ZONE.HX.titleY} title="PLATE HX — PRIMARY DCS" width={200} />
        <ScadaZoneTitle x={ETS_ZONE.SIDESTREAM.x + 10} y={ETS_ZONE.SIDESTREAM.titleY} title="SIDE-STREAM / CycSP" width={180} />

        <text x={STATION_W / 2} y={STATION_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          ETS A-B03-01 · serves ASM · {state.heatExchangers.length} plate HX · {state.simulation.controlMode} · approach {h.approachC}°C · ε {(h.effectiveness * 100).toFixed(0)}%
        </text>
      </svg>

      <button type="button" className="ets-data-toggle" onClick={() => setShowPanels((s) => !s)}>
        {showPanels ? '✕ Close Data Panels' : '📋 Data Panels'}
      </button>

      {showPanels && (
        <div className="ets-data-popout">
          {kvPanels.map((p) => (
            <div key={p.title} className="ets-data-card">
              <div className="ets-data-card-title">{p.title}</div>
              <div className="ets-data-card-body">
                {p.rows.map((r, i) => (
                  <div key={i} className="ets-data-row">
                    <span>{r[0]}</span>
                    <span>{r[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="ets-data-card">
            <div className="ets-data-card-title">CycSP</div>
            <div className="ets-data-card-body">
              <div className="ets-data-row ets-data-row--head">
                <span />
                <span>{cycSp.cols[0]}</span>
                <span>{cycSp.cols[1]}</span>
              </div>
              {cycSp.rows.map((r, i) => (
                <div key={i} className="ets-data-row ets-data-row--3col">
                  <span>{r[0]}</span>
                  <span>{r[1]}</span>
                  <span>{r[2]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
