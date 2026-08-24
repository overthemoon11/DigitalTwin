import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTwinStore } from "../../store/useTwinStore";
import { buildAhuChatSuggestions } from "../../services/ahu/ahuCopilotActions";
import { buildEtsChatSuggestions } from "../../services/ets/etsCopilotActions";

import SidePanel from "../shell/SidePanel";
import { AlertIcon, AssistantIcon } from "../ui/TwIcons";

import { AGENT_SYSTEMS, assistantConfigFor } from "./assistantConfig";
import {
  buildContextChips,
  busyLabels,
  classifyCommand,
  deriveAssistantStatus,
} from "./assistantState";
import AssistantWelcome, { StatusNote } from "./AssistantWelcome";
import ChatComposer from "./ChatComposer";
import Conversation from "./Conversation";

/**
 * Plant AI Assistant.
 *
 * The chiller path is now an agent: every message goes to
 * `POST /api/assistant/chat/stream`, where the backend classifies it, chooses
 * tools from an allowlist, reads the twin / MPC / knowledge base and answers
 * from what it read. There is no intent parsing, no command vocabulary and no
 * fallback prose in this component — a chatbot that decides anything in the
 * browser is a chatbot that can be told two different things by two tabs.
 *
 * ETS and AHU still run their own local engines and go through
 * `sendCopilotMessage`, unchanged. The transcript shape is shared, so both
 * render through the same thread.
 *
 * Two layouts, one panel:
 *   no messages yet → welcome, live suggestions, starter questions
 *   conversation on → the thread takes the height, starters shrink to chips
 */
