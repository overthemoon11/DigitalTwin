import React from 'react';
import { ETS_CONTROL_META } from '../ets/etsControlMeta';
import { getEtsScenarioById } from '../../services/ets/etsScenarios';
import { getAhuScenarioById } from '../../services/ahu/ahuScenarios';

const DC_CONTROL_AFFECTS = {
  'ctrl-dc-load': ['coolingDemandRt', 'building flows', 'pump staging', 'HX duty'],
  'ctrl-dc-occupied': ['effective cooling demand', 'IAQ / comfort outputs'],
  'ctrl-dc-chws-sp': ['CHWS', 'secondary ΔT', 'pump power'],
  'ctrl-dc-dp-sp': ['secondary DP', 'pump speed'],
  'ctrl-dc-pump-min': ['pump speed floor', 'pump power'],
  'ctrl-dc-pump-max': ['pump staging', 'max flow per pump'],
  'ctrl-dc-bypass': ['bypass valve', 'secondary ΔT'],
  'ctrl-dc-contract': ['contract utilization alarms'],
  'ctrl-dc-primary-valve': ['primary flow', 'HX approach'],
  'ctrl-dc-ambient': ['weather-shaped load'],
  'ctrl-dc-humidity': ['condensation risk display'],
  'ctrl-dc-rh-limit': ['comfort RH alarms'],
};

import { CHILLER_CONTROL_META } from '../chiller/chillerControlMeta';

function fmtCell(v, unit) {
  if (v == null || v === '') return '—';
  return `${v}${unit ? ` ${unit}` : ''}`;
}

