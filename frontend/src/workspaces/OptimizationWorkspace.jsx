import React, { useState } from "react";
import TrendChart from "../components/charts/TrendChart";
import StagingTimeline from "../components/charts/StagingTimeline";
import MpcCycleStrip from "../features/mpc/components/MpcCycleStrip";
import { Card, CardHead, EmptyState, InfoHint, Metric, PageHead, SectionTitle, StatusPill, fmt, isNum } from "../components/ui/Primitives";
import { OptimizeIcon, SpinIcon } from "../components/ui/TwIcons";
import {
  ACTIVE_CONSTRAINT,
  CONTROL_NOTE,
  CONTROL_ROWS,
  COST_LABEL,
  PROVENANCE_LABEL,
  PROVENANCE_TITLE,
  controlDelta,
  controlText,
  headlineSaving,
  labelsFor,
  meanKw,
  seriesOf,
  solverState,
} from "../features/mpc/horizonSelectors";

/**
 * OPTIMIZATION — what is the MPC doing, and why.
 *
 * Three claims in order, because that is the order they have to be believed in:
 * what it changed, what that was worth, and what stopped it doing more. The
 * caveats and the provenance badges are not decoration — only some of the six
 * controls are genuinely searched, and a row that inherited the plant's own
 * setpoint must never read like a computed optimum.
 */

function ImpactCard({ label, value, unit, sub, tone = "" }) {
  return (
    <article className={`opt-impact ${tone}`}>
      <span className="opt-impact-label">{label}</span>
      <div className="opt-impact-value">
        {value}
        {unit ? <em>{unit}</em> : null}
      </div>
      {sub && <p className="opt-impact-sub">{sub}</p>}
    </article>
  );
}

function CompareRow({ row, baseline, optimal, provenance }) {
  const before = controlText(baseline, row);
  const after = controlText(optimal, row);
  const changed = before !== "—" && after !== "—" && before !== after;
  const delta = controlDelta(baseline, optimal, row);
  const prov = provenance?.[row.key];
  const note = CONTROL_NOTE[row.key];

  return (
    <div className={`opt-row ${changed ? "is-changed" : ""}`}>
      <div className="opt-row-label">
        <span>{row.label}</span>
        {note && (
          <InfoHint title={row.label} label={`How ${row.label} was arrived at`}>
            {prov && (
              <p style={{ margin: "0 0 8px" }}>
                <span className={`tw-prov tw-prov--${prov}`}>{PROVENANCE_LABEL[prov] ?? prov}</span>{" "}
                {PROVENANCE_TITLE[prov] ?? ""}
              </p>
            )}
            {note}
          </InfoHint>
        )}
      </div>
      <div className="opt-row-before">
        {before}
        {row.unit && before !== "—" ? ` ${row.unit}` : ""}
      </div>
      <div className="opt-row-arrow" aria-hidden="true">
        →
      </div>
      <div className="opt-row-after">
        {delta && (
          <span className={`opt-row-delta opt-row-delta--${delta.direction}`}>
            {delta.direction === "up" ? "↑" : "↓"}
            {fmt(Math.abs(delta.value), row.decimals ?? 1)}
          </span>
        )}
        <span>
          {after}
          {row.unit && after !== "—" ? <em> {row.unit}</em> : null}
        </span>
        {prov && (
          <span className={`tw-prov tw-prov--${prov}`} title={PROVENANCE_TITLE[prov] ?? ""}>
            {PROVENANCE_LABEL[prov] ?? prov}
          </span>
        )}
      </div>
    </div>
  );
}

