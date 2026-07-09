import React, { useState } from 'react';
import { CHILLER_CONTROL_CONSTRAINTS } from '../../services/chillerConstraints';

/** Format a number, or em-dash for non-finite. */
const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');

/**
 * One SCADA parameter row. Editable rows render a numeric input that commits on
 * Enter/blur (clamped to the control's range); reading rows are display-only.
 */
function ScadaRow({ label, value, unit, edit, onSet }) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;

  if (!edit) {
    return (
      <div className="scada-row">
        <span className="scada-row-label">{label}</span>
        <span className="scada-row-read">
          {typeof value === 'number' ? fmt(value, edit?.decimals ?? 1) : value}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    );
  }

  const commit = () => {
    if (draft === null) return;
    let n = parseFloat(draft);
    if (Number.isFinite(n)) {
      if (typeof edit.min === 'number') n = Math.max(edit.min, n);
      if (typeof edit.max === 'number') n = Math.min(edit.max, n);
      onSet(edit.controlId, n);
    }
    setDraft(null);
  };

  return (
    <div className="scada-row scada-row--edit">
      <span className="scada-row-label">{label}</span>
      <span className="scada-input-wrap">
        <input
          className="scada-input"
          type="number"
          inputMode="decimal"
          step={edit.step ?? 1}
          min={edit.min}
          max={edit.max}
          value={editing ? draft : fmt(value, edit.decimals ?? 0)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        {unit ? <span className="scada-row-unit">{unit}</span> : null}
      </span>
    </div>
  );
}

function ScadaBox({ title, rows, onSet }) {
  return (
    <div className="scada-box">
      <div className="scada-box-title">{title}</div>
      <div className="scada-box-body">
        {rows.map((r) => (
          <ScadaRow key={r.label} {...r} onSet={onSet} />
        ))}
      </div>
    </div>
  );
}

const edit = (controlId, extra = {}) => ({
  controlId,
  ...CHILLER_CONTROL_CONSTRAINTS[controlId],
  ...extra,
});

/**
 * Right-sidebar SCADA control panel for the T1 chiller plant. Shows grouped
 * equipment / energy parameter boxes in a 2-column grid. Selected setpoints are
 * editable (commit on Enter/blur) and drive the simulation; everything else is
 * a live reading.
 */
