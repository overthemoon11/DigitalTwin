import { LOOP, SCADA } from '../chiller/scadaTheme';

/** Loop legend for the ETS station schematic — matches chiller ScadaLegend layout. */
export function EtsScadaLegend() {
  const items = [
    { key: 'chwsAsm' as const, ...LOOP.chwsAsm },
    { key: 'chwrAsm' as const, ...LOOP.chwrAsm },
    { key: 'dcs' as const, ...LOOP.dcs },
    { key: 'dcr' as const, ...LOOP.dcr },
  ];
  return (
    <g className="scada-legend">
      <rect x={12} y={8} width={340} height={22} fill={SCADA.panel} stroke={SCADA.panelBorder} rx={3} opacity={0.95} />
      <text x={22} y={22} fill={SCADA.textMuted} fontSize={9} fontWeight="600">
        LOOP
      </text>
      {items.map((item, i) => (
        <g key={item.key} transform={`translate(${58 + i * 82}, 12)`}>
          <line x1={0} y1={6} x2={18} y2={6} stroke={item.stroke} strokeWidth={4} strokeLinecap="round" />
          <text x={24} y={10} fill={SCADA.text} fontSize={8} fontFamily={SCADA.mono}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}