/** Before → after domino-effect table (falls back to the text trace). */
function DominoEffect({ simulation }) {
  const rows = simulation?.cascadeRows;
  if (rows?.length) {
    const hasBefore = rows.some((r) => r.before != null);
    return (
      <section className="vsp-section">
        <h4>Domino effect{hasBefore ? ' — before → after' : ''}</h4>
        <table className="vsp-cascade-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.changed ? 'changed' : ''}>
                <td className="vsp-ct-param">{r.label}</td>
                <td className="vsp-ct-before">{fmtCell(r.before, r.unit)}</td>
                <td className="vsp-ct-after">{fmtCell(r.after, r.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hasBefore && <p className="vsp-desc">Adjust controls and click Apply to see before → after.</p>}
      </section>
    );
  }
  if (simulation?.cascadeTrace?.length > 0) {
    return (
      <section className="vsp-section">
        <h4>Domino effect</h4>
        <ol className="vsp-cascade">
          {simulation.cascadeTrace.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </section>
    );
  }
  return null;
}

function MetricRow({ label, value, unit, warn, before }) {
  if (value == null || value === '') return null;
  const showBefore = before != null && before !== '' && String(before) !== String(value);
  return (
    <div className={`vsp-metric ${warn ? 'warn' : ''}`}>
      <span className="vsp-metric-label">{label}</span>
      <strong className="vsp-metric-value">
        {value}
        {unit ? <span className="vsp-metric-unit"> {unit}</span> : null}
      </strong>
      {showBefore && (
        <span className="vsp-metric-before">
          from {before}
          {unit ? ` ${unit}` : ''}
        </span>
      )}
    </div>
  );
}

function EtsInsight({ state, simulation }) {
  const headers = state?.headers;
  const bh = simulation?.beforeHeaders;
  const bef = (key) => bh?.[key];
  const meta = simulation?.scenarioId
    ? {
        formula: null,
        affects: ['Scenario-driven plant outputs'],
        description: getEtsScenarioById(simulation.scenarioId)?.description,
      }
    : simulation?.lastControlId
      ? ETS_CONTROL_META[simulation.lastControlId]
      : null;

  const effPct = headers?.effectiveness != null ? `${(headers.effectiveness * 100).toFixed(1)}` : null;

  return (
    <>
      {meta && (
        <section className="vsp-section">
          <h4>Parameters affected</h4>
          {meta.formula && <p className="vsp-formula">ƒ {meta.formula}</p>}
          <ul className="vsp-affects">
            {meta.affects.map((a) => <li key={a}>{a}</li>)}
          </ul>
          {meta.description && <p className="vsp-desc">{meta.description}</p>}
        </section>
      )}
      <DominoEffect simulation={simulation} />
      <section className="vsp-section">
        <h4>Performance & efficiency</h4>
        <div className="vsp-metrics">
          <MetricRow label="Cooling demand" value={headers?.coolingDemandRt} unit="RT" before={bef('coolingDemandRt')} />
          <MetricRow label="HX approach" value={headers?.approachC} unit="°C" warn={headers?.approachC > 2.5} before={bef('approachC')} />
          <MetricRow label="HX effectiveness" value={effPct} unit="%" before={bef('effectiveness') != null ? (bef('effectiveness') * 100).toFixed(1) : undefined} />
          <MetricRow label="Load / capacity" value={headers?.loadPct} unit="%" warn={headers?.loadPct > 95} before={bef('loadPct')} />
          <MetricRow label="Pump power" value={headers?.pumpPowerKw?.toFixed?.(1) ?? headers?.pumpPowerKw} unit="kW" before={bef('pumpPowerKw')?.toFixed?.(1)} />
          <MetricRow label="Pump efficiency" value={headers?.pumpKwPerRt?.toFixed?.(3) ?? headers?.pumpKwPerRt} unit="kW/RT" warn={headers?.pumpKwPerRt > 0.1} before={bef('pumpKwPerRt')?.toFixed?.(3)} />
          <MetricRow label="Pumps online" value={simulation?.stage} unit={`/ ${3}`} before={bef('stage')} />
          <MetricRow label="Primary ΔT" value={headers?.primaryDeltaT} unit="°C" before={bef('primaryDeltaT')} />
          <MetricRow label="Secondary ΔT" value={headers?.secondaryDeltaT} unit="°C" before={bef('secondaryDeltaT')} />
        </div>
      </section>
    </>
  );
}

function AhuInsight({ state, simulation }) {
  const headers = state?.headers;
  const meta = simulation?.scenarioId
    ? { affects: ['Scenario-driven AHU outputs'], description: getAhuScenarioById(simulation.scenarioId)?.description }
    : null;

  return (
    <>
      {meta && (
        <section className="vsp-section">
          <h4>Parameters affected</h4>
          <ul className="vsp-affects">
            {meta.affects.map((a) => <li key={a}>{a}</li>)}
          </ul>
          {meta.description && <p className="vsp-desc">{meta.description}</p>}
        </section>
      )}
      <DominoEffect simulation={simulation} />
      <section className="vsp-section">
        <h4>Performance & efficiency</h4>
        <div className="vsp-metrics">
          <MetricRow label="SA / RA CFM" value={headers ? `${headers.saCfm} / ${headers.raCfm}` : null} />
          <MetricRow label="RA temp / RH" value={headers ? `${headers.ratC}°C / ${headers.raRhPct}%` : null} warn={headers?.ratC > 25.5} />
          <MetricRow label="SAT / MAT" value={headers ? `${headers.satC} / ${headers.matC}°C` : null} />
          <MetricRow label="Cooling duty" value={headers?.coolingKw} unit="kW" />
          <MetricRow label="Fan power" value={headers?.fanPowerKw} unit="kW" />
          <MetricRow label="Fan kW/CFM" value={headers?.kwPerCfm} unit="kW/CFM" />
          <MetricRow label="Static pressure" value={headers?.staticPressurePa} unit="Pa" />
          <MetricRow label="OA fraction" value={headers ? `${(headers.oaFraction * 100).toFixed(0)}` : null} unit="%" />
        </div>
      </section>
    </>
  );
}

function DistrictInsight({ state, simulation }) {
  const headers = state?.headers;
  const affects = simulation?.lastControlId ? DC_CONTROL_AFFECTS[simulation.lastControlId] : null;
  const kwPerRt = state?.kpis?.find((k) => k.id === 'dc-kpi-kwrt')?.value;
  const hxApproach = state?.kpis?.find((k) => k.id === 'dc-kpi-hx')?.value;

  return (
    <>
      {affects && (
        <section className="vsp-section">
          <h4>Parameters affected</h4>
          <ul className="vsp-affects">
            {affects.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>
      )}
      <section className="vsp-section">
        <h4>Performance & efficiency</h4>
        <div className="vsp-metrics">
          <MetricRow label="Cooling demand" value={headers?.coolingDemandRt} unit="RT" />
          <MetricRow label="System efficiency" value={kwPerRt} unit="kW/RT" warn={kwPerRt > 0.35} />
          <MetricRow label="HX approach" value={hxApproach} unit="°C" warn={hxApproach > 2.5} />
          <MetricRow label="Pump power" value={headers?.pumpPowerKw} unit="kW" />
          <MetricRow label="Primary ΔT" value={headers?.primaryDeltaT} unit="°C" />
          <MetricRow label="Secondary ΔT" value={headers?.secondaryDeltaT} unit="°C" />
          <MetricRow label="CHWS / CHWR" value={headers ? `${headers.chws} / ${headers.chwr}` : null} unit="°C" />
        </div>
      </section>
    </>
  );
}

function ChillerInsight({ state, simulation }) {
  const headers = state?.headers;
  const kpis = state?.kpis || [];
  const kpi = (id) => kpis.find((k) => k.id === id)?.value;
  const beforeKpis = simulation?.beforeKpis;
  const bkpi = (id) => beforeKpis?.find((k) => k.id === id)?.value;
  const meta = simulation?.lastControlId ? CHILLER_CONTROL_META[simulation.lastControlId] : null;
  const deltaT = headers ? round(headers.chwr - headers.chws, 1) : null;

  return (
    <>
      {meta && (
        <section className="vsp-section">
          <h4>Parameters affected</h4>
          {meta.formula && <p className="vsp-formula">ƒ {meta.formula}</p>}
          <ul className="vsp-affects">
            {meta.affects.map((a) => <li key={a}>{a}</li>)}
          </ul>
          {meta.description && <p className="vsp-desc">{meta.description}</p>}
        </section>
      )}
      <DominoEffect simulation={simulation} />
      <section className="vsp-section">
        <h4>Performance & efficiency</h4>
        <div className="vsp-metrics">
          <MetricRow label="Building load" value={headers?.buildingLoadRt} unit="RT" before={bkpi('kpi-load')} />
          <MetricRow label="Plant COP" value={typeof kpi('kpi-cop') === 'number' ? kpi('kpi-cop').toFixed(2) : kpi('kpi-cop')} warn={Number(kpi('kpi-cop')) < 4.5} before={bkpi('kpi-cop')} />
          <MetricRow label="Total plant kW" value={kpi('kpi-kw')} unit="kW" before={bkpi('kpi-kw')} />
          <MetricRow label="Plant kW/RT" value={kpi('kpi-eff')} unit="kW/RT" warn={Number(kpi('kpi-eff')) > 0.85} before={bkpi('kpi-eff')} />
          <MetricRow label="CHW ΔT" value={kpi('kpi-chw-dt') ?? deltaT} unit="°C" warn={Number(kpi('kpi-chw-dt') ?? deltaT) < 4.5} before={bkpi('kpi-chw-dt')} />
          <MetricRow label="Tower approach" value={kpi('kpi-approach')} unit="°C" warn={Number(kpi('kpi-approach')) > 5} before={bkpi('kpi-approach')} />
          <MetricRow label="Header DP" value={kpi('kpi-dp')} unit="psi" before={bkpi('kpi-dp')} />
          <MetricRow label="Bypass" value={kpi('kpi-bypass')} unit="%" warn={Number(kpi('kpi-bypass')) > 15} before={bkpi('kpi-bypass')} />
          <MetricRow label="Chillers online" value={kpi('kpi-rch')} before={bkpi('kpi-rch')} />
        </div>
      </section>
    </>
  );
}

function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/**
 * Left-sidebar virtual simulator view — last input, affected parameters, efficiency.
 */
export default function VirtualSimulatorPanel({ plantScenario, state }) {
  const simulation = state?.simulation;
  if (!simulation) {
    return (
      <div className="virtual-simulator-panel">
        <p className="vsp-empty">Waiting for simulator…</p>
      </div>
    );
  }

  const { lastTrigger } = simulation;
  const isEts = plantScenario === 'ets';
  const isAhu = plantScenario === 'ahu';
  const isChiller = plantScenario === 'chiller';

  return (
    <div className="virtual-simulator-panel">
      <div className="vsp-header">
        <span className="vsp-badge">Virtual Simulator</span>
      </div>

      <section className="vsp-section vsp-section--trigger">
        <h4>Last input</h4>
        <p className="vsp-trigger">{lastTrigger}</p>
      </section>

      {isEts && <EtsInsight state={state} simulation={simulation} />}
      {isAhu && <AhuInsight state={state} simulation={simulation} />}
      {!isEts && !isChiller && !isAhu && <DistrictInsight state={state} simulation={simulation} />}
      {isChiller && <ChillerInsight state={state} simulation={simulation} />}

      {state?.recommendedActions?.length > 0 && (
        <section className="vsp-section">
          <h4>Recommended actions</h4>
          <ul className="vsp-actions">
            {state.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      <p className="vsp-footnote">Offline physics model — not live BMS points.</p>
    </div>
  );
}
