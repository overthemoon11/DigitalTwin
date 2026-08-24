import React from "react";

/**
 * One icon family for the whole product shell.
 *
 * Stroke-only, 1.6px, 24-grid — the same drawing rules across navigation, KPI
 * glyphs and header actions, so nothing reads as borrowed from a second set.
 * The existing `common/Icons.jsx` set stays where it is: it is used by the
 * alert / KPI panels of the other domains and mixing the two inside one card
 * is what makes an interface look assembled rather than designed.
 */
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const Icon = ({ size, children, ...rest }) => (
  <svg {...base} {...(size ? { width: size, height: size } : null)} {...rest}>
    {children}
  </svg>
);

/* ── workspaces ─────────────────────────────────────────────────────────── */

export const PlantIcon = (p) => (
  <Icon {...p}>
    <path d="M3 21h18" />
    <path d="M5 21V9l5-3v15" />
    <path d="M14 21V4l5 2v15" />
    <path d="M8.5 12h.01M8.5 15.5h.01M16.5 10h.01M16.5 14h.01" />
  </Icon>
);

export const SimulationIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
    <path d="M21 3v6h-6" />
    <path d="M8 13.5c1.4 0 1.4-3 2.8-3s1.4 3 2.8 3 1.4-3 2.8-3" />
  </Icon>
);

export const OptimizeIcon = (p) => (
  <Icon {...p}>
    <path d="M3 17l5-5 3.5 3.5L21 5" />
    <path d="M15 5h6v6" />
    <circle cx="8" cy="12" r="1.4" />
  </Icon>
);

export const AnalyticsIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" />
    <rect x="7" y="11" width="3" height="6" rx="1" />
    <rect x="12.5" y="7" width="3" height="10" rx="1" />
    <rect x="18" y="13" width="3" height="4" rx="1" />
  </Icon>
);

export const EngineeringIcon = (p) => (
  <Icon {...p}>
    <path d="M10.6 3.5 9.9 5.9a7 7 0 0 0-1.7 1l-2.4-.7-1.4 2.4 1.8 1.7a7 7 0 0 0 0 2l-1.8 1.7 1.4 2.4 2.4-.7a7 7 0 0 0 1.7 1l.7 2.4h2.8l.7-2.4a7 7 0 0 0 1.7-1l2.4.7 1.4-2.4-1.8-1.7a7 7 0 0 0 0-2l1.8-1.7-1.4-2.4-2.4.7a7 7 0 0 0-1.7-1l-.7-2.4z" />
    <circle cx="12" cy="12" r="2.6" />
  </Icon>
);

/* ── metrics ────────────────────────────────────────────────────────────── */

export const LoadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    <circle cx="12" cy="12" r="3.4" />
  </Icon>
);

export const PowerIcon = (p) => (
  <Icon {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />
  </Icon>
);

export const EfficiencyIcon = (p) => (
  <Icon {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-4" />
    <circle cx="12" cy="18" r="1.2" />
  </Icon>
);

export const SavingIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M7 7v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" />
    <path d="M12 16V10" />
    <path d="m9.5 12.5 2.5-2.5 2.5 2.5" />
  </Icon>
);

/* ── shell actions ──────────────────────────────────────────────────────── */

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
);

export const GuideIcon = (p) => (
  <Icon {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </Icon>
);

export const ChatIcon = (p) => (
  <Icon {...p}>
    <path d="M20 15a2.5 2.5 0 0 1-2.5 2.5H9L4 21V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />
    <path d="M8.5 10.5h7M8.5 13.5h4" />
  </Icon>
);

export const MenuIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const AssetsIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3 3.5 7.5 12 12l8.5-4.5z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
  </Icon>
);

export const AlertIcon = (p) => (
  <Icon {...p}>
    <path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 16.5h.01" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const SpinIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Icon>
);

export const ArrowRightIcon = (p) => (
  <Icon {...p}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const SolverIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M7.5 9.5h4M7.5 13h6M15.5 9.5h1M15.5 13h1M7.5 16.5h9" />
  </Icon>
);

