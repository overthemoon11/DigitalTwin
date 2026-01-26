/**
 * SVG Icon Components for HVAC Digital Twin
 * Provides professional vector icons for the UI
 */

import React from 'react';

// Icon wrapper component with consistent sizing
const Icon = ({ children, size = 20, color = 'currentColor', className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {children}
  </svg>
);

// Energy / Power icon (lightning bolt)
export const EnergyIcon = (props) => (
  <Icon {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none" />
  </Icon>
);

// Temperature / Thermometer icon
export const TemperatureIcon = (props) => (
  <Icon {...props}>
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </Icon>
);

// Air Quality / Wind icon
export const AirQualityIcon = (props) => (
  <Icon {...props}>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  </Icon>
);

// Operational / Settings / Gear icon
export const OperationalIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

// Cost / Dollar icon
export const CostIcon = (props) => (
  <Icon {...props}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </Icon>
);

// Chart / Analytics icon
export const ChartIcon = (props) => (
  <Icon {...props}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);

// Building icon
export const BuildingIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
  </Icon>
);

// Zone / Room icon
export const ZoneIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </Icon>
);

// AHU / HVAC unit icon
export const AHUIcon = (props) => (
  <Icon {...props}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="8" cy="12" r="2" />
    <path d="M14 10v4M18 10v4" />
    <path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
  </Icon>
);

// Chiller icon (snowflake-like)
export const ChillerIcon = (props) => (
  <Icon {...props}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4" />
  </Icon>
);

// Boiler / Fire icon
export const BoilerIcon = (props) => (
  <Icon {...props}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Icon>
);

// Pump icon
export const PumpIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </Icon>
);

// Filter icon
export const FilterIcon = (props) => (
  <Icon {...props}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </Icon>
);

// Alert / Warning icon
export const AlertIcon = (props) => (
  <Icon {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

// Check / Success icon
export const CheckIcon = (props) => (
  <Icon {...props}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

// Close / X icon
export const CloseIcon = (props) => (
  <Icon {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);

// Robot / AI Copilot icon
export const CopilotIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="4" />
    <path d="M8 15h.01M16 15h.01" />
    <path d="M9 18h6" />
  </Icon>
);

// Controls / Sliders icon
export const ControlsIcon = (props) => (
  <Icon {...props}>
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </Icon>
);

// KPI / Dashboard icon
export const DashboardIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </Icon>
);

// Trend Up icon
export const TrendUpIcon = (props) => (
  <Icon {...props}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </Icon>
);

// Trend Down icon
export const TrendDownIcon = (props) => (
  <Icon {...props}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </Icon>
);

// Trend Stable icon
export const TrendStableIcon = (props) => (
  <Icon {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Icon>
);

// Play / Simulate icon
export const PlayIcon = (props) => (
  <Icon {...props}>
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
  </Icon>
);

// Reset icon
export const ResetIcon = (props) => (
  <Icon {...props}>
    <path d="M1 4v6h6" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </Icon>
);

// Send message icon
export const SendIcon = (props) => (
  <Icon {...props}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </Icon>
);

// CO2 icon (cloud with text)
export const CO2Icon = (props) => (
  <Icon {...props}>
    <path d="M17 18a5 5 0 0 0-10 0" />
    <path d="M12 9v3" />
    <circle cx="12" cy="6" r="3" />
    <text x="12" y="22" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none">CO₂</text>
  </Icon>
);

// Floor icon
export const FloorIcon = (props) => (
  <Icon {...props}>
    <rect x="2" y="7" width="20" height="3" />
    <path d="M22 10v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8" />
    <path d="M6 7V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
  </Icon>
);

// VAV icon (duct with damper)
export const VAVIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="8" width="18" height="8" rx="1" />
    <path d="M7 8V6M17 8V6M12 8V4" />
    <path d="M7 16v2M17 16v2M12 16v4" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </Icon>
);

// Export icon mapping for category icons
export const CATEGORY_ICONS = {
  energy: EnergyIcon,
  comfort: TemperatureIcon,
  iaq: AirQualityIcon,
  operational: OperationalIcon,
  cost: CostIcon,
};

// Export icon mapping for asset type icons
export const ASSET_TYPE_ICONS = {
  building: BuildingIcon,
  floor: FloorIcon,
  zone: ZoneIcon,
  ahu: AHUIcon,
  vav: VAVIcon,
  chiller: ChillerIcon,
  boiler: BoilerIcon,
  pump: PumpIcon,
  filter: FilterIcon,
};

// Export trend icon mapping
export const TREND_ICONS = {
  improving: TrendUpIcon,
  degrading: TrendDownIcon,
  stable: TrendStableIcon,
};

export default Icon;
