/**
 * Read-only derivations over a horizon run.
 *
 * Every workspace that shows the same number must derive it the same way, or
 * the Plant page and the Optimization page will eventually disagree about what
 * the MPC did. Nothing here computes physics — it reshapes what the server
 * already sent.
 */

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const num = (v, decimals = 0) =>
  isNum(v)
    ? Number(v).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "—";

/** Live plant KPI by id, from the WebSocket-delivered plant state. */
export const kpiValue = (plantState, id) => {
  const kpi = plantState?.kpis?.find((item) => item.id === id);
  return typeof kpi?.value === "number" ? kpi.value : undefined;
};

/** The duty machines, or the bare count when the model does not name them. */
export function stagingLabel(control) {
  if (!control) return "—";
  if (control.chillerIds?.length) {
    // Non-breaking hyphen: a soft wrap after an ordinary "-" would split "CH-4".
    return control.chillerIds.map((id) => id.replace(/-/g, "‑")).join(", ");
  }
  return `${control.runningChillers}`;
}

/**
 * The six manipulated variables, in the order an operator reads them: the two
 * setpoints that drive everything, then staging, then the three speeds.
 */
export const CONTROL_ROWS = [
  { key: "chwstSetpointC", label: "CHWST setpoint", short: "CHWST", unit: "°C", decimals: 2 },
  { key: "dpSetpointPsi", label: "Differential pressure", short: "DP", unit: "psi", decimals: 1 },
  { key: "runningChillers", label: "Chiller staging", short: "Chillers", text: stagingLabel },
  { key: "chwpSpeedPct", label: "CHWP speed", short: "CHWP", unit: "%", decimals: 1 },
  { key: "cwpSpeedPct", label: "CWP speed", short: "CWP", unit: "%", decimals: 1 },
  { key: "ctFanSpeedPct", label: "CT fan speed", short: "CT fan", unit: "%", decimals: 1 },
];

export function controlText(control, row) {
  if (!control) return "—";
  if (row.text) return row.text(control);
  return num(control[row.key], row.decimals ?? 1);
}

export function controlDelta(before, after, row) {
  if (!before || !after || row.text) return null;
  const a = before[row.key];
  const b = after[row.key];
  if (!isNum(a) || !isNum(b) || Math.abs(b - a) < 1e-6) return null;
  return { direction: b > a ? "up" : "down", value: b - a };
}

/**
 * What the model behind each control actually rests on.
 *
 * The provenance badge says whether the solver SEARCHED the value; these notes
 * say how well the model underneath is calibrated. Both have to be visible or a
 * row overstates itself — DP is genuinely optimised and sits on a relation this
 * site never trended.
 */
export const CONTROL_NOTE = {
  chwstSetpointC:
    "Site-calibrated chiller response. Bounded by the CHWR return limit in Engineering → Constraints — that limit is what stops a reset running away.",
  dpSetpointPsi:
    "Searched, but this site trends NO differential pressure. The DP-to-pump-speed relation is a twin default, so the pump operating point and its energy are real while the DP number attached to them is not site-validated.",
  runningChillers:
    "Site-calibrated. Part-load shape from a Gordon-Ng fit to the same trend, which is what stops extra machines looking free.",
  chwpSpeedPct:
    "Follows the DP setpoint through one documented map, so the two can be executed together. Pump power level is measured; the affinity response away from it is physics.",
  cwpSpeedPct:
    "Searched. The condenser-flow penalty on compressor lift is physics-based, not site-calibrated — T1 ran its condenser pumps at a fixed point all month.",
  ctFanSpeedPct:
    "Searched. Approach LEVEL is site-fitted (0.10 K held-out MAE); the fan-speed response is a standard tower power law, since fan speed is not trended.",
};

export const PROVENANCE_LABEL = {
  optimized: "Optimised",
  derived: "Derived",
  "baseline-derived": "Inherited baseline",
  fixed: "Fixed",
  "not-available": "Not available",
};

export const PROVENANCE_TITLE = {
  optimized: "The optimiser searched this variable and chose this value.",
  derived:
    "Computed from an optimised variable through a documented model — genuinely responsive and included in the energy result, but not searched independently.",
  "baseline-derived": "Not optimised in this run — carried over from the plant's current operation.",
  fixed: "Pinned by configuration; the optimiser was not allowed to move it.",
  "not-available":
    "The plant model cannot represent this variable's effect yet, so no value is proposed.",
};

