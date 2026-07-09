import { useState } from 'react';
import type { PlantEquipment, PlantHeaders, PlantKpi, MakeupTankEquipment, PumpEquipment } from '../../types/plant';
import { Chiller } from './Chiller';
import { CoolingTower } from './CoolingTower';
import { Pump } from './Pump';
import { Valve } from './Valve';
import { ExpansionTank } from './ExpansionTank';
import { ScadaPipe } from './ScadaPipe';
import { ScadaLegend } from './ScadaLegend';
import { PipeLoopLabel } from './PipeLoopLabel';
import { ScadaZonePanel, ScadaZoneTitle } from './ScadaZone';
import { EquipLabel } from './EquipLabel';
import { EquipSprite } from './EquipSprite';
import { EQUIP_IMG } from './equipmentImages';
import { LOOP, SCADA } from './scadaTheme';
import { PLANT_HEIGHT, PLANT_WIDTH } from './plantEquipmentLayout';
import { PLANT_FOOTER_Y } from './plantTopology';
import { usePlantViewport } from './usePlantViewport';
import { CHWP_COUNT, CWP_COUNT } from '../../services/plantPhysics';
import {
  TRAIN_COUNT,
  BYPASS_X,
  BYPASS_Y,
  CHWP_X,
  CHWP_Y,
  STANDBY_CHWP_X,
  STANDBY_CWP_X,
  CH_X,
  CH_Y,
  CT_X,
  CT_Y,
  CWP_X,
  CWP_Y,
  EXPTNK_X,
  EXPTNK_Y,
  H_RISE,
  MAKEUP_PUMP_X,
  MAKEUP_PUMP_Y,
  MAKEUP_TANK,
  M_RISE,
  PIPE_LOOP_LABELS,
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
  kpis?: PlantKpi[] | null;
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

export default function ChillerPlant2DView({ equipment, headers, kpis, selectedId, onSelect }: Props) {
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
  const cwpSpd = avgPumpSpeed(equipment, 'cwp', CWP_COUNT);
  const chwpSpd = avgPumpSpeed(equipment, 'chwp', CHWP_COUNT);
  const ctFan = equipment['ct-1'] as { fanSpeedPercent?: number; status?: string } | undefined;
  const ctSpd = ctFan?.status === 'running' ? ctFan.fanSpeedPercent ?? 0 : 0;

  const get = <T extends PlantEquipment>(id: string) => equipment[id] as T | undefined;

  // Plant-wide totals for the overlay. Prefer the engine KPIs; fall back to
  // summing equipment power / headers so the panel still works without KPIs.
  const kpi = (id: string) => kpis?.find((k) => k.id === id);
  const loadRt = Number(kpi('kpi-load')?.value ?? h.buildingLoadRt);
  const totalKw = Number(
    kpi('kpi-kw')?.value ??
      Object.values(equipment).reduce((s, e) => s + (typeof e.powerKw === 'number' ? e.powerKw : 0), 0)
  );
  const effKwPerRt = Number(kpi('kpi-eff')?.value ?? (loadRt > 0 ? totalKw / loadRt : 0));
  const effStatus = kpi('kpi-eff')?.status ?? 'normal';

  // Plant summary + per-subsystem efficiency (kW/Ton) for the pop-up panel.
  const [showSummary, setShowSummary] = useState(false);
  const kNum = (id: string) => Number(kpi(id)?.value ?? NaN);
  const sumFlowM3h = (cat: string) =>
    Object.values(equipment)
      .filter((e) => (e as { category?: string }).category === cat && e.status === 'running')
      .reduce((s, e) => s + (typeof e.flowRate === 'number' ? e.flowRate : 0), 0);
  const chillerKw = kNum('kpi-ch-kw');
  const chwpKw = kNum('kpi-chwp-kw');
  const cwpKw = kNum('kpi-cwp-kw');
  const ctKw = kNum('kpi-ct-kw');
  const perTon = (kw: number) => (loadRt > 0 && Number.isFinite(kw) ? kw / loadRt : NaN);
  const cwfLs = sumFlowM3h('cwp') / 3.6;
  const cwDt = h.cwr - h.cws;
  const qRejKw = cwfLs * 3.6 * cwDt * 1.163;
  const qCoolKw = loadRt * 3.517;
  const heatBalance = qCoolKw + chillerKw > 0 ? (qRejKw / (qCoolKw + chillerKw)) * 100 : NaN;
  const cwTon = loadRt + (Number.isFinite(chillerKw) ? chillerKw / 3.517 : 0); // heat rejected in RT
  const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

  const clearSelection = () => {
    onSelect(null);
    fitAll();
  };

  const condPaths = condenserPipes();
  const chillPaths = chilledPipes();

  return (
    <div className="chiller-plant-2d">
      <div className="scada-viewport-tools">
        <button
          type="button"
          className={`scada-summary-btn ${showSummary ? 'active' : ''}`}
          onClick={() => setShowSummary((s) => !s)}
          title="Plant summary & efficiency"
        >
          Σ Summary
        </button>
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit full plant">⊡</button>
      </div>
      <p className="scada-viewport-hint">Scroll to zoom · drag background to pan · click equipment to focus · click again to unfocus</p>

      {showSummary && (
        <div className="scada-summary" role="dialog">
          <div className="scada-summary-head">
            <span>Plant Summary</span>
            <button type="button" onClick={() => setShowSummary(false)} title="Close" aria-label="Close">×</button>
          </div>
          <div className="scada-summary-body">
            <div className="scada-summary-box">
              <div className="scada-summary-title">System Summary</div>
              <div className="scada-summary-row"><span>Total CW Ton</span><strong>{fmt(cwTon, 0)} <em>RT</em></strong></div>
              <div className="scada-summary-row"><span>Total CHW Ton</span><strong>{fmt(loadRt, 0)} <em>RT</em></strong></div>
              <div className="scada-summary-row"><span>Total Elec kW</span><strong>{fmt(totalKw, 1)} <em>kW</em></strong></div>
            </div>
            <div className="scada-summary-box">
              <div className="scada-summary-title">Efficiency (kW/Ton)</div>
              <div className="scada-summary-row"><span>Chiller</span><strong>{fmt(perTon(chillerKw))}</strong></div>
              <div className="scada-summary-row"><span>CHWP</span><strong>{fmt(perTon(chwpKw))}</strong></div>
              <div className="scada-summary-row"><span>CWP</span><strong>{fmt(perTon(cwpKw))}</strong></div>
              <div className="scada-summary-row"><span>CT</span><strong>{fmt(perTon(ctKw))}</strong></div>
              <div className="scada-summary-row scada-summary-row--total"><span>System</span><strong>{fmt(effKwPerRt)}</strong></div>
              <div className="scada-summary-row"><span>Heat Balance</span><strong>{fmt(heatBalance, 1)} <em>%</em></strong></div>
            </div>
          </div>
        </div>
      )}

      <div className="scada-metrics">
        <div className="scada-metric">
          <span className="scada-metric-label">System Efficiency</span>
          <span className={`scada-metric-value ${effStatus}`}>{effKwPerRt.toFixed(3)}<em>kW/RT</em></span>
        </div>
        <div className="scada-metric">
          <span className="scada-metric-label">Total Power</span>
          <span className="scada-metric-value">{Math.round(totalKw).toLocaleString()}<em>kW</em></span>
        </div>
        <div className="scada-metric">
          <span className="scada-metric-label">Cooling Load</span>
          <span className="scada-metric-value">{Math.round(loadRt).toLocaleString()}<em>RT</em></span>
        </div>
      </div>

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
            running={cwpSpd > 0 || ctSpd > 0}
            width={5}
            arrows
          />
        ))}
        {chillPaths.map((p, i) => (
          <ScadaPipe
            key={`chill-${i}`}
            d={p.d}
            loop={p.loop}
            running={chwpSpd > 0}
            width={5}
            arrows
          />
        ))}

        {/* Pipe loop labels — beside headers, not on risers */}
        {Object.entries(PIPE_LOOP_LABELS).map(([id, lbl]) => (
          <PipeLoopLabel
            key={id}
            x={lbl.x}
            y={lbl.y}
            text={lbl.text}
            loop={lbl.loop}
            anchor={'anchor' in lbl ? lbl.anchor : 'start'}
          />
        ))}

        {/* —— EQUIPMENT —— */}
        {CT_X.map((tx, i) => {
          const id = `ct-${i + 1}`;
          const eq = get(id);
          return eq ? (
            <CoolingTower key={id} equipment={eq} x={tx} y={CT_Y} selected={selectedId === id} onSelect={(id) => onSelect(id)} />
          ) : null;
        })}

        {get('cwmup-1') && (
          <Pump equipment={get('cwmup-1')!} x={MAKEUP_PUMP_X[0]} y={MAKEUP_PUMP_Y} compact labelW={58} labelSide="right" selected={selectedId === 'cwmup-1'} onSelect={(id) => onSelect(id)} />
        )}
        {get('cwmup-2') && (
          <Pump equipment={get('cwmup-2')!} x={MAKEUP_PUMP_X[1]} y={MAKEUP_PUMP_Y} compact labelW={58} labelSide="right" selected={selectedId === 'cwmup-2'} onSelect={(id) => onSelect(id)} />
        )}

        {tank && (
          <g className="plant-equip scada-makeup-tank" onClick={() => onSelect(tank.id)} style={{ cursor: 'pointer' }}>
            <EquipSprite
              href={EQUIP_IMG.tank}
              x={MAKEUP_TANK.x}
              y={MAKEUP_TANK.y}
              w={MAKEUP_TANK.w}
              h={MAKEUP_TANK.h}
              status={tank.lowLevel ? 'alarm' : 'running'}
              selected={selectedId === tank.id}
              scale={1.8}
            />
            <EquipLabel
              iconX={MAKEUP_TANK.x}
              iconY={MAKEUP_TANK.y}
              iconW={MAKEUP_TANK.w}
              iconH={MAKEUP_TANK.h}
              plateW={74}
              side="right"
              lines={[
                { text: tank.name, variant: 'tag' },
                { text: `${tank.levelPercent.toFixed(0)} %`, variant: 'pv' },
              ]}
            />
          </g>
        )}

        {Array.from({ length: TRAIN_COUNT }, (_, i) => i).map((i) => {
          const chId = `ch-${i + 1}`;
          const chwpId = `chwp-${i + 1}`;
          const cwpId = `cwp-${i + 1}`;
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

        {get(`chwp-${CHWP_COUNT}`) && (
          <Pump equipment={get(`chwp-${CHWP_COUNT}`)!} x={STANDBY_CHWP_X} y={CHWP_Y} compact labelW={58} labelSide="below" selected={selectedId === `chwp-${CHWP_COUNT}`} onSelect={onSelect} />
        )}
        {get(`cwp-${CWP_COUNT}`) && (
          <Pump equipment={get(`cwp-${CWP_COUNT}`)!} x={STANDBY_CWP_X} y={CWP_Y} mini labelW={54} labelSide="below" selected={selectedId === `cwp-${CWP_COUNT}`} onSelect={onSelect} />
        )}

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
          <ExpansionTank equipment={get('exptnk-01')!} x={EXPTNK_X[0]} y={EXPTNK_Y} selected={selectedId === 'exptnk-01'} onSelect={(id) => onSelect(id)} scale={1.8} />
        )}
        {get('exptnk-02') && (
          <ExpansionTank equipment={get('exptnk-02')!} x={EXPTNK_X[1]} y={EXPTNK_Y} selected={selectedId === 'exptnk-02'} onSelect={(id) => onSelect(id)} scale={1.8} />
        )}
        {get('bv-1') && <Valve equipment={get('bv-1')!} x={BYPASS_X} y={BYPASS_Y[0]} selected={selectedId === 'bv-1'} onSelect={(id) => onSelect(id)} />}
        {get('bv-2') && <Valve equipment={get('bv-2')!} x={BYPASS_X} y={BYPASS_Y[1]} selected={selectedId === 'bv-2'} onSelect={(id) => onSelect(id)} />}

        {/* Zone titles on top — opaque badge so pipes never cover text */}
        <ScadaZoneTitle x={18} y={ZONE.TOWERS.titleY} title="COOLING TOWERS CT-01…05" width={260} />
        <ScadaZoneTitle x={ZONE.MAKEUP.x + 10} y={ZONE.MAKEUP.titleY} title="MAKE-UP WATER" width={168} />
        <ScadaZoneTitle x={18} y={ZONE.CHILLERS.titleY} title="CHILLERS CH-1…5 · CHWP / CWP" width={300} />
        <ScadaZoneTitle x={200} y={ZONE.CHW_LOOP.titleY} title="CHILLED WATER — M / H RISE" width={280} />

        <text x={PLANT_WIDTH / 2} y={PLANT_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          CHILLER PLANT ROOM · T1 · VIRTUAL SIMULATOR
        </text>
      </svg>
    </div>
  );
}
