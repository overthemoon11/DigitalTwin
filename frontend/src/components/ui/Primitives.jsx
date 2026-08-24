import React, { useEffect, useId, useRef, useState } from "react";

/**
 * The small set of shapes every workspace is built from.
 *
 * Deliberately unopinionated about content: a KPI card knows how to sit in a
 * grid and how to render a number beside its unit, and nothing about what a
 * chiller is. Anything that needs plant knowledge lives in the workspace.
 */

/* ── numbers ─────────────────────────────────────────────────────────────── */

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Locale-grouped fixed-decimal number, or an em-dash. Never invents a value. */
export function fmt(value, decimals = 0) {
  if (!isNum(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ── surfaces ────────────────────────────────────────────────────────────── */

export function Card({ as: Tag = "section", pad = true, className = "", children, ...rest }) {
  return (
    <Tag className={`tw-card ${pad ? "tw-card--pad" : "tw-card--flush"} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHead({ eyebrow, title, subtitle, actions, tight = false }) {
  return (
    <header className={`tw-card-head ${tight ? "tw-card-head--tight" : ""}`}>
      <div>
        {eyebrow && <span className="tw-eyebrow">{eyebrow}</span>}
        {title && <h3>{title}</h3>}
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="tw-card-head-actions">{actions}</div>}
    </header>
  );
}

export function PageHead({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="tw-page-head">
      <div>
        {eyebrow && <span className="tw-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="tw-page-head-actions">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, note, actions }) {
  return (
    <div className="tw-section">
      <h3>{title}</h3>
      {note && <p>{note}</p>}
      <span className="tw-section-rule" />
      {actions}
    </div>
  );
}

/* ── status ──────────────────────────────────────────────────────────────── */

const PILL_TONE = {
  ok: "tw-pill--ok",
  info: "tw-pill--info",
  warn: "tw-pill--warn",
  bad: "tw-pill--bad",
  busy: "tw-pill--busy",
  neutral: "",
};

export function StatusPill({ tone = "neutral", children, small = false, title }) {
  return (
    <span className={`tw-pill ${PILL_TONE[tone] ?? ""} ${small ? "tw-pill--sm" : ""}`} title={title}>
      <i />
      {children}
    </span>
  );
}

/* ── KPI ─────────────────────────────────────────────────────────────────── */

export function KpiCard({ label, value, unit, note, glyph, tone = "blue", feature = false, footer, empty = false }) {
  return (
    <article className={`tw-kpi tw-kpi--${tone} ${feature ? "tw-kpi--feature" : ""}`}>
      <div className="tw-kpi-top">
        <span className="tw-kpi-label">{label}</span>
        {glyph && <span className="tw-kpi-glyph">{glyph}</span>}
      </div>
      <div>
        <div className={`tw-kpi-value ${empty ? "tw-kpi-value--empty" : ""}`}>
          {value}
          {unit ? <em>{unit}</em> : null}
        </div>
        {note && <p className="tw-kpi-note">{note}</p>}
        {footer && <div className="tw-kpi-feature-foot">{footer}</div>}
      </div>
    </article>
  );
}

/* ── data display ────────────────────────────────────────────────────────── */

export function DataRow({ label, value, unit, title }) {
  return (
    <div className="tw-datarow" title={title}>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <em>{unit}</em> : null}
      </strong>
    </div>
  );
}

export function Metric({ label, value, unit, note, title }) {
  return (
    <div className="tw-metric" title={title}>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <em>{unit}</em> : null}
      </strong>
      {note && <small>{note}</small>}
    </div>
  );
}

/* ── tabs ────────────────────────────────────────────────────────────────── */

export function Tabs({ items, value, onChange, label }) {
  return (
    <div className="tw-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ── progressive disclosure ──────────────────────────────────────────────────
   The old UI carried long engineering explanations permanently on screen.
   They are not deleted — they moved in here, one click away from the number
   they qualify. */

export function InfoHint({ title, children, label = "What this means" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="tw-hint" ref={ref}>
      <button
        type="button"
        className="tw-hint-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <div className="tw-hint-pop" id={id} role="note">
          {title && <strong>{title}</strong>}
          {children}
        </div>
      )}
    </span>
  );
}

/* ── empty state ─────────────────────────────────────────────────────────── */

export function EmptyState({ glyph, title, children, action }) {
  return (
    <div className="tw-empty">
      {glyph && <span className="tw-empty-glyph">{glyph}</span>}
      <h3>{title}</h3>
      {children}
      {action}
    </div>
  );
}
