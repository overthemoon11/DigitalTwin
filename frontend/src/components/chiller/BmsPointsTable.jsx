import React, { useEffect, useMemo, useState } from "react";
import { useTwinStore } from "../../store/useTwinStore";
import * as simulationApi from "../../api/simulationApi";
import { Card, CardHead, StatusPill } from "../ui/Primitives";
import { SearchIcon } from "../ui/TwIcons";

/**
 * Every column of T1_MVrawDataR2_2025_12, with the twin's current value beside
 * it — as a real table rather than a 300px stack of collapsible groups.
 *
 * The dataset's original naming quirks are preserved exactly (CH-4 CP-1 uses
 * underscores, CT-4 uses DPM_CT_04 and VSD_135/246, the riser captions keep
 * their site spelling). A "tidied" tag would not match the site's BMS and the
 * list would stop being a mapping.
 *
 * The Equipment column is derived from the tag itself, not from a lookup table
 * of invented descriptions: there is no point metadata in this dataset beyond
 * the column name, and inventing some would be a fabrication.
 *
 * When a dataset-replay scenario is active every row also shows the measured
 * value and the sim − dataset delta, colour-coded.
 */

/** Show the "Replay dataset row…" validation picker. Set true to re-enable. */
const SHOW_ROW_REPLAY = false;

const fmt = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

/** Which machine a tag belongs to, read off the tag. */
function equipmentOf(tag) {
  let match = /^(?:DPM[-_])?(CH)[-_](\d)/i.exec(tag) || /^HL_CH_(\d)/i.exec(tag);
  if (/^HL_CH_/i.test(tag)) return `CH-${/^HL_CH_(\d)/i.exec(tag)[1]}`;
  if (match) return `CH-${match[2]}`;
  match = /^(?:DPM-)?CHWP[-_](\d)/i.exec(tag);
  if (match) return `CHWP-${match[1]}`;
  match = /^(?:DPM-)?CWP[-_](\d)/i.exec(tag);
  if (match) return `CWP-${match[1]}`;
  match = /^CT[-_]?(\d)/i.exec(tag) || /^DPM_CT_0(\d)/i.exec(tag);
  if (match) return `CT-${match[1]}`;
  if (/^CHW-Riser-/i.test(tag)) return tag.replace(/^CHW-Riser-/i, "").replace(/-Chw.*$/i, "");
  if (/^Header-/i.test(tag)) return "Header";
  if (/^WST_/i.test(tag)) return `WST-${/^WST_(\d)/.exec(tag)?.[1] ?? ""}`;
  return "Plant";
}

function DutyChips({ label, category, units, runSet, onToggleDuty }) {
  return (
    <div className="bms-duty-row">
      <span className="bms-duty-label">{label}</span>
      <span className="eng-chips">
        {units.map((unit) => {
          const on = runSet.has(unit);
          return (
            <button
              key={unit}
              type="button"
              className="eng-chip"
              aria-pressed={on}
              title={`${label}-${unit}: ${on ? "running — click to set standby" : "standby — click to put on duty"}`}
              onClick={() => onToggleDuty(category, unit)}
            >
              {unit}
            </button>
          );
        })}
      </span>
    </div>
  );
}

