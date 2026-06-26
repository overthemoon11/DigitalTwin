import React, { useState } from 'react';

const GROUPS = [
  {
    key: 'energy',
    label: 'Energy & performance',
    ids: ['kpi-load', 'kpi-kw', 'kpi-eff', 'kpi-cop', 'kpi-ch-kwrt', 'kpi-ch-kw', 'kpi-chwp-kw', 'kpi-cwp-kw', 'kpi-ct-kw'],
  },
  {
    key: 'chilled',
    label: 'Chilled water loop',
    ids: ['kpi-chw-dt', 'kpi-chws', 'kpi-chwr', 'kpi-dp', 'kpi-bypass'],
  },
  {
    key: 'condenser',
    label: 'Condenser loop',
    ids: ['kpi-cond-dt', 'kpi-cws', 'kpi-cwr', 'kpi-approach', 'kpi-ct-fan'],
  },
  {
    key: 'ops',
    label: 'Equipment staging',
    ids: ['kpi-rch', 'kpi-rchwp', 'kpi-rcwp', 'kpi-rct', 'kpi-water'],
  },
  {
    key: 'environment',
    label: 'Weather',
    ids: ['kpi-ambient', 'kpi-humidity', 'kpi-wetbulb'],
  },
];

function formatTarget(kpi) {
  const t = kpi.target;
  if (t === '—' || t === '' || t == null) return '—';
  if (typeof t === 'string') return t;
  return `${t}${kpi.unit ? ` ${kpi.unit}` : ''}`;
}

function KpiRow({ kpi }) {
  const status = kpi.status || 'normal';
  return (
    <div className={`ets-kpi-row ${status}`}>
      <span className="ets-kpi-row-label">{kpi.name}</span>
      <span className="ets-kpi-row-value">
        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
        {kpi.unit ? <span className="ets-kpi-row-unit">{kpi.unit}</span> : null}
      </span>
      <span className="ets-kpi-row-target">{formatTarget(kpi)}</span>
    </div>
  );
}

function KpiGroup({ label, items, open, onToggle }) {
  if (!items.length) return null;
  return (
    <section className="ets-kpi-group">
      <button type="button" className="ets-kpi-group-toggle" onClick={onToggle} aria-expanded={open}>
        <span>{open ? '▾' : '▸'} {label}</span>
        <span className="ets-kpi-group-count">{items.length}</span>
      </button>
      {open && (
        <div className="ets-kpi-rows">
          <div className="ets-kpi-row ets-kpi-row-head">
            <span>Metric</span>
            <span>Value</span>
            <span>Target</span>
          </div>
          {items.map((kpi) => <KpiRow key={kpi.id} kpi={kpi} />)}
        </div>
      )}
    </section>
  );
}

/** Grouped KPI panel for L29 chiller plant — expert on-prem metrics. */
export default function ChillerKPIPanel({ kpis }) {
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(GROUPS.map((g) => [g.key, true]))
  );

  const byId = Object.fromEntries((kpis || []).map((k) => [k.id, k]));
  const warnCount = (kpis || []).filter((k) => k.status === 'warning' || k.status === 'critical').length;

  return (
    <div className="ets-kpi-panel chiller-kpi-panel">
      <p className="ets-kpi-panel-hint">
        On-prem plant KPIs (kW/RT, COP, ΔT, approach). Targets per AHRI/ASHRAE water-cooled benchmarks.
        {warnCount > 0 ? ` ${warnCount} off-target.` : ''}
      </p>
      {GROUPS.map((g) => (
        <KpiGroup
          key={g.key}
          label={g.label}
          items={g.ids.map((id) => byId[id]).filter(Boolean)}
          open={openGroups[g.key]}
          onToggle={() => setOpenGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
        />
      ))}
      {!kpis?.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No KPI data yet.</p>
      )}
    </div>
  );
}
