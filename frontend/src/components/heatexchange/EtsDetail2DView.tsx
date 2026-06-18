import type { DistrictCoolingHeaders, DcsBuildingBranch } from '../../types/districtCooling';
import { ScadaPipe } from '../chiller/ScadaPipe';
import { ScadaZonePanel, ScadaZoneTitle } from '../chiller/ScadaZone';
import { ScadaSpin } from '../chiller/ScadaSpin';
import { LOOP, SCADA, statusFill } from '../chiller/scadaTheme';
import {
  DcsAhuCoil,
  DcsBranchValve,
  PlateHeatExchanger,
} from './DcsEquipment';
import { SystemSnapshotButton } from './SystemSnapshotButton';
import { buildingDisplayName } from './resolveEtsBuilding';
import {
  BYPASS,
  EQUIP,
  ETS_FOOTER_Y,
  ETS_HEIGHT,
  ETS_WIDTH,
  LEGEND_POS,
  PHE,
  PRIMARY_ZONE,
  PRIMARY_Y,
  SECONDARY_ZONE,
  SECONDARY_Y,
  etsPipes,
} from './etsDetailTopology';
import { useEtsViewport } from './useEtsViewport';

interface Props {
  buildingId: string;
  branch: DcsBuildingBranch;
  headers: DistrictCoolingHeaders;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBackToCampus: () => void;
}

