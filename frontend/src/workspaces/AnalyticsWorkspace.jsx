import React, { useMemo, useState } from "react";
import TrendChart from "../components/charts/TrendChart";
import ChillerKPIPanel from "../components/chiller/ChillerKPIPanel";
import { Card, CardHead, EmptyState, InfoHint, Metric, PageHead, SectionTitle, StatusPill, Tabs, fmt } from "../components/ui/Primitives";
import { AnalyticsIcon } from "../components/ui/TwIcons";
import { headlineSaving, kpiValue, labelsFor, meanKw, seriesOf } from "../features/mpc/horizonSelectors";

/**
 * ANALYTICS — what happened over the simulation horizon.
 *
 * This is where the graphs live, at a size an engineer can read. The split from
 * Optimization is deliberate and there are no duplicated charts across the two:
 *
 *   Optimization  the DECISION variables — what the controller moved
 *   Analytics     the OUTCOME — the disturbances it faced, the plant state that
 *                 resulted, and where the energy went
 *
 * Every series is a channel the server actually returned for that run. Nothing
 * is interpolated into existence and nothing is smoothed across a gap.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "forecast", label: "Forecast" },
  { id: "plant", label: "Plant state" },
  { id: "energy", label: "Energy" },
  { id: "equipment", label: "Live equipment" },
];

export default function AnalyticsWorkspace({ run, plantState, onNavigate }) {
  const [tab, setTab] = useState("overview");
  const [hover, setHover] = useState(null);

  const data = useMemo(() => {
    if (!run) return null;
    return {
      base: run.baseline.trajectory,
      mpc: run.mpc.trajectory,
      labels: labelsFor(run.mpc.trajectory),
    };
  }, [run]);

  const saving = headlineSaving(run);
  const horizonHours = run ? run.mpc.totals.hours : null;

  const range = run
    ? `${run.mpc.trajectory[0]?.t?.slice(11, 16) ?? "start"} – ${
        run.mpc.trajectory[run.mpc.trajectory.length - 1]?.t?.slice(11, 16) ?? "end"
      }`
    : "—";

  const shared = { hoverIndex: hover, onHover: setHover };

  const equipmentTab = (
    <div className="an-stack">
      <SectionTitle
        title="Live plant KPIs"
        note="Streamed from the twin over the telemetry socket — current values, not the horizon run."
      />
      <Card className="eng-host eng-host--padded">
        <ChillerKPIPanel kpis={plantState?.kpis ?? []} />
      </Card>
    </div>
  );

  if (!run) {
    return (
      <div className="tw-page">
        <PageHead
          eyebrow="Analysis"
          title="Plant analytics"
          subtitle="Every trajectory the last run produced, at a size that can actually be read."
          actions={<Tabs items={TABS} value={tab} onChange={setTab} label="Analytics view" />}
        />
        {tab === "equipment" ? (
          equipmentTab
        ) : (
          <EmptyState
            glyph={<AnalyticsIcon size={22} />}
            title="No run to analyse yet"
            action={
              <button type="button" className="tw-btn tw-btn--primary" onClick={() => onNavigate("optimization")}>
                Go to Optimization
              </button>
            }
          >
            <p>
              Horizon analytics need a completed run. The live plant KPIs remain available under Live
              equipment while you wait.
            </p>
          </EmptyState>
        )}
      </div>
    );
  }

  const { base, mpc, labels } = data;

  return (
    <div className="tw-page">
      <PageHead
        eyebrow="Analysis"
        title="Plant analytics"
        subtitle="Every trajectory the last run produced. Baseline is neutral and dashed, MPC is blue and solid; one crosshair is shared across all charts."
        actions={
          <span className="an-range">
            <StatusPill tone="info" small>
              {run.scenario.mode === "bms" ? run.scenario.day : run.scenario.mode}
            </StatusPill>
            <span>
              Horizon <strong>{range}</strong> · {run.solver.steps} × {run.scenario.stepMinutes} min
            </span>
          </span>
        }
      />

      <div className="an-toolbar">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Analytics view" />
        <span className="an-range">
          {saving && (
            <StatusPill tone={saving.pct > 0 ? "ok" : "neutral"} small>
              {saving.label} {fmt(Math.abs(saving.pct), 2)}%
            </StatusPill>
          )}
          <InfoHint title="Reading these charts">
            Both arms faced an identical disturbance horizon, so any difference between the grey and blue
            lines is attributable to the controller. Where a series is missing at a step the line breaks
            rather than bridging the gap.
          </InfoHint>
        </span>
      </div>

      {tab === "overview" && (
        <div className="an-stack">
          <div className="tw-metric-grid">
            <Metric
              label="Mean plant power"
              value={fmt(meanKw(run.mpc.totals, (x) => x.totalPlantKwh), 0)}
              unit="kW"
              note={`baseline ${fmt(meanKw(run.baseline.totals, (x) => x.totalPlantKwh), 0)} kW`}
            />
            <Metric
              label="Plant efficiency"
              value={fmt(run.mpc.totals.plantKwPerRt, 3)}
              unit="kW/RT"
              note={`baseline ${fmt(run.baseline.totals.plantKwPerRt, 3)}`}
            />
            <Metric
              label="Energy"
              value={fmt(run.mpc.totals.totalPlantKwh, 0)}
              unit="kWh"
              note={`over ${fmt(horizonHours, 1)} h`}
            />
            <Metric
              label="Cooling delivered"
              value={fmt(run.mpc.totals.rtHours, 0)}
              unit="RT·h"
              note={`baseline ${fmt(run.baseline.totals.rtHours, 0)} RT·h`}
            />
            <Metric label="Peak CHWR" value={fmt(run.mpc.totals.chwrMaxC, 2)} unit="°C" note={`baseline ${fmt(run.baseline.totals.chwrMaxC, 2)} °C`} />
            <Metric label="Chiller starts" value={`${run.mpc.totals.chillerStarts}`} note={`baseline ${run.baseline.totals.chillerStarts}`} />
          </div>

          <div className="an-grid an-grid--wide">
            <TrendChart
              title="Total plant power"
              subtitle="Chillers, pumps and towers combined, at every control step"
              unit="kW"
              decimals={0}
              height="tall"
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.totalPlantKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.totalPlantKw),
              ]}
            />
          </div>

          <div className="an-grid">
            <TrendChart
              title="Plant efficiency"
              subtitle="Lower is better"
              unit="kW/RT"
              decimals={3}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.plantKwPerRt),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.plantKwPerRt),
              ]}
            />
            <TrendChart
              title="Cooling delivered"
              subtitle="What actually reached the building, not what was demanded"
              unit="RT"
              decimals={0}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.deliveredRt),
                seriesOf("MPC", "mpc", mpc, (s) => s.deliveredRt),
              ]}
            />
          </div>
        </div>
      )}

      {tab === "forecast" && (
        <div className="an-stack">
          <SectionTitle
            title="The conditions both arms faced"
            note="Drawn once, not twice — a single disturbance series is the visual form of the fairness guarantee."
          />
          <div className="an-grid">
            <TrendChart
              title="Building load"
              subtitle={`Disturbance horizon · ${run.scenario.forecast} forecast`}
              unit="RT"
              decimals={0}
              height="tall"
              labels={labels}
              {...shared}
              series={[seriesOf("Load", "forecast", mpc, (s) => s.disturbance.buildingLoadRt)]}
            />
            <TrendChart
              title="Wet bulb"
              subtitle="Mean of the five WST sensors"
              unit="°C"
              decimals={2}
              height="tall"
              labels={labels}
              {...shared}
              series={[seriesOf("Wet bulb", "forecast", mpc, (s) => s.disturbance.wetBulbC)]}
            />
          </div>

          <SectionTitle title="Demand versus delivery" note="Where a controller defers cooling into the loop, these two separate." />
          <div className="an-grid">
            <TrendChart
              title="Load demanded vs delivered — MPC"
              unit="RT"
              decimals={0}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Demanded", "forecast", mpc, (s) => s.disturbance.buildingLoadRt),
                seriesOf("Delivered", "mpc", mpc, (s) => s.deliveredRt),
              ]}
            />
            <TrendChart
              title="Cooling deferred into the loop"
              subtitle="Unmet at each step; the loop pays it back later"
              unit="RT"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.unmetRt),
                seriesOf("MPC", "mpc", mpc, (s) => s.unmetRt),
              ]}
            />
          </div>
        </div>
      )}

      {tab === "plant" && (
        <div className="an-stack">
          <SectionTitle title="Chilled water" note="The loop the whole horizon exists to manage." />
          <div className="an-grid">
            <TrendChart
              title="CHW supply temperature"
              unit="°C"
              decimals={2}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chwsC),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chwsC),
              ]}
            />
            <TrendChart
              title="CHW loop return"
              subtitle="The state variable the return limit constrains"
              unit="°C"
              decimals={2}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.loop.chwrC),
                seriesOf("MPC", "mpc", mpc, (s) => s.loop.chwrC),
              ]}
            />
            <TrendChart
              title="Chilled-water flow"
              unit="L/s"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chwFlowLs),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chwFlowLs),
              ]}
            />
            <TrendChart
              title="Measured differential pressure"
              subtitle="The DP the pumps actually produce, not the setpoint"
              unit="psi"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.measuredDpPsi),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.measuredDpPsi),
              ]}
            />
            <TrendChart
              title="CHW delta-T"
              unit="K"
              decimals={2}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chwDeltaT),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chwDeltaT),
              ]}
            />
            <TrendChart
              title="Chiller part load"
              unit="%"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chillerLoadPct),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chillerLoadPct),
              ]}
            />
          </div>

          <SectionTitle title="Condenser side" note="Heat rejection, and the lift it costs the compressors." />
          <div className="an-grid">
            <TrendChart
              title="Condenser water temperatures — MPC"
              unit="°C"
              decimals={2}
              labels={labels}
              {...shared}
              series={[
                seriesOf("CWS", "cond", mpc, (s) => s.result.cwsC),
                seriesOf("CWR", "alt", mpc, (s) => s.result.cwrC),
              ]}
            />
            <TrendChart
              title="Tower approach"
              subtitle="CWS above wet bulb — the limit the tower cannot beat"
              unit="K"
              decimals={2}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.towerApproachC),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.towerApproachC),
              ]}
            />
            <TrendChart
              title="Condenser lift shift"
              subtitle="Change in compressor lift attributable to condenser flow"
              unit="K"
              decimals={3}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.condenserLiftShiftK),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.condenserLiftShiftK),
              ]}
            />
          </div>
        </div>
      )}

      {tab === "energy" && (
        <div className="an-stack">
          <SectionTitle title="Where the power went" note="Per subsystem, at every control step." />
          <div className="an-grid">
            <TrendChart
              title="Chiller power"
              unit="kW"
              decimals={0}
              height="tall"
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chillerKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chillerKw),
              ]}
            />
            <TrendChart
              title="Pump power"
              subtitle="CHWP + CWP combined"
              unit="kW"
              decimals={1}
              height="tall"
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.pumpKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.pumpKw),
              ]}
            />
            <TrendChart
              title="CHW pump power"
              unit="kW"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.chwpKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.chwpKw),
              ]}
            />
            <TrendChart
              title="CW pump power"
              unit="kW"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.cwpKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.cwpKw),
              ]}
            />
            <TrendChart
              title="Cooling-tower power"
              unit="kW"
              decimals={1}
              labels={labels}
              {...shared}
              series={[
                seriesOf("Baseline", "baseline", base, (s) => s.result.towerKw),
                seriesOf("MPC", "mpc", mpc, (s) => s.result.towerKw),
              ]}
            />
            <Card>
              <CardHead
                eyebrow="Run totals"
                title="Energy by subsystem"
                tight
                subtitle={`Integrated over ${fmt(horizonHours, 1)} h.`}
              />
              <div className="tw-metric-grid">
                {[
                  ["Chillers", "chillerKwh"],
                  ["Pumps", "pumpKwh"],
                  ["Towers", "towerKwh"],
                  ["Total", "totalPlantKwh"],
                ].map(([label, key]) => (
                  <Metric
                    key={key}
                    label={label}
                    value={fmt(run.mpc.totals[key], 0)}
                    unit="kWh"
                    note={`baseline ${fmt(run.baseline.totals[key], 0)}`}
                  />
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "equipment" && equipmentTab}
    </div>
  );
}
