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
  BYPASS_X,
  BYPASS_Y,
  CHWP_X,
  CHWP_Y,
  STANDBY_CHWP_X,
  STANDBY_CWP_X,
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
  H_RISE,
  HR_EXPORT_X,
  MAKEUP_PUMP_X,
  MAKEUP_PUMP_Y,
  MAKEUP_TANK,
  M_RISE,
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

function RiseBox({
  id,
  rise,
  title,
  letter,
  loadRt,
  selected,
  onSelect,
}: {
  id: string;
  rise: { x: number; y: number; w: number; h: number };
  title: string;
  letter: string;
  loadRt: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <g className="plant-equip scada-rise-box" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <rect
        x={rise.x}
        y={rise.y}
        width={rise.w}
        height={rise.h}
        fill={SCADA.faceplate}
        stroke={selected ? SCADA.selected : LOOP.chws.stroke}
        strokeWidth={selected ? 2.5 : 2}
        rx={4}
      />
      <text x={rise.x + rise.w / 2} y={rise.y + 16} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontWeight="600">
        {title}
      </text>
      <text x={rise.x + 18} y={rise.y + 38} fill={SCADA.tag} fontSize={18} fontWeight="700" fontFamily={SCADA.mono}>
        {letter}
      </text>
      <text x={rise.x + rise.w - 12} y={rise.y + 38} textAnchor="end" fill={SCADA.pv} fontSize={14} fontWeight="700" fontFamily={SCADA.mono}>
        {loadRt.toFixed(0)}
      </text>
      <text x={rise.x + rise.w - 12} y={rise.y + 48} textAnchor="end" fill={SCADA.tag} fontSize={8} fontFamily={SCADA.mono}>
        RT
      </text>
    </g>
  );
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

  const h = headers || { chws: 7, chwr: 12, cws: 29, cwr: 32, buildingLoadRt: 0, ambientTemp: 32, humidityRh: 65 };
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

        {/* Zone panels */}
        <ScadaZonePanel x={ZONE.TOWERS.x} y={ZONE.TOWERS.y} width={ZONE.TOWERS.w} height={ZONE.TOWERS.h} fill={LOOP.cws.fill} />
        <ScadaZonePanel x={ZONE.MAKEUP.x} y={ZONE.MAKEUP.y} width={ZONE.MAKEUP.w} height={ZONE.MAKEUP.h} fill={LOOP.cws.fill} />
        <ScadaZonePanel x={ZONE.CHILLERS.x} y={ZONE.CHILLERS.y} width={ZONE.CHILLERS.w} height={ZONE.CHILLERS.h} fill="rgba(226,232,240,0.55)" />
        <ScadaZonePanel x={188} y={ZONE.CHW_LOOP.y} width={860} height={ZONE.CHW_LOOP.h} fill={LOOP.chws.fill} />

        {/* —— PIPING —— */}
        {condPaths.map((p, i) => (
          <ScadaPipe
            key={`cond-${i}`}
            d={p.d}
            loop={p.loop}
            flowSpeed={cwpSpd}
            running={cwpSpd > 0 || ctSpd > 0}
            width={9}
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
        <text x={CT_X[0] - 4} y={PIPE.CWS_CT_TOP - 6} fill={LOOP.cws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CWS</text>
        <text x={HR_EXPORT_X + 48} y={PIPE.CWR_HDR - 6} fill={LOOP.cwr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CWR</text>
        <text x={HR_EXPORT_X + 48} y={PIPE.CWS_HDR - 6} fill={LOOP.cws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CWS</text>
        <text x={HR_EXPORT_X + 48} y={PIPE.CHWS - 6} fill={LOOP.chws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWS</text>
        <text x={HR_EXPORT_X + 48} y={PIPE.CHWR + 14} fill={LOOP.chwr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>CHWR</text>
        <text x={HR_EXPORT_X + 8} y={PIPE.CHWS + 22} fill={LOOP.chws.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>→ High Rise</text>

        {/* —— EQUIPMENT —— */}
        {CT_X.map((tx, i) => {
          const id = `ct-41-${i + 1}`;
          const eq = get(id);
          return eq ? (
            <CoolingTower key={id} equipment={eq} x={tx} y={CT_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        {get('cwmup-1') && (
          <Pump equipment={get('cwmup-1')!} x={MAKEUP_PUMP_X[0]} y={MAKEUP_PUMP_Y} compact labelW={58} labelSide="below" selected={selectedId === 'cwmup-1'} onSelect={(id) => onSelect(id)} />
        )}
        {get('cwmup-2') && (
          <Pump equipment={get('cwmup-2')!} x={MAKEUP_PUMP_X[1]} y={MAKEUP_PUMP_Y} compact labelW={58} labelSide="below" selected={selectedId === 'cwmup-2'} onSelect={(id) => onSelect(id)} />
        )}

        {tank && (
          <g className="plant-equip scada-makeup-tank" onClick={() => onSelect(tank.id)} style={{ cursor: 'pointer' }}>
            <rect x={MAKEUP_TANK.x} y={MAKEUP_TANK.y} width={MAKEUP_TANK.w} height={MAKEUP_TANK.h} fill={SCADA.faceplate} stroke={tank.lowLevel ? SCADA.alarm : SCADA.faceplateBorder} rx={3} />
            <rect
              x={MAKEUP_TANK.x + 4}
              y={MAKEUP_TANK.y + (1 - tank.levelPercent / 100) * (MAKEUP_TANK.h - 4)}
              width={MAKEUP_TANK.w - 8}
              height={(tank.levelPercent / 100) * (MAKEUP_TANK.h - 4)}
              fill="#0ea5e9"
              opacity={0.85}
              className="tank-level-anim"
            />
            <EquipLabel
              iconX={MAKEUP_TANK.x}
              iconY={MAKEUP_TANK.y}
              iconW={MAKEUP_TANK.w}
              iconH={MAKEUP_TANK.h}
              plateW={74}
              side="below"
              lines={[
                { text: tank.name, variant: 'tag' },
                { text: `${tank.levelPercent.toFixed(0)} %`, variant: 'pv' },
              ]}
            />
          </g>
        )}

        {[0, 1, 2].map((i) => {
          const chId = `ch-29-${i + 1}`;
          const chwpId = `chwp-29-${i + 1}`;
          const cwpId = `cwp-29-${i + 1}`;
          const ch = get(chId);
          const chwp = get(chwpId);
          const cwp = get(cwpId);
          return (
            <g key={chId} className="scada-chiller-train">
              {chwp && (
                <Pump equipment={chwp} x={CHWP_X[i]} y={CHWP_Y} compact labelW={58} labelSide="below" selected={selectedId === chwpId} onSelect={onSelect} />
              )}
              {ch && (
                <Chiller equipment={ch} x={CH_X[i]} y={CH_Y} labelSide="below" labelW={100} selected={selectedId === chId} onSelect={onSelect} />
              )}
              {cwp && (
                <Pump equipment={cwp} x={CWP_X[i]} y={CWP_Y} mini labelW={54} labelSide="below" selected={selectedId === cwpId} onSelect={onSelect} />
              )}
            </g>
          );
        })}

        {get('chwp-29-4') && (
          <Pump equipment={get('chwp-29-4')!} x={STANDBY_CHWP_X} y={CHWP_Y} compact labelW={58} labelSide="below" selected={selectedId === 'chwp-29-4'} onSelect={onSelect} />
        )}
        {get('cwp-29-4') && (
          <Pump equipment={get('cwp-29-4')!} x={STANDBY_CWP_X} y={CWP_Y} mini labelW={54} labelSide="below" selected={selectedId === 'cwp-29-4'} onSelect={onSelect} />
        )}

        <HeaderPipe x={CHWS_TAG.x} y={CHWS_TAG.y} label="CHWS Header" tagId="CHWS_HDR" temp={h.chws} loop="chws" pipeY={PIPE.CHWS} />
        <HeaderPipe x={CHWR_TAG.x} y={CHWR_TAG.y} label="CHWR Header" tagId="CHWR_HDR" temp={h.chwr} loop="chwr" pipeY={PIPE.CHWR} />

        <RiseBox
          id="m-rise"
          rise={M_RISE}
          title="To Medium Rise"
          letter="M"
          loadRt={h.buildingLoadRt * 0.55}
          selected={selectedId === 'm-rise'}
          onSelect={onSelect}
        />
        <RiseBox
          id="h-rise"
          rise={H_RISE}
          title="To High Rise"
          letter="H"
          loadRt={h.buildingLoadRt * 0.45}
          selected={selectedId === 'h-rise'}
          onSelect={onSelect}
        />

        {get('exptnk-01') && (
          <ExpansionTank equipment={get('exptnk-01')!} x={EXPTNK_X} y={EXPTNK_Y[0]} selected={selectedId === 'exptnk-01'} onSelect={(id) => onSelect(id)} />
        )}
        {get('exptnk-02') && (
          <ExpansionTank equipment={get('exptnk-02')!} x={EXPTNK_X} y={EXPTNK_Y[1]} selected={selectedId === 'exptnk-02'} onSelect={(id) => onSelect(id)} />
        )}
        {get('bv-1') && <Valve equipment={get('bv-1')!} x={BYPASS_X} y={BYPASS_Y[0]} selected={selectedId === 'bv-1'} onSelect={(id) => onSelect(id)} />}
        {get('bv-2') && <Valve equipment={get('bv-2')!} x={BYPASS_X} y={BYPASS_Y[1]} selected={selectedId === 'bv-2'} onSelect={(id) => onSelect(id)} />}

        {/* Zone titles on top — opaque badge so pipes never cover text */}
        <ScadaZoneTitle x={18} y={ZONE.TOWERS.titleY} title="COOLING TOWERS CT-41" width={240} />
        <ScadaZoneTitle x={ZONE.MAKEUP.x + 10} y={ZONE.MAKEUP.titleY} title="MAKE-UP WATER" width={168} />
        <ScadaZoneTitle x={18} y={ZONE.CHILLERS.titleY} title="CHILLERS CH-29 · CHWP / CWP" width={280} />
        <ScadaZoneTitle x={200} y={ZONE.CHW_LOOP.titleY} title="CHILLED WATER — M / H RISE" width={280} />

        <text x={PLANT_WIDTH / 2} y={PLANT_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          CHILLER PLANT ROOM · L29 · VIRTUAL SIMULATOR
        </text>
      </svg>
    </div>
  );
}