function EditCell({ control, onSet }) {
  const [draft, setDraft] = useState(null);
  if (!control) return <span className="muted">—</span>;
  const commit = () => {
    const v = parseFloat(draft);
    if (draft != null && draft !== "" && Number.isFinite(v) && v !== control.value) onSet(control.id, v);
    setDraft(null);
  };
  return (
    <input
      className="scada-input bms-edit"
      type="number"
      min={control.min}
      max={control.max}
      step={control.step}
      aria-label={control.label}
      value={draft ?? String(control.value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

export default function BmsPointsTable({ plantState, onToggleDuty, onSetControl }) {
  const meterRatios = useTwinStore((st) => st.plantConfig?.meterRatios);
  const validationCfg = useTwinStore((st) => st.plantConfig?.validation);
  const HL_CP_RATIO = meterRatios?.hlCp ?? [];
  const CHWP_VSD_RATIO = meterRatios?.chwpVsd ?? [];
  const CWP_VSD_RATIO = meterRatios?.cwpVsd ?? [];
  const ROW86_EXPECTED = validationCfg?.row86Expected ?? null;

  const [datasetRows, setDatasetRows] = useState([]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");

  useEffect(() => {
    if (!SHOW_ROW_REPLAY) return undefined;
    let alive = true;
    simulationApi
      .fetchDatasetRows()
      .then((d) => alive && setDatasetRows(d.rows))
      .catch(() => alive && setDatasetRows([]));
    return () => {
      alive = false;
    };
  }, []);

  const scenarioId = plantState?.simulation?.scenarioId;
  const comparing = scenarioId === validationCfg?.row86ScenarioId ? ROW86_EXPECTED : null;
  const activeRow = datasetRows.find((r) => r.scenarioId === scenarioId);

  const groups = useMemo(() => {
    const eq = plantState?.equipment ?? {};
    const headers = plantState?.headers ?? {};
    const kpis = plantState?.kpis ?? [];
    const risers = plantState?.risers ?? [];
    const ctrl = (id) => (plantState?.controls ?? []).find((c) => c.id === id);
    const kval = (id) => {
      const k = kpis.find((x) => x.id === id);
      return typeof k?.value === "number" ? k.value : NaN;
    };
    const ch = (i) => eq[`ch-${i}`] ?? {};
    const chwp = (i) => eq[`chwp-${i}`] ?? {};
    const cwp = (i) => eq[`cwp-${i}`] ?? {};
    const ct = (i) => eq[`ct-${i}`] ?? {};

    // Dataset naming quirks preserved exactly.
    const cp1Name = (i) => (i === 4 ? "DPM_CH-4-CP-1-kW" : `DPM-CH-${i}-CP-1-kW`);
    const ctKwName = (i) => (i === 4 ? "DPM_CT_04_kW" : `CT_0${i}_DPM_kW`);
    const ctVsdA = (i) => (i === 4 ? "CT_4_VSD_135_kW" : `CT_${i}_VSD_A_kW`);
    const ctVsdB = (i) => (i === 4 ? "CT_4_VSD_246_kW" : `CT_${i}_VSD_B_kW`);

    const five = [1, 2, 3, 4, 5];
    const six = [1, 2, 3, 4, 5, 6];
    const row = (tag, value, unit, extra = {}) => ({ tag, value, unit, ...extra });

    return [
      {
        id: "totals",
        title: "Plant totals",
        points: [
          row("kw", fmt(kval("kpi-kw"), 2), "kW"),
          row("kw/rt", fmt(headers.buildingLoadRt > 0 ? kval("kpi-kw") / headers.buildingLoadRt : NaN, 4), ""),
          onSetControl
            ? row("rt", null, "RT", { control: ctrl("ctrl-building-load") })
            : row("rt", fmt(headers.buildingLoadRt, 2), "RT"),
          row("deltaT", fmt(kval("kpi-chw-dt"), 2), "°C"),
        ],
      },
      {
        id: "chiller-kw",
        title: "Chiller compressor kW (DPM / HL)",
        points: [
          ...five.flatMap((i) => [
            row(cp1Name(i), fmt(ch(i).cp1Kw), "kW"),
            row(`DPM-CH-${i}-CP-2-kW`, fmt(ch(i).cp2Kw), "kW"),
          ]),
          // HL heat-load meters read below the DPM feeders (per-meter ratio
          // from row 1); they register 0 for stopped units.
          ...five.flatMap((i) => {
            const live = ch(i).status === "running";
            const r = HL_CP_RATIO[i - 1] ?? [1, 1];
            return [
              row(`HL_CH_${i}_CP1_Power`, live ? fmt(ch(i).cp1Kw * r[0], 0) : "0", "kW"),
              row(`HL_CH_${i}_CP2_Power`, live ? fmt(ch(i).cp2Kw * r[1], 0) : "0", "kW"),
            ];
          }),
        ],
      },
      {
        id: "chiller-temp",
        title: "Chiller temperatures",
        points: five.flatMap((i) => [
          row(`CH-${i}-ChwSt`, fmt(ch(i).supplyTemp), "°C"),
          row(`CH-${i}-ChwRt`, fmt(ch(i).returnTemp), "°C"),
          row(`CH-${i}-CwSt`, fmt(ch(i).cwSupplyTemp), "°C"),
          row(`CH-${i}-CwRt`, fmt(ch(i).cwReturnTemp), "°C"),
        ]),
      },
      {
        id: "chiller-flow",
        title: "Chiller flows",
        points: five.flatMap((i) => [
          row(`CH-${i}-ChwFls`, fmt((ch(i).flowRate ?? 0) / 3.6, 2), "L/s"),
          row(`CH-${i}-CwFls`, fmt((ch(i).condFlowRate ?? 0) / 3.6, 2), "L/s"),
        ]),
      },
      {
        id: "chwp",
        title: "CHWP kW (DPM / VSD)",
        points: [
          ...six.map((i) => row(`DPM-CHWP-${i}-kW`, fmt(chwp(i).powerKw), "kW")),
          // VSD readouts differ from the DPM feeder meters and register 0.0 for
          // stopped pumps, exactly as in the dataset.
          ...six.map((i) =>
            row(
              `CHWP_${i}_VSDkW`,
              chwp(i).status === "running" ? fmt(chwp(i).powerKw * (CHWP_VSD_RATIO[i - 1] ?? 1), 1) : "0.0",
              "kW"
            )
          ),
        ],
      },
      {
        id: "cwp",
        title: "CWP kW (DPM / VSD)",
        points: [
          ...six.map((i) => row(`DPM-CWP-${i}-kW`, fmt(cwp(i).powerKw), "kW")),
          ...six.map((i) =>
            row(
              `CWP_${i}_VSDkW`,
              cwp(i).status === "running" ? fmt(cwp(i).powerKw * (CWP_VSD_RATIO[i - 1] ?? 1), 1) : "0.0",
              "kW"
            )
          ),
        ],
      },
      {
        id: "towers",
        title: "Cooling towers (fans + cells)",
        points: [
          ...five.map((i) => row(ctKwName(i), fmt(ct(i).powerKw), "kW")),
          ...five.flatMap((i) => [
            row(ctVsdA(i), fmt(ct(i).cells?.a?.kw), "kW"),
            row(ctVsdB(i), fmt(ct(i).cells?.b?.kw), "kW"),
          ]),
          ...five.flatMap((i) => [
            row(`CT_${i}A_CWST`, fmt(ct(i).cells?.a?.cwst), "°C"),
            row(`CT_${i}B_CWST`, fmt(ct(i).cells?.b?.cwst), "°C"),
            row(`CT_${i}A_CWRT`, fmt(ct(i).cells?.a?.cwrt), "°C"),
            row(`CT_${i}B_CWRT`, fmt(ct(i).cells?.b?.cwrt), "°C"),
          ]),
        ],
      },
      {
        id: "risers",
        title: "CHW risers",
        points: risers.flatMap((r) => [
          row(`CHW-Riser-${r.name}-ChwFls`, fmt(r.flowLs, 2), "L/s"),
          row(`CHW-Riser-${r.name}-ChwSt`, fmt(r.chwSt), "°C"),
          row(`CHW-Riser-${r.name}-ChwRt`, fmt(r.chwRt), "°C"),
        ]),
      },
      {
        id: "headers",
        title: "Headers",
        points: [
          row("Header-hcwf", fmt((headers.condFlowM3h ?? 0) / 3.6, 2), "L/s"),
          onSetControl
            ? row("Header-hcwst", null, "°C", { control: ctrl("ctrl-chws-sp") })
            : row("Header-hcwst", fmt(headers.chws), "°C"),
          row("Header-hcwrt", fmt(headers.chwr), "°C"),
        ],
      },
      {
        id: "wetbulb",
        title: "Wet-bulb sensors",
        points: (headers.wetBulbSensors ?? []).map((w, i) => row(`WST_${i + 1}_WetBulbTemp`, fmt(w, 2), "°C")),
      },
    ];
  }, [plantState, HL_CP_RATIO, CHWP_VSD_RATIO, CWP_VSD_RATIO, onSetControl]);

  const needle = query.trim().toLowerCase();
  const visible = groups
    .filter((g) => group === "all" || g.id === group)
    .map((g) => ({
      ...g,
      points: g.points.filter(
        (p) => !needle || p.tag.toLowerCase().includes(needle) || equipmentOf(p.tag).toLowerCase().includes(needle)
      ),
    }))
    .filter((g) => g.points.length > 0);

  const total = groups.reduce((n, g) => n + g.points.length, 0);
  const shown = visible.reduce((n, g) => n + g.points.length, 0);

  const eq = plantState?.equipment ?? {};
  const duty = plantState?.dutyOrders;
  const runSets = duty
    ? {
        chiller: new Set(
          Object.values(eq).filter((e) => e.category === "chiller" && e.status !== "stopped").map((e) => Number(e.id.split("-")[1]))
        ),
        chwp: new Set(
          Object.values(eq).filter((e) => e.category === "chwp" && e.status !== "stopped").map((e) => Number(e.id.split("-")[1]))
        ),
        cwp: new Set(
          Object.values(eq).filter((e) => e.category === "cwp" && e.status !== "stopped").map((e) => Number(e.id.split("-")[1]))
        ),
        ct: new Set(
          Object.values(eq).filter((e) => e.category === "cooling_tower" && e.status !== "stopped").map((e) => Number(e.id.split("-")[1]))
        ),
      }
    : null;

  const comparisonFor = (tag, value) => {
    if (!comparing) return null;
    const expected = comparing[tag];
    if (typeof expected !== "number") return null;
    const sim = parseFloat(value);
    if (!Number.isFinite(sim)) return null;
    const decimals = (String(value).split(".")[1] || "").length;
    const delta = sim - expected;
    const okTol = Math.max(0.05, Math.abs(expected) * 0.005);
    const warnTol = Math.max(0.2, Math.abs(expected) * 0.02);
    const tone = Math.abs(delta) <= okTol ? "ok" : Math.abs(delta) <= warnTol ? "warn" : "bad";
    return {
      tone,
      expected: expected.toFixed(decimals),
      delta: `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(decimals)}`,
    };
  };

  return (
    <div className="an-stack">
      {runSets && onToggleDuty && (
        <Card>
          <CardHead
            eyebrow="Duty selection"
            title="Which units serve the load"
            tight
            subtitle="Click a unit to swap duty ↔ standby. How many run stays load-driven — this only chooses which machines."
          />
          <div className="bms-duty">
            <DutyChips label="CH" category="chiller" units={[1, 2, 3, 4, 5]} runSet={runSets.chiller} onToggleDuty={onToggleDuty} />
            <DutyChips label="CHWP" category="chwp" units={[1, 2, 3, 4, 5, 6]} runSet={runSets.chwp} onToggleDuty={onToggleDuty} />
            <DutyChips label="CWP" category="cwp" units={[1, 2, 3, 4, 5, 6]} runSet={runSets.cwp} onToggleDuty={onToggleDuty} />
            <DutyChips label="CT" category="ct" units={[1, 2, 3, 4, 5]} runSet={runSets.ct} onToggleDuty={onToggleDuty} />
          </div>
        </Card>
      )}

      {SHOW_ROW_REPLAY && datasetRows.length > 0 && (
        <Card>
          <CardHead eyebrow="Validation" title="Replay a measured dataset row" tight />
          <select
            className="scada-input"
            value={activeRow ? activeRow.scenarioId : ""}
            onChange={(e) => {
              const meta = datasetRows.find((r) => r.scenarioId === e.target.value);
              if (meta) simulationApi.replayDatasetRow(meta.row).catch(() => {});
            }}
          >
            <option value="" disabled>
              Replay dataset row… (M&amp;V window 00:00–02:12)
            </option>
            {datasetRows.map((r) => (
              <option key={r.row} value={r.scenarioId}>
                Row {r.row} — {r.time} · {r.loadRt.toFixed(0)} RT · {r.kwRt.toFixed(4)} kW/RT
              </option>
            ))}
          </select>
        </Card>
      )}

      <Card className="bms-card">
        <div className="bms-toolbar">
          <div>
            <span className="tw-eyebrow">BMS points</span>
            <h3 className="bms-title">T1 dataset mapping</h3>
          </div>
          <div className="bms-toolbar-controls">
            <label className="eng-search">
              <SearchIcon size={15} />
              <input
                type="search"
                value={query}
                placeholder="Filter by tag or equipment…"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter BMS points"
              />
            </label>
            <StatusPill tone="info" small>
              {shown} / {total} points
            </StatusPill>
          </div>
        </div>

        <div className="bms-groupbar eng-chips">
          <button type="button" className="eng-chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
            All groups
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="eng-chip"
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
            >
              {g.title}
            </button>
          ))}
        </div>

        {comparing && (
          <p className="tw-alert tw-alert--info bms-compare-note">
            A dataset-replay scenario is active: every row is compared against the measured value.
            <span className="bms-delta ok">≤0.5%</span>
            <span className="bms-delta warn">≤2%</span>
            <span className="bms-delta bad">&gt;2%</span>
          </p>
        )}

        <div className={`eng-table-wrap bms-table-wrap ${comparing ? "bms-table-wrap--compare" : ""}`}>
          <table className={`tw-table bms-table ${comparing ? "bms-table--compare" : ""}`}>
            <colgroup>
              <col className="bms-col-tag" />
              <col className="bms-col-equipment" />
              <col className="bms-col-value" />
              <col className="bms-col-unit" />
              {comparing && <col className="bms-col-dataset" />}
              {comparing && <col className="bms-col-delta" />}
            </colgroup>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Equipment</th>
                <th className="num">Value</th>
                <th>Unit</th>
                {comparing && <th className="num">Dataset</th>}
                {comparing && <th className="num">Δ</th>}
              </tr>
            </thead>
            {visible.map((g) => (
              <tbody key={g.id}>
                <tr className="bms-group-row">
                  <td colSpan={comparing ? 6 : 4}>{g.title}</td>
                </tr>
                {g.points.map((point) => {
                  const cmp = comparisonFor(point.tag, point.value);
                  return (
                    <tr key={`${g.id}-${point.tag}`}>
                      <td className="tag">{point.tag}</td>
                      <td className="muted">{equipmentOf(point.tag)}</td>
                      <td className="num">
                        {point.control ? <EditCell control={point.control} onSet={onSetControl} /> : point.value}
                      </td>
                      <td className="muted">{point.unit}</td>
                      {comparing && <td className="num">{cmp ? cmp.expected : "—"}</td>}
                      {comparing && (
                        <td className={`num ${cmp ? `bms-delta-cell ${cmp.tone}` : ""}`}>{cmp ? cmp.delta : "—"}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
          {visible.length === 0 && <p className="bms-empty">No point matches “{query}”.</p>}
        </div>
      </Card>
    </div>
  );
}
