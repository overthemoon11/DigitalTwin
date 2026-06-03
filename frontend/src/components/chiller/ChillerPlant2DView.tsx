import { useMemo } from 'react';
import type { PlantEquipment, PlantHeaders, MakeupTankEquipment } from '../../types/plant';
import { PIPE_COLORS } from '../../types/plant';
import { Chiller } from './Chiller';
import { CoolingTower } from './CoolingTower';
import { Pump } from './Pump';
import { Valve } from './Valve';
import { ExpansionTank } from './ExpansionTank';
import { HeaderPipe } from './HeaderPipe';

const FOCUS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'cwmutnk-41-1': { x: 0, y: 0, w: 280, h: 200 },
  'cwmup-1': { x: 0, y: 0, w: 280, h: 200 },
  'ct-41-1': { x: 200, y: 0, w: 500, h: 220 },
  'ch-29-1': { x: 150, y: 200, w: 600, h: 280 },
  'cwp-29-1': { x: 100, y: 160, w: 700, h: 200 },
  'chwp-29-1': { x: 100, y: 400, w: 700, h: 200 },
  default: { x: 0, y: 0, w: 1000, h: 620 },
};

function FlowPipe({ d, color, animated = true }: { d: string; color: string; animated?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={9}
      strokeLinecap="round"
      className={animated ? 'pipe-flow-animated' : undefined}
      opacity={0.9}
    />
  );
}

