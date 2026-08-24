import React from "react";
import {
  AlertIcon,
  ArrowRightIcon,
  AssistantIcon,
  BellIcon,
  OptimizeIcon,
  PowerIcon,
  SolverIcon,
  TrendUpIcon,
} from "../ui/TwIcons";

/**
 * The panel before the first message.
 *
 * It used to print the full command vocabulary, because the chatbot needed the
 * operator to know it. The agent does not: anything phrased any way reaches the
 * same router, so the job here is to say what the assistant knows about and
 * show a few examples that prove free-form questions work.
 *
 * "Suggested" stays, and still comes from the plant's own state — an alarm the
 * plant raised is a better opening question than any fixed list. What changed
 * is that a suggestion is now just a message: clicking one sends its text
 * through the same endpoint as typing it.
 */

/* A suggestion arrives from the server as `{ id, label, prompt, priority }`.
   The icon and the second line are chosen from that id / priority, so an alarm
   reads as an alarm without the card itself turning red. */
const SUGGESTION_META = {
  review_alerts: { icon: BellIcon, hint: "Review what needs attention" },
  energy_high: { icon: TrendUpIcon, hint: "Investigate plant efficiency" },
  kw_rt: { icon: TrendUpIcon, hint: "Investigate plant efficiency" },
  cop_low: { icon: PowerIcon, hint: "Find what is holding COP down" },
  pump_eff: { icon: PowerIcon, hint: "Check secondary pumping" },
  hx_approach: { icon: TrendUpIcon, hint: "Check heat-exchanger approach" },
  iaq_warning: { icon: AlertIcon, hint: "Review air quality" },
  peak_summer: { icon: OptimizeIcon, hint: "Run the scenario" },
  status: { icon: AssistantIcon, hint: "Summarise current operation" },
  optimize: { icon: OptimizeIcon, hint: "Where the savings are" },
};

const TONE_OF = { high: "tw-asst-sug--high", medium: "tw-asst-sug--medium" };

/** What the assistant can be asked about. Topics, not commands. */
const CAPABILITIES = [
  "current plant performance",
  "energy efficiency",
  "equipment behaviour",
  "alarms and constraints",
  "MPC decisions",
  "optimisation opportunities",
  "simulation scenarios",
];

/**
 * What the assistant is doing, when it is not simply ready.
 *
 * Says what still works — the plant tools, the MPC and the simulator never
 * needed the language model — and offers to re-read the status rather than
 * making the operator reload.
 */
export function StatusNote({ text, onRecheck }) {
  if (!text) return null;
  return (
    <div className="tw-asst-note tw-asst-note--warn" role="status">
      <AlertIcon size={15} />
      <span>
        {text}
        {onRecheck && (
          <button type="button" className="tw-asst-note-btn" onClick={onRecheck}>
            Check again
          </button>
        )}
      </span>
    </div>
  );
}

export function SuggestedActions({ suggestions, disabled, onRun }) {
  if (!suggestions.length) return null;

  return (
    <section className="tw-asst-group" aria-label="Suggested">
      <h4>
        Suggested
        <em>from current plant state</em>
      </h4>
      {suggestions.map((suggestion) => {
        const meta = SUGGESTION_META[suggestion.id] ?? {};
        const Glyph = meta.icon ?? AssistantIcon;
        return (
          <button
            key={suggestion.id}
            type="button"
            className={`tw-asst-sug ${TONE_OF[suggestion.priority] ?? ""}`}
            disabled={disabled}
            onClick={() => onRun(suggestion.prompt)}
          >
            <span className="tw-asst-sug-glyph">
              <Glyph size={16} />
            </span>
            <span className="tw-asst-sug-text">
              <strong>{suggestion.label}</strong>
              {meta.hint && <small>{meta.hint}</small>}
            </span>
            <ArrowRightIcon size={15} className="tw-asst-sug-go" aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}

export function QuickActions({ actions, disabled, onRun, agent }) {
  if (!actions?.length) return null;

  return (
    <section className="tw-asst-group" aria-label="Starter questions">
      <h4>
        {agent ? "Try asking" : "Quick actions"}
        {agent && <em>or type anything</em>}
      </h4>
      <div className="tw-asst-quick">
        {actions.map((action) => {
          const Glyph = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              className="tw-asst-qa"
              disabled={disabled}
              onClick={() => onRun(action.prompt)}
              title={action.prompt}
            >
              <Glyph size={17} />
              <strong>{action.label}</strong>
              <small>{action.hint}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function AssistantWelcome({
  config,
  statusNote,
  onRecheckModel,
  suggestions,
  disabled,
  onRun,
  agent,
}) {
  return (
    <>
      <section className="tw-asst-hero">
        <h3>{config.welcomeTitle}</h3>
        <p>{config.welcomeBody}</p>
        {agent && (
          <ul className="tw-asst-hero-list">
            {CAPABILITIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <StatusNote text={statusNote} onRecheck={onRecheckModel} />

      <SuggestedActions suggestions={suggestions} disabled={disabled} onRun={onRun} />
      <QuickActions actions={config.quickActions} disabled={disabled} onRun={onRun} agent={agent} />

      {agent && (
        <p className="tw-asst-hero-foot">
          <SolverIcon size={13} />
          Plant figures are read from the Digital Twin and the MPC solver, never recalled. Setpoint
          changes are proposed for your confirmation and never written to a real BMS.
        </p>
      )}
    </>
  );
}
