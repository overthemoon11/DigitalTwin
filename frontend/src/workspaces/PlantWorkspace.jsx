import React, { useMemo } from "react";
import ChillerPlant2DView from "../components/chiller/ChillerPlant2DView";
import EquipmentDetailCard from "../components/chiller/EquipmentDetailCard";
import MpcQuickCard from "../features/mpc/components/MpcQuickCard";
import { Card, CardHead, EmptyState, KpiCard, PageHead, StatusPill, fmt, isNum } from "../components/ui/Primitives";
import {
  AlertIcon,
  AssetsIcon,
  EfficiencyIcon,
  LoadIcon,
  PowerIcon,
  SavingIcon,
} from "../components/ui/TwIcons";
import { FORECAST_LABEL, MODE_LABEL, headlineSaving, kpiValue } from "../features/mpc/horizonSelectors";

/**
 * PLANT — what is happening now.
 *
 * Tier-1 information only: the four numbers an operator glances at, the twin
 * itself at the largest size the viewport allows, the optimiser's current
 * recommendation, and enough context to know which scenario those numbers
 * belong to. Everything that is configuration, analysis or diagnostics has its
 * own workspace.
 */
export default function PlantWorkspace({
  plantState,
  selectedAsset,
  onSelectAsset,
  isConnected,
  scenario,
  config,
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
  onOpenAssets,
}) {
  const coolingLoad = kpiValue(plantState, "kpi-load") ?? plantState?.headers?.buildingLoadRt;
  const totalPower = kpiValue(plantState, "kpi-kw");
  const efficiency = kpiValue(plantState, "kpi-eff");
  const cop = kpiValue(plantState, "kpi-cop");
  const wetBulb = kpiValue(plantState, "kpi-wetbulb");
  const saving = headlineSaving(run);

  const selected = selectedAsset ? plantState?.equipment?.[selectedAsset] : null;
  const alerts = useMemo(
    () => (plantState?.alerts ?? []).filter((alert) => !alert.resolved),
    [plantState]
  );

  const fleet = useMemo(() => {
    const equipment = Object.values(plantState?.equipment ?? {});
    return [
      ["Chillers", "chiller"],
      ["CHW pumps", "chwp"],
      ["CW pumps", "cwp"],
      ["Cooling towers", "cooling_tower"],
    ].map(([label, category]) => {
      const all = equipment.filter((item) => item.category === category);
      return {
        label,
        running: all.filter((item) => item.status === "running").length,
        total: all.length,
      };
    });
  }, [plantState]);

  const stepMinutes = config?.bms?.stepMinutes ?? 15;
  const hours = ((Number(scenario?.steps) || 0) * stepMinutes) / 60;
  const calibration = plantState?.simulation?.calibration;

  return (
    <div className="tw-page tw-page--fill">
      <PageHead
        eyebrow="Chiller plant"
        title="Plant overview"
        subtitle="Live digital twin of the T1 chiller plant, with the current whole-plant MPC recommendation beside it."
        actions={
          <>
            <button type="button" className="tw-btn tw-btn--sm" onClick={onOpenAssets}>
              <AssetsIcon size={15} />
              Assets
            </button>
            <StatusPill tone={isConnected ? "ok" : "bad"}>
              {isConnected ? "Telemetry live" : "Telemetry offline"}
            </StatusPill>
          </>
        }
      />

      <section className="plant-kpis" aria-label="Plant performance">
        <KpiCard
          label="Cooling load"
          value={fmt(coolingLoad, 0)}
          unit="RT"
          note="Delivered to the risers"
          glyph={<LoadIcon />}
          tone="cyan"
        />
        <KpiCard
          label="Total plant power"
          value={fmt(totalPower, 0)}
          unit="kW"
          note="Chillers, pumps and towers"
          glyph={<PowerIcon />}
          tone="blue"
        />
        <KpiCard
          label="Plant efficiency"
          value={fmt(efficiency, 3)}
          unit="kW/RT"
          note={isNum(cop) ? `System COP ${fmt(cop, 2)}` : "Lower is better"}
          glyph={<EfficiencyIcon />}
          tone="green"
        />
        <KpiCard
          feature
          label="MPC opportunity"
          value={saving ? `${fmt(Math.abs(saving.pct), 1)}` : "—"}
          unit={saving ? "%" : ""}
          empty={!saving}
          glyph={<SavingIcon />}
          note={saving ? saving.basisNote : "Run the optimiser to compare against the plant's own control"}
          footer={
            saving ? (
              <>
                <StatusPill tone={saving.pct > 0 ? "ok" : "neutral"} small>
                  {saving.label}
                </StatusPill>
                <button
                  type="button"
                  className="tw-btn tw-btn--sm tw-btn--ghost"
                  onClick={() => onNavigate("optimization")}
                >
                  Details
                </button>
              </>
            ) : (
              <button
                type="button"
                className="tw-btn tw-btn--sm tw-btn--soft"
                onClick={onRun}
                disabled={status === "RUNNING"}
              >
                {status === "RUNNING" ? "Optimising…" : "Run optimiser"}
              </button>
            )
          }
        />
      </section>

      <section className="plant-hero">
        <article className="tw-card tw-card--flush plant-twin-card">
          <header className="plant-twin-head">
            <div>
              <span className="tw-eyebrow">Digital twin</span>
              <h3>T1 chiller plant</h3>
            </div>
            <div className="plant-twin-head-meta">
              <StatusPill tone={calibration?.status === "extrapolated" ? "warn" : "ok"} small
                title={
                  calibration?.status === "extrapolated"
                    ? `Outside the measured operating region: ${calibration.reasons.join("; ")}`
                    : "Current inputs sit inside the operating region covered by the measured T1 dataset"
                }
              >
                {calibration?.status === "extrapolated" ? "Extrapolating" : "Calibrated region"}
              </StatusPill>
              <StatusPill tone="info" small>
                {selected ? selected.name : "Whole plant"}
              </StatusPill>
            </div>
          </header>
          <div className="plant-twin-stage">
            {plantState ? (
              <ChillerPlant2DView
                equipment={plantState.equipment}
                headers={plantState.headers}
                kpis={plantState.kpis}
                selectedId={selectedAsset}
                onSelect={onSelectAsset}
              />
            ) : (
              <div className="loading">
                <h2>Initialising chiller plant…</h2>
              </div>
            )}
          </div>
        </article>

        <aside className="plant-side">
          {selected && (
            <EquipmentDetailCard
              equipment={selected}
              alerts={plantState?.alerts}
              onClear={() => onSelectAsset(null)}
              onOpenPoints={() => onNavigate("engineering", "bms")}
            />
          )}

          <MpcQuickCard
            baseline={baselineControl}
            optimal={run?.appliedControl ?? null}
            status={status}
            run={run}
            error={error}
            applied={applied}
            constraintErrors={constraintErrors}
            onRun={onRun}
            onRestoreBaseline={onRestoreBaseline}
            onReapplyOptimum={onReapplyOptimum}
            onOpenOptimization={() => onNavigate("optimization")}
          />
        </aside>
      </section>

      <div className="plant-footer">
        <Card className="plant-context">
          <div>
            <span className="tw-eyebrow">Current simulation context</span>
            <div className="plant-context-facts">
              <span>
                <em>Conditions</em>
                {MODE_LABEL[scenario?.mode] ?? scenario?.mode ?? "—"}
              </span>
              {scenario?.mode === "bms" && (
                <span>
                  <em>Day</em>
                  {scenario?.day || "—"}
                </span>
              )}
              <span>
                <em>Horizon</em>
                {hours ? `${fmt(hours, 0)} h · ${scenario.steps} × ${stepMinutes} min` : "—"}
              </span>
              <span>
                <em>Forecast</em>
                {FORECAST_LABEL[scenario?.forecast] ?? scenario?.forecast ?? "—"}
              </span>
              {run && (
                <span>
                  <em>Last run</em>
                  {run.solver.steps} steps · {fmt(run.solver.meanSolveMs, 0)} ms mean
                </span>
              )}
            </div>
          </div>
          <div className="plant-context-actions">
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => onNavigate("simulation")}>
              Simulation setup
            </button>
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => onNavigate("engineering", "constraints")}>
              Constraints
            </button>
            <button type="button" className="tw-btn tw-btn--sm tw-btn--soft" onClick={() => onNavigate("analytics")}>
              View analytics
            </button>
          </div>
        </Card>

        <Card className="plant-status-card">
          <CardHead
            eyebrow="Plant status"
            title="Running equipment"
            tight
            actions={
              alerts.length > 0 ? (
                <StatusPill tone="warn" small>
                  <AlertIcon size={13} />
                  {alerts.length}
                </StatusPill>
              ) : (
                <StatusPill tone="ok" small>
                  No alerts
                </StatusPill>
              )
            }
          />
          <div className="plant-status-grid">
            {fleet.map((group) => (
              <div className="tw-metric" key={group.label}>
                <span>{group.label}</span>
                <strong>
                  {group.running}
                  <em>/ {group.total}</em>
                </strong>
              </div>
            ))}
            <div className="tw-metric">
              <span>CHWS / CHWR</span>
              <strong>
                {fmt(plantState?.headers?.chws, 2)} / {fmt(plantState?.headers?.chwr, 2)}
                <em>°C</em>
              </strong>
            </div>
            <div className="tw-metric">
              <span>CWS / CWR</span>
              <strong>
                {fmt(plantState?.headers?.cws, 2)} / {fmt(plantState?.headers?.cwr, 2)}
                <em>°C</em>
              </strong>
            </div>
            <div className="tw-metric">
              <span>Wet bulb</span>
              <strong>
                {fmt(wetBulb, 2)}
                <em>°C</em>
              </strong>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="plant-alerts">
              {alerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className={`plant-alert-row plant-alert-row--${alert.severity}`}>
                  <i />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {!plantState && (
        <EmptyState title="Waiting for the twin">
          <p>The backend has not yet delivered a plant state on the telemetry socket.</p>
        </EmptyState>
      )}
    </div>
  );
}