export default function AssistantPanel({ open, onClose, page }) {
  const conversationHistory = useTwinStore((s) => s.conversationHistory);
  const sendAssistantMessage = useTwinStore((s) => s.sendAssistantMessage);
  const sendCopilotMessage = useTwinStore((s) => s.sendCopilotMessage);
  const confirmAssistantAction = useTwinStore((s) => s.confirmAssistantAction);
  const clearConversation = useTwinStore((s) => s.clearConversation);
  const loadTwinState = useTwinStore((s) => s.loadTwinState);
  const fetchModelStatus = useTwinStore((s) => s.fetchModelStatus);
  const fetchAssistantStatus = useTwinStore((s) => s.fetchAssistantStatus);
  const activePlantScenario = useTwinStore((s) => s.activePlantScenario);
  const plantState = useTwinStore((s) => s.plantState);
  const etsState = useTwinStore((s) => s.etsState);
  const ahuState = useTwinStore((s) => s.ahuState);
  const plantConfig = useTwinStore((s) => s.plantConfig);
  const modelStatus = useTwinStore((s) => s.modelStatus);
  const assistantStatus = useTwinStore((s) => s.assistantStatus);
  const assistantStage = useTwinStore((s) => s.assistantStage);
  const isConnected = useTwinStore((s) => s.isConnected);

  const system = activePlantScenario === "ets" || activePlantScenario === "ahu" ? activePlantScenario : "chiller";
  const isChiller = system === "chiller";
  const isAgent = AGENT_SYSTEMS.has(system);
  const config = assistantConfigFor(system);

  const [input, setInput] = useState("");
  const [busyKind, setBusyKind] = useState(null);
  const [error, setError] = useState(null);
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const lastSentRef = useRef("");

  const busy = busyKind !== null;

  /* ── suggestions ───────────────────────────────────────────────────────────
     Two real sources, both pre-existing: the chiller plant twin computes its
     own starters into `plantConfig.chatSuggestions`, and the building twin
     serves `/api/copilot/suggestions`. Both are used, plant-derived first,
     deduplicated. They are ordinary messages now — the agent reads each one as
     free text, so a suggestion carries no privileged wording. */
  const localSuggestions = useMemo(() => {
    if (system === "ahu") return buildAhuChatSuggestions(ahuState);
    if (system === "ets") return buildEtsChatSuggestions(etsState);
    return plantConfig?.chatSuggestions ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system, ahuState, etsState, plantConfig?.chatSuggestions]);

  const fetchSuggestions = useCallback(async () => {
    if (!isChiller) return;
    try {
      const response = await fetch("/api/copilot/suggestions");
      if (response.ok) setRemoteSuggestions(await response.json());
    } catch {
      // The panel still has the plant-derived starters; nothing to report.
    }
  }, [isChiller]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (!isChiller) return undefined;
    const interval = setInterval(fetchSuggestions, 30000);
    return () => clearInterval(interval);
  }, [fetchSuggestions, isChiller]);

  const suggestions = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 };
    // A starter that fires the same message as a quick-action card is not a
    // suggestion, it is the same button twice.
    const seen = new Set(config.quickActions.map((a) => a.prompt));
    const merged = [];
    for (const item of [...localSuggestions, ...(isChiller ? remoteSuggestions : [])]) {
      if (!item?.prompt || seen.has(item.id) || seen.has(item.prompt)) continue;
      seen.add(item.id);
      seen.add(item.prompt);
      merged.push(item);
    }
    merged.sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3));

    // When something is actually off, "Suggested" says only that. The routine
    // starters are the quick-action grid; they fill this section only when the
    // plant has nothing notable to report.
    const notable = merged.filter((s) => s.priority === "high" || s.priority === "medium");
    return notable.length ? notable.slice(0, 3) : merged.slice(0, 2);
  }, [localSuggestions, remoteSuggestions, isChiller, config.quickActions]);

  /* ── status ───────────────────────────────────────────────────────────────
     The agent reports two things separately: whether the plant tools respond
     and whether a language model is up. Re-read on open in case either changed
     while the drawer was closed. */
  useEffect(() => {
    if (!open) return;
    fetchModelStatus?.();
    if (isAgent) fetchAssistantStatus?.();
  }, [open, isAgent, fetchModelStatus, fetchAssistantStatus]);

  const status = deriveAssistantStatus({
    assistantStatus: isAgent ? assistantStatus : null,
    modelStatus,
    isConnected,
    busyKind,
    config,
    agent: isAgent,
  });
  const contextChips = useMemo(
    () => buildContextChips(system, { plantState, etsState, ahuState, plantConfig }),
    [system, plantState, etsState, ahuState, plantConfig]
  );

  /* ── sending ─────────────────────────────────────────────────────────────── */

  const send = useCallback(
    async (raw) => {
      const message = String(raw ?? "").trim();
      if (!message || busy) return;

      lastSentRef.current = message;
      setInput("");
      setError(null);
      setBusyKind(classifyCommand(message));

      try {
        if (isAgent) {
          // Lightweight context only: which workspace, and what is selected in
          // the schematic. Never the whole application state.
          const result = await sendAssistantMessage(message, {
            page: page?.workspace,
            selectedEquipment: page?.selectedEquipment ?? undefined,
            system,
          });
          if (result?.toolsUsed?.length) loadTwinState();
        } else {
          const result = await sendCopilotMessage(message);
          if (result?.actionExecuted) loadTwinState();
        }
      } catch (err) {
        setError({
          title: "The assistant could not complete that",
          body: isAgent
            ? "The plant tools, the MPC and the simulator run on the backend — check that it is reachable on :3007."
            : "The simulator is still available — scenarios, setpoint commands and plant analysis do not depend on the language model.",
          detail: err?.stack || err?.message || String(err),
        });
      } finally {
        setBusyKind(null);
      }
    },
    [busy, isAgent, sendAssistantMessage, sendCopilotMessage, loadTwinState, page, system]
  );

  const confirmAction = useCallback(
    (actionId) => confirmAssistantAction(actionId),
    [confirmAssistantAction]
  );

  const hasThread = conversationHistory.length > 0;

  // Clearing the thread, or reopening the drawer, must land on the top of the
  // welcome rather than wherever the last conversation had scrolled to.
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!hasThread) scrollRef.current?.scrollTo(0, 0);
  }, [hasThread, open]);

  // Contextual starters once the thread has started: anything urgent first,
  // then the same starter set as the welcome grid, as one wrapping row.
  const followUps = useMemo(() => {
    const urgent = suggestions
      .filter((s) => s.priority === "high")
      .map((s) => ({ key: `s-${s.id}`, label: s.label, prompt: s.prompt, urgent: true }));
    const quick = config.quickActions.map((a) => ({
      key: `q-${a.id}`,
      label: a.label,
      prompt: a.prompt,
      icon: a.icon,
    }));
    return [...urgent, ...quick];
  }, [suggestions, config.quickActions]);

  const header = (
    <div className="tw-asst-head">
      <span className="tw-asst-mark" aria-hidden="true">
        <AssistantIcon size={19} />
      </span>
      <div className="tw-asst-title">
        <h2>Plant AI Assistant</h2>
        <p className={`tw-asst-status tw-asst-status--${status.tone}`} title={status.title || undefined}>
          <span className="tw-asst-status-sys">{config.systemLabel}</span>
          <span aria-hidden="true">·</span>
          <i className="tw-asst-status-dot" aria-hidden="true" />
          <span>{status.label}</span>
        </p>
      </div>
    </div>
  );

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Plant AI Assistant"
      header={header}
      headerClass="tw-panel-header--asst"
      flush
    >
      <div className="tw-asst">
        {contextChips.length > 0 && (
          <div className="tw-asst-context">
            {contextChips.map((chip, idx) => (
              <React.Fragment key={chip.key}>
                {idx > 0 && <span className="tw-asst-context-sep" aria-hidden="true" />}
                <span>
                  {chip.label} <b>{chip.value}</b>
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className={`tw-asst-scroll ${hasThread ? "tw-asst-scroll--thread" : ""}`} ref={scrollRef}>
          {!hasThread ? (
            <AssistantWelcome
              config={config}
              statusNote={status.note}
              onRecheckModel={
                status.tone === "bad" || status.tone === "warn"
                  ? () => {
                      fetchModelStatus?.();
                      if (isAgent) fetchAssistantStatus?.();
                    }
                  : null
              }
              suggestions={suggestions}
              disabled={busy}
              onRun={send}
              agent={isAgent}
            />
          ) : (
            <>
              <StatusNote
                text={status.note}
                onRecheck={status.tone === "bad" ? fetchAssistantStatus ?? fetchModelStatus : null}
              />
              <Conversation
                messages={conversationHistory}
                authorLabel={config.authorLabel}
                busy={busy}
                busyLabel={busyLabels(busyKind, config).long}
                stage={isAgent ? assistantStage : null}
                error={error}
                onRetry={lastSentRef.current ? () => send(lastSentRef.current) : null}
                onRun={send}
                onConfirmAction={confirmAction}
                scrollHost={scrollRef}
              />
              {!busy && (
                <div className="tw-asst-ex tw-asst-followup" role="group" aria-label="Starter questions">
                  {followUps.map((item) => {
                    const Glyph = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={item.urgent ? "is-urgent" : ""}
                        onClick={() => send(item.prompt)}
                        title={item.prompt}
                      >
                        {item.urgent ? <AlertIcon size={13} /> : Glyph ? <Glyph size={13} /> : null}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={send}
          onInsert={setInput}
          busy={busy}
          config={config}
          agent={isAgent}
          canClear={hasThread}
          onClear={() => {
            clearConversation();
            setError(null);
          }}
        />
      </div>
    </SidePanel>
  );
}
