import { LOOP, SCADA } from '../chiller/scadaTheme';

/** Air-loop legend for AHU01 schematic. */
export function AhuScadaLegend() {
  const items = [
    { key: 'ra' as const, stroke: LOOP.chwr.stroke, label: 'RA' },
    { key: 'sa' as const, stroke: LOOP.chws.stroke, label: 'SA' },
    { key: 'oa' as const, stroke: LOOP.cws.stroke, label: 'OA' },
  ];
  return (
    <g className="scada-legend">
      <rect x={12} y={56} width={220} height={22} fill={SCADA.panel} stroke={SCADA.panelBorder} rx={3} opacity={0.95} />
      <text x={22} y={70} fill={SCADA.textMuted} fontSize={9} fontWeight="600">
        AIR LOOP
      </text>
      {items.map((item, i) => (
        <g key={item.key} transform={`translate(${72 + i * 58}, 60)`}>
          <line x1={0} y1={6} x2={18} y2={6} stroke={item.stroke} strokeWidth={4} strokeLinecap="round" />
          <text x={24} y={10} fill={SCADA.text} fontSize={8} fontFamily={SCADA.mono}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}