/** Plain-language names for the constraint codes the solver reports as active. */
export const ACTIVE_CONSTRAINT = {
  CHWR_LIMIT: {
    label: "CHWR return limit",
    why: "The optimum sits on the maximum allowed loop return temperature — widening it would buy more saving, at the cost of a warmer loop.",
  },
  CHWR_TERMINAL_LIMIT: {
    label: "CHWR limit at the horizon end",
    why: "Cooling deferred into the loop has to be paid back before the horizon closes, so the last steps are bounded.",
  },
  CAPACITY_SHORTFALL: {
    label: "Staged capacity",
    why: "The machines the constraint set allows to run cannot cover the load with margin.",
  },
  LOOP_WARMING: {
    label: "Cooling deferred into the loop",
    why: "The plan is using the loop's thermal mass as short-term storage rather than serving the load instantaneously.",
  },
  CHILLER_SWITCH: {
    label: "Chiller switching penalty",
    why: "A staging change would pay for itself on energy alone; the switching penalty is what holds it back.",
  },
  OUTSIDE_OPERATING_HOURS: {
    label: "Plant schedule",
    why: "The operating-hours window bounds what the plant is permitted to do at this step.",
  },
};

export const COST_LABEL = {
  energyKwh: "Plant energy",
  unmetPenalty: "Unservable cooling",
  loopCarryPenalty: "Deferred cooling",
  chwrPenalty: "CHWR overshoot",
  switchingPenalty: "Chiller switching",
  movementPenalty: "Setpoint movement",
  terminalStoragePenalty: "Loop energy left behind",
  infeasiblePenalty: "Constraint violation",
};

/**
 * The headline percentage — the SERVER decides which one it is.
 *
 * If the two arms did not deliver the same cooling then a kWh difference is
 * partly a difference in load served, and the honest figure is kW/RT. Choosing
 * here would let the UI quote whichever number looked better.
 */
export function headlineSaving(run) {
  if (!run) return null;
  const s = run.savings;
  const isEfficiency = s.headline === "kwPerRtPct";
  return {
    pct: isEfficiency ? s.kwPerRtPct : s.totalPlantPct,
    label: isEfficiency ? "Efficiency improvement" : "Energy saving",
    basisNote: isEfficiency ? "kW/RT vs baseline" : "kWh vs baseline",
    kwh: s.totalPlantKwh,
    unequalDelivery: s.basis === "unequal-delivery",
    deliveredDeltaPct: s.deliveredRtHoursDeltaPct,
  };
}

/** Mean power over a run — the like-for-like way to compare two runs of equal length. */
export const meanKw = (totals, pick) => (totals?.hours > 0 ? pick(totals) / totals.hours : NaN);

/** HH:MM tick labels straight from the simulation timestamps. */
export const labelsFor = (trajectory) =>
  (trajectory ?? []).map((step, i) => step.t?.slice(11, 16) ?? `${i + 1}`);

export const seriesOf = (name, kind, trajectory, pick) => ({
  name,
  kind,
  values: (trajectory ?? []).map(pick),
});

export const SOLVER_STATE = {
  IDLE: { tone: "neutral", label: "Ready" },
  RUNNING: { tone: "busy", label: "Optimising" },
  COMPLETED: { tone: "ok", label: "Optimal" },
  ERROR: { tone: "bad", label: "Failed" },
};

/** COMPLETED with fallback steps is not the same claim as COMPLETED. */
export function solverState(status, run) {
  if (status === "COMPLETED" && run?.solver?.fallbacks > 0) {
    return { tone: "warn", label: "Fallback used" };
  }
  return SOLVER_STATE[status] ?? SOLVER_STATE.IDLE;
}

export const MODE_LABEL = {
  bms: "Recorded day",
  manual: "Manual",
  synthetic: "Synthetic profile",
};

export const FORECAST_LABEL = {
  degraded: "Realistic",
  perfect: "Perfect foresight",
  persistence: "Hold flat",
};
