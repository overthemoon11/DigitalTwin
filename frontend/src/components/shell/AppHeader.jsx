import React from "react";
import { ChatIcon, GuideIcon, MenuIcon, SearchIcon } from "../ui/TwIcons";

/**
 * Global header.
 *
 * Three zones, and the middle one is the important decision: the system
 * selector (which plant am I looking at) is NOT the page navigation (what am I
 * doing with it). Mixing them was the single most confusing thing about the old
 * tab bar — "AHU" and "Constraints" are not alternatives to one another.
 */
export default function AppHeader({
  systems,
  activeSystem,
  onSelectSystem,
  onToggleNav,
  navOpen,
  onOpenSearch,
  onOpenChat,
  chatOpen,
  isConnected,
}) {
  return (
    <header className="tw-header">
      <div className="tw-header-left">
        <button
          type="button"
          className="tw-icon-btn"
          onClick={onToggleNav}
          aria-label={navOpen ? "Collapse workspace navigation" : "Expand workspace navigation"}
          aria-expanded={navOpen}
        >
          <MenuIcon />
        </button>

        <div className="tw-brand">
          <span className="tw-brand-mark" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.6 3.6 7.3v9.4L12 21.4l8.4-4.7V7.3z" />
              <path d="M12 12.1 3.6 7.3M12 12.1l8.4-4.8M12 12.1v9.3" />
            </svg>
          </span>
          <span className="tw-brand-text">
            <strong>Digital Twin</strong>
            <span>Plant optimisation platform</span>
          </span>
        </div>
      </div>

      <div className="tw-header-center">
        <div className="tw-system-tabs" role="group" aria-label="System">
          {systems.map((system) => (
            <button
              key={system.id}
              type="button"
              className="tw-system-tab"
              aria-pressed={activeSystem === system.id}
              onClick={() => onSelectSystem(system.id)}
            >
              {system.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tw-header-right">
        <button type="button" className="tw-search-btn" onClick={onOpenSearch}>
          <SearchIcon size={15} />
          <span>Search</span>
          <kbd>Ctrl K</kbd>
        </button>

        <a
          className="tw-icon-btn"
          href="/docs/user-guide.html"
          target="_blank"
          rel="noreferrer"
          title="User guide — how to use this application"
          aria-label="User guide"
        >
          <GuideIcon />
        </a>

        <button
          type="button"
          className="tw-icon-btn"
          onClick={onOpenChat}
          aria-pressed={chatOpen}
          title="Plant AI Assistant"
          aria-label="Plant AI Assistant"
        >
          <ChatIcon />
        </button>

        <span className="tw-header-divider" aria-hidden="true" />

        <span
          className={`tw-pill ${isConnected ? "tw-pill--ok" : "tw-pill--bad"} tw-pill--sm`}
          title={isConnected ? "Backend API and telemetry connected" : "Backend API unreachable"}
        >
          <i />
          {isConnected ? "Online" : "Offline"}
        </span>

        <span className="tw-user">
          <span className="tw-user-avatar" aria-hidden="true">
            OP
          </span>
          <span className="tw-user-name">Plant Operator</span>
        </span>
      </div>
    </header>
  );
}
