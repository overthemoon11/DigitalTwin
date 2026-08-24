import React, { useEffect, useRef } from "react";
import { CloseIcon } from "../ui/TwIcons";

/**
 * Right-hand side panel used for everything that is a task rather than a page:
 * the asset browser, the chatbot, a focused constraint edit reached from
 * somewhere other than the Engineering workspace.
 *
 * Long-lived configuration does NOT live here — that is what the Simulation and
 * Engineering workspaces are for. A drawer that holds the primary form is just
 * a sidebar with extra steps.
 */
export default function SidePanel({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  wide = false,
  flush = false,
  /** Replaces the eyebrow + title block. The close button stays. */
  header,
  headerClass = "",
}) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Reopening a panel should start at the top rather than wherever the previous
  // visit left the scroll position.
  useEffect(() => {
    if (open) bodyRef.current?.scrollTo(0, 0);
  }, [open]);

  return (
    <div className={`tw-panel-layer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button
        type="button"
        className="tw-panel-scrim"
        onClick={onClose}
        aria-label={`Close ${title}`}
        tabIndex={open ? 0 : -1}
      />
      <aside className={`tw-panel ${wide ? "tw-panel--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className={`tw-panel-header ${headerClass}`}>
          {header ?? (
            <div>
              {eyebrow && <span className="tw-eyebrow">{eyebrow}</span>}
              <h2>{title}</h2>
            </div>
          )}
          <button type="button" className="tw-icon-btn" onClick={onClose} aria-label={`Close ${title}`}>
            <CloseIcon />
          </button>
        </header>
        <div className={`tw-panel-body ${flush ? "tw-panel-body--flush" : ""}`} ref={bodyRef}>
          {open ? children : null}
        </div>
        {footer && <footer className="tw-panel-footer">{footer}</footer>}
      </aside>
    </div>
  );
}
