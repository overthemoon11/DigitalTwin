import { useMemo } from 'react';
import type { PlantEquipment, PlantHeaders, MakeupTankEquipment, PumpEquipment } from '../../types/plant';
import { Chiller } from './Chiller';
import { CoolingTower } from './CoolingTower';
import { Pump } from './Pump';
import { Valve } from './Valve';
import { ExpansionTank } from './ExpansionTank';
import { HeaderPipe } from './HeaderPipe';
import { ScadaPipe } from './ScadaPipe';
import { ScadaLegend } from './ScadaLegend';
import { ScadaZone } from './ScadaZone';
import { ScadaTag } from './ScadaTag';
import { LOOP, SCADA } from './scadaTheme';

const W = 1040;
const H = 680;

const FOCUS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'cwmutnk-41-1': { x: 0, y: 0, w: 320, h: 220 },
  'ct-41-1': { x: 200, y: 0, w: 520, h: 240 },
  'ch-29-1': { x: 150, y: 200, w: 640, h: 300 },
  'chwp-29-1': { x: 80, y: 380, w: 760, h: 280 },
  default: { x: 0, y: 0, w: W, h: H },
};

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
  onSelect: (id: string) => void;
}

export default function ChillerPlant2DView({ equipment, headers, selectedId, onSelect }: Props) {
  const viewBox = useMemo(() => {
    const f = (selectedId && FOCUS[selectedId]) || FOCUS.default;
    return `${f.x} ${f.y} ${f.w} ${f.h}`;
  }, [selectedId]);

  const h = headers || { chws: 7, chwr: 12, cws: 29, cwr: 32, buildingLoadRt: 0 };
  const tank = equipment['cwmutnk-41-1'] as MakeupTankEquipment | undefined;
  const cwpSpd = avgPumpSpeed(equipment, 'cwp-29', 4);
  const chwpSpd = avgPumpSpeed(equipment, 'chwp-29', 4);
  const ctFan = equipment['ct-41-1'] as { fanSpeedPercent?: number; status?: string } | undefined;
  const ctSpd = ctFan?.status === 'running' ? ctFan.fanSpeedPercent ?? 0 : 0;

  const get = <T extends PlantEquipment>(id: string) => equipment[id] as T | undefined;

  return (
    <div className="chiller-plant-2d">
      <svg viewBox={viewBox} className="chiller-plant-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="scada-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={SCADA.grid} strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={SCADA.bg} />
        <rect width={W} height={H} fill="url(#scada-grid)" opacity={0.4} />

        <ScadaLegend />

        <ScadaZone x={8} y={34} width={200} height={118} title="MAKE-UP WATER" fill={LOOP.makeup.fill} />
        <ScadaZone x={212} y={34} width={816} height={118} title="CONDENSER LOOP — COOLING TOWERS" fill={LOOP.cws.fill} />
        <ScadaZone x={212} y={158} width={816} height={100} title="CONDENSER PUMPS" fill={LOOP.cws.fill} />
        <ScadaZone x={212} y={268} width={816} height={118} title="CHILLERS" fill="rgba(30,41,59,0.35)" />
        <ScadaZone x={8} y={268} width={196} height={200} title="HYDRONIC AUX" fill="rgba(14,165,233,0.04)" />
        <ScadaZone x={212} y={396} width={816} height={250} title="CHILLED WATER LOOP" fill={LOOP.chws.fill} />

        {/* —— PIPING (behind equipment) —— */}
        <ScadaPipe d="M 108 88 L 220 88 L 220 118" loop="makeup" flowSpeed={tank && tank.levelPercent < 35 ? 55 : 0} running={!!tank} />
        <ScadaPipe d="M 248 118 L 400 118 L 480 98" loop="makeup" flowSpeed={20} running />

        <ScadaPipe d="M 240 98 L 920 98" loop="cws" flowSpeed={ctSpd} running={ctSpd > 0} />
        <ScadaPipe d="M 240 248 L 920 248" loop="cwr" flowSpeed={cwpSpd} running={cwpSpd > 0} />

        {[288, 488, 688, 788].map((px) => (
          <ScadaPipe key={`cws-riser-${px}`} d={`M ${px} 98 L ${px} 168`} loop="cws" flowSpeed={cwpSpd} running={cwpSpd > 0} width={8} />
        ))}
        <ScadaPipe d="M 508 248 L 508 278" loop="cwr" flowSpeed={cwpSpd} running={cwpSpd > 0} />

        <ScadaPipe d="M 140 428 L 920 428" loop="chws" flowSpeed={chwpSpd} running={chwpSpd > 0} />
        <ScadaPipe d="M 508 456 L 508 498" loop="chws" flowSpeed={chwpSpd} running={chwpSpd > 0} width={8} />
        <ScadaPipe d="M 140 568 L 920 568" loop="chwr" flowSpeed={chwpSpd} running={chwpSpd > 0} />
        {[332, 508, 684].map((px) => (
          <ScadaPipe key={`chwr-riser-${px}`} d={`M ${px} 568 L ${px} 368`} loop="chwr" flowSpeed={chwpSpd} running={chwpSpd > 0} width={8} />
        ))}

        {/* —— MAKE-UP —— */}
        {tank && (
          <g className="plant-equip scada-makeup-tank" onClick={() => onSelect(tank.id)} style={{ cursor: 'pointer' }}>
            <rect x={28} y={52} width={56} height={72} fill={SCADA.faceplate} stroke={tank.lowLevel ? SCADA.alarm : SCADA.faceplateBorder} rx={3} />
            <rect
              x={32}
              y={52 + (1 - tank.levelPercent / 100) * 68}
              width={48}
              height={(tank.levelPercent / 100) * 68}
              fill="#0ea5e9"
              opacity={0.85}
              className="tank-level-anim"
            />
            <text x={56} y={72} textAnchor="middle" fill={SCADA.tag} fontSize={8} fontFamily={SCADA.mono}>
              {tank.name}
            </text>
            <ScadaTag x={20} y={128} tag="LVL" pv={tank.levelPercent.toFixed(0)} unit="%" alarm={tank.lowLevel} width={72} />
          </g>
        )}
        {get('cwmup-1') && <Pump equipment={get('cwmup-1')!} x={168} y={58} selected={selectedId === 'cwmup-1'} onSelect={onSelect} />}
        {get('cwmup-2') && <Pump equipment={get('cwmup-2')!} x={168} y={118} selected={selectedId === 'cwmup-2'} onSelect={onSelect} />}

        {/* —— TOWERS —— */}
        {get('ct-41-1') && <CoolingTower equipment={get('ct-41-1')!} x={268} y={44} selected={selectedId === 'ct-41-1'} onSelect={onSelect} />}
        {get('ct-41-2') && <CoolingTower equipment={get('ct-41-2')!} x={468} y={44} selected={selectedId === 'ct-41-2'} onSelect={onSelect} />}
        {get('ct-41-3') && <CoolingTower equipment={get('ct-41-3')!} x={668} y={44} selected={selectedId === 'ct-41-3'} onSelect={onSelect} />}

        {/* —— CWP —— */}
        {[268, 468, 668, 768].map((x, i) => {
          const id = `cwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <g key={id}>
              <ScadaPipe d={`M ${x + 30} 168 L ${x + 30} 198`} loop="cws" flowSpeed={p.status === 'running' ? (p as PumpEquipment).speedPercent : 0} running={p.status === 'running'} width={8} />
              <Pump equipment={p} x={x} y={178} selected={selectedId === id} onSelect={onSelect} />
            </g>
          ) : null;
        })}

        {/* —— CHILLERS —— */}
        {get('ch-29-1') && <Chiller equipment={get('ch-29-1')!} x={288} y={288} selected={selectedId === 'ch-29-1'} onSelect={onSelect} />}
        {get('ch-29-2') && <Chiller equipment={get('ch-29-2')!} x={464} y={288} selected={selectedId === 'ch-29-2'} onSelect={onSelect} />}
        {get('ch-29-3') && <Chiller equipment={get('ch-29-3')!} x={640} y={288} selected={selectedId === 'ch-29-3'} onSelect={onSelect} />}

        {/* —— CHWP + headers (tags above pipes) —— */}
        <HeaderPipe x={400} y={388} label="CHWS Header" tagId="CHWS_HDR" temp={h.chws} loop="chws" />
        {[268, 468, 668, 768].map((x, i) => {
          const id = `chwp-29-${i + 1}`;
          const p = get(id);
          return p ? (
            <g key={id}>
              <ScadaPipe d={`M ${x + 30} 428 L ${x + 30} 458`} loop="chws" flowSpeed={(p as PumpEquipment).speedPercent} running={p.status === 'running'} width={8} />
              <Pump equipment={p} x={x} y={458} selected={selectedId === id} onSelect={onSelect} />
            </g>
          ) : null;
        })}

        {/* Building load faceplate */}
        <g className="scada-building-load">
          <rect x={430} y={502} width={140} height={52} fill={SCADA.faceplate} stroke={LOOP.chws.stroke} strokeWidth={2} rx={4} />
          <text x={500} y={520} textAnchor="middle" fill={SCADA.textMuted} fontSize={9} fontWeight="600">
            BUILDING LOAD
          </text>
          <text x={500} y={542} textAnchor="middle" fill={SCADA.pv} fontSize={16} fontWeight="700" fontFamily={SCADA.mono}>
            {h.buildingLoadRt.toFixed(0)}
          </text>
          <text x={500} y={556} textAnchor="middle" fill={SCADA.tag} fontSize={9} fontFamily={SCADA.mono}>
            RT
          </text>
        </g>

        <HeaderPipe x={400} y={528} label="CHWR Header" tagId="CHWR_HDR" temp={h.chwr} loop="chwr" />

        {/* —— AUX —— */}
        {get('exptnk-01') && <ExpansionTank equipment={get('exptnk-01')!} x={44} y={300} selected={selectedId === 'exptnk-01'} onSelect={onSelect} />}
        {get('exptnk-02') && <ExpansionTank equipment={get('exptnk-02')!} x={44} y={380} selected={selectedId === 'exptnk-02'} onSelect={onSelect} />}
        {get('bv-1') && <Valve equipment={get('bv-1')!} x={960} y={310} selected={selectedId === 'bv-1'} onSelect={onSelect} />}
        {get('bv-2') && <Valve equipment={get('bv-2')!} x={960} y={380} selected={selectedId === 'bv-2'} onSelect={onSelect} />}

        <text x={W / 2} y={H - 12} textAnchor="middle" fill={SCADA.textMuted} fontSize={10} fontFamily={SCADA.mono}>
          CHILLER PLANT ROOM · L29 · VIRTUAL SIMULATOR
        </text>
      </svg>
    </div>
  );
}
