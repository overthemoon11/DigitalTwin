import React, { useEffect, useMemo, useState } from "react";
import * as horizonApi from "../api/horizonApi";
import SimulationInputPanel from "../features/mpc/components/SimulationInputPanel";
import TrendChart from "../components/charts/TrendChart";
import { Card, CardHead, EmptyState, InfoHint, Metric, PageHead, SectionTitle, StatusPill, fmt } from "../components/ui/Primitives";
import { ClockIcon, SimulationIcon, SpinIcon } from "../components/ui/TwIcons";
import { FORECAST_LABEL, MODE_LABEL } from "../features/mpc/horizonSelectors";

/**
 * SIMULATION — what conditions are we simulating.
 *
 * The old build kept this form permanently docked beside the schematic, where
 * it cost 300px of the twin all day to hold four selects an operator touches
 * once per session. It is now a workspace, which also makes room for the thing
 * the form always needed and never had: a preview of the conditions the run
 * will actually face.
 *
 * The preview is MEASURED data — the recorded day pulled straight from the BMS
 * artifact — not a reconstruction. Manual and synthetic modes say what they are
 * instead of drawing a made-up curve.
 */
export default function SimulationWorkspace({
  input,
  scenario,
  config,
  status,
  error,
  run,
  constraintErrors,
  onChangeInput,
  onChangeScenario,
  onRun,
  scenarios,
  onApplyScenario,
  activeScenarioId,
  onNavigate,
}) {
  const running = status === "RUNNING";
  const invalid = (constraintErrors?.length ?? 0) > 0;
  const stepMinutes = config?.bms?.stepMinutes ?? 15;
  const hours = ((Number(scenario?.steps) || 0) * stepMinutes) / 60;
  const measured = scenario?.mode === "bms";

  const [days, setDays] = useState([]);
  const [dayRecords, setDayRecords] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let alive = true;
    horizonApi
      .fetchBmsDays()
      .then((res) => alive && setDays(res.days ?? []))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!measured || !scenario?.day) {
      setDayRecords(null);
      return undefined;
    }
    let alive = true;
    setDayLoading(true);
    setDayError(null);
    horizonApi
      .fetchBmsDayRecords(scenario.day)
      .then((res) => {
        if (!alive) return;
        setDayRecords(res);
        setDayLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setDayError(err.message);
        setDayRecords(null);
        setDayLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [measured, scenario?.day]);

  /** The run replays from the start of the day for `steps` buckets. */
  const window = useMemo(() => {
    if (!dayRecords?.records?.length) return null;
    const steps = Math.max(Number(scenario?.steps) || 0, 1);
    const rows = dayRecords.records.slice(0, steps);
    return {
      rows,
      labels: rows.map((r) => r.t?.slice(11, 16) ?? ""),
      full: dayRecords.records.length,
    };
  }, [dayRecords, scenario?.steps]);

  const stats = useMemo(() => {
    if (!window?.rows?.length) return null;
    const pick = (key) => window.rows.map((r) => r[key]).filter((v) => typeof v === "number");
    const range = (values) =>
      values.length ? { min: Math.min(...values), max: Math.max(...values), mean: values.reduce((a, b) => a + b, 0) / values.length } : null;
    return {
      load: range(pick("loadRt")),
      wetBulb: range(pick("wetBulbC")),
      power: range(pick("totalPlantKw")),
      flagged: window.rows.filter((r) => r.qualityFlags.length > 0).length,
    };
  }, [window]);

  const daySummary = days.find((d) => d.day === scenario?.day);

  return (
    <div className="tw-page">
      <PageHead
        eyebrow="Scenario"
        title="Simulation setup"
        subtitle="Choose the conditions both control arms will face. The baseline and the MPC always replay the identical disturbance horizon — that is what makes the comparison a comparison."
        actions={
          <StatusPill tone={running ? "busy" : run ? "ok" : "neutral"}>
            {running ? "Running" : run ? "Last run complete" : "Ready"}
          </StatusPill>
        }
      />

      <div className="sim-grid">
        <Card className="sim-config">
          <CardHead eyebrow="Configuration" title="Run definition" tight />
          <SimulationInputPanel
            input={input}
            scenario={scenario}
            config={config}
            onChange={onChangeInput}
            onChangeScenario={onChangeScenario}
            disabled={running}
          />

          <div className="sim-config-foot">
            {error && (
              <p className="tw-alert" role="alert">
                {error}
              </p>
            )}
            {invalid && (
              <p className="tw-alert tw-alert--warn">
                {constraintErrors.length} constraint {constraintErrors.length === 1 ? "problem" : "problems"} —
                fix them in Engineering → Constraints before running.
              </p>
            )}
            <button type="button" className="tw-run-btn" onClick={onRun} disabled={running || invalid}>
              {running ? (
                <>
                  <SpinIcon size={16} className="tw-spin" />
                  Running…
                </>
              ) : (
                "Run simulation & MPC"
              )}
            </button>
            <p>
              Replays the same conditions twice — the plant&apos;s own control, then the horizon
              optimiser — and compares them. A longer run costs proportionally more: every step
              re-solves a full horizon.
            </p>
          </div>
        </Card>

        <div className="sim-preview">
          <Card>
            <CardHead
              eyebrow={measured ? "Measured conditions" : "Conditions"}
              title={
                measured
                  ? `Recorded day ${scenario?.day || "—"}`
                  : `${MODE_LABEL[scenario?.mode] ?? scenario?.mode} conditions`
              }
              subtitle={
                measured
                  ? "Straight from this plant's own trend — the exact buckets the run will replay."
                  : "Held flat or generated at run time; nothing is drawn here that the plant did not measure."
              }
              actions={
                <>
                  <StatusPill tone="info" small>
                    <ClockIcon size={13} />
                    {hours ? `${fmt(hours, 0)} h horizon` : "—"}
                  </StatusPill>
                  <InfoHint title="Where these numbers come from">
                    Building load is derived from the four riser flows and the header ΔT; wet bulb is the
                    mean of the five WST sensors. Plant power is metered at the DPM feeders. Buckets are{" "}
                    {stepMinutes} minutes wide.
                  </InfoHint>
                </>
              }
            />

            <div className="tw-metric-grid">
              <Metric label="Conditions" value={MODE_LABEL[scenario?.mode] ?? "—"} />
              <Metric
                label="Horizon"
                value={hours ? fmt(hours, 0) : "—"}
                unit="h"
                note={`${scenario?.steps ?? "—"} × ${stepMinutes} min`}
              />
              <Metric label="Forecast" value={FORECAST_LABEL[scenario?.forecast] ?? "—"} />
              {measured ? (
                <>
                  <Metric
                    label="Mean building load"
                    value={fmt(stats?.load?.mean, 0)}
                    unit="RT"
                    note={stats?.load ? `${fmt(stats.load.min, 0)}–${fmt(stats.load.max, 0)} RT` : undefined}
                  />
                  <Metric
                    label="Mean wet bulb"
                    value={fmt(stats?.wetBulb?.mean, 1)}
                    unit="°C"
                    note={stats?.wetBulb ? `${fmt(stats.wetBulb.min, 1)}–${fmt(stats.wetBulb.max, 1)} °C` : undefined}
                  />
                  <Metric
                    label="Measured plant power"
                    value={fmt(stats?.power?.mean, 0)}
                    unit="kW"
                    note="What the plant actually drew"
                  />
                </>
              ) : (
                <>
                  <Metric label="Building load" value={fmt(input?.buildingLoadRt, 0)} unit="RT" note="Operator input" />
                  <Metric label="Wet bulb" value={fmt(input?.wetBulbC, 1)} unit="°C" note="Operator input" />
                </>
              )}
            </div>
          </Card>

          {measured ? (
            dayError ? (
              <Card>
                <p className="tw-alert" role="alert">
                  {dayError}
                </p>
              </Card>
            ) : dayLoading ? (
              <Card>
                <EmptyState glyph={<SpinIcon className="tw-spin" />} title="Loading measured day">
                  <p>Reading the recorded buckets for {scenario?.day}.</p>
                </EmptyState>
              </Card>
            ) : window ? (
              <div className="sim-preview-grid">
                <TrendChart
                  title="Building load"
                  subtitle="Measured, over the replay window"
                  unit="RT"
                  decimals={0}
                  labels={window.labels}
                  hoverIndex={hover}
                  onHover={setHover}
                  series={[{ name: "Measured", kind: "forecast", values: window.rows.map((r) => r.loadRt) }]}
                />
                <TrendChart
                  title="Wet bulb"
                  subtitle="Mean of the five WST sensors"
                  unit="°C"
                  decimals={1}
                  labels={window.labels}
                  hoverIndex={hover}
                  onHover={setHover}
                  series={[{ name: "Measured", kind: "forecast", values: window.rows.map((r) => r.wetBulbC) }]}
                />
                <TrendChart
                  title="Measured plant power"
                  subtitle="What the plant actually drew on this day"
                  unit="kW"
                  decimals={0}
                  labels={window.labels}
                  hoverIndex={hover}
                  onHover={setHover}
                  series={[{ name: "Measured", kind: "forecast", values: window.rows.map((r) => r.totalPlantKw) }]}
                />
                <TrendChart
                  title="Header temperatures"
                  subtitle="Chilled water supply and return"
                  unit="°C"
                  decimals={2}
                  labels={window.labels}
                  hoverIndex={hover}
                  onHover={setHover}
                  series={[
                    { name: "CHWS", kind: "chw", values: window.rows.map((r) => r.chwsC) },
                    { name: "CHWR", kind: "chwr", values: window.rows.map((r) => r.chwrC) },
                  ]}
                />
              </div>
            ) : (
              <Card>
                <EmptyState glyph={<SimulationIcon />} title="Pick a recorded day">
                  <p>Choose a day on the left to preview the measured conditions the run will replay.</p>
                </EmptyState>
              </Card>
            )
          ) : (
            <Card>
              <EmptyState glyph={<SimulationIcon />} title={`${MODE_LABEL[scenario?.mode]} conditions`}>
                <p>
                  {scenario?.mode === "manual"
                    ? `Your numbers held flat for ${hours ? fmt(hours, 0) : "—"} hours at ${stepMinutes}-minute steps. There is nothing measured to preview.`
                    : "A generated diurnal shape scaled to your numbers, produced by the server at run time. It is a benchmark, not this site's profile, so nothing is drawn until the run returns it."}
                </p>
                {run && (
                  <p>The last run&apos;s realised disturbances are charted in Analytics → Forecast.</p>
                )}
              </EmptyState>
            </Card>
          )}

          {measured && (
            <Card>
              <CardHead
                eyebrow="Dataset"
                title="Recorded days"
                subtitle={`${days.length} day${days.length === 1 ? "" : "s"} of measured plant history are available to replay.`}
                actions={
                  daySummary?.qualityFlags?.length ? (
                    <StatusPill tone="warn" small title={daySummary.qualityFlags.join(", ")}>
                      {daySummary.flaggedRecords} flagged buckets
                    </StatusPill>
                  ) : null
                }
              />
              <div className="sim-daylist">
                {days.map((day) => (
                  <button
                    key={day.day}
                    type="button"
                    className="sim-day"
                    aria-pressed={scenario?.day === day.day}
                    disabled={running}
                    onClick={() => onChangeScenario({ horizonDay: day.day })}
                  >
                    <span>
                      <strong>{day.day}</strong>
                      <span>
                        {day.records} buckets
                        {day.loadRtMin != null && day.loadRtMax != null
                          ? ` · ${fmt(day.loadRtMin, 0)}–${fmt(day.loadRtMax, 0)} RT`
                          : ""}
                      </span>
                    </span>
                    {day.flaggedRecords > 0 && (
                      <StatusPill tone="warn" small title={day.qualityFlags.join(", ")}>
                        {day.flaggedRecords}
                      </StatusPill>
                    )}
                  </button>
                ))}
                {days.length === 0 && (
                  <p style={{ margin: 0, color: "var(--tw-ink-2)", fontSize: "0.76rem" }}>
                    No recorded days are available from the backend.
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {scenarios?.length > 0 && (
        <>
          <SectionTitle
            title="Live twin scenarios"
            note="Set the plant's current operating point — this moves the twin itself, and with it the BEFORE column everywhere else."
          />
          <div className="an-grid">
            {scenarios.map((preset) => (
              <Card key={preset.id}>
                <CardHead
                  title={preset.label}
                  subtitle={preset.description}
                  actions={
                    activeScenarioId === preset.id ? (
                      <StatusPill tone="ok" small>
                        Active
                      </StatusPill>
                    ) : null
                  }
                />
                <button
                  type="button"
                  className="tw-btn tw-btn--sm tw-btn--soft"
                  onClick={() => onApplyScenario(preset.id)}
                  disabled={running}
                >
                  Apply to twin
                </button>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle title="Next" note="Once the conditions are right, run the optimiser and read the result." />
      <Card>
        <div className="plant-context-actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => onNavigate("engineering", "constraints")}>
            Review constraints
          </button>
          <button type="button" className="tw-btn tw-btn--sm tw-btn--soft" onClick={() => onNavigate("optimization")}>
            Go to Optimization
          </button>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => onNavigate("analytics")}>
            Analytics
          </button>
        </div>
      </Card>
    </div>
  );
}
