import React, { useEffect, useState } from "react";
import { AlertIcon, AssistantIcon, RetryIcon } from "../ui/TwIcons";
import MessageBody from "./MessageBody";
import {
  AnswerActions,
  AnswerBlocks,
  AnswerFooter,
  AnswerWarnings,
  ProposedActionCard,
} from "./AnswerMeta";

/**
 * The thread. Author is a label rather than an avatar column, so a reply gets
 * the full panel width — the old build spent 2rem of a 480 px drawer on
 * indentation.
 *
 * An assistant turn now carries `meta`: where its numbers came from, which
 * tools ran, the metric and comparison blocks, any caveat, any change waiting
 * for confirmation, and the follow-ups the answer itself suggested. A turn
 * without `meta` — the ETS and AHU panels, which still answer locally — renders
 * exactly as it did before.
 */
export default function Conversation({
  messages,
  authorLabel,
  busy,
  busyLabel,
  stage,
  error,
  onRetry,
  onRun,
  onConfirmAction,
  scrollHost,
}) {
  const [showDetail, setShowDetail] = useState(false);

  // Scroll the panel's scroller rather than the last message into view: the
  // contextual action chips live below the thread and must stay reachable.
  useEffect(() => {
    const host = scrollHost?.current;
    if (!host) return;
    host.scrollTo({ top: host.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages, busy, error, scrollHost]);

  useEffect(() => {
    setShowDetail(false);
  }, [error]);

  const lastIndex = messages.length - 1;

  return (
    <section className="tw-asst-thread" aria-label="Conversation" aria-live="polite">
      {messages.map((message, idx) => {
        const isUser = message.role === "user";
        const meta = message.meta;
        const isLast = idx === lastIndex;

        // A streaming turn with nothing yet is drawn by the thinking indicator
        // below, not as an empty bubble.
        if (!isUser && meta?.streaming && !message.content) return null;

        return (
          <article
            className={`tw-asst-msg ${isUser ? "tw-asst-msg--user" : "tw-asst-msg--ai"}`}
            key={`${message.role}-${idx}`}
          >
            <header className="tw-asst-msg-who">
              {!isUser && <AssistantIcon size={13} />}
              {isUser ? "You" : authorLabel}
            </header>
            <div className="tw-asst-bubble">
              {isUser ? (
                message.content
              ) : (
                <>
                  <MessageBody text={message.content} />
                  {!meta?.streaming && <AnswerBlocks blocks={meta?.blocks} />}
                  {!meta?.streaming && (
                    // A warning attached to a pending change is shown inside its
                    // card, beside the button that would apply it. Repeating it
                    // here would read as two separate problems.
                    <AnswerWarnings
                      warnings={(meta?.warnings ?? []).filter(
                        (w) => !(meta?.proposedActions ?? []).some((a) => a.warnings?.includes(w))
                      )}
                    />
                  )}
                  {(meta?.proposedActions ?? []).map((action) => (
                    <ProposedActionCard
                      key={action.id}
                      action={action}
                      busy={busy}
                      onConfirm={onConfirmAction}
                    />
                  ))}
                  {(meta?.appliedActions ?? []).map((applied, i) => (
                    <ProposedActionCard key={`applied-${i}`} action={applied.action} applied={applied} />
                  ))}
                  {meta?.failed && (
                    <div className="tw-asst-note tw-asst-note--warn" role="alert">
                      <AlertIcon size={15} />
                      <span>{meta.error}</span>
                    </div>
                  )}
                  <AnswerFooter meta={meta} />
                  {isLast && !busy && (
                    <AnswerActions actions={meta?.actions} onRun={onRun} disabled={busy} />
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}

      {busy && (
        <article className="tw-asst-msg tw-asst-msg--ai">
          <header className="tw-asst-msg-who">
            <AssistantIcon size={13} />
            {authorLabel}
          </header>
          <div className="tw-asst-think" role="status">
            <span className="tw-asst-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {/* The tool stage is more informative than a generic spinner, and
                it is also the honest description of what is happening. */}
            {stage?.label ? `${stage.label}…` : busyLabel}
          </div>
        </article>
      )}

      {error && (
        <div className="tw-asst-err" role="alert">
          <h4>
            <AlertIcon size={16} />
            {error.title}
          </h4>
          <p>{error.body}</p>
          <div className="tw-asst-err-actions">
            {onRetry && (
              <button type="button" className="tw-btn tw-btn--sm" onClick={onRetry}>
                <RetryIcon size={14} />
                Retry
              </button>
            )}
            {error.detail && (
              <button
                type="button"
                className="tw-btn tw-btn--sm tw-btn--ghost"
                aria-expanded={showDetail}
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? "Hide technical details" : "Show technical details"}
              </button>
            )}
          </div>
          {showDetail && error.detail && <pre>{error.detail}</pre>}
        </div>
      )}
    </section>
  );
}
