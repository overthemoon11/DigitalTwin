import React from "react";

/**
 * Compact 62px workspace navigation.
 *
 * Icons plus hover tooltips rather than a permanent labelled sidebar: the old
 * layout spent 300–660px of every screen on navigation and configuration that
 * an operator reads once a session, which is precisely the width the digital
 * twin needed.
 *
 * When collapsed from the header the same items render as a horizontal strip
 * (`WorkspaceTabBar`) so no workspace ever becomes unreachable.
 */
export default function WorkspaceRail({ items, value, onChange, hidden }) {
  if (hidden) return null;
  return (
    <nav className="tw-rail" aria-label="Workspace">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="tw-rail-item"
          aria-current={value === item.id ? "page" : undefined}
          aria-label={item.label}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.badge ? <span className="tw-rail-badge" /> : null}
          <span className="tw-rail-tip">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function WorkspaceTabBar({ items, value, onChange, visible }) {
  return (
    <div className={`tw-tabbar ${visible ? "tw-tabbar--on" : ""}`} role="navigation" aria-label="Workspace">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={value === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
