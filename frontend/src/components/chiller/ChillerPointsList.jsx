import React, { useContext, useState } from 'react';
import { HL_CP_RATIO, CHWP_VSD_RATIO, CWP_VSD_RATIO } from '../../services/chiller/t1Snapshot';
import { ROW86_EXPECTED, ROW86_SCENARIO_ID } from '../../services/chiller/t1Row86';
import { T1_MV_ROWS, mvRowById, buildRowReplayPayload } from '../../services/chiller/t1MvRows';

/**
 * Live BMS point list mirroring every column of T1_MVrawDataR2_2025_12
 * (exact dataset point names, including their original naming quirks), with the
 * simulator's current value for each. Unit chips at the top toggle duty ↔
 * standby (which units serve the load-driven staging count).
 *
 * When a dataset-replay scenario (Row 86) is active, every row also shows the
 * measured dataset value and the sim − dataset delta, colour-coded.
 */

const fmt = (v, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—';

/** Measured dataset values for the active replay scenario (null = none). */
const ExpectedContext = React.createContext(null);

function Group({ title, children, defaultOpen = false }) {
  // While a dataset comparison is active all groups start open (the list is
  // remounted on scenario change, so the initial state re-evaluates).
  const comparing = useContext(ExpectedContext) != null;
  const [open, setOpen] = useState(defaultOpen || comparing);
  return (
    <div className="pts-group">
      <button type="button" className="pts-group-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="pts-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="pts-group-body">{children}</div>}
    </div>
  );
}

function Row({ name, value, unit }) {
  const expectedMap = useContext(ExpectedContext);
  const expected = expectedMap ? expectedMap[name] : undefined;
  let comparison = null;
  if (typeof expected === 'number') {
    const sim = parseFloat(value);
    if (Number.isFinite(sim)) {
      const decimals = (String(value).split('.')[1] || '').length;
      const delta = sim - expected;
      const okTol = Math.max(0.05, Math.abs(expected) * 0.005);
      const warnTol = Math.max(0.2, Math.abs(expected) * 0.02);
      const cls =
        Math.abs(delta) <= okTol ? 'ok' : Math.abs(delta) <= warnTol ? 'warn' : 'bad';
      comparison = (
        <span className={`pts-exp ${cls}`}>
          dataset {expected.toFixed(decimals)}
          <em>
            {' '}
            Δ {delta >= 0 ? '+' : '-'}
            {Math.abs(delta).toFixed(decimals)}
          </em>
        </span>
      );
    }
  }
  return (
    <div className={`pts-row ${comparison ? 'pts-row--cmp' : ''}`}>
      <span className="pts-name">{name}</span>
      <span className="pts-value">
        {value}
        {unit ? <em> {unit}</em> : null}
      </span>
      {comparison}
    </div>
  );
}

/** Editable point — a dataset point that IS an operator input (load, CHWS SP).
 *  Commits on Enter / blur through the same constrained control path as the
 *  SCADA panel; all other points stay read-only because they are calculated. */
