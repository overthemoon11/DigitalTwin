import React, { useState } from 'react';

/** Compact grouped layout for ETS A-B03-01 — avoids 19 full KPI cards in one list. */
const ETS_KPI_GROUPS = [
  {
    key: 'summary',
    label: 'Summary',
    ids: ['ets-kpi-load', 'ets-kpi-kw', 'ets-kpi-capacity', 'ets-kpi-approach', 'ets-kpi-sec-dt', 'ets-kpi-hxcop'],
    defaultOpen: true,
    compact: 'grid',
  },
  {
    key: 'hx',
    label: 'Heat exchanger',
    ids: ['ets-kpi-return-approach', 'ets-kpi-eff'],
    defaultOpen: false,
  },
  {
    key: 'temps',
    label: 'Temperatures',
    ids: ['ets-kpi-chws', 'ets-kpi-dcs', 'ets-kpi-pri-dt'],
    defaultOpen: false,
  },
  {
    key: 'flows',
    label: 'Flows & hydraulics',
    ids: ['ets-kpi-pri-flow', 'ets-kpi-sec-flow', 'ets-kpi-flow-ratio', 'ets-kpi-lt-bypass', 'ets-kpi-lt-flow', 'ets-kpi-dp'],
    defaultOpen: false,
  },
  {
    key: 'pumping',
    label: 'Pumping & energy',
    ids: ['ets-kpi-stage', 'ets-kpi-pumpkw', 'ets-kpi-pumpeff'],
    defaultOpen: false,
  },
];

function formatValue(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function formatTarget(kpi) {
  const t = kpi.target;
  const u = kpi.unit;
  if (typeof t === 'string') return t;
  if (!u) return String(t);
  return `${t} ${u}`;
}

function KpiRow({ kpi }) {
  const status = kpi.status === 'warning' || kpi.status === 'critical' ? kpi.status : '';
  return (
    <div className={`ets-kpi-row ${status}`}>
      <span className="ets-kpi-row-label">{kpi.name}</span>
      <span className="ets-kpi-row-value">
        {formatValue(kpi.value)}
        {kpi.unit ? <span className="ets-kpi-row-unit">{kpi.unit}</span> : null}
      </span>
      <span className="ets-kpi-row-target">{formatTarget(kpi)}</span>
    </div>
  );
}

function KpiRowsHeader() {
  return (
    <div className="ets-kpi-row ets-kpi-row-head">
      <span>Metric</span>
      <span>Actual</span>
      <span>Target</span>
    </div>
  );
}

function KpiTile({ kpi }) {
  const status = kpi.status === 'warning' || kpi.status === 'critical' ? kpi.status : '';
  return (
    <div className={`ets-kpi-tile ${status}`}>
      <div className="ets-kpi-tile-label">{kpi.name}</div>
      <div className="ets-kpi-tile-value">
        {formatValue(kpi.value)}
        {kpi.unit ? <span className="ets-kpi-row-unit">{kpi.unit}</span> : null}
      </div>
      <div className="ets-kpi-tile-target">Target {formatTarget(kpi)}</div>
    </div>
  );
}

function EtsKpiGroup({ group, kpisById, open, onToggle }) {
  const items = group.ids.map((id) => kpisById[id]).filter(Boolean);
  if (!items.length) return null;

  return (
    <section className="ets-kpi-group">
      <button type="button" className="ets-kpi-group-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? '▾' : '▸'} {group.label}
        <span className="ets-kpi-group-count">{items.length}</span>
      </button>
      {open && (
        group.compact === 'grid' ? (
          <div className="ets-kpi-tile-grid">
            {items.map((kpi) => <KpiTile key={kpi.id} kpi={kpi} />)}
          </div>
        ) : (
          <div className="ets-kpi-rows">
            <KpiRowsHeader />
            {items.map((kpi) => <KpiRow key={kpi.id} kpi={kpi} />)}
          </div>
        )
      )}
    </section>
  );
}

export default function EtsKPIPanel({ kpis }) {
  const kpisById = Object.fromEntries((kpis || []).map((k) => [k.id, k]));
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(ETS_KPI_GROUPS.map((g) => [g.key, g.defaultOpen]))
  );

  const warningCount = (kpis || []).filter((k) => k.status === 'warning' || k.status === 'critical').length;

  return (
    <div className="ets-kpi-panel">
      <p className="ets-kpi-panel-hint">
        On-prem ETS performance indicators
        {warningCount > 0 ? ` · ${warningCount} alert${warningCount > 1 ? 's' : ''}` : ''}
      </p>
      {ETS_KPI_GROUPS.map((group) => (
        <EtsKpiGroup
          key={group.key}
          group={group}
          kpisById={kpisById}
          open={!!openGroups[group.key]}
          onToggle={() => setOpenGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
        />
      ))}
    </div>
  );
}
