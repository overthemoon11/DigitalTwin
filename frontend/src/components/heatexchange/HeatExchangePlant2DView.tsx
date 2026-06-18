import type { DistrictCoolingHeaders, DcsBuildingBranch } from '../../types/districtCooling';
import { ScadaPipe } from '../chiller/ScadaPipe';
import { ScadaZonePanel, ScadaZoneTitle } from '../chiller/ScadaZone';
import { LOOP, SCADA } from '../chiller/scadaTheme';
import { useDcsViewport } from './useDcsViewport';
import {
  DcsAhuCoil,
  DcsBranchValve,
  DcsBuildingBlock,
  PlateHeatExchanger,
} from './DcsEquipment';
import { SystemSnapshotButton } from './SystemSnapshotButton';
import {
  BRANCH_X,
  BUILDING_DEFS,
  DCS_FOOTER_Y,
  DCS_HEIGHT,
  DCS_WIDTH,
  LEGEND_ROW,
  PLANT,
  PLANT_CX,
  RETURN_Y,
  SUPPLY_Y,
  ZONE,
  ahuBox,
  buildingBox,
  dcsPipes,
  hxBox,
  valvePos,
} from './dcsPlantTopology';

interface Props {
  headers: DistrictCoolingHeaders;
  buildings: DcsBuildingBranch[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function DcsLegend() {
  const items = [
    { key: 'dcs', label: 'DCS — District supply' },
    { key: 'dcr', label: 'DCR — District return' },
    { key: 'chws', label: 'CHWS — Secondary supply' },
    { key: 'chwr', label: 'CHWR — Secondary return' },
  ] as const;

  const itemW = 138;
  const gap = 10;
  const titleW = 78;
  const totalW = titleW + gap + items.length * itemW + (items.length - 1) * gap;
  const x = PLANT_CX - totalW / 2;
  const { y, h } = LEGEND_ROW;

  return (
    <g className="scada-legend dcs-legend-row" transform={`translate(${x}, ${y})`}>
      <rect x={0} y={0} width={totalW} height={h} fill={SCADA.faceplate} stroke={SCADA.panelBorder} rx={4} opacity={0.96} />
      <text x={10} y={h / 2 + 4} fill={SCADA.textMuted} fontSize={7} fontWeight="700">
        LOOP LEGEND
      </text>
      {items.map((item, i) => {
        const ix = titleW + gap + i * (itemW + gap);
        return (
          <g key={item.key} transform={`translate(${ix}, ${h / 2 - 5})`}>
            <line x1={0} y1={5} x2={20} y2={5} stroke={LOOP[item.key].stroke} strokeWidth={4} strokeLinecap="round" />
            <text x={26} y={9} fill={SCADA.text} fontSize={7}>
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function HeatExchangePlant2DView({ headers, buildings, selectedId, onSelect }: Props) {
  const {
    svgRef,
    viewBox,
    fitAll,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomStep,
  } = useDcsViewport(selectedId);

  const h = headers;
  const flowSpeed = h.pumpSpeedPct;
  const pipes = dcsPipes();

  const branchData = (idx: number) =>
    buildings[idx] ?? {
      id: BUILDING_DEFS[idx].id,
      name: BUILDING_DEFS[idx].name,
      loadRt: 0,
      chws: h.chws,
      chwr: h.chwr,
      hxApproach: h.hxApproach,
      valvePct: 70,
      status: 'running' as const,
    };

  const clearSelection = () => {
    onSelect(null);
    fitAll();
  };

  return (
    <div className="chiller-plant-2d hx-plant-2d">
      <div className="scada-viewport-tools">
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit full plant">⊡</button>
      </div>
      <p className="scada-viewport-hint">
        Scroll to zoom · drag background to pan · click equipment to focus · DCS campus schematic (ORQ / MBFC / MBS)
      </p>

      <SystemSnapshotButton headers={h} />

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
          <pattern id="dcs-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SCADA.grid} strokeWidth={0.5} />
          </pattern>
        </defs>

        <rect width={DCS_WIDTH} height={DCS_HEIGHT} fill={SCADA.bg} className="scada-viewport-bg" />
        <rect width={DCS_WIDTH} height={DCS_HEIGHT} fill="url(#dcs-grid)" opacity={0.35} pointerEvents="none" />

        <ScadaZonePanel x={ZONE.PLANT.x} y={ZONE.PLANT.y} width={ZONE.PLANT.w} height={ZONE.PLANT.h} fill={LOOP.dcs.fill} />
        <ScadaZonePanel x={ZONE.SUPPLY.x} y={ZONE.SUPPLY.y} width={ZONE.SUPPLY.w} height={ZONE.SUPPLY.h} fill={LOOP.dcs.fill} />
        <ScadaZonePanel x={ZONE.BRANCHES.x} y={ZONE.BRANCHES.y} width={ZONE.BRANCHES.w} height={ZONE.BRANCHES.h} fill="rgba(241,245,249,0.5)" />
        <ScadaZonePanel x={ZONE.RETURN.x} y={ZONE.RETURN.y} width={ZONE.RETURN.w} height={ZONE.RETURN.h} fill={LOOP.dcr.fill} />

        {pipes.map((p, i) => (
          <ScadaPipe
            key={`dcs-pipe-${i}`}
            d={p.d}
            loop={p.loop}
            flowSpeed={flowSpeed}
            running={flowSpeed > 0}
            width={p.loop === 'dcs' || p.loop === 'dcr' ? 10 : 8}
          />
        ))}

        <text x={DCS_WIDTH - 52} y={SUPPLY_Y - 6} fill={LOOP.dcs.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>
          DCS HEADER
        </text>
        <text x={DCS_WIDTH - 52} y={RETURN_Y - 6} fill={LOOP.dcr.stroke} fontSize={8} fontWeight="600" fontFamily={SCADA.mono}>
          DCR HEADER
        </text>
        <text x={PLANT_CX + 8} y={SUPPLY_Y + 4} fill={LOOP.dcs.stroke} fontSize={8} fontFamily={SCADA.mono}>
          {h.dcsTemp}°C SP
        </text>
        <text x={BRANCH_X[2] + 40} y={RETURN_Y + 18} fill={LOOP.chwr.stroke} fontSize={8} fontFamily={SCADA.mono}>
          ΔT {h.primaryDeltaT}°C · DCR {h.dcrTemp}°C
        </text>

        {/* Central district chiller plant */}
        <g
          className="plant-equip scada-dcs-plant"
          onClick={() => onSelect('dcs-plant')}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={PLANT.x}
            y={PLANT.y}
            width={PLANT.w}
            height={PLANT.h}
            fill={SCADA.faceplate}
            stroke={selectedId === 'dcs-plant' ? SCADA.selected : LOOP.dcs.stroke}
            strokeWidth={selectedId === 'dcs-plant' ? 2.5 : 2}
            rx={6}
          />
          <text x={PLANT_CX} y={PLANT.y + 26} textAnchor="middle" fill={SCADA.tag} fontSize={10} fontWeight="700">
            DISTRICT CHILLER PLANT
          </text>
          <text x={PLANT_CX} y={PLANT.y + 46} textAnchor="middle" fill={SCADA.pv} fontSize={12} fontWeight="700" fontFamily={SCADA.mono}>
            DCS {h.dcsTemp}°C
          </text>
          <text x={PLANT_CX} y={PLANT.y + 62} textAnchor="middle" fill={SCADA.sp} fontSize={9} fontFamily={SCADA.mono}>
            SP · Total {h.coolingDemandRt} RT
          </text>
        </g>

        {BRANCH_X.map((cx, idx) => {
          const branch = branchData(idx);
          const hx = hxBox(cx);
          const bld = buildingBox(cx);
          const ahu = ahuBox(cx);
          const valve = valvePos(cx);

          return (
            <g key={BUILDING_DEFS[idx].id}>
              <DcsBranchValve
                branch={branch}
                x={valve.x}
                y={valve.y}
                selected={selectedId === `dcv-${branch.id}`}
                onSelect={onSelect}
              />
              <PlateHeatExchanger
                branch={branch}
                x={hx.x}
                y={hx.y}
                w={hx.w}
                h={hx.h}
                selected={selectedId === `hx-${branch.id}`}
                onSelect={onSelect}
              />
              <DcsBuildingBlock
                branch={branch}
                x={bld.x}
                y={bld.y}
                w={bld.w}
                h={bld.h}
                selected={selectedId === branch.id}
                onSelect={onSelect}
              />
              <DcsAhuCoil
                branch={branch}
                x={ahu.x}
                y={ahu.y}
                w={ahu.w}
                h={ahu.h}
                selected={selectedId === `ahu-${branch.id}`}
                onSelect={onSelect}
              />
            </g>
          );
        })}

        <ScadaZoneTitle x={18} y={ZONE.PLANT.titleY} title="CENTRAL DISTRICT COOLING PLANT" width={280} />
        <ScadaZoneTitle x={18} y={ZONE.SUPPLY.titleY} title="PRIMARY SUPPLY HEADER (DCS)" width={240} />
        <ScadaZoneTitle x={18} y={ZONE.BRANCHES.titleY} title="BUILDING ETS BRANCHES — PLATE HX · SECONDARY CHW · AHU" width={420} />
        <ScadaZoneTitle x={18} y={ZONE.RETURN.titleY} title="PRIMARY RETURN HEADER (DCR)" width={240} />

        <DcsLegend />

        <text x={DCS_WIDTH / 2} y={DCS_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          DISTRICT COOLING SYSTEM · ORQ / MBFC / MBS · VIRTUAL SIMULATOR
        </text>
      </svg>
    </div>
  );
}
