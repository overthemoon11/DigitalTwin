import type { AhuState } from '../../types/ahu';
import { ScadaPipe } from '../chiller/ScadaPipe';
import { ScadaSpin } from '../chiller/ScadaSpin';
import { ScadaTag } from '../chiller/ScadaTag';
import { ScadaZonePanel, ScadaZoneTitle } from '../chiller/ScadaZone';
import { LOOP, SCADA, statusFill } from '../chiller/scadaTheme';
import { useStationViewport } from '../ets/useStationViewport';
import {
  AHU_W,
  AHU_H,
  RA_BOX,
  SA_BOX,
  RA_CY,
  SA_CY,
  EXT_EA,
  EXT_FA,
  ROOM,
  RA_DAMPER,
  RECIRC_X,
  DUCT,
  POS,
  MODE_LABELS,
  ahuDuctPaths,
  boundsForAhuAsset,
  focusAhuViewport,
} from './ahu01Topology';

interface Props {
  state: AhuState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const DUCT_SHELL = SCADA.grid;
const DUCT_EDGE = SCADA.faceplateBorder;

function StatusDot({ x, y, ok }: { x: number; y: number; ok: boolean }) {
  return <circle cx={x} cy={y} r={5} fill={ok ? SCADA.running : SCADA.alarm} stroke={SCADA.faceplate} strokeWidth={1} />;
}

function FlowArrow({ x, y, dir, loop }: { x: number; y: number; dir: 'left' | 'right' | 'down' | 'up'; loop: 'sa' | 'ra' }) {
  const s = 7;
  const pts = {
    left: `${x - s},${y} ${x},${y - s / 2} ${x},${y + s / 2}`,
    right: `${x + s},${y} ${x},${y - s / 2} ${x},${y + s / 2}`,
    down: `${x},${y + s} ${x - s / 2},${y} ${x + s / 2},${y}`,
    up: `${x},${y - s} ${x - s / 2},${y} ${x + s / 2},${y}`,
  };
  const fill = loop === 'sa' ? LOOP.chws.stroke : LOOP.chwr.stroke;
  return <polygon points={pts[dir]} fill={fill} />;
}

function ExhaustBox({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  return (
    <rect x={x} y={y} width={w} height={h} fill={fill} stroke={SCADA.faceplateBorder} strokeWidth={1.5} rx={3} />
  );
}

function ExternalDamperBox({ x, y, w, h, label, selected, onSelect, flowDir, loop, showFlowArrow = true }: {
  x: number; y: number; w: number; h: number; label: string;
  selected: boolean; onSelect: () => void; flowDir: 'left' | 'right'; loop: 'sa' | 'ra';
  showFlowArrow?: boolean;
}) {
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={w} height={h} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1.5} rx={3} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill={SCADA.tag} fontSize={7} fontWeight="700">{label}</text>
      {showFlowArrow && (
        <FlowArrow x={flowDir === 'left' ? x - 4 : x + w + 4} y={y + h / 2} dir={flowDir} loop={loop} />
      )}
    </g>
  );
}

function AhuDamper({ x, y, label, pct, open, selected, onSelect, vertical = true }: {
  x: number; y: number; label: string; pct: number; open: boolean;
  selected: boolean; onSelect: () => void; vertical?: boolean;
}) {
  const w = vertical ? 28 : 48;
  const h = vertical ? 56 : 28;
  const stroke = open ? SCADA.running : SCADA.stopped;
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <text x={x} y={y - h / 2 - 8} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontWeight="700">{label}</text>
      <StatusDot x={x} y={y - h / 2 - 18} ok={open} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1.5} rx={2} />
      {vertical ? (
        Array.from({ length: 4 }, (_, i) => (
          <line key={i} x1={x - 8} y1={y - 18 + i * 12} x2={x + 8} y2={y - 18 + i * 12} stroke={stroke} strokeWidth={2} opacity={0.7} />
        ))
      ) : (
        Array.from({ length: 4 }, (_, i) => (
          <line key={i} x1={x - 18 + i * 12} y1={y - 8} x2={x - 18 + i * 12} y2={y + 8} stroke={stroke} strokeWidth={2} opacity={0.7} />
        ))
      )}
      {!label.includes('FIRE') && (
        <ScadaTag x={x - 28} y={y + h / 2 + 6} tag="POS" pv={pct.toFixed(1)} unit="%" width={56} compact />
      )}
    </g>
  );
}

