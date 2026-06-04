import { LOOP, SCADA } from './scadaTheme';

export function ScadaLegend() {
  const items = [
    { key: 'cws', ...LOOP.cws },
    { key: 'cwr', ...LOOP.cwr },
    { key: 'chws', ...LOOP.chws },
    { key: 'chwr', ...LOOP.chwr },
    { key: 'makeup', ...LOOP.makeup },
  ];
  return (
    <g className="scada-legend">
      <rect x={12} y={8} width={420} height={22} fill={SCADA.panel} stroke={SCADA.panelBorder} rx={3} opacity={0.95} />
      <text x={22} y={22} fill={SCADA.textMuted} fontSize={9} fontWeight="600">
        LOOP
      </text>
      {items.map((item, i) => (
        <g key={item.key} transform={`translate(${58 + i * 78}, 12)`}>
          <line x1={0} y1={6} x2={18} y2={6} stroke={item.stroke} strokeWidth={4} strokeLinecap="round" />
          <text x={24} y={10} fill={SCADA.text} fontSize={9} fontFamily={SCADA.mono}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}
