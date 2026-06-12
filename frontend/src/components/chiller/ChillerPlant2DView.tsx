import type { PlantEquipment, PlantHeaders, MakeupTankEquipment, PumpEquipment } from '../../types/plant';
import { Chiller } from './Chiller';
import { CoolingTower } from './CoolingTower';
import { Pump } from './Pump';
import { Valve } from './Valve';
import { ExpansionTank } from './ExpansionTank';
import { HeaderPipe } from './HeaderPipe';
import { ScadaPipe } from './ScadaPipe';
import { ScadaLegend } from './ScadaLegend';
import { ScadaZonePanel, ScadaZoneTitle } from './ScadaZone';
import { EquipLabel } from './EquipLabel';
import { LOOP, SCADA } from './scadaTheme';
import { PLANT_HEIGHT, PLANT_WIDTH } from './plantEquipmentLayout';
import { PLANT_FOOTER_Y } from './plantTopology';
import { usePlantViewport } from './usePlantViewport';
import {
  BUILDING,
  BYPASS_X,
  BYPASS_Y,
  CHWP_X,
  CHWP_Y,
  CHWS_TAG,
  CHWR_TAG,
  CH_X,
  CH_Y,
  CT_X,
  CT_Y,
  CWP_X,
  CWP_Y,
  EXPTNK_X,
  EXPTNK_Y,
  MAKEUP_PUMP_X,
  MAKEUP_PUMP_Y,
  MAKEUP_TANK,
  PIPE,
  ZONE,
  chilledPipes,
  condenserPipes,
} from './plantTopology';

function avgPumpSpeed(equipment: Record<string, PlantEquipment>, prefix: string, count: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 1; i <= count; i++) {
    const p = equipment[`${prefix}-${i}`] as PumpEquipment | undefined;
    if (p?.status === 'running' && 'speedPercent' in p) {
      sum += p.speedPercent;
      n++;
    }
  }
  return n ? sum / n : 0;
}