function AhuFan({ x, y, fan, flowDir, selected, onSelect }: {
  x: number; y: number; fan: AhuState['saFan']; flowDir: 'left' | 'right';
  selected: boolean; onSelect: () => void;
}) {
  const col = statusFill(fan.status);
  const tri = flowDir === 'right' ? '-6,-4 6,0 -6,4' : '6,-4 -6,0 6,4';
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <text x={x} y={y - 48} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontWeight="700">{fan.name}</text>
      <StatusDot x={x} y={y - 38} ok={fan.running} />
      <circle cx={x} cy={y} r={22} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : col} strokeWidth={selected ? 2.5 : 2} />
      <circle cx={x} cy={y} r={10} fill={SCADA.panel} stroke={col} strokeWidth={1.5} />
      <g transform={`translate(${x}, ${y})`}>
        <g><ScadaSpin durSec={fan.running ? 1.2 : 0} /></g>
        <polygon points={tri} fill={col} opacity={0.85} />
      </g>
      <ScadaTag x={x - 28} y={y + 28} tag="SPD" pv={fan.speedPct.toFixed(1)} unit="%" width={56} compact />
    </g>
  );
}

function AhuFilter({ x, y, w, h, name, status, selected, onSelect }: {
  x: number; y: number; w: number; h: number; name: string;
  status: string; selected: boolean; onSelect: () => void;
}) {
  const ok = status === 'CLEAN';
  const fill = ok ? SCADA.faceplate : '#fef9c3';
  const mesh = ok ? SCADA.faceplateBorder : SCADA.manual;
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <text x={x} y={y - h / 2 - 8} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight="700">{name}</text>
      <StatusDot x={x} y={y - h / 2 - 18} ok={ok} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={fill} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1.5} rx={2} />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={x - w / 2 + 6 + i * 7} y1={y - h / 2 + 6} x2={x - w / 2 + 6 + i * 7} y2={y + h / 2 - 6}
          stroke={mesh} strokeWidth={1.2} opacity={0.5} />
      ))}
    </g>
  );
}

function AhuCoil({ x, y, w, h, name, loopKey, valvePct, selected, onSelect }: {
  x: number; y: number; w: number; h: number; name: string;
  loopKey: 'chws' | 'cwr'; valvePct: number; selected: boolean; onSelect: () => void;
}) {
  const loop = LOOP[loopKey];
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <text x={x} y={y - h / 2 - 8} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontWeight="700">{name}</text>
      <StatusDot x={x} y={y - h / 2 - 18} ok={valvePct > 0} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={loop.fill} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1.5} rx={2} />
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1={x - w / 2 + 8 + i * 9} y1={y - h / 2 + 8} x2={x - w / 2 + 8 + i * 9} y2={y + h / 2 - 8}
          stroke={loop.stroke} strokeWidth={2} opacity={0.55} />
      ))}
      <line x1={x - 14} y1={y + h / 2 + 4} x2={x - 14} y2={y + h / 2 + 18} stroke={LOOP.chws.stroke} strokeWidth={3} />
      <line x1={x + 14} y1={y + h / 2 + 4} x2={x + 14} y2={y + h / 2 + 18} stroke={LOOP.cwr.stroke} strokeWidth={3} />
      <ScadaTag x={x - 28} y={y + h / 2 + 20} tag="VALVE" pv={valvePct.toFixed(1)} unit="%" width={56} compact />
    </g>
  );
}

function MixingBox({ x, y, w, h, selected, onSelect }: {
  x: number; y: number; w: number; h: number;
  selected: boolean; onSelect: () => void;
}) {
  return (
    <g className="plant-equip" onClick={onSelect} style={{ cursor: 'pointer' }}>
      <text x={x} y={y - h / 2 - 8} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontWeight="700">MIXING BOX</text>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={SCADA.panel} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1.5} rx={2} />
    </g>
  );
}

