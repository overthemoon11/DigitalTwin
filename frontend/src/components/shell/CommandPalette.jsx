import React, { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../ui/TwIcons";

/**
 * Ctrl/Cmd-K search over the things this application actually contains:
 * workspaces, the equipment the twin is currently modelling, and the handful of
 * actions that change plant state.
 *
 * Nothing here is a fixture — every equipment entry comes from the live
 * `plantState.equipment` map, so the list is empty before the twin has loaded
 * rather than showing plausible-looking placeholder tags.
 */
export default function CommandPalette({ open, onClose, groups }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after the paint that mounts the input.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !needle ||
            item.label.toLowerCase().includes(needle) ||
            (item.hint ?? "").toLowerCase().includes(needle)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => results.flatMap((group) => group.items), [results]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  if (!open) return null;

  const run = (item) => {
    onClose();
    item.run();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") return onClose();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      return setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      return setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    }
    if (event.key === "Enter" && flat[cursor]) {
      event.preventDefault();
      return run(flat[cursor]);
    }
    return undefined;
  };

  let index = -1;

  return (
    <div
      className="tw-cmd-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tw-cmd" role="dialog" aria-modal="true" aria-label="Search">
        <div className="tw-cmd-input">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search workspaces, equipment and actions…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
        </div>
        <div className="tw-cmd-list">
          {results.length === 0 && <p className="tw-cmd-empty">Nothing matches “{query}”.</p>}
          {results.map((group) => (
            <div key={group.title}>
              <div className="tw-cmd-group">{group.title}</div>
              {group.items.map((item) => {
                index += 1;
                const active = index === cursor;
                const at = index;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`tw-cmd-item ${active ? "is-active" : ""}`}
                    onMouseEnter={() => setCursor(at)}
                    onClick={() => run(item)}
                  >
                    {item.icon}
                    {item.label}
                    {item.hint && <small>{item.hint}</small>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
