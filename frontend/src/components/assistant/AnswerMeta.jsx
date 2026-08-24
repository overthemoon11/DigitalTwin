import React, { useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  ModelIcon,
  SolverIcon,
  SpinIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "../ui/TwIcons";

/**
 * Everything the assistant says ABOUT an answer, rendered under it.
 *
 * The panel's job here is provenance, not decoration. A number from the MPC
 * solver, a number from the twin and a sentence of textbook HVAC look identical
 * in prose, and the difference matters more than anything else on screen — so
 * the source badge is always present, and a caveat is never collapsed behind a
 * disclosure.
 *
 * The components stay small on purpose. An answer to "what is kW/RT" should be
 * a paragraph with one badge under it, not a dashboard.
 */

/* ─────────────────────────────────────────────────────── source badges ──── */

const SOURCE_META = {
  LIVE_BMS: { label: "Live BMS", tone: "live", title: "Measured from field devices" },
  DIGITAL_TWIN: { label: "Digital Twin", tone: "twin", title: "Calculated by the calibrated plant model — not a field measurement" },
  MPC_PREDICTION: { label: "MPC prediction", tone: "mpc", title: "Predicted by the optimiser; not yet observed" },
  WHAT_IF_SIMULATION: { label: "What-if simulation", tone: "sim", title: "A hypothetical condition scored on the twin" },
  HISTORICAL_BMS: { label: "Historical BMS", tone: "live", title: "Measured T1 trend history" },
  KNOWLEDGE_BASE: { label: "Knowledge base", tone: "kb", title: "From the HVAC glossary and this project's documentation" },
  GENERAL_KNOWLEDGE: { label: "General knowledge", tone: "kb", title: "General HVAC engineering — says nothing about this plant" },
  MIXED: { label: "Mixed sources", tone: "twin", title: "More than one kind of source contributed" },
  NONE: { label: "No data read", tone: "kb", title: "No tool was needed for this answer" },
};

export function SourceBadge({ sourceType }) {
  const meta = SOURCE_META[sourceType];
  if (!meta) return null;
  return (
    <span className={`tw-asst-src tw-asst-src--${meta.tone}`} title={meta.title}>
      {meta.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── blocks ──── */

const TONE_CLASS = { good: "is-good", warn: "is-warn", bad: "is-bad" };

/**
 * The shapes Markdown cannot carry honestly: a metric with its target, a
 * before/after with its delta, a caveat that must not be missed.
 */
export function AnswerBlocks({ blocks }) {
  if (!blocks?.length) return null;
  const metrics = blocks.filter((b) => b.kind === "metric" || b.kind === "comparison");
  const notes = blocks.filter((b) => b.kind === "warning" || b.kind === "note");

  return (
    <>
      {metrics.length > 0 && (
        <div className="tw-asst-metrics">
          {metrics.map((block, idx) =>
            block.kind === "metric" ? (
              <div className={`tw-asst-metric ${TONE_CLASS[block.tone] ?? ""}`} key={`m${idx}`}>
                <span className="tw-asst-metric-k">{block.label}</span>
                <strong>
                  {block.value}
                  {block.unit && <em>{block.unit}</em>}
                </strong>
                {block.note && <small>{block.note}</small>}
              </div>
            ) : (
              <div className={`tw-asst-metric tw-asst-metric--cmp ${TONE_CLASS[block.tone] ?? ""}`} key={`m${idx}`}>
                <span className="tw-asst-metric-k">{block.label}</span>
                <strong>
                  <i>{block.before}</i>
                  <span aria-hidden="true">→</span>
                  {block.after}
                </strong>
                {block.delta && (
                  <small>
                    {String(block.delta).trim().startsWith("-") || String(block.delta).includes("−") ? (
                      <TrendDownIcon size={12} />
                    ) : (
                      <TrendUpIcon size={12} />
                    )}
                    {block.delta}
                  </small>
                )}
              </div>
            )
          )}
        </div>
      )}
      {notes.map((block, idx) => (
        <div
          key={`n${idx}`}
          className={`tw-asst-note ${block.kind === "warning" ? "tw-asst-note--warn" : ""}`}
          role={block.kind === "warning" ? "status" : undefined}
        >
          {block.kind === "warning" && <AlertIcon size={15} />}
          <span>{block.text}</span>
        </div>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────── proposed plant changes ── */

/**
 * A control write the assistant wants to make.
 *
 * Nothing has happened when this renders. The current value, the proposed
 * value and the twin's own simulated effect are all shown before the operator
 * commits, which is the whole point — an AI reply that had already moved a
 * setpoint would be indistinguishable from one that had not.
 */
export function ProposedActionCard({ action, applied, onConfirm, busy }) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);

  if (applied) {
    return (
      <div className="tw-asst-action tw-asst-action--done">
        <h5>
          <CheckIcon size={15} />
          Applied to the Digital Twin
        </h5>
        {applied.outcome?.length > 0 && (
          <div className="tw-asst-rows">
            {applied.outcome.map((row) => (
              <div className="tw-asst-row" key={row.label}>
                <span>{row.label}</span>
                <strong>
                  <i>{row.before}</i> → {row.after}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const confirm = async () => {
    setState("running");
    setError(null);
    try {
      await onConfirm(action.id);
      setState("idle");
    } catch (err) {
      setError(err?.message ?? String(err));
      setState("idle");
    }
  };

  return (
    <div className="tw-asst-action">
      <h5>Proposed change — needs your confirmation</h5>

      <div className="tw-asst-rows">
        {action.changes.map((change) => (
          <div className="tw-asst-row" key={change.controlId}>
            <span>{change.label}</span>
            <strong>
              <i>
                {change.currentValue} {change.unit}
              </i>
              <span aria-hidden="true"> → </span>
              {change.proposedValue} {change.unit}
            </strong>
          </div>
        ))}
      </div>

      {action.expectedEffect?.length > 0 && (
        <>
          <h6>Expected effect, simulated on the twin</h6>
          <div className="tw-asst-rows">
            {action.expectedEffect.map((row) => (
              <div className="tw-asst-row" key={row.label}>
                <span>{row.label}</span>
                <strong>
                  <i>{row.before}</i> → {row.after}
                  {row.delta && <em> ({row.delta})</em>}
                </strong>
              </div>
            ))}
          </div>
        </>
      )}

      {action.warnings?.map((warning) => (
        <div className="tw-asst-note tw-asst-note--warn" key={warning}>
          <AlertIcon size={15} />
          <span>{warning}</span>
        </div>
      ))}

      {error && (
        <div className="tw-asst-note tw-asst-note--warn" role="alert">
          <AlertIcon size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="tw-asst-action-btns">
        <button
          type="button"
          className="tw-btn tw-btn--sm tw-btn--primary"
          disabled={busy || state === "running"}
          onClick={confirm}
        >
          {state === "running" ? <SpinIcon size={14} className="tw-spin" /> : <CheckIcon size={14} />}
          Confirm and apply
        </button>
        <span className="tw-asst-action-note">Applies to the Digital Twin only — never to a real BMS.</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── tool trace ──── */

const TOOL_LABELS = {
  getPlantState: "plant state",
  getPlantSummary: "plant summary",
  getPlantEfficiency: "efficiency",
  getEquipmentStatus: "equipment",
  getChillerStatus: "chillers",
  getPumpStatus: "pumps",
  getCoolingTowerStatus: "cooling towers",
  getActiveAlarms: "alarms",
  getPlantTrends: "trend",
  getCurrentConstraints: "constraints",
  getPlantControls: "controls",
  getMPCResult: "MPC result",
  getMPCDiagnostics: "solver diagnostics",
  getMPCExplanationContext: "MPC diagnostics",
  getModelCalibrationStatus: "model calibration",
  runMPC: "MPC solve",
  compareBaselineVsMPC: "baseline vs MPC",
  runWhatIfScenario: "what-if simulation",
  runSimulation: "simulation",
  listScenarios: "scenarios",
  applyScenario: "scenario",
  proposeControlChange: "control preview",
  searchKnowledgeBase: "knowledge base",
};

/**
 * What the answer was built from — source, tools, and whether the prose was
 * generated or composed from the verified data.
 *
 * `answeredBy` is deliberately visible. "AI answer" over a templated reply is a
 * small lie that costs trust the first time someone notices.
 */
export function AnswerFooter({ meta }) {
  if (!meta || meta.streaming) return null;
  const tools = meta.toolsUsed ?? [];
  const errors = meta.toolErrors ?? [];

  return (
    <div className="tw-asst-foot-meta">
      <SourceBadge sourceType={meta.sourceType} />
      {tools.length > 0 && (
        <span className="tw-asst-trace" title={tools.join(", ")}>
          <SolverIcon size={12} />
          read {tools.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
        </span>
      )}
      {meta.answeredBy === "composer" && (
        <span className="tw-asst-trace" title="Written from the verified tool results rather than generated by the language model">
          <ModelIcon size={12} />
          verified data
        </span>
      )}
      {typeof meta.latencyMs === "number" && (
        <span className="tw-asst-trace tw-asst-trace--dim">
          <ClockIcon size={12} />
          {(meta.latencyMs / 1000).toFixed(1)}s
        </span>
      )}
      {errors.length > 0 && (
        <span className="tw-asst-trace tw-asst-trace--bad" title={errors.map((e) => `${e.tool}: ${e.error}`).join("\n")}>
          <AlertIcon size={12} />
          {errors.length} tool{errors.length > 1 ? "s" : ""} failed
        </span>
      )}
    </div>
  );
}

/** Warnings the backend attached to the answer. Never collapsed. */
export function AnswerWarnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <>
      {warnings.map((warning) => (
        <div className="tw-asst-note tw-asst-note--warn" role="status" key={warning}>
          <AlertIcon size={15} />
          <span>{warning}</span>
        </div>
      ))}
    </>
  );
}

/** Follow-ups the answer itself suggested. Sent through the same chat path. */
export function AnswerActions({ actions, onRun, disabled }) {
  const runnable = (actions ?? []).filter((a) => a.prompt);
  if (!runnable.length) return null;
  return (
    <div className="tw-asst-ex tw-asst-answer-actions" role="group" aria-label="Suggested follow-ups">
      {runnable.map((action) => (
        <button
          key={action.id}
          type="button"
          className={action.tone === "primary" ? "is-primary" : ""}
          disabled={disabled}
          onClick={() => onRun(action.prompt)}
          title={action.prompt}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