function EditRow({ name, control, unit, onSet }) {
  const [draft, setDraft] = useState(null);
  if (!control) return null;
  const commit = () => {
    const v = parseFloat(draft);
    if (draft != null && draft !== '' && Number.isFinite(v) && v !== control.value) {
      onSet(control.id, v);
    }
    setDraft(null);
  };
  return (
    <div className="pts-row pts-row--edit">
      <span className="pts-name" title={`Operator input → ${control.label}`}>
        {name} ✎
      </span>
      <span className="pts-value">
        <input
          className="pts-edit-input"
          type="number"
          min={control.min}
          max={control.max}
          step={control.step}
          value={draft ?? String(control.value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {unit ? <em> {unit}</em> : null}
      </span>
    </div>
  );
}

/** Headline sim-vs-dataset line for the active row replay. */
function SummaryLine({ label, sim, expected, decimals }) {
  if (!Number.isFinite(sim)) return null;
  const pct = expected !== 0 ? (100 * (sim - expected)) / Math.abs(expected) : 0;
  const cls = Math.abs(pct) <= 0.5 ? 'ok' : Math.abs(pct) <= 2 ? 'warn' : 'bad';
  return (
    <div className="pts-summary-line">
      <span className="pts-name">{label}</span>
      <span className={`pts-exp ${cls}`}>
        sim {sim.toFixed(decimals)} · dataset {expected.toFixed(decimals)}
        <em>
          {' '}
          ({pct >= 0 ? '+' : ''}
          {pct.toFixed(2)}%)
        </em>
      </span>
    </div>
  );
}

function DutyChips({ label, category, units, runSet, onToggleDuty }) {
  return (
    <div className="pts-duty-row">
      <span className="pts-duty-label">{label}</span>
      <span className="pts-duty-chips">
        {units.map((u) => {
          const on = runSet.has(u);
          return (
            <button
              key={u}
              type="button"
              className={`pts-chip ${on ? 'on' : ''}`}
              title={`${label}-${u}: ${on ? 'running — click to set standby' : 'standby — click to put on duty'}`}
              onClick={() => onToggleDuty(category, u)}
            >
              {u}
            </button>
          );
        })}
      </span>
    </div>
  );
}

export default function ChillerPointsList({
  plantState,
  onToggleDuty,
  onApplyScenario,
  onApplyScenarioPayload,
  onSetControl,
}) {
  const validating = plantState?.simulation?.scenarioId === ROW86_SCENARIO_ID;
  const activeRow = mvRowById(plantState?.simulation?.scenarioId);
  const eq = plantState?.equipment ?? {};
  const ctrl = (id) => (plantState?.controls ?? []).find((c) => c.id === id);
  const headers = plantState?.headers ?? {};
  const kpis = plantState?.kpis ?? [];
  const risers = plantState?.risers ?? [];
  const duty = plantState?.dutyOrders;

  const kval = (id) => {
    const k = kpis.find((x) => x.id === id);
    return typeof k?.value === 'number' ? k.value : NaN;
  };
  const ch = (i) => eq[`ch-${i}`] ?? {};
  const chwp = (i) => eq[`chwp-${i}`] ?? {};
  const cwp = (i) => eq[`cwp-${i}`] ?? {};
  const ct = (i) => eq[`ct-${i}`] ?? {};

  const runSets = duty
    ? {
        chiller: new Set(
          Object.values(eq).filter((e) => e.category === 'chiller' && e.status !== 'stopped').map((e) => Number(e.id.split('-')[1]))
        ),
        chwp: new Set(
          Object.values(eq).filter((e) => e.category === 'chwp' && e.status !== 'stopped').map((e) => Number(e.id.split('-')[1]))
        ),
        cwp: new Set(
          Object.values(eq).filter((e) => e.category === 'cwp' && e.status !== 'stopped').map((e) => Number(e.id.split('-')[1]))
        ),
        ct: new Set(
          Object.values(eq).filter((e) => e.category === 'cooling_tower' && e.status !== 'stopped').map((e) => Number(e.id.split('-')[1]))
        ),
      }
    : null;

  // Dataset naming quirks preserved: CH-4 CP-1 uses underscores, CT-4 uses
  // DPM_CT_04 and VSD_135/246, riser columns carry the original captions.
  const cp1Name = (i) => (i === 4 ? 'DPM_CH-4-CP-1-kW' : `DPM-CH-${i}-CP-1-kW`);
  const ctKwName = (i) => (i === 4 ? 'DPM_CT_04_kW' : `CT_0${i}_DPM_kW`);
  const ctVsdA = (i) => (i === 4 ? 'CT_4_VSD_135_kW' : `CT_${i}_VSD_A_kW`);
  const ctVsdB = (i) => (i === 4 ? 'CT_4_VSD_246_kW' : `CT_${i}_VSD_B_kW`);

  return (
    <ExpectedContext.Provider value={validating ? ROW86_EXPECTED : null}>
    <div className="pts-list" key={validating ? 'validate' : 'live'}>
      <div className="pts-title">BMS POINTS — T1 DATASET</div>

      {onApplyScenarioPayload && (
        <div className={`pts-scenario ${activeRow ? 'active' : ''}`}>
          <select
            className="pts-row-select"
            value={activeRow ? `row-${activeRow.row}` : ''}
            onChange={(e) => {
              const meta = T1_MV_ROWS.find((r) => `row-${r.row}` === e.target.value);
              if (meta) onApplyScenarioPayload(buildRowReplayPayload(meta));
            }}
            title="Replay the measured operator inputs (load, CHWS, CW ΔT, riser shares, duty) of a dataset row and let the physics compute every other point"
          >
            <option value="" disabled>
              ▶ Replay dataset row… (M&amp;V window 00:00–02:12)
            </option>
            {T1_MV_ROWS.map((r) => (
              <option key={r.row} value={`row-${r.row}`}>
                Row {r.row} — {r.time} · {r.loadRt.toFixed(0)} RT · {r.kwRt.toFixed(4)} kW/RT
              </option>
            ))}
          </select>
          {activeRow && (
            <div className="pts-replay-summary">
              <SummaryLine label="kW" sim={kval('kpi-kw')} expected={activeRow.kw} decimals={2} />
              <SummaryLine
                label="kW/RT"
                sim={headers.buildingLoadRt > 0 ? kval('kpi-kw') / headers.buildingLoadRt : NaN}
                expected={activeRow.kwRt}
                decimals={4}
              />
              <SummaryLine label="ΔT" sim={kval('kpi-chw-dt')} expected={activeRow.deltaT} decimals={2} />
            </div>
          )}
          {activeRow && (
            <p className="pts-scenario-hint">
              Inputs = measured row {activeRow.row} ({activeRow.time}); every point below is
              computed by the physics. Row 86 additionally shows per-point dataset deltas:
              <span className="pts-exp ok"> ≤0.5 %</span> ·
              <span className="pts-exp warn"> ≤2 %</span> ·
              <span className="pts-exp bad"> &gt;2 %</span>. Editing any control exits the replay.
            </p>
          )}
        </div>
      )}

      {runSets && onToggleDuty && (
        <div className="pts-duty">
          <DutyChips label="CH" category="chiller" units={[1, 2, 3, 4, 5]} runSet={runSets.chiller} onToggleDuty={onToggleDuty} />
          <DutyChips label="CHWP" category="chwp" units={[1, 2, 3, 4, 5, 6]} runSet={runSets.chwp} onToggleDuty={onToggleDuty} />
          <DutyChips label="CWP" category="cwp" units={[1, 2, 3, 4, 5, 6]} runSet={runSets.cwp} onToggleDuty={onToggleDuty} />
          <DutyChips label="CT" category="ct" units={[1, 2, 3, 4, 5]} runSet={runSets.ct} onToggleDuty={onToggleDuty} />
          <p className="pts-duty-hint">Click a unit to swap duty ↔ standby; how many run stays load-driven.</p>
        </div>
      )}

      <Group title="Plant totals" defaultOpen>
        <Row name="kw" value={fmt(kval('kpi-kw'), 2)} unit="kW" />
        <Row
          name="kw/rt"
          value={fmt(
            headers.buildingLoadRt > 0 ? kval('kpi-kw') / headers.buildingLoadRt : NaN,
            4
          )}
        />
        {onSetControl ? (
          <EditRow name="rt" control={ctrl('ctrl-building-load')} unit="RT" onSet={onSetControl} />
        ) : (
          <Row name="rt" value={fmt(headers.buildingLoadRt, 2)} unit="RT" />
        )}
        <Row name="deltaT" value={fmt(kval('kpi-chw-dt'), 2)} unit="°C" />
      </Group>

      <Group title="Chiller compressor kW (DPM / HL)">
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <Row name={cp1Name(i)} value={fmt(ch(i).cp1Kw)} unit="kW" />
            <Row name={`DPM-CH-${i}-CP-2-kW`} value={fmt(ch(i).cp2Kw)} unit="kW" />
          </React.Fragment>
        ))}
        {/* HL heat-load meters read below the DPM feeders (per-meter ratio from row 1);
            they register 0 for stopped units. */}
        {[1, 2, 3, 4, 5].map((i) => {
          const live = ch(i).status === 'running';
          const r = HL_CP_RATIO[i - 1] ?? [1, 1];
          return (
            <React.Fragment key={`hl${i}`}>
              <Row name={`HL_CH_${i}_CP1_Power`} value={live ? fmt(ch(i).cp1Kw * r[0], 0) : '0'} unit="kW" />
              <Row name={`HL_CH_${i}_CP2_Power`} value={live ? fmt(ch(i).cp2Kw * r[1], 0) : '0'} unit="kW" />
            </React.Fragment>
          );
        })}
      </Group>

      <Group title="Chiller temperatures">
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <Row name={`CH-${i}-ChwSt`} value={fmt(ch(i).supplyTemp)} unit="°C" />
            <Row name={`CH-${i}-ChwRt`} value={fmt(ch(i).returnTemp)} unit="°C" />
            <Row name={`CH-${i}-CwSt`} value={fmt(ch(i).cwSupplyTemp)} unit="°C" />
            <Row name={`CH-${i}-CwRt`} value={fmt(ch(i).cwReturnTemp)} unit="°C" />
          </React.Fragment>
        ))}
      </Group>

      <Group title="Chiller flows">
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <Row name={`CH-${i}-ChwFls`} value={fmt((ch(i).flowRate ?? 0) / 3.6, 2)} unit="L/s" />
            <Row name={`CH-${i}-CwFls`} value={fmt((ch(i).condFlowRate ?? 0) / 3.6, 2)} unit="L/s" />
          </React.Fragment>
        ))}
      </Group>

      {/* VSD readouts differ from the DPM feeder meters (per-meter ratio from
          row 1) and register 0.0 for stopped pumps, exactly as in the dataset. */}
      <Group title="CHWP kW (DPM / VSD)">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Row key={i} name={`DPM-CHWP-${i}-kW`} value={fmt(chwp(i).powerKw)} unit="kW" />
        ))}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Row
            key={`v${i}`}
            name={`CHWP_${i}_VSDkW`}
            value={chwp(i).status === 'running' ? fmt(chwp(i).powerKw * (CHWP_VSD_RATIO[i - 1] ?? 1), 1) : '0.0'}
            unit="kW"
          />
        ))}
      </Group>

      <Group title="CWP kW (DPM / VSD)">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Row key={i} name={`DPM-CWP-${i}-kW`} value={fmt(cwp(i).powerKw)} unit="kW" />
        ))}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Row
            key={`v${i}`}
            name={`CWP_${i}_VSDkW`}
            value={cwp(i).status === 'running' ? fmt(cwp(i).powerKw * (CWP_VSD_RATIO[i - 1] ?? 1), 1) : '0.0'}
            unit="kW"
          />
        ))}
      </Group>

      <Group title="Cooling towers (fans + cells)">
        {[1, 2, 3, 4, 5].map((i) => (
          <Row key={i} name={ctKwName(i)} value={fmt(ct(i).powerKw)} unit="kW" />
        ))}
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={`v${i}`}>
            <Row name={ctVsdA(i)} value={fmt(ct(i).cells?.a?.kw)} unit="kW" />
            <Row name={ctVsdB(i)} value={fmt(ct(i).cells?.b?.kw)} unit="kW" />
          </React.Fragment>
        ))}
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={`t${i}`}>
            <Row name={`CT_${i}A_CWST`} value={fmt(ct(i).cells?.a?.cwst)} unit="°C" />
            <Row name={`CT_${i}B_CWST`} value={fmt(ct(i).cells?.b?.cwst)} unit="°C" />
            <Row name={`CT_${i}A_CWRT`} value={fmt(ct(i).cells?.a?.cwrt)} unit="°C" />
            <Row name={`CT_${i}B_CWRT`} value={fmt(ct(i).cells?.b?.cwrt)} unit="°C" />
          </React.Fragment>
        ))}
      </Group>

      <Group title="CHW risers">
        {risers.map((r) => (
          <React.Fragment key={r.id}>
            <Row name={`CHW-Riser-${r.name}-ChwFls`} value={fmt(r.flowLs, 2)} unit="L/s" />
            <Row name={`CHW-Riser-${r.name}-ChwSt`} value={fmt(r.chwSt)} unit="°C" />
            <Row name={`CHW-Riser-${r.name}-ChwRt`} value={fmt(r.chwRt)} unit="°C" />
          </React.Fragment>
        ))}
      </Group>

      <Group title="Headers">
        <Row name="Header-hcwf" value={fmt((headers.condFlowM3h ?? 0) / 3.6, 2)} unit="L/s" />
        {onSetControl ? (
          <EditRow name="Header-hcwst" control={ctrl('ctrl-chws-sp')} unit="°C" onSet={onSetControl} />
        ) : (
          <Row name="Header-hcwst" value={fmt(headers.chws)} unit="°C" />
        )}
        <Row name="Header-hcwrt" value={fmt(headers.chwr)} unit="°C" />
      </Group>

      <Group title="Wet-bulb sensors">
        {(headers.wetBulbSensors ?? []).map((w, i) => (
          <Row key={i} name={`WST_${i + 1}_WetBulbTemp`} value={fmt(w, 2)} unit="°C" />
        ))}
      </Group>
    </div>
    </ExpectedContext.Provider>
  );
}
