import React from "react";
import { Card, DataRow, StatusPill, fmt, isNum } from "../ui/Primitives";

/**
 * Contextual detail for the equipment the operator clicked on the schematic.
 *
 * Selecting a machine must not navigate anywhere: the twin stays on screen,
 * focused on that unit, and this panel answers "what is it doing" beside it.
 *
 * Every row comes from the live equipment record. There is no fallback table of
 * plausible values — a machine that does not report a COP simply has no COP row.
 */

const STATUS_TONE = {
  running: "ok",
  stopped: "neutral",
  alarm: "bad",
  manual: "warn",
};

const CATEGORY_LABEL = {
  chiller: "Chiller",
  chwp: "Chilled water pump",
  cwp: "Condenser water pump",
  cooling_tower: "Cooling tower",
  makeup_pump: "Make-up pump",
  makeup_tank: "Make-up tank",
  expansion_tank: "Expansion tank",
  valve: "Valve",
};

/** Rows are declared per equipment type and filtered to what is actually reported. */
function rowsFor(eq) {
  const rows = [];
  const push = (label, value, unit, decimals = 1) => {
    if (isNum(value)) rows.push({ label, value: fmt(value, decimals), unit });
  };

  if (eq.type === "chiller") {
    push("Load", eq.loadPercent, "%", 0);
    push("Power", eq.powerKw, "kW", 0);
    push("COP", eq.cop, "", 2);
    push("CHW supply", eq.supplyTemp, "°C", 2);
    push("CHW return", eq.returnTemp, "°C", 2);
    push("CW supply", eq.cwSupplyTemp, "°C", 2);
    push("CW return", eq.cwReturnTemp, "°C", 2);
    push("CHW flow", isNum(eq.flowRate) ? eq.flowRate / 3.6 : undefined, "L/s", 1);
    push("CW flow", isNum(eq.condFlowRate) ? eq.condFlowRate / 3.6 : undefined, "L/s", 1);
    push("Compressor 1", eq.cp1Kw, "kW", 1);
    push("Compressor 2", eq.cp2Kw, "kW", 1);
  } else if (eq.type === "pump") {
    push("Speed", eq.speedPercent, "%", 1);
    push("Frequency", eq.frequencyHz, "Hz", 1);
    push("Power", eq.powerKw, "kW", 1);
    push("Flow", isNum(eq.flowRate) ? eq.flowRate / 3.6 : undefined, "L/s", 1);
  } else if (eq.type === "cooling_tower") {
    push("Fan speed", eq.fanSpeedPercent, "%", 1);
    push("Frequency", eq.frequencyHz, "Hz", 1);
    push("Power", eq.powerKw, "kW", 1);
    push("Leaving water", eq.leavingTemp, "°C", 2);
    if (eq.cells) {
      push("Cell A", eq.cells.a?.kw, "kW", 1);
      push("Cell B", eq.cells.b?.kw, "kW", 1);
      push("Cell A CWST", eq.cells.a?.cwst, "°C", 2);
      push("Cell B CWST", eq.cells.b?.cwst, "°C", 2);
    }
  } else if (eq.type === "makeup_tank") {
    push("Level", eq.levelPercent, "%", 0);
    push("Volume", eq.volumeGal, "gal", 0);
  } else if (eq.type === "expansion_tank") {
    push("Level", eq.levelPercent, "%", 0);
  } else if (eq.type === "valve") {
    push("Position", eq.positionPercent, "%", 0);
  } else if (eq.type === "makeup_pump") {
    push("Speed", eq.speedPercent, "%", 1);
    push("Power", eq.powerKw, "kW", 1);
  }

  push("Runtime", eq.runtimeHours, "h", 0);
  return rows;
}

export default function EquipmentDetailCard({ equipment, alerts, onClear, onOpenPoints }) {
  if (!equipment) return null;
  const rows = rowsFor(equipment);
  const related = (alerts ?? []).filter((a) => a.assetId === equipment.id && !a.resolved);

  return (
    <Card className="equip-card">
      <header className="equip-card-head">
        <div>
          <span className="tw-eyebrow">{CATEGORY_LABEL[equipment.category] ?? equipment.type}</span>
          <h3>{equipment.name}</h3>
        </div>
        <StatusPill tone={STATUS_TONE[equipment.status] ?? "neutral"} small>
          {equipment.status}
        </StatusPill>
      </header>

      {rows.length > 0 ? (
        rows.map((row) => <DataRow key={row.label} label={row.label} value={row.value} unit={row.unit} />)
      ) : (
        <p style={{ margin: 0, color: "var(--tw-ink-2)", fontSize: "0.75rem" }}>
          This asset reports no live channels.
        </p>
      )}

      {related.length > 0 && (
        <div className="plant-alerts">
          {related.map((alert) => (
            <div key={alert.id} className={`plant-alert-row plant-alert-row--${alert.severity}`}>
              <i />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="equip-card-actions">
        <button type="button" className="tw-btn tw-btn--sm tw-btn--soft" onClick={onOpenPoints}>
          BMS points
        </button>
        <button type="button" className="tw-btn tw-btn--sm" onClick={onClear}>
          Clear selection
        </button>
      </div>
    </Card>
  );
}