export default function ChillerScadaPanel({ plantState, onSet }) {
  const controls = plantState?.controls ?? [];
  const headers = plantState?.headers ?? {};
  const kpis = plantState?.kpis ?? [];
  const equipment = plantState?.equipment ?? {};

  const cval = (id, d = 0) => {
    const c = controls.find((x) => x.id === id);
    return typeof c?.value === 'number' ? c.value : d;
  };
  const kval = (id) => {
    const k = kpis.find((x) => x.id === id);
    return typeof k?.value === 'number' ? k.value : NaN;
  };
  const avgSpeed = (category) => {
    const on = Object.values(equipment).filter(
      (e) => e.category === category && e.status === 'running' && typeof e.speedPercent === 'number'
    );
    return on.length ? on.reduce((s, e) => s + e.speedPercent, 0) / on.length : 0;
  };
  const sumFlowM3h = (category) =>
    Object.values(equipment)
      .filter((e) => e.category === category && e.status === 'running')
      .reduce((s, e) => s + (typeof e.flowRate === 'number' ? e.flowRate : 0), 0);

  const chwsT = headers.chws;
  const chwrT = headers.chwr;
  const cwsT = headers.cws;
  const cwrT = headers.cwr;
  const chwDt = Number.isFinite(chwrT) && Number.isFinite(chwsT) ? chwrT - chwsT : NaN;
  const cwDt = Number.isFinite(cwrT) && Number.isFinite(cwsT) ? cwrT - cwsT : NaN;
  const chwfLs = sumFlowM3h('chwp') / 3.6; // m³/h → L/s
  const cwfLs = sumFlowM3h('cwp') / 3.6;
  const coolingRt = Number.isFinite(headers.buildingLoadRt) ? headers.buildingLoadRt : kval('kpi-load');
  const ctFanSpd = (() => {
    const ct = equipment['ct-1'];
    return ct?.status === 'running' ? ct.fanSpeedPercent ?? 0 : avgSpeed('cooling_tower');
  })();
  const measuredDp = kval('kpi-dp');

  // Heat balance: rejected ≈ cooling + compressor work.
  const qCoolKw = Number.isFinite(coolingRt) ? coolingRt * 3.517 : NaN;
  const wCompKw = Object.values(equipment)
    .filter((e) => e.type === 'chiller' && e.status === 'running')
    .reduce((s, e) => s + (e.powerKw || 0), 0);
  const qRejKw = cwfLs * 3.6 * cwDt * 1.163; // L/s → m³/h
  const heatBalance = qCoolKw + wCompKw > 0 ? (qRejKw / (qCoolKw + wCompKw)) * 100 : NaN;

  const boxes = [
    {
      title: 'Outdoor Condition',
      rows: [
        { label: 'Outdoor Temp', value: headers.ambientTemp, unit: '°C', edit: edit('ctrl-ambient-temp', { decimals: 1 }) },
        { label: 'Outdoor Humidity', value: headers.humidityRh, unit: '%RH', edit: edit('ctrl-humidity', { decimals: 0 }) },
        { label: 'Wet Bulb', value: kval('kpi-wetbulb'), unit: '°C' },
      ],
    },
    {
      title: 'CHWP Control',
      rows: [
        { label: 'CHWP VSD CMD', value: avgSpeed('chwp'), unit: '%', edit: edit('ctrl-pump-spd') },
        { label: 'Med Rise DP Setpoint', value: cval('ctrl-dp-sp'), unit: 'psi', edit: edit('ctrl-dp-sp') },
        { label: 'Med Rise DP', value: measuredDp, unit: 'psi' },
        { label: 'High Rise DP Setpoint', value: cval('ctrl-dp-sp-high'), unit: 'psi', edit: edit('ctrl-dp-sp-high') },
        { label: 'High Rise DP', value: measuredDp, unit: 'psi' },
      ],
    },
    {
      title: 'CWP Control',
      rows: [
        { label: 'CWP VSD CMD', value: avgSpeed('cwp'), unit: '%', edit: edit('ctrl-cwp-spd') },
        { label: 'CW Differential Temp Setpoint', value: cval('ctrl-cw-dt-sp'), unit: '°C', edit: edit('ctrl-cw-dt-sp', { decimals: 1 }) },
        { label: 'CW Differential Temp', value: cwDt, unit: '°C' },
        { label: 'CWS Header', value: cwsT, unit: '°C' },
        { label: 'CWR Header', value: cwrT, unit: '°C' },
      ],
    },
    {
      title: 'CT Control',
      rows: [
        { label: 'CT VSD CMD', value: ctFanSpd, unit: '%', edit: edit('ctrl-ct-fan') },
        { label: 'CWS Header Setpoint', value: cval('ctrl-cws-sp'), unit: '°C', edit: edit('ctrl-cws-sp', { decimals: 1 }) },
        { label: 'CWS Header', value: cwsT, unit: '°C' },
      ],
    },
    {
      title: 'Cooling Load',
      rows: [
        { label: 'CHWS Header', value: chwsT, unit: '°C' },
        { label: 'CHWR Header', value: chwrT, unit: '°C' },
        { label: 'CHW Differential Temp', value: chwDt, unit: '°C' },
        { label: 'CHWF', value: chwfLs, unit: 'L/s' },
        { label: 'Cooling Load', value: coolingRt, unit: 'RT', edit: edit('ctrl-building-load', { decimals: 0 }) },
      ],
    },
    {
      title: 'Heat Rejected',
      rows: [
        { label: 'CWS Header', value: cwsT, unit: '°C' },
        { label: 'CWR Header', value: cwrT, unit: '°C' },
        { label: 'CW Differential Temp', value: cwDt, unit: '°C' },
        { label: 'CWF', value: cwfLs, unit: 'L/s' },
      ],
    },
    {
      title: 'Heat Balance',
      rows: [{ label: 'Heat Balance', value: heatBalance, unit: '%' }],
    },
  ];

  return (
    <div className="scada-panel">
      <div className="scada-grid">
        {boxes.map((b) => (
          <ScadaBox key={b.title} title={b.title} rows={b.rows} onSet={onSet} />
        ))}
      </div>
    </div>
  );
}