interface Props {
  equipment: Record<string, PlantEquipment>;
  headers: PlantHeaders | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function ChillerPlant2DView({ equipment, headers, selectedId, onSelect }: Props) {
  const {
    svgRef,
    viewBox,
    fitAll,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomStep,
  } = usePlantViewport(selectedId);

  const h = headers || { chws: 7, chwr: 12, cws: 29, cwr: 32, buildingLoadRt: 0 };
  const tank = equipment['cwmutnk-41-1'] as MakeupTankEquipment | undefined;
  const cwpSpd = avgPumpSpeed(equipment, 'cwp-29', 4);
  const chwpSpd = avgPumpSpeed(equipment, 'chwp-29', 4);
  const ctFan = equipment['ct-41-1'] as { fanSpeedPercent?: number; status?: string } | undefined;
  const ctSpd = ctFan?.status === 'running' ? ctFan.fanSpeedPercent ?? 0 : 0;

  const get = <T extends PlantEquipment>(id: string) => equipment[id] as T | undefined;

  const clearSelection = () => {
    onSelect(null);
    fitAll();
  };

  const condPaths = condenserPipes();
  const chillPaths = chilledPipes();

  return (
    <div className="chiller-plant-2d">
      <div className="scada-viewport-tools">
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit full plant">⊡</button>
      </div>
      <p className="scada-viewport-hint">Scroll to zoom · drag background to pan · click equipment to focus · click again to unfocus</p>

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
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest('.plant-equip')) clearSelection();
        }}
      >
        <defs>
          <pattern id="scada-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SCADA.grid} strokeWidth={0.5} />
          </pattern>
        </defs>

        <rect width={PLANT_WIDTH} height={PLANT_HEIGHT} fill={SCADA.bg} className="scada-viewport-bg" />
        <rect width={PLANT_WIDTH} height={PLANT_HEIGHT} fill="url(#scada-grid)" opacity={0.35} pointerEvents="none" />

        <ScadaLegend />

        {/* Zone panels (behind pipes — titles rendered later) */}
        <ScadaZonePanel x={8} y={ZONE.MAKEUP.y} width={188} height={ZONE.MAKEUP.h} fill={LOOP.makeup.fill} />
        <ScadaZonePanel x={200} y={ZONE.TOWERS.y} width={848} height={ZONE.TOWERS.h} fill={LOOP.cws.fill} />
        <ScadaZonePanel x={200} y={ZONE.CWP_ROW.y} width={848} height={ZONE.CWP_ROW.h} fill={LOOP.cws.fill} />
        <ScadaZonePanel x={200} y={ZONE.CHILLERS.y} width={848} height={ZONE.CHILLERS.h} fill="rgba(226,232,240,0.55)" />
        <ScadaZonePanel x={8} y={ZONE.HYDRONIC.y} width={188} height={ZONE.HYDRONIC.h} fill="rgba(2,132,199,0.06)" />
        <ScadaZonePanel x={200} y={ZONE.CHW_LOOP.y} width={848} height={ZONE.CHW_LOOP.h} fill={LOOP.chws.fill} />

        {/* —— PIPING —— */}
        {condPaths.map((p, i) => (
          <ScadaPipe
            key={`cond-${i}`}
            d={p.d}
            loop={p.loop}
            flowSpeed={p.loop === 'cwr' ? cwpSpd : p.loop === 'cws' ? cwpSpd : 20}
            running={p.loop !== 'makeup' ? cwpSpd > 0 || ctSpd > 0 : !!tank}
            width={p.loop === 'makeup' ? 6 : 9}
          />
        ))}
        {chillPaths.map((p, i) => (
          <ScadaPipe
            key={`chill-${i}`}
            d={p.d}
            loop={p.loop}
            flowSpeed={chwpSpd}
            running={chwpSpd > 0}
            width={9}
          />
        ))}

        {/* Pipe labels */}
        <text x={948} y={PIPE.CWR_HDR - 6} fill={LOOP.cwr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CWR</text>
        <text x={948} y={PIPE.CWS_HDR - 6} fill={LOOP.cws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CWS</text>
        <text x={948} y={PIPE.CHWS - 6} fill={LOOP.chws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWS</text>
        <text x={948} y={PIPE.CHWR + 14} fill={LOOP.chwr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWR</text>

        {/* —— EQUIPMENT —— */}
        {tank && (
          <g className="plant-equip scada-makeup-tank" onClick={() => onSelect(tank.id)} style={{ cursor: 'pointer' }}>
            <rect x={MAKEUP_TANK.x} y={MAKEUP_TANK.y} width={56} height={72} fill={SCADA.faceplate} stroke={tank.lowLevel ? SCADA.alarm : SCADA.faceplateBorder} rx={3} />
            <rect
              x={MAKEUP_TANK.x + 4}
              y={MAKEUP_TANK.y + (1 - tank.levelPercent / 100) * 68}
              width={48}
              height={(tank.levelPercent / 100) * 68}
              fill="#0ea5e9"
              opacity={0.85}
              className="tank-level-anim"
            />
            <EquipLabel
              iconX={MAKEUP_TANK.x}
              iconY={MAKEUP_TANK.y}
              iconW={56}
              iconH={72}
              plateW={96}
              lines={[
                { text: tank.name, variant: 'tag' },
                { text: `${tank.levelPercent.toFixed(0)} %`, variant: 'pv' },
              ]}
            />
          </g>
        )}
        {get('cwmup-1') && (
          <Pump equipment={get('cwmup-1')!} x={MAKEUP_PUMP_X} y={MAKEUP_PUMP_Y[0]} compact selected={selectedId === 'cwmup-1'} onSelect={(id) => onSelect(id)} />
        )}
        {get('cwmup-2') && (
          <Pump equipment={get('cwmup-2')!} x={MAKEUP_PUMP_X} y={MAKEUP_PUMP_Y[1]} compact selected={selectedId === 'cwmup-2'} onSelect={(id) => onSelect(id)} />
        )}

        {CT_X.map((tx, i) => {
          const id = `ct-41-${i + 1}`;
          const eq = get(id);
          return eq ? (
            <CoolingTower key={id} equipment={eq} x={tx} y={CT_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        {CWP_X.map((px, i) => {
          const id = `cwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <Pump key={id} equipment={p} x={px} y={CWP_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        {CH_X.map((hx, i) => {
          const id = `ch-29-${i + 1}`;
          const eq = get(id);
          return eq ? (
            <Chiller key={id} equipment={eq} x={hx} y={CH_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        <HeaderPipe x={CHWS_TAG.x} y={CHWS_TAG.y} label="CHWS Header" tagId="CHWS_HDR" temp={h.chws} loop="chws" pipeY={PIPE.CHWS} />
        <HeaderPipe x={CHWR_TAG.x} y={CHWR_TAG.y} label="CHWR Header" tagId="CHWR_HDR" temp={h.chwr} loop="chwr" pipeY={PIPE.CHWR} />

        {CHWP_X.map((px, i) => {
          const id = `chwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <Pump key={id} equipment={p} x={px} y={CHWP_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        <g className="scada-building-load plant-equip" onClick={() => onSelect('building-load')} style={{ cursor: 'pointer' }}>
          <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} fill={SCADA.faceplate} stroke={LOOP.chws.stroke} strokeWidth={2} rx={4} />
          <text x={BUILDING.x + BUILDING.w / 2} y={BUILDING.y + 20} textAnchor="middle" fill={SCADA.textMuted} fontSize={9} fontWeight="600">
            BUILDING LOAD
          </text>
          <text x={BUILDING.x + BUILDING.w / 2} y={BUILDING.y + 40} textAnchor="middle" fill={SCADA.pv} fontSize={16} fontWeight="700" fontFamily={SCADA.mono}>
            {h.buildingLoadRt.toFixed(0)}
          </text>
          <text x={BUILDING.x + BUILDING.w / 2} y={BUILDING.y + 52} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontFamily={SCADA.mono}>
            RT
          </text>
        </g>

        {get('exptnk-01') && (
          <ExpansionTank equipment={get('exptnk-01')!} x={EXPTNK_X} y={EXPTNK_Y[0]} selected={selectedId === 'exptnk-01'} onSelect={(id) => onSelect(id)} />
        )}
        {get('exptnk-02') && (
          <ExpansionTank equipment={get('exptnk-02')!} x={EXPTNK_X} y={EXPTNK_Y[1]} selected={selectedId === 'exptnk-02'} onSelect={(id) => onSelect(id)} />
        )}
        {get('bv-1') && <Valve equipment={get('bv-1')!} x={BYPASS_X} y={BYPASS_Y[0]} selected={selectedId === 'bv-1'} onSelect={(id) => onSelect(id)} />}
        {get('bv-2') && <Valve equipment={get('bv-2')!} x={BYPASS_X} y={BYPASS_Y[1]} selected={selectedId === 'bv-2'} onSelect={(id) => onSelect(id)} />}

        {/* Zone titles on top — opaque badge so pipes never cover text */}
        <ScadaZoneTitle x={18} y={ZONE.MAKEUP.titleY} title="MAKE-UP WATER" width={168} />
        <ScadaZoneTitle x={210} y={ZONE.TOWERS.titleY} title="CONDENSER LOOP — COOLING TOWERS" width={280} />
        <ScadaZoneTitle x={210} y={ZONE.CWP_ROW.titleY} title="CONDENSER PUMPS (CWS)" width={220} />
        <ScadaZoneTitle x={210} y={ZONE.CHILLERS.titleY} title="CHILLERS" width={100} />
        <ScadaZoneTitle x={18} y={ZONE.HYDRONIC.titleY} title="HYDRONIC AUX" width={168} />
        <ScadaZoneTitle x={210} y={ZONE.CHW_LOOP.titleY} title="CHILLED WATER LOOP" width={200} />

        <text x={PLANT_WIDTH / 2} y={PLANT_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          CHILLER PLANT ROOM · L29 · VIRTUAL SIMULATOR
        </text>
      </svg>
    </div>
  );
}
