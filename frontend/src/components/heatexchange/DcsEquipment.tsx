import type { DcsBuildingBranch } from '../../types/districtCooling';
import { EquipLabel } from '../chiller/EquipLabel';
import { SCADA, statusFill } from '../chiller/scadaTheme';

interface Props {
  branch: DcsBuildingBranch;
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  onSelect: (id: string) => void;
  hideLabel?: boolean;
}

/** Plate heat exchanger symbol (ETS) */
export function PlateHeatExchanger({ branch, x, y, w, h, selected, onSelect, hideLabel = false }: Props) {
  const fill = statusFill(branch.status);
  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <g
      className="plant-equip scada-hx"
      onClick={() => onSelect(`hx-${branch.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={SCADA.faceplate}
        stroke={selected ? SCADA.selected : fill}
        strokeWidth={selected ? 2.5 : 2}
        rx={4}
      />
      <line x1={x + 14} y1={y + 14} x2={x + w - 14} y2={y + h - 14} stroke="#94a3b8" strokeWidth={2} />
      <line x1={x + 14} y1={y + h - 14} x2={x + w - 14} y2={y + 14} stroke="#94a3b8" strokeWidth={2} />
      <rect x={cx - 18} y={cy - 8} width={36} height={14} fill={SCADA.faceplate} rx={2} />
      <text x={cx} y={cy + 4} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontWeight="700">
        PHE
      </text>
      {!hideLabel && (
        <EquipLabel
          iconX={x}
          iconY={y}
          iconW={w}
          iconH={h}
          plateW={118}
          lines={[
            { text: `HX — ${branch.name}`, variant: 'tag' },
            { text: `Approach ${branch.hxApproach}°C`, variant: 'pv' },
            { text: `${branch.loadRt} RT`, variant: 'muted' },
          ]}
        />
      )}
    </g>
  );
}

interface BuildingProps {
  branch: DcsBuildingBranch;
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  onSelect: (id: string) => void;
  showTemps?: boolean;
  unitLabel?: string;
}

export function DcsBuildingBlock({ branch, x, y, w, h, selected, onSelect }: BuildingProps) {
  return (
    <g
      className="plant-equip scada-dcs-building"
      onClick={() => onSelect(branch.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={SCADA.faceplate}
        stroke={selected ? SCADA.selected : SCADA.faceplateBorder}
        strokeWidth={selected ? 2.5 : 1.5}
        rx={4}
      />
      <text x={x + w / 2} y={y + 28} textAnchor="middle" fill={SCADA.tag} fontSize={11} fontWeight="700">
        {branch.name}
      </text>
      <text x={x + w / 2} y={y + 48} textAnchor="middle" fill={SCADA.pv} fontSize={14} fontWeight="700" fontFamily={SCADA.mono}>
        {branch.loadRt}
      </text>
      <text x={x + w / 2} y={y + 62} textAnchor="middle" fill={SCADA.textMuted} fontSize={8}>
        RT LOAD
      </text>
    </g>
  );
}

export function DcsAhuCoil({ branch, x, y, w, h, selected, onSelect, showTemps = true, unitLabel }: BuildingProps) {
  const cx = x + w / 2;
  return (
    <g
      className="plant-equip scada-ahu-coil"
      onClick={() => onSelect(`ahu-${branch.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={SCADA.faceplate}
        stroke={selected ? SCADA.selected : '#d97706'}
        strokeWidth={selected ? 2.5 : 1.5}
        rx={4}
      />
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={x + 16}
          y1={y + 14 + i * 12}
          x2={x + w - 16}
          y2={y + 14 + i * 12}
          stroke="#f59e0b"
          strokeWidth={2}
        />
      ))}
      <text x={cx} y={y + h - 8} textAnchor="middle" fill={SCADA.textMuted} fontSize={8} fontWeight="600">
        {unitLabel ?? 'AHU / FCU'}
      </text>
      {showTemps && (
        <EquipLabel
          iconX={x}
          iconY={y}
          iconW={w}
          iconH={h}
          side="left"
          plateW={100}
          lines={[
            { text: `CHWS ${branch.chws}°C`, variant: 'pv' },
            { text: `CHWR ${branch.chwr}°C`, variant: 'muted' },
          ]}
        />
      )}
    </g>
  );
}

interface ValveProps {
  branch: DcsBuildingBranch;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function DcsBranchValve({ branch, x, y, selected, onSelect }: ValveProps) {
  const cx = x + 20;
  const cy = y + 16;
  const open = branch.valvePct;

  return (
    <g
      className="plant-equip scada-valve"
      onClick={() => onSelect(`dcv-${branch.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <line x1={x} y1={cy} x2={x + 40} y2={cy} stroke="#475569" strokeWidth={4} strokeLinecap="round" />
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill={SCADA.faceplate}
        stroke={selected ? SCADA.selected : SCADA.running}
        strokeWidth={selected ? 2.5 : 2}
      />
      <line
        x1={cx - 8}
        y1={cy}
        x2={cx + 8}
        y2={cy}
        stroke={SCADA.running}
        strokeWidth={3}
        transform={`rotate(${open * 0.9 - 45}, ${cx}, ${cy})`}
      />
    </g>
  );
}
