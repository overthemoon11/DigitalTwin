import React, { useState } from 'react';

const AHU_KPI_GROUPS = [
  {
    key: 'setpoints',
    label: 'ACT vs Setpoint',
    ids: ['ahu-kpi-ra-temp', 'ahu-kpi-ra-rh', 'ahu-kpi-sa-cfm', 'ahu-kpi-ra-cfm'],
    defaultOpen: true,
  },
  {
    key: 'summary',
    label: 'Summary',
    ids: ['ahu-kpi-sat', 'ahu-kpi-chw', 'ahu-kpi-hw', 'ahu-kpi-fan', 'ahu-kpi-cool', 'ahu-kpi-sp'],
    defaultOpen: true,
    compact: 'grid',
  },
];

function formatValue(value) {
  return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value;
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

function AhuKpiGroup({ group, kpisById, open, onToggle }) {
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

export default function AhuKPIPanel({ kpis }) {
  const kpisById = Object.fromEntries((kpis || []).map((k) => [k.id, k]));
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(AHU_KPI_GROUPS.map((g) => [g.key, g.defaultOpen]))
  );
  const warningCount = (kpis || []).filter((k) => k.status === 'warning' || k.status === 'critical').length;

  return (
    <div className="ets-kpi-panel">
      <p className="ets-kpi-panel-hint">
        AHU01 — BMS setpoints & performance
        {warningCount > 0 ? ` · ${warningCount} off-target` : ''}
      </p>
      {AHU_KPI_GROUPS.map((group) => (
        <AhuKpiGroup
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
