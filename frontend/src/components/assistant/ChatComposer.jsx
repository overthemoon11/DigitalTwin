import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, SendIcon, SpinIcon, TerminalIcon, TrashIcon } from "../ui/TwIcons";

/**
 * Input, and everything that used to be printed underneath it.
 *
 * The examples and the raw scenario-JSON box sit behind one disclosure so the
 * conversation keeps the space until someone asks for them.
 *
 * On the agent path the examples are exactly that — examples. They are not a
 * vocabulary, and the copy says so, because the single most important thing an
 * operator can learn about this panel is that they do not have to phrase
 * anything a particular way.
 */
export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  onInsert,
  busy,
  config,
  agent,
  canClear,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(config.scenarioJson);
  const areaRef = useRef(null);
  const panelId = useId();

  // Each system has its own scenario shape, so reset the box when the header
  // selector moves to another plant.
  useEffect(() => {
    setJson(config.scenarioJson);
  }, [config.scenarioJson]);

  // Grow with the message, up to the CSS max-height.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const submit = (event) => {
    event.preventDefault();
    onSubmit(value);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit(value);
    }
  };

  const useExample = (example) => {
    onInsert(example);
    setOpen(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  return (
    <div className="tw-asst-foot">
      {open && (
        <div className="tw-asst-adv" id={panelId}>
          <h5>{agent ? "Example questions" : "Command examples"}</h5>
          <p>
            {agent
              ? "Examples, not commands — ask anything in your own words. Pick one to put it in the box and edit it before sending."
              : "Pick one to put it in the box, then edit it before sending."}
          </p>
          <div className="tw-asst-ex">
            {config.examples.map((example) => (
              <button key={example} type="button" onClick={() => useExample(example)}>
                {example}
              </button>
            ))}
          </div>

          <div className="tw-asst-adv-sep">
            <h5>Advanced · scenario JSON</h5>
            <p>
              Sent as a message, exactly as pasting it into the box. Use{" "}
              <code>{'{ "id": "…" }'}</code> for a preset ({config.scenarioIds.join(", ")}) or{" "}
              <code>controls</code> for a custom one. Plain English works too —{" "}
              <em>&ldquo;run the peak summer scenario&rdquo;</em>.
            </p>
            <textarea
              className="tw-asst-json"
              value={json}
              spellCheck={false}
              aria-label="Scenario JSON"
              onChange={(event) => setJson(event.target.value)}
            />
            <div className="tw-asst-json-actions">
              <button
                type="button"
                className="tw-btn tw-btn--sm tw-btn--soft"
                disabled={busy || !json.trim()}
                onClick={() => {
                  onSubmit(json);
                  setOpen(false);
                }}
              >
                Run scenario JSON
              </button>
              <button
                type="button"
                className="tw-btn tw-btn--sm tw-btn--ghost"
                onClick={() => setJson(config.scenarioJson)}
              >
                Reset template
              </button>
            </div>
          </div>
        </div>
      )}

      <form className="tw-asst-form" onSubmit={submit}>
        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          placeholder={config.placeholder}
          aria-label={config.inputLabel}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="tw-asst-send"
          disabled={busy || !value.trim()}
          aria-label="Send message"
          title="Send message"
        >
          {busy ? <SpinIcon size={16} className="tw-spin" /> : <SendIcon size={16} />}
        </button>
      </form>

      <div className="tw-asst-meta">
        <button
          type="button"
          className="tw-asst-link"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <TerminalIcon size={14} />
          Examples &amp; advanced
          <ChevronDownIcon size={13} className="tw-asst-chev" />
        </button>

        {canClear && (
          <button type="button" className="tw-asst-link tw-asst-link--end" onClick={onClear}>
            <TrashIcon size={14} />
            Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}