function OutcomeRow({ label, before, after, decimals = 0, unit = "", better = "down" }) {
  const delta = isNum(before) && isNum(after) ? after - before : null;
  const direction = delta != null && delta < 0 ? "down" : "up";
  const visibleDelta = delta != null && Math.abs(delta) > 0.5 * 10 ** -decimals;
  const tone = better == null ? "neutral" : direction === better ? "good" : "bad";

  return (
    <div className="opt-row">
      <div className="opt-row-label">
        <span>{label}</span>
      </div>
      <div className="opt-row-before">
        {fmt(before, decimals)}
        {unit ? ` ${unit}` : ""}
      </div>
      <div className="opt-row-arrow" aria-hidden="true">
        →
      </div>
      <div className="opt-row-after">
        {visibleDelta && (
          <span className={`opt-row-delta opt-row-delta--${tone}`}>
            {direction === "down" ? "↓" : "↑"}
            {fmt(Math.abs(delta), decimals)}
          </span>
        )}
        <span>
          {fmt(after, decimals)}
          {unit ? <em> {unit}</em> : null}
        </span>
      </div>
    </div>
  );
}

export default function OptimizationWorkspace({
  run,
  status,
  error,
  applied,
  baselineControl,
  constraintErrors,
  onRun,
  onRestoreBaseline,
  onReapplyOptimum,
  onNavigate,
}) {
  const [hover, setHover] = useState(null);
  const running = status === "RUNNING";
  const invalid = (constraintErrors?.length ?? 0) > 0;
  const state = solverState(status, run);
  const saving = headlineSaving(run);

  const baseline = run?.baselineControl ?? baselineControl ?? null;
  const optimal = run?.appliedControl ?? null;

  const runCard = (
    <Card className="opt-run-card">
      <CardHead
        eyebrow="Controller"
        title="Run the optimiser"
        tight
        subtitle={run ? run.solver.name : "Receding-horizon whole-plant MPC"}
        actions={<StatusPill tone={state.tone}>{state.label}</StatusPill>}
      />

      <div className="opt-run-state">
        <span>
          {running
            ? "Solving the horizon at every step and replaying the baseline under identical conditions…"
            : run
              ? `${run.solver.steps} steps solved · ${run.solver.fallbacks} fallback${run.solver.fallbacks === 1 ? "" : "s"} · ${fmt(run.solver.meanSolveMs, 0)} ms mean`
              : "Set the conditions in Simulation, the limits in Engineering, then run."}
        </span>
      </div>

      {running && (
        <div className="opt-progress">
          <i />
        </div>
      )}

      {error && (
        <p className="tw-alert" role="alert">
          {error}
        </p>
      )}
      {invalid && (
        <p className="tw-alert tw-alert--warn">
          {constraintErrors.length} constraint {constraintErrors.length === 1 ? "problem" : "problems"} must be
          fixed before a run.{" "}
          <button
            type="button"
            className="tw-btn tw-btn--sm tw-btn--ghost"
            onClick={() => onNavigate("engineering", "constraints")}
          >
            Open constraints
          </button>
        </p>
      )}

      <button type="button" className="tw-run-btn" onClick={onRun} disabled={running || invalid}>
        {running ? (
          <>
            <SpinIcon size={16} className="tw-spin" />
            Optimising…
          </>
        ) : (
          "Run MPC optimisation"
        )}
      </button>

      {optimal && (
        <div className="mpc-quick-apply">
          <button
            type="button"
            className="tw-btn tw-btn--sm"
            onClick={onRestoreBaseline}
            disabled={running || !applied}
            title="Put the twin back on the pre-optimisation control state"
          >
            Restore current
          </button>
          <button
            type="button"
            className="tw-btn tw-btn--sm tw-btn--soft"
            onClick={onReapplyOptimum}
            disabled={running || applied}
            title="Re-apply the optimised control state to the twin"
          >
            Apply optimum
          </button>
        </div>
      )}

      {run && (
        <div className="tw-metric-grid">
          <Metric label="Steps" value={`${run.solver.steps}`} note={`${run.scenario.stepMinutes} min each`} />
          <Metric label="Mean solve" value={fmt(run.solver.meanSolveMs, 0)} unit="ms" />
          <Metric
            label="Fallbacks"
            value={`${run.solver.fallbacks}`}
            note={run.solver.fallbacks ? "not optimised steps" : "every step solved"}
          />
          <Metric label="Infeasible" value={`${run.mpc.totals.infeasibleSteps}`} />
        </div>
      )}
    </Card>
  );

  if (!run) {
    return (
      <div className="tw-page">
        <PageHead
          eyebrow="Model predictive control"
          title="MPC optimisation"
          subtitle="Compare the plant's own control against a receding-horizon optimiser over identical conditions."
        />
        <div className="opt-top">
          <EmptyState
            glyph={<OptimizeIcon size={22} />}
            title="No optimisation run yet"
            action={
              <button type="button" className="tw-btn tw-btn--primary" onClick={onRun} disabled={running || invalid}>
                {running ? "Optimising…" : "Run MPC optimisation"}
              </button>
            }
          >
            <p>
              A run replays the configured conditions twice — once under the plant&apos;s own control, once
              under the horizon optimiser — and reports the difference. Nothing on this page is populated
              until it has.
            </p>
          </EmptyState>
          {runCard}
        </div>
      </div>
    );
  }

  const b = run.baseline.totals;
  const m = run.mpc.totals;
  const baseMeanKw = meanKw(b, (x) => x.totalPlantKwh);
  const mpcMeanKw = meanKw(m, (x) => x.totalPlantKwh);
  const powerPct = run.savings.totalPlantPct;
  const effPct = run.savings.kwPerRtPct;

  const baseTraj = run.baseline.trajectory;
  const mpcTraj = run.mpc.trajectory;
  const labels = labelsFor(mpcTraj);

  const cost = run.solver.firstStepCostKw ?? {};
  const costEntries = Object.entries(cost).filter(([, v]) => Number.isFinite(v) && Math.abs(v) > 1e-9);
  const costMax = Math.max(...costEntries.map(([, v]) => Math.abs(v)), 1e-9);

  return (
    <div className="tw-page">
      <PageHead
        eyebrow="Model predictive control"
        title="MPC optimisation"
        subtitle="The plant's own control and a receding-horizon optimiser, over identical conditions."
        actions={
          <>
            <StatusPill tone={state.tone}>{state.label}</StatusPill>
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => onNavigate("analytics")}>
              Full analytics
            </button>
          </>
        }
      />

      <section className="opt-impacts" aria-label="Optimisation impact">
        <ImpactCard
          label="Power reduction"
          value={fmt(Math.abs(powerPct), 1)}
          unit="%"
          sub={`${fmt(baseMeanKw, 0)} → ${fmt(mpcMeanKw, 0)} kW mean`}
          tone={powerPct > 0 ? "opt-impact--gain" : ""}
        />
        <ImpactCard
          label="Efficiency improvement"
          value={fmt(Math.abs(effPct), 1)}
          unit="%"
          sub={`${fmt(b.plantKwPerRt, 3)} → ${fmt(m.plantKwPerRt, 3)} kW/RT`}
          tone={`opt-impact--green ${effPct > 0 ? "opt-impact--gain" : ""}`}
        />
        <ImpactCard
          label="Energy over the run"
          value={fmt(Math.abs(run.savings.totalPlantKwh), 0)}
          unit="kWh"
          sub={`${fmt(b.totalPlantKwh, 0)} → ${fmt(m.totalPlantKwh, 0)} kWh in ${fmt(m.hours, 1)} h`}
          tone="opt-impact--plain"
        />
        <ImpactCard
          label="Cooling delivered"
          value={`${run.savings.deliveredRtHoursDeltaPct > 0 ? "+" : ""}${fmt(run.savings.deliveredRtHoursDeltaPct, 2)}`}
          unit="%"
          sub={`${fmt(m.rtHours, 0)} RT·h vs ${fmt(b.rtHours, 0)} RT·h baseline`}
          tone="opt-impact--plain"
        />
      </section>

      {saving?.unequalDelivery && (
        <p className="tw-alert tw-alert--warn" style={{ marginBottom: 14 }}>
          The two arms did not serve the same cooling ({run.savings.deliveredRtHoursDeltaPct > 0 ? "+" : ""}
          {fmt(run.savings.deliveredRtHoursDeltaPct, 2)}%), so the headline figure is kW/RT rather than kWh — a
          kWh difference here is partly a difference in load served.
        </p>
      )}

      <div className="opt-top">
        <Card className="opt-compare">
          <CardHead
            eyebrow="Applied step"
            title="Baseline control → MPC optimal"
            subtitle="The move the optimiser applied at the first step of the run. The badge says whether the solver searched the value; the info icon says what the model behind it rests on."
          />
          <div className="opt-compare-head">
            <span>Control</span>
            <span>Baseline</span>
            <span />
            <span>MPC optimal</span>
          </div>
          {CONTROL_ROWS.map((row) => (
            <CompareRow
              key={row.key}
              row={row}
              baseline={baseline}
              optimal={optimal}
              provenance={run.optimisedControls}
            />
          ))}
        </Card>

        {runCard}
      </div>

      <SectionTitle
        title="Why did the MPC choose this?"
        note="Taken from the solver's own reporting for the applied step — nothing here is inferred by the interface."
      />
      <div className="opt-why">
        <Card>
          <CardHead
            eyebrow="Binding constraints"
            title="What bounded the answer"
            tight
            subtitle={
              run.solver.activeConstraints.length === 0
                ? "None — the optimum is interior, so widening a limit would not buy anything."
                : "An optimum sitting on a limit is a different claim from one sitting in the interior."
            }
          />
          {run.solver.activeConstraints.length > 0 && (
            <div className="opt-binding">
              {run.solver.activeConstraints.map((code) => {
                const meta = ACTIVE_CONSTRAINT[code];
                return (
                  <div className="opt-binding-item" key={code}>
                    <i />
                    <span>
                      {meta?.label ?? code}
                      {meta?.why && <small>{meta.why}</small>}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                className="tw-btn tw-btn--sm"
                onClick={() => onNavigate("engineering", "constraints")}
              >
                Adjust these limits
              </button>
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            eyebrow="Objective"
            title="What the cost function weighed"
            tight
            subtitle="Applied step, in kW-equivalent. A surprising decision can be traced to energy, to the return limit, or to a switching penalty rather than taken on trust."
          />
          <div className="opt-cost">
            {costEntries.map(([key, value]) => (
              <div
                className={`opt-cost-row ${key !== "energyKwh" && value > 0 ? "opt-cost-row--penalty" : ""}`}
                key={key}
              >
                <span>{COST_LABEL[key] ?? key}</span>
                <strong>{fmt(value, 2)}</strong>
                <span className="opt-cost-bar">
                  <i style={{ width: `${Math.min((Math.abs(value) / costMax) * 100, 100)}%` }} />
                </span>
              </div>
            ))}
            {costEntries.length === 0 && (
              <p style={{ margin: 0, color: "var(--tw-ink-2)", fontSize: "0.75rem" }}>
                The solver reported no non-zero objective terms for this step.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead
            eyebrow="Read with care"
            title="Caveats on this number"
            tight
            subtitle="Rendered in full, never truncated — they are the difference between a number and a claim."
          />
          {run.caveats.length > 0 ? (
            <ul className="opt-caveats">
              {run.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--tw-ink-2)", fontSize: "0.75rem" }}>
              The server attached no caveats to this run.
            </p>
          )}
          <p style={{ margin: "12px 0 0", color: "var(--tw-ink-3)", fontSize: "0.7rem", lineHeight: 1.55 }}>
            Basis:{" "}
            {run.scenario.mode === "bms"
              ? "site-calibrated Digital Twin replaying real measured conditions"
              : run.scenario.mode === "manual"
                ? "site-calibrated Digital Twin at operator-entered conditions"
                : "Digital Twin over a generated profile (benchmark, not this site)"}
            . Simulated result, not measured before/after data.
          </p>
        </Card>
      </div>

      <SectionTitle
        title="Outcome over the run"
        note="Mean power over the horizon — the like-for-like way to compare two runs of the same length."
      />
      <div className="an-grid">
        <Card>
          <CardHead eyebrow="Energy" title="Where the power went" tight />
          {[
            ["Chillers", (x) => x.chillerKwh],
            ["Pumps (CHWP + CWP)", (x) => x.pumpKwh],
            ["Cooling towers", (x) => x.towerKwh],
            ["Total plant", (x) => x.totalPlantKwh],
          ].map(([label, pick]) => {
            const before = meanKw(b, pick);
            const after = meanKw(m, pick);
            return (
              <OutcomeRow key={label} label={label} before={before} after={after} unit="kW" />
            );
          })}
        </Card>

        <Card>
          <CardHead eyebrow="Plant behaviour" title="What it cost the loop" tight />
          {[
            { label: "Peak CHWR", before: b.chwrMaxC, after: m.chwrMaxC, decimals: 2, unit: "°C", better: "down" },
            { label: "Chiller starts", before: b.chillerStarts, after: m.chillerStarts, decimals: 0, unit: "", better: "down" },
            { label: "Unmet cooling", before: b.unmetRtHours, after: m.unmetRtHours, decimals: 1, unit: "RT·h", better: "down" },
            { label: "Cooling delivered", before: b.rtHours, after: m.rtHours, decimals: 0, unit: "RT·h", better: "up" },
            { label: "Plant efficiency", before: b.plantKwPerRt, after: m.plantKwPerRt, decimals: 3, unit: "kW/RT", better: "down" },
            { label: "Run length", before: b.hours, after: m.hours, decimals: 1, unit: "h", better: null },
          ].map((row) => (
            <OutcomeRow key={row.label} {...row} />
          ))}
        </Card>
      </div>

      <SectionTitle
        title="Control trajectories"
        note="Baseline is neutral and dashed; MPC is blue and solid. Hovering any chart moves the crosshair on all of them."
      />
      <div className="an-grid">
        <div className="an-span-2">
          <StagingTimeline run={run} hoverIndex={hover} onHover={setHover} />
        </div>
        <TrendChart
          title="CHWST setpoint"
          unit="°C"
          decimals={2}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.control.chwstSetpointC),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.control.chwstSetpointC),
          ]}
        />
        <TrendChart
          title="Differential pressure setpoint"
          unit="psi"
          decimals={1}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.control.dpSetpointPsi),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.control.dpSetpointPsi),
          ]}
        />
        <TrendChart
          title="CHW pump speed"
          unit="%"
          decimals={1}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.control.chwpSpeedPct),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.control.chwpSpeedPct),
          ]}
        />
        <TrendChart
          title="CW pump speed"
          unit="%"
          decimals={1}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.control.cwpSpeedPct),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.control.cwpSpeedPct),
          ]}
        />
        <TrendChart
          title="Cooling-tower fan speed"
          unit="%"
          decimals={1}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.control.ctFanSpeedPct),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.control.ctFanSpeedPct),
          ]}
        />
        <TrendChart
          title="Total plant power"
          unit="kW"
          decimals={0}
          labels={labels}
          hoverIndex={hover}
          onHover={setHover}
          series={[
            seriesOf("Baseline", "baseline", baseTraj, (s) => s.result.totalPlantKw),
            seriesOf("MPC", "mpc", mpcTraj, (s) => s.result.totalPlantKw),
          ]}
        />
      </div>

      <SectionTitle
        title="The receding-horizon cycle"
        note="Real numbers from this run, not a diagram: the controller re-plans against a measurement every step and applies only the first move."
      />
      <Card className="eng-host eng-host--padded">
        <MpcCycleStrip run={run} />
      </Card>
    </div>
  );
}