function SensorProbe({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      {label && <text x={x} y={y - 12} textAnchor="middle" fill={SCADA.textMuted} fontSize={7} fontWeight="600">{label}</text>}
      <circle cx={x} cy={y} r={6} fill={SCADA.faceplate} stroke={SCADA.faceplateBorder} strokeWidth={1.5} />
      <line x1={x} y1={y - 6} x2={x} y2={y + 10} stroke={SCADA.faceplateBorder} strokeWidth={2} />
    </g>
  );
}

export default function Ahu01StationView({ state, selectedId, onSelect }: Props) {
  const { svgRef, viewBox, fitAll, handleWheel, handlePointerDown, handlePointerMove, handlePointerUp, zoomStep } =
    useStationViewport(AHU_W, AHU_H, selectedId, { getBounds: boundsForAhuAsset, focus: focusAhuViewport });

  const h = state.headers;
  const modeLabel = MODE_LABELS[['recirculation', 'minimum_oa', 'economizer', 'heating'].indexOf(h.mode)] ?? h.mode.toUpperCase();
  const clearSelection = () => { onSelect(null); fitAll(); };
  const damper = (id: string) => state.dampers.find((d) => d.id === id);
  const filter = (id: string) => state.filters.find((f) => f.id === id);
  const ducts = ahuDuctPaths();
  const saFlow = state.saFan.speedPct;
  const raFlow = state.raFan.speedPct;
  const faPct = damper('ahu01-fa-damper-02')?.positionPct ?? h.oaFraction * 100;
  const eaPct = damper('ahu01-ea-damper-02')?.positionPct ?? 15;
  const raDamperPct = damper('ahu01-ra-damper')?.positionPct ?? 85;

  return (
    <div className="chiller-plant-2d ahu-station-2d">
      <div className="scada-viewport-tools">
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit full schematic">⊡</button>
      </div>
      <p className="scada-viewport-hint">
        Scroll to zoom · drag to pan · click equipment · AHU01 · {modeLabel}
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
        <rect className="scada-viewport-bg" width={AHU_W} height={AHU_H} fill={SCADA.bg} />

        <ScadaZonePanel x={8} y={8} width={AHU_W - 16} height={40} />
        <ScadaZoneTitle x={16} y={24} title={`AHU01 — ${modeLabel} · FIRE ${h.fireStatus} · ${h.floor}`} width={480} />

        <g className="plant-equip" onClick={() => onSelect('ahu01-ambient-trh')} style={{ cursor: 'pointer' }}>
          <ScadaTag x={POS.ambient.x} y={POS.ambient.y} tag="AMBIENT T&RH" pv={`${h.oatC}° / ${h.oaRhPct}%`} width={118} />
        </g>

        {/* Duct shells */}
        {ducts.grey.map((d, i) => (
          <path key={`g${i}`} d={d} fill="none" stroke={DUCT_SHELL} strokeWidth={20} strokeLinecap="square" strokeLinejoin="miter" />
        ))}
        {ducts.grey.map((d, i) => (
          <path key={`gb${i}`} d={d} fill="none" stroke={DUCT_EDGE} strokeWidth={1} strokeLinecap="square" opacity={0.6} />
        ))}

        {/* Animated flow overlay */}
        {ducts.flow.map((p, i) => (
          <ScadaPipe key={i} d={p.d} loop={p.loop}
            flowSpeed={p.loop === 'chws' ? saFlow : p.loop === 'chwr' ? raFlow : 40}
            running={p.loop === 'chws' ? state.saFan.running : p.loop === 'chwr' ? state.raFan.running : true}
            width={4} dashed />
        ))}

        <ExternalDamperBox {...EXT_EA} label="EA DAMPER-01" flowDir="left" loop="ra" showFlowArrow={false}
          selected={selectedId === 'ahu01-ea-damper-01'} onSelect={() => onSelect('ahu01-ea-damper-01')} />
        <text x={EXT_EA.x - 20} y={EXT_EA.y + EXT_EA.h / 2 + 4} textAnchor="end" fill={SCADA.tag} fontSize={9} fontWeight="700">EA</text>
        <FlowArrow x={EXT_EA.x - 5} y={EXT_EA.y + EXT_EA.h / 2} dir="left" loop="ra" />
        <ExternalDamperBox {...EXT_FA} label="FA DAMPER-01" flowDir="right" loop="sa" showFlowArrow={false}
          selected={selectedId === 'ahu01-fa-damper-01'} onSelect={() => onSelect('ahu01-fa-damper-01')} />
        <text x={EXT_FA.x - 20} y={EXT_FA.y + EXT_FA.h / 2 + 4} textAnchor="end" fill={SCADA.tag} fontSize={9} fontWeight="700">FA</text>
        <FlowArrow x={EXT_FA.x - 10} y={EXT_FA.y + EXT_FA.h / 2} dir="right" loop="sa" />

        <ExhaustBox {...RA_BOX} fill={LOOP.chwr.fill} />
        <ExhaustBox {...SA_BOX} fill={LOOP.chws.fill} />
        <ScadaZoneTitle x={RA_BOX.x + 8} y={RA_BOX.y + 14} title="RETURN AIR (RA)" width={150} />
        <ScadaZoneTitle x={SA_BOX.x + 8} y={SA_BOX.y + 14} title="SUPPLY AIR (SA)" width={150} />

        <AhuDamper x={POS.raEa.x} y={POS.raEa.y} label="EA DAMPER-02" pct={eaPct} open={eaPct > 10}
          selected={selectedId === 'ahu01-ea-damper-02'} onSelect={() => onSelect('ahu01-ea-damper-02')} />
        <AhuFan x={POS.raFan.x} y={POS.raFan.y} fan={state.raFan} flowDir="left"
          selected={selectedId === state.raFan.id} onSelect={() => onSelect(state.raFan.id)} />
        {filter('ahu01-ra-eu7') && (
          <AhuFilter x={POS.raEu7.x} y={POS.raEu7.y} w={POS.raEu7.w} h={POS.raEu7.h}
            name="EU-7 FILTER-01" status={filter('ahu01-ra-eu7')!.status}
            selected={selectedId === 'ahu01-ra-eu7'} onSelect={() => onSelect('ahu01-ra-eu7')} />
        )}
        <AhuDamper x={POS.raFire.x} y={POS.raFire.y} label="FIRE DAMPER-01" pct={100} open
          selected={selectedId === 'ahu01-ra-fire'} onSelect={() => onSelect('ahu01-ra-fire')} />

        {/* Return duct sensors: CFM → T&RH on horiz run, smoke on vertical drop to room */}
        <g className="plant-equip" onClick={() => onSelect('ahu01-ra-cfm')} style={{ cursor: 'pointer' }}>
          <SensorProbe x={POS.raCfm.x} y={RA_CY - 6} label="AIRFLOW" />
          <ScadaTag x={POS.raCfm.x - 40} y={RA_CY + 6} tag="RA CFM" pv={`${h.raCfm.toFixed(1)}`} unit="CFM" width={88} compact />
        </g>
        <g className="plant-equip" onClick={() => onSelect('ahu01-ra-trh')} style={{ cursor: 'pointer' }}>
          <SensorProbe x={POS.raTrh.x} y={RA_CY - 6} label="T & RH" />
          <ScadaTag x={POS.raTrh.x - 36} y={RA_CY - 52} tag="T & RH" pv={`${h.ratC}° / ${h.raRhPct}%`} width={96} />
        </g>
        <g className="plant-equip" onClick={() => onSelect('ahu01-smoke-sensor')} style={{ cursor: 'pointer' }}>
          <SensorProbe x={DUCT.raDropX} y={(RA_CY + ROOM.y) / 2 - 15} label="SMOKE SENSOR" />
          <StatusDot x={DUCT.raDropX} y={(RA_CY + ROOM.y) / 2 - 44} ok={h.fireStatus === 'NORMAL'} />
        </g>
        <FlowArrow x={DUCT.raDropX} y={(RA_CY + ROOM.y) / 2 - 90} dir="up" loop="ra" />
        <FlowArrow x={DUCT.raDropX} y={(RA_CY + ROOM.y) / 2 + 70} dir="up" loop="ra" />

        {/* RA damper riser — centred above mixing box, clear of RA fan */}
        <g className="plant-equip" onClick={() => onSelect('ahu01-ra-damper')} style={{ cursor: 'pointer' }}>
          <text x={RECIRC_X} y={RA_DAMPER.y - 6} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight="700">RA DAMPER</text>
          <StatusDot x={RECIRC_X} y={RA_DAMPER.y - 16} ok={raDamperPct > 20} />
          <rect x={RA_DAMPER.x} y={RA_DAMPER.y} width={RA_DAMPER.w} height={RA_DAMPER.h} fill={SCADA.faceplate}
            stroke={selectedId === 'ahu01-ra-damper' ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selectedId === 'ahu01-ra-damper' ? 2 : 1.5} rx={2} />
          {Array.from({ length: 3 }, (_, i) => (
            <line key={i} x1={RA_DAMPER.x + 6} y1={RA_DAMPER.y + 8 + i * 10} x2={RA_DAMPER.x + RA_DAMPER.w - 6} y2={RA_DAMPER.y + 8 + i * 10}
              stroke={SCADA.running} strokeWidth={2} opacity={0.7} />
          ))}
          <ScadaTag x={RA_DAMPER.x + RA_DAMPER.w + 6} y={RA_DAMPER.y + RA_DAMPER.h - 32} tag="POS" pv={raDamperPct.toFixed(1)} unit="%" width={56} compact />
          <FlowArrow x={RECIRC_X} y={RA_DAMPER.y + RA_DAMPER.h + 34} dir="down" loop="ra" />
        </g>

        <AhuDamper x={POS.saFa.x} y={POS.saFa.y} label="FA DAMPER-02" pct={faPct} open={faPct > 5}
          selected={selectedId === 'ahu01-fa-damper-02'} onSelect={() => onSelect('ahu01-fa-damper-02')} />
        <MixingBox x={POS.mixing.x} y={POS.mixing.y} w={POS.mixing.w} h={POS.mixing.h}
          selected={selectedId === 'ahu01-mixing'} onSelect={() => onSelect('ahu01-mixing')} />
        {filter('ahu01-sa-eu4') && (
          <AhuFilter x={POS.saEu4.x} y={POS.saEu4.y} w={POS.saEu4.w} h={POS.saEu4.h}
            name="EU-4 FILTER" status={filter('ahu01-sa-eu4')!.status}
            selected={selectedId === 'ahu01-sa-eu4'} onSelect={() => onSelect('ahu01-sa-eu4')} />
        )}
        <AhuCoil x={POS.chwCoil.x} y={POS.chwCoil.y} w={POS.chwCoil.w} h={POS.chwCoil.h}
          name="CHW COIL" loopKey="chws" valvePct={state.chwCoil.valvePct}
          selected={selectedId === state.chwCoil.id} onSelect={() => onSelect(state.chwCoil.id)} />
        <AhuCoil x={POS.hwCoil.x} y={POS.hwCoil.y} w={POS.hwCoil.w} h={POS.hwCoil.h}
          name="HW COIL" loopKey="cwr" valvePct={state.hwCoil.valvePct}
          selected={selectedId === state.hwCoil.id} onSelect={() => onSelect(state.hwCoil.id)} />
        <AhuFan x={POS.saFan.x} y={POS.saFan.y} fan={state.saFan} flowDir="right"
          selected={selectedId === state.saFan.id} onSelect={() => onSelect(state.saFan.id)} />
        {filter('ahu01-sa-eu7') && (
          <AhuFilter x={POS.saEu7.x} y={POS.saEu7.y} w={POS.saEu7.w} h={POS.saEu7.h}
            name="EU-7 FILTER-02" status={filter('ahu01-sa-eu7')!.status}
            selected={selectedId === 'ahu01-sa-eu7'} onSelect={() => onSelect('ahu01-sa-eu7')} />
        )}
        {filter('ahu01-sa-eu13') && (
          <AhuFilter x={POS.saEu13.x} y={POS.saEu13.y} w={POS.saEu13.w} h={POS.saEu13.h}
            name="EU-13 FILTER" status={filter('ahu01-sa-eu13')!.status}
            selected={selectedId === 'ahu01-sa-eu13'} onSelect={() => onSelect('ahu01-sa-eu13')} />
        )}
        <AhuDamper x={POS.saFire.x} y={POS.saFire.y} label="FIRE DAMPER-02" pct={100} open
          selected={selectedId === 'ahu01-sa-fire'} onSelect={() => onSelect('ahu01-sa-fire')} />

        <g className="plant-equip" onClick={() => onSelect('ahu01-sa-cfm')} style={{ cursor: 'pointer' }}>
          <SensorProbe x={POS.saCfm.x} y={SA_CY - 6} label="AIRFLOW" />
          <ScadaTag x={POS.saCfm.x - 40} y={SA_CY + 6} tag="SA CFM" pv={`${h.saCfm.toFixed(1)}`} unit="CFM" width={88} compact />
        </g>
        <FlowArrow x={POS.saCfm.x + 44} y={SA_CY} dir="right" loop="sa" />

        {/* FA damper → mixing box: 1 right on horizontal run, 2 up on vertical riser */}
        <FlowArrow x={DUCT.faExitX + (POS.mixing.x - DUCT.faExitX) / 2} y={DUCT.faDuctY} dir="right" loop="sa" />
        <FlowArrow x={POS.mixing.x} y={DUCT.faDuctY - (DUCT.faDuctY - (POS.mixing.y + POS.mixing.h / 2)) * 0.35} dir="up" loop="sa" />
        <FlowArrow x={POS.mixing.x} y={DUCT.faDuctY - (DUCT.faDuctY - (POS.mixing.y + POS.mixing.h / 2)) * 0.70} dir="up" loop="sa" />
        {/* Return duct direction hints */}
        <FlowArrow x={RA_BOX.x + 40} y={RA_CY} dir="left" loop="ra" />
        <FlowArrow x={DUCT.raHorizEnd + 40} y={RA_CY} dir="left" loop="ra" />
        <FlowArrow x={DUCT.raHorizEnd - 90} y={RA_CY} dir="left" loop="ra" />

        <text x={RA_BOX.x - 24} y={RA_CY + 4} textAnchor="end" fill={SCADA.tag} fontSize={9} fontWeight="700">EA</text>
        <FlowArrow x={RA_BOX.x - 12} y={RA_CY} dir="left" loop="ra" />
        <text x={SA_BOX.x - 24} y={SA_CY + 4} textAnchor="end" fill={SCADA.tag} fontSize={9} fontWeight="700">FA</text>
        <FlowArrow x={SA_BOX.x - 12} y={SA_CY} dir="right" loop="sa" />

        <g className="plant-equip" onClick={() => onSelect('room')} style={{ cursor: 'pointer' }}>
          <rect x={ROOM.x} y={ROOM.y} width={ROOM.w} height={ROOM.h} fill={LOOP.chws.fill}
            stroke={selectedId === 'room' ? SCADA.selected : SCADA.running} strokeWidth={selectedId === 'room' ? 2.5 : 1.5} rx={3} />
          <text x={ROOM.x + ROOM.w / 2} y={ROOM.y + ROOM.h / 2 + 4} textAnchor="middle" fill={SCADA.text} fontSize={14} fontWeight="700">ROOM</text>
          <FlowArrow x={DUCT.saDropX} y={ROOM.y + 10} dir="down" loop="sa" />
          {/* <FlowArrow x={DUCT.saDropX + 12} y={ROOM.y + 22} dir="down" loop="sa" /> */}
          <FlowArrow x={DUCT.raDropX} y={ROOM.y + 10} dir="up" loop="ra" />
          {/* <FlowArrow x={DUCT.raDropX - 12} y={ROOM.y + 22} dir="up" loop="ra" /> */}
        </g>
      </svg>
    </div>
  );
}
