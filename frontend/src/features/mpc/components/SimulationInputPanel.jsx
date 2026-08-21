import React from "react";
import NumberField from "./NumberField";

/**
 * SECTION A — the disturbances, and where they come from.
 *
 * Building load and wet bulb are the conditions the plant must serve and the
 * MPC cannot manipulate. Every controllable quantity lives on the right
 * (constraints) or in Optimal Control (results).
 *
 * The source selector is here rather than buried in a settings panel because it
 * changes what the two numbers below MEAN, and that is not a detail:
 *
 *   Recorded day  the load and wet bulb are the plant's own measured history.
 *                 The two entry fields are disabled, because inventing a load
 *                 for a day the plant actually ran would be a fabrication.
 *   Manual        the operator's numbers, held flat. A what-if.
 *   Synthetic     a generated diurnal profile. No site data is involved, and
 *                 the panel says so.
 */

const MODE_LABEL = {
  bms: "Recorded day",
  manual: "Manual",
  synthetic: "Synthetic profile",
};

const MODE_NOTE = {
  bms: "Real measured plant history. Load is derived from the riser flows and header ΔT; wet bulb is the mean of the five WST sensors.",
  manual: "Your numbers, held flat across the run. A what-if, not a measurement.",
  synthetic: "A generated diurnal shape scaled to your numbers. Not this site's profile — a benchmark.",
};

const FORECAST_LABEL = {
  degraded: "Realistic (error grows with lead time)",
  perfect: "Perfect foresight (upper bound)",
  persistence: "No forecast (hold flat)",
};

export default function SimulationInputPanel({
  input,
  scenario,
  config,
  onChange,
  onChangeScenario,
  disabled,
}) {
  const mode = scenario?.mode ?? "bms";
  const bmsAvailable = config?.bms?.available ?? false;
  const days = config?.bms?.days ?? [];
  const modes = (config?.modes ?? ["bms", "manual", "synthetic"]).filter(
    (m) => m !== "bms" || bmsAvailable
  );
  const stepMinutes = config?.bms?.stepMinutes ?? 15;
  const measured = mode === "bms";

  const hours = ((Number(scenario?.steps) || 0) * stepMinutes) / 60;

  return (
    <section className="vsp-section mpc-section">
      <h4>Simulation Input</h4>

      <div className="mpc-scenario-grid">
        <label>
          Conditions
          <select
            value={mode}
            onChange={(e) => onChangeScenario({ horizonMode: e.target.value })}
            disabled={disabled}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m] ?? m}
              </option>
            ))}
          </select>
        </label>

        {measured && (
          <label>
            Day
            <select
              value={scenario?.day ?? ""}
              onChange={(e) => onChangeScenario({ horizonDay: e.target.value })}
              disabled={disabled || !days.length}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Run length
          <select
            value={scenario?.steps ?? 16}
            onChange={(e) => onChangeScenario({ horizonSteps: Number(e.target.value) })}
            disabled={disabled}
          >
            {[8, 16, 24, 48, 96].map((n) => (
              <option key={n} value={n}>
                {n} × {stepMinutes} min ({((n * stepMinutes) / 60).toFixed(0)} h)
              </option>
            ))}
          </select>
        </label>

        <label>
          Forecast
          <select
            value={scenario?.forecast ?? "degraded"}
            onChange={(e) => onChangeScenario({ horizonForecast: e.target.value })}
            disabled={disabled}
          >
            {(config?.forecasts ?? ["degraded", "perfect", "persistence"]).map((f) => (
              <option key={f} value={f}>
                {FORECAST_LABEL[f] ?? f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="vsp-desc mpc-source-note">{MODE_NOTE[mode]}</p>

      <div className="scada-box-body mpc-input-body">
        <NumberField
          label="Building Load"
          value={input?.buildingLoadRt}
          unit="RT"
          step={10}
          decimals={0}
          disabled={disabled || measured}
          onCommit={(v) => onChange({ buildingLoadRt: v })}
        />
        <NumberField
          label="Wet Bulb"
          value={input?.wetBulbC}
          unit="°C"
          step={0.1}
          decimals={1}
          disabled={disabled || measured}
          onCommit={(v) => onChange({ wetBulbC: v })}
        />
      </div>

      {measured && (
        <p className="vsp-desc">
          These come from the recording and cannot be edited — the run replays what the
          plant actually faced. Switch to Manual to enter your own.
        </p>
      )}
      {!measured && hours > 0 && (
        <p className="vsp-desc">
          Held for {hours.toFixed(0)} h at {stepMinutes}-minute steps.
        </p>
      )}
    </section>
  );
}