interface Props {
  equipment: Record<string, PlantEquipment>;
  headers: PlantHeaders | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ChillerPlant2DView({ equipment, headers, selectedId, onSelect }: Props) {
  const viewBox = useMemo(() => {
    const f = (selectedId && FOCUS[selectedId]) || FOCUS.default;
    return `${f.x} ${f.y} ${f.w} ${f.h}`;
  }, [selectedId]);

  const h = headers || { chws: 7, chwr: 12, cws: 29, cwr: 32, buildingLoadRt: 0 };
  const tank = equipment['cwmutnk-41-1'] as MakeupTankEquipment | undefined;

  const get = <T extends PlantEquipment>(id: string) => equipment[id] as T | undefined;

  return (
    <div className="chiller-plant-2d">
      <svg viewBox={viewBox} className="chiller-plant-svg" preserveAspectRatio="xMidYMid meet">
        <rect width="1000" height="620" fill="#0a0e14" />

        {/* Make-up */}
        <text x={80} y={22} fill="#94a3b8" fontSize={10} fontWeight="600">
          MAKE-UP WATER
        </text>
        {tank && (
          <g className="plant-equip" onClick={() => onSelect(tank.id)} style={{ cursor: 'pointer' }}>
            <rect x={24} y={32} width={72} height={70} fill="#1e293b" stroke={tank.lowLevel ? '#ef4444' : '#475569'} rx={4} />
            <rect
              x={28}
              y={32 + (1 - tank.levelPercent / 100) * 66}
              width={64}
              height={(tank.levelPercent / 100) * 66}
              fill="#0ea5e9"
              opacity={0.75}
              className="tank-level-anim"
            />
            <text x={60} y={50} textAnchor="middle" fill="#e2e8f0" fontSize={8} fontWeight="600">
              {tank.name}
            </text>
            <text x={60} y={62} textAnchor="middle" fill="#7dd3fc" fontSize={8} fontFamily="monospace">
              {tank.levelPercent.toFixed(0)}%
            </text>
          </g>
        )}
        <FlowPipe d="M 96 68 L 200 68 L 200 100" color={PIPE_COLORS.makeup} />
        {get('cwmup-1') && (
          <Pump equipment={get('cwmup-1')!} x={170} y={78} selected={selectedId === 'cwmup-1'} onSelect={onSelect} />
        )}
        {get('cwmup-2') && (
          <Pump equipment={get('cwmup-2')!} x={170} y={128} selected={selectedId === 'cwmup-2'} onSelect={onSelect} />
        )}
        <FlowPipe d="M 226 110 L 350 110 L 420 90" color={PIPE_COLORS.makeup} />

        {/* Towers */}
        <FlowPipe d="M 180 90 L 820 90" color={PIPE_COLORS.cws} />
        <FlowPipe d="M 180 250 L 820 250" color={PIPE_COLORS.cwr} />
        {get('ct-41-1') && (
          <CoolingTower equipment={get('ct-41-1')!} x={260} y={28} selected={selectedId === 'ct-41-1'} onSelect={onSelect} />
        )}
        {get('ct-41-2') && (
          <CoolingTower equipment={get('ct-41-2')!} x={460} y={28} selected={selectedId === 'ct-41-2'} onSelect={onSelect} />
        )}
        {get('ct-41-3') && (
          <CoolingTower equipment={get('ct-41-3')!} x={660} y={28} selected={selectedId === 'ct-41-3'} onSelect={onSelect} />
        )}

        {/* CWP */}
        <FlowPipe d="M 300 90 L 300 170" color={PIPE_COLORS.cws} />
        <FlowPipe d="M 500 90 L 500 170" color={PIPE_COLORS.cws} />
        <FlowPipe d="M 700 90 L 700 170" color={PIPE_COLORS.cws} />
        {[260, 460, 660, 760].map((x, i) => {
          const id = `cwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <g key={id}>
              <FlowPipe d={`M ${x + 28} 170 L ${x + 28} 200`} color={PIPE_COLORS.cws} />
              <Pump equipment={p} x={x} y={200} selected={selectedId === id} onSelect={onSelect} />
            </g>
          ) : null;
        })}

        {/* Chillers */}
        <FlowPipe d="M 500 250 L 500 280" color={PIPE_COLORS.cwr} />
        {get('ch-29-1') && (
          <Chiller equipment={get('ch-29-1')!} x={280} y={280} selected={selectedId === 'ch-29-1'} onSelect={onSelect} />
        )}
        {get('ch-29-2') && (
          <Chiller equipment={get('ch-29-2')!} x={456} y={280} selected={selectedId === 'ch-29-2'} onSelect={onSelect} />
        )}
        {get('ch-29-3') && (
          <Chiller equipment={get('ch-29-3')!} x={632} y={280} selected={selectedId === 'ch-29-3'} onSelect={onSelect} />
        )}

        {/* CHWP + headers */}
        <FlowPipe d="M 120 400 L 880 400" color={PIPE_COLORS.chws} />
        <HeaderPipe x={400} y={368} label="CHWS Header" temp={h.chws} loop="chws" width={200} />
        {[260, 460, 660, 760].map((x, i) => {
          const id = `chwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <g key={id}>
              <FlowPipe d={`M ${x + 28} 400 L ${x + 28} 430`} color={PIPE_COLORS.chws} />
              <Pump equipment={p} x={x} y={430} selected={selectedId === id} onSelect={onSelect} />
            </g>
          ) : null;
        })}

        {/* Building load */}
        <FlowPipe d="M 500 458 L 500 480" color={PIPE_COLORS.chws} />
        <rect x={400} y={480} width={200} height={56} fill="#1e293b" stroke={PIPE_COLORS.chws} strokeWidth={2} rx={6} />
        <text x={500} y={504} textAnchor="middle" fill="#e2e8f0" fontSize={12} fontWeight="700">
          Building Load
        </text>
        <text x={500} y={522} textAnchor="middle" fill="#60a5fa" fontSize={11} fontFamily="monospace">
          {h.buildingLoadRt.toFixed(1)} RT
        </text>

        <FlowPipe d="M 120 540 L 880 540" color={PIPE_COLORS.chwr} />
        <HeaderPipe x={400} y={548} label="CHWR Header" temp={h.chwr} loop="chwr" width={200} />
        <FlowPipe d="M 324 540 L 324 352" color={PIPE_COLORS.chwr} />
        <FlowPipe d="M 500 540 L 500 352" color={PIPE_COLORS.chwr} />
        <FlowPipe d="M 676 540 L 676 352" color={PIPE_COLORS.chwr} />

        {/* Expansion + valves */}
        {get('exptnk-01') && (
          <ExpansionTank equipment={get('exptnk-01')!} x={40} y={300} selected={selectedId === 'exptnk-01'} onSelect={onSelect} />
        )}
        {get('exptnk-02') && (
          <ExpansionTank equipment={get('exptnk-02')!} x={40} y={370} selected={selectedId === 'exptnk-02'} onSelect={onSelect} />
        )}
        {get('bv-1') && (
          <Valve equipment={get('bv-1')!} x={900} y={300} selected={selectedId === 'bv-1'} onSelect={onSelect} />
        )}
        {get('bv-2') && (
          <Valve equipment={get('bv-2')!} x={900} y={360} selected={selectedId === 'bv-2'} onSelect={onSelect} />
        )}

        <text x={500} y={610} textAnchor="middle" fill="#475569" fontSize={10}>
          Chiller Plant Room — Level 29
        </text>
      </svg>
    </div>
  );
}