function EtsLegend() {
  const items = [
    { key: 'dcs', label: 'DCS — Primary supply' },
    { key: 'dcr', label: 'DCR — Primary return' },
    { key: 'chws', label: 'CHWS — Secondary supply' },
    { key: 'chwr', label: 'CHWR — Secondary return' },
  ] as const;

  const lineH = 20;
  const headerH = 22;
  const pad = 12;
  const boxH = headerH + items.length * lineH + pad;

  return (
    <g className="scada-legend" transform={`translate(${LEGEND_POS.x}, ${LEGEND_POS.y})`}>
      <rect x={0} y={0} width={172} height={boxH} fill={SCADA.faceplate} stroke={SCADA.panelBorder} rx={4} opacity={0.95} />
      <text x={10} y={16} fill={SCADA.textMuted} fontSize={8} fontWeight="700">
        LOOP LEGEND
      </text>
      {items.map((item, i) => (
        <g key={item.key} transform={`translate(10, ${headerH + 4 + i * lineH})`}>
          <line x1={0} y1={6} x2={24} y2={6} stroke={LOOP[item.key].stroke} strokeWidth={4} strokeLinecap="round" />
          <text x={32} y={10} fill={SCADA.text} fontSize={7}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function FlowMeter({
  buildingId,
  flowRt,
  selected,
  onSelect,
}: {
  buildingId: string;
  flowRt: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y } = EQUIP.flowMeter;
  const id = `flow-${buildingId}`;

  return (
    <g className="plant-equip scada-flow-meter" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={40} height={40} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <text x={x + 20} y={y + 24} textAnchor="middle" fill={SCADA.tag} fontSize={14} fontWeight="700">
        F
      </text>
      <text x={x + 20} y={y + 54} textAnchor="middle" fill={SCADA.tag} fontSize={7} fontWeight="700">
        Flow meter
      </text>
      <text x={x + 20} y={y + 66} textAnchor="middle" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>
        {flowRt.toFixed(0)} RT
      </text>
    </g>
  );
}

function EnergyMeter({
  buildingId,
  kw,
  selected,
  onSelect,
}: {
  buildingId: string;
  kw: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y } = EQUIP.energyMeter;
  const id = `meter-${buildingId}`;

  return (
    <g className="plant-equip scada-energy-meter" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={72} height={48} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : '#64748b'} strokeWidth={selected ? 2 : 1.5} strokeDasharray="4 3" rx={3} />
      <text x={x + 36} y={y + 22} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontWeight="700">
        ENERGY
      </text>
      <text x={x + 36} y={y + 38} textAnchor="middle" fill={SCADA.pv} fontSize={11} fontWeight="700" fontFamily={SCADA.mono}>
        {kw.toFixed(1)} kW
      </text>
    </g>
  );
}

function EtsPump({
  buildingId,
  branch,
  headers,
  selected,
  onSelect,
}: {
  buildingId: string;
  branch: DcsBuildingBranch;
  headers: DistrictCoolingHeaders;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y } = EQUIP.pump;
  const id = `pump-${buildingId}`;
  const running = branch.status === 'running';
  const fill = statusFill(branch.status);
  const spd = headers.pumpSpeedPct;
  const cx = x + 30;
  const cy = y + 26;
  const plateW = 108;
  const plateX = x - plateW - 8;

  return (
    <g className="plant-equip scada-pump" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={60} height={52} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : SCADA.faceplateBorder} strokeWidth={selected ? 2 : 1} rx={3} />
      <circle cx={cx} cy={cy} r={18} fill="#f1f5f9" stroke={fill} strokeWidth={2.5} />
      <g transform={`translate(${cx}, ${cy})`}>
        <g>
          <polygon points="0,-10 8,6 -8,6" fill={running ? fill : SCADA.stopped} opacity={0.9} />
          <ScadaSpin durSec={running ? Math.max(0.4, 2 - spd / 60) : 0} />
        </g>
      </g>
      <g pointerEvents="none">
        <rect x={plateX} y={y + 8} width={plateW} height={36} fill={SCADA.faceplate} stroke={SCADA.faceplateBorder} strokeWidth={0.75} rx={2} opacity={0.94} />
        <text x={plateX + 6} y={y + 20} fill={SCADA.tag} fontSize={8} fontWeight="700" fontFamily={SCADA.mono}>
          CHW pump
        </text>
        <text x={plateX + 6} y={y + 34} fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>
          {spd.toFixed(0)}% · {headers.pumpPowerKw.toFixed(1)} kW
        </text>
      </g>
    </g>
  );
}

function BypassValve({
  buildingId,
  selected,
  onSelect,
}: {
  buildingId: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const id = `bypass-${buildingId}`;
  const cx = BYPASS.cx;
  const cy = BYPASS.y;

  return (
    <g className="plant-equip scada-bypass-valve" onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
      <circle cx={cx} cy={cy} r={11} fill={SCADA.faceplate} stroke={selected ? SCADA.selected : '#94a3b8'} strokeWidth={selected ? 2.5 : 2} />
      <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7} stroke="#94a3b8" strokeWidth={2.5} />
      <text x={cx} y={cy - 16} textAnchor="middle" fill={SCADA.textMuted} fontSize={7}>
        BYPASS
      </text>
    </g>
  );
}

function HeaderNode({ x, y, label, sub }: { x: number; y: number; label: string; sub: string }) {
  return (
    <g>
      <rect x={x} y={y} width={88} height={52} fill={SCADA.faceplate} stroke={SCADA.panelBorder} rx={4} />
      <text x={x + 44} y={y + 22} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight="700">
        {label}
      </text>
      <text x={x + 44} y={y + 40} textAnchor="middle" fill={SCADA.textMuted} fontSize={7}>
        {sub}
      </text>
    </g>
  );
}

function LoopTag({ x, y, text, loop }: { x: number; y: number; text: string; loop: keyof typeof LOOP }) {
  return (
    <g>
      <rect x={x} y={y} width={76} height={22} fill={LOOP[loop].fill} stroke={LOOP[loop].stroke} rx={3} />
      <text x={x + 38} y={y + 15} textAnchor="middle" fill={LOOP[loop].stroke} fontSize={9} fontWeight="700" fontFamily={SCADA.mono}>
        {text}
      </text>
    </g>
  );
}

function PheInfoPlate({ branch }: { branch: DcsBuildingBranch }) {
  const { x, y, w, h } = EQUIP.pheInfo;

  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill={SCADA.faceplate} stroke={SCADA.faceplateBorder} rx={3} opacity={0.95} />
      <text x={x + w / 2} y={y + 16} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontWeight="700" fontFamily={SCADA.mono}>
        HX — {branch.name}
      </text>
      <text x={x + w / 2} y={y + 30} textAnchor="middle" fill={SCADA.pv} fontSize={8} fontFamily={SCADA.mono}>
        Approach {branch.hxApproach}°C · {branch.loadRt} RT
      </text>
    </g>
  );
}

export default function EtsDetail2DView({
  buildingId,
  branch,
  headers,
  selectedId,
  onSelect,
  onBackToCampus,
}: Props) {
  const {
    svgRef,
    viewBox,
    fitAll,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomStep,
  } = useEtsViewport(selectedId);

  const h = headers;
  const pipes = etsPipes();
  const flowSpeed = h.pumpSpeedPct;
  const name = buildingDisplayName(buildingId);
  const ahuUnits = [1, 2, 3];

  const clearSelection = () => {
    onSelect(null);
    fitAll();
  };

  return (
    <div className="chiller-plant-2d hx-plant-2d ets-detail-2d">
      <div className="scada-viewport-tools">
        <button type="button" className="ets-back-btn" onClick={onBackToCampus} title="Back to campus overview">
          ← Campus
        </button>
        <button type="button" onClick={() => zoomStep(true)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomStep(false)} title="Zoom out">−</button>
        <button type="button" onClick={clearSelection} title="Fit schematic">⊡</button>
      </div>
      <p className="scada-viewport-hint">
        {name} ETS room · primary DCS/DCR via PHE · secondary CHW loop · scroll to zoom · drag to pan
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
          <pattern id="ets-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SCADA.grid} strokeWidth={0.5} />
          </pattern>
        </defs>

        <rect width={ETS_WIDTH} height={ETS_HEIGHT} fill={SCADA.bg} className="scada-viewport-bg" />
        <rect width={ETS_WIDTH} height={ETS_HEIGHT} fill="url(#ets-grid)" opacity={0.35} pointerEvents="none" />

        <ScadaZoneTitle x={PRIMARY_ZONE.x + 6} y={PRIMARY_ZONE.y - 4} title={`PRIMARY DISTRICT LOOP — ${name} ETS`} width={320} />
        <ScadaZoneTitle x={SECONDARY_ZONE.x + 6} y={SECONDARY_ZONE.y - 4} title={`SECONDARY BUILDING CHW — ${name}`} width={300} />

        <ScadaZonePanel x={PRIMARY_ZONE.x} y={PRIMARY_ZONE.y} width={PRIMARY_ZONE.w} height={PRIMARY_ZONE.h} fill={LOOP.dcs.fill} />
        <ScadaZonePanel x={SECONDARY_ZONE.x} y={SECONDARY_ZONE.y} width={SECONDARY_ZONE.w} height={SECONDARY_ZONE.h} fill={LOOP.chws.fill} />

        {pipes.map((p, i) => (
          <ScadaPipe
            key={`ets-pipe-${i}`}
            d={p.d}
            loop={p.loop}
            flowSpeed={flowSpeed}
            running={flowSpeed > 0}
            width={p.dashed ? 5 : p.loop === 'dcs' || p.loop === 'dcr' ? 10 : 8}
            dashed={p.dashed}
          />
        ))}

        {/* Opaque mask + PHE on top of pipes */}
        <ScadaZonePanel x={PHE.x - 20} y={PHE.y - 16} width={PHE.w + 40} height={PHE.h + 32} fill={SCADA.bg} />
        <rect x={PHE.x - 4} y={PHE.y - 4} width={PHE.w + 8} height={PHE.h + 8} fill={SCADA.bg} stroke="none" rx={4} />
        <PlateHeatExchanger
          branch={branch}
          x={PHE.x}
          y={PHE.y}
          w={PHE.w}
          h={PHE.h}
          selected={selectedId === `hx-${buildingId}`}
          onSelect={onSelect}
          hideLabel
        />
        <PheInfoPlate branch={branch} />

        <HeaderNode x={EQUIP.headerFrom.x} y={EQUIP.headerFrom.y} label="FROM DCS" sub="District header" />
        <HeaderNode x={EQUIP.headerTo.x} y={EQUIP.headerTo.y} label="TO DCR" sub="District header" />

        <LoopTag x={132} y={PRIMARY_Y - 40} text={`DCS ${h.dcsTemp}°C`} loop="dcs" />
        <LoopTag x={680} y={PRIMARY_Y - 40} text={`DCR ${h.dcrTemp}°C`} loop="dcr" />
        <LoopTag x={SECONDARY_ZONE.x + 12} y={SECONDARY_ZONE.y + SECONDARY_ZONE.h - 34} text={`CHWS ${branch.chws}°C`} loop="chws" />
        <LoopTag x={SECONDARY_ZONE.x + SECONDARY_ZONE.w - 88} y={SECONDARY_ZONE.y + SECONDARY_ZONE.h - 34} text={`CHWR ${branch.chwr}°C`} loop="chwr" />

        <FlowMeter
          buildingId={buildingId}
          flowRt={branch.loadRt}
          selected={selectedId === `flow-${buildingId}`}
          onSelect={onSelect}
        />

        <DcsBranchValve
          branch={branch}
          x={EQUIP.valve.x}
          y={EQUIP.valve.y}
          selected={selectedId === `dcv-${buildingId}`}
          onSelect={onSelect}
        />

        <EnergyMeter
          buildingId={buildingId}
          kw={h.pumpPowerKw}
          selected={selectedId === `meter-${buildingId}`}
          onSelect={onSelect}
        />

        <EtsPump
          buildingId={buildingId}
          branch={branch}
          headers={h}
          selected={selectedId === `pump-${buildingId}`}
          onSelect={onSelect}
        />

        <BypassValve
          buildingId={buildingId}
          selected={selectedId === `bypass-${buildingId}`}
          onSelect={onSelect}
        />

        {ahuUnits.map((n, idx) => {
          const ax = EQUIP.ahu.x + idx * EQUIP.ahu.gap;
          const ahuBranch = { ...branch, id: `${buildingId}-${n}`, name: `${branch.name} AHU ${n}` };
          return (
            <DcsAhuCoil
              key={n}
              branch={ahuBranch}
              x={ax}
              y={EQUIP.ahu.y}
              w={EQUIP.ahu.w}
              h={EQUIP.ahu.h}
              selected={selectedId === `ahu-${buildingId}-${n}` || (n === 1 && selectedId === `ahu-${buildingId}`)}
              onSelect={onSelect}
              showTemps={false}
              unitLabel={`AHU ${n}`}
            />
          );
        })}

        {/* Foreground labels — drawn last so nothing covers them */}
        <ScadaZoneTitle x={PHE.x + 20} y={PHE.y - 6} title="PLATE HEAT EXCHANGER (PHE)" width={200} />
        <EtsLegend />

        <text x={ETS_WIDTH / 2} y={ETS_FOOTER_Y} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          {name} ENERGY TRANSFER STATION · DCS {h.dcsTemp}°C / DCR {h.dcrTemp}°C · LOAD {branch.loadRt} RT
        </text>
      </svg>
    </div>
  );
}
