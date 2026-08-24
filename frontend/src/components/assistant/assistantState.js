import { isNum, fmt } from "../ui/Primitives";

/**
 * Everything the assistant shows about the world it is talking about, derived
 * from state the store already holds.
 *
 * Nothing here invents a value: a chip is omitted when the underlying number is
 * not in the state, and the LLM status is whatever `/api/model/status` and the
 * `model_status` socket frame reported — never a decorative green dot.
 */

/* ── context strip ───────────────────────────────────────────────────────── */

/**
 * @param {'chiller' | 'ets' | 'ahu'} system
 * @returns {{ key: string, label: string, value: string }[]}
 */
export function buildContextChips(system, { plantState, etsState, ahuState, plantConfig }) {
  const chips = [];
  const push = (key, label, value, unit) => {
    if (value === null || value === undefined || value === "") return;
    chips.push({ key, label, value: unit ? `${value} ${unit}` : String(value) });
  };

  if (system === "ets") {
    const h = etsState?.headers;
    if (h) {
      push("load", "Load", isNum(h.buildingLoadRt) ? fmt(h.buildingLoadRt) : null, "RT");
      push("approach", "Approach", isNum(h.approachC) ? h.approachC.toFixed(1) : null, "°C");
      push("dt", "Secondary ΔT", isNum(h.secondaryDeltaT) ? h.secondaryDeltaT.toFixed(1) : null, "°C");
    }
    return chips;
  }

  if (system === "ahu") {
    const h = ahuState?.headers;
    if (h) {
      push("sat", "SAT", isNum(h.satC) ? h.satC.toFixed(1) : null, "°C");
      push("sa", "SA flow", isNum(h.saCfm) ? fmt(h.saCfm) : null, "CFM");
      push("mode", "Mode", h.mode || null);
    }
    return chips;
  }

  const h = plantState?.headers;
  if (h) {
    push("load", "Load", isNum(h.buildingLoadRt) ? fmt(h.buildingLoadRt) : null, "RT");
  }
  const cop = plantState?.kpis?.find((k) => k.id === "kpi-cop")?.value;
  push("cop", "Plant COP", isNum(cop) ? cop.toFixed(2) : cop ?? null);

  const scenarioId = plantState?.simulation?.scenarioId;
  if (scenarioId) {
    const label = plantConfig?.scenarios?.find((s) => s.id === scenarioId)?.label;
    push("scenario", "Scenario", label || scenarioId);
  }
  return chips;
}

/* ── status ──────────────────────────────────────────────────────────────── */

const BUSY_LABELS = {
  scenario: { short: "Running scenario", long: "Running the scenario in the simulator…" },
  change: { short: "Preparing change", long: "Preparing the change and simulating its effect…" },
  alarms: { short: "Checking alarms", long: "Checking active alarms…" },
  optimise: { short: "Optimising", long: "Solving for the cheapest legal operating point…" },
  explain: { short: "Reading diagnostics", long: "Reading the solver's diagnostics…" },
  analysis: { short: "Analysing", long: null },
};

/**
 * Which of the store's paths the submitted message will take. The store applies
 * scenario and control commands to the simulator before it answers, so this is
 * a description of real work rather than a generic spinner caption.
 *
 * @param {string} message
 */
export function classifyCommand(message) {
  const text = (message || "").toLowerCase();
  if (!text) return "analysis";
  if (text.includes("{") || /\bscenario\b/.test(text)) return "scenario";
  if (/\b(mpc|optimi[sz])/.test(text) && /\b(why|explain|reason|trust)\b/.test(text)) return "explain";
  if (/\b(run|start)\s+(the\s+)?(mpc|optimi)/.test(text) || /\boptimi[sz]e\b/.test(text)) return "optimise";
  if (/\bset\b.*\bto\b|\b(raise|lower|increase|decrease|reduce|adjust|change)\b.*\bto\b/.test(text)) {
    return "change";
  }
  if (/\b(alarm|alert)s?\b/.test(text)) return "alarms";
  return "analysis";
}

export function busyLabels(kind, config) {
  const entry = BUSY_LABELS[kind] ?? BUSY_LABELS.analysis;
  return { short: entry.short, long: entry.long ?? config.analysing };
}

/**
 * The assistant's own status line.
 *
 * Two things can be up or down independently, and conflating them is what the
 * old header did: it printed "Local model ready" whatever was happening. The
 * TOOLS answer plant questions and work with no model at all; the MODEL writes
 * the prose. So a missing model is a degradation that must not read as an
 * outage, and missing tools is an outage that must not read as "ready".
 *
 * `assistantStatus` comes from `GET /api/assistant/status`, which reports both.
 * `modelStatus` is the older model-only frame and is the fallback for the ETS
 * and AHU panels, which do not use the agent.
 *
 * @returns {{ tone: 'ok'|'busy'|'warn'|'bad'|'idle', label: string, title?: string, note?: string }}
 */
export function deriveAssistantStatus({ assistantStatus, modelStatus, isConnected, busyKind, config, agent }) {
  if (busyKind) {
    return { tone: "busy", label: busyLabels(busyKind, config).short };
  }
  if (isConnected === false) {
    return {
      tone: "bad",
      label: "Backend offline",
      title: "The backend API and telemetry socket are unreachable",
      note: "The backend is unreachable, so the assistant cannot read plant state or reach the model.",
    };
  }
  if (assistantStatus) {
    const { health, label, detail, toolsAvailable } = assistantStatus;
    const title = `${detail} · ${toolsAvailable} tools available`;
    if (health === "ready") return { tone: "ok", label, title };
    if (health === "connecting") return { tone: "warn", label, title, note: detail };
    if (health === "degraded") {
      // Deliberately not phrased as an error. Everything the operator asks the
      // plant still works; only the wording of the reply changes.
      return { tone: "warn", label, title, note: detail };
    }
    return { tone: "bad", label, title, note: detail };
  }

  // On the agent path the model-only frame is not the answer to "is the
  // assistant ready", and printing "Local model ready" from it would be the
  // exact over-claim this rewrite removed. Say nothing until the agent reports.
  if (agent) {
    return { tone: "idle", label: "Checking assistant…", title: "Reading /api/assistant/status" };
  }

  if (!modelStatus) {
    return { tone: "idle", label: "AI status unknown", title: "The assistant has not reported its status yet" };
  }

  const { status, ready, message, downloadProgress, modelAlias, provider } = modelStatus;
  const model = [provider, modelAlias].filter(Boolean).join(" · ");

  if (ready) return { tone: "ok", label: "Local model ready", title: model || message };
  if (status === "downloading") {
    const pct = isNum(downloadProgress) ? `${downloadProgress.toFixed(0)}%` : "";
    return {
      tone: "warn",
      label: `Downloading model ${pct}`.trim(),
      title: model,
      note: "The language model is still downloading. Plant answers come from the built-in analysis until it finishes.",
    };
  }
  if (status === "loading" || status === "initializing" || status === "not_initialized") {
    return {
      tone: "warn",
      label: "Local model loading",
      title: message || model,
      note: "The language model is still starting. Plant answers come from the built-in analysis until it is ready.",
    };
  }
  if (status === "error" || status === "unavailable") {
    return {
      tone: "bad",
      label: "Local LLM offline",
      title: message || model,
      note: "The language model is unreachable. Scenarios, setpoint commands and plant analysis still run on the simulator.",
    };
  }
  return { tone: "idle", label: "Local LLM", title: message || model };
}