export const ConstraintIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6h16M4 18h16" />
    <path d="M8 10.5h8v3H8z" />
    <path d="M12 6v4.5M12 13.5V18" />
  </Icon>
);

export const PointsIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="8" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="14" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="10" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const ModelIcon = (p) => (
  <Icon {...p}>
    <circle cx="6" cy="7" r="2.4" />
    <circle cx="18" cy="7" r="2.4" />
    <circle cx="12" cy="17.5" r="2.4" />
    <path d="M8.4 7h7.2M7.3 9.2l3.4 6.2M16.7 9.2l-3.4 6.2" />
  </Icon>
);

export const SlidersIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4v6M5 14v6M12 4v3M12 11v9M19 4v10M19 18v2" />
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="9" r="2" />
    <circle cx="19" cy="16" r="2" />
  </Icon>
);

/* ── assistant ──────────────────────────────────────────────────────────── */

export const AssistantIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.2l1.5 4.1 4.1 1.5-4.1 1.5L12 14.4l-1.5-4.1L6.4 8.8l4.1-1.5z" />
    <path d="M18.4 14.6l.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75z" />
    <path d="M6 16.5h4.5" />
  </Icon>
);

export const SendIcon = (p) => (
  <Icon {...p}>
    <path d="M4.4 11.9 20 5l-6.9 15.6-2-6.7z" />
    <path d="m11.1 13.9 8.9-8.9" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.8 11.4A1.7 1.7 0 0 0 9 20h6a1.7 1.7 0 0 0 1.7-1.6L17.5 7" />
    <path d="M10.5 11v5M13.5 11v5" />
  </Icon>
);

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
  </Icon>
);

export const FlameIcon = (p) => (
  <Icon {...p}>
    <path d="M12 21c3.5 0 6-2.3 6-5.5 0-4.4-4.2-5.9-3.4-11.5-2.6 1-4.4 3.3-4.4 5.6 0 1.4.6 2.2.6 2.9 0 .9-.7 1.5-1.5 1.5S8 13.3 8 12c-1.3 1.2-2 2.7-2 4.4C6 19 8.4 21 12 21z" />
  </Icon>
);

export const BuildingIcon = (p) => (
  <Icon {...p}>
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21" />
    <path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21" />
    <path d="M3 21h18" />
    <path d="M7.5 8h4M7.5 12h4M7.5 16h4" />
  </Icon>
);

export const BellIcon = (p) => (
  <Icon {...p}>
    <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" />
    <path d="M10 18a2 2 0 0 0 4 0" />
  </Icon>
);

export const TrendDownIcon = (p) => (
  <Icon {...p}>
    <path d="M3 7l6 6 3.5-3.5L21 17" />
    <path d="M21 11v6h-6" />
  </Icon>
);

export const TrendUpIcon = (p) => (
  <Icon {...p}>
    <path d="M3 17l6-6 3.5 3.5L21 7" />
    <path d="M15 7h6v6" />
  </Icon>
);

export const DropletIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.2s5.5 5.6 5.5 9.4a5.5 5.5 0 0 1-11 0C6.5 8.8 12 3.2 12 3.2z" />
  </Icon>
);

export const FilterIcon = (p) => (
  <Icon {...p}>
    <path d="M4.5 5h15l-5.8 7v6.2l-3.4-1.8V12z" />
  </Icon>
);

export const WindIcon = (p) => (
  <Icon {...p}>
    <path d="M3 8.5h10a2.6 2.6 0 1 0-2.6-2.6" />
    <path d="M3 15.5h13a2.6 2.6 0 1 1-2.6 2.6" />
    <path d="M3 12h17" />
  </Icon>
);

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4z" />
  </Icon>
);

export const ExchangeIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8.5h13M14 5.5l3 3-3 3" />
    <path d="M20 15.5H7M10 12.5l-3 3 3 3" />
  </Icon>
);

export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const RetryIcon = (p) => (
  <Icon {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.5 4.5V10h-5.4" />
  </Icon>
);

export const TerminalIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="m7.5 10 2.4 2.4-2.4 2.4" />
    <path d="M12.5 14.8h4" />
  </Icon>
);

export default Icon;
