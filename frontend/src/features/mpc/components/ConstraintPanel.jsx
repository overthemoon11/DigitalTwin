import React from 'react';
import ConstraintSection from './ConstraintSection';
import NumberField from './NumberField';
import RangeField from './RangeField';

/**
 * CONSTRAINT INPUT — the MPC's search boundaries.
 *
 * This is NOT a manual command panel: nothing here writes a setpoint to the
 * plant. Each field defines what the optimiser is ALLOWED to propose, and every
 * one of them is read by the candidate generator or the constraint validator.
 *
 * Bounds on the same quantity are ONE row, not two. A "Min Load / Max Load"
 * pair is a single allowed band; listing them separately doubled the length of
 * the panel and hid the fact that they belong together. Genuinely independent
 * limits -- a tower approach floor vs a CWST ceiling, the two anti-cycle timers
 * -- stay on their own rows, because pairing those would imply a range that
 * does not exist.
 *
 * Fields that the constraint layer enforces but the physics does not yet
 * simulate (the anti-short-cycle timers) are labelled as such rather than
 * quietly implying they are modelled.
 */
export default function ConstraintPanel({
  constraints,
  errors,
  disabled,
  onSet,
  onSetFleet,
  onSetAvailable,
  onReset,
  /** 'panel' = collapsible groups for a narrow container.
   *  'workspace' = every group open, laid out as cards in a grid. */
  variant = 'panel',
}) {
  const cfg = constraints;
  const workspace = variant === 'workspace';
  const groupProps = workspace ? { alwaysOpen: true } : {};

  // Constraints are fetched from the backend rather than imported from the MPC
  // module, so there is a brief window before they arrive. Render a placeholder
  // instead of reaching into a null config.
  if (!cfg?.chiller?.units?.length) {
    return (
      <div className="mpc-constraint-panel">
        <div className="mpc-constraint-head">
          <h4>Constraint Input</h4>
        </div>
        <p className="mpc-constraint-hint">Loading plant limits…</p>
      </div>
    );
  }

  const errFor = (section, field) =>
    errors?.find((e) => e.section === section && e.field === field)?.message;
  const countIn = (section) => errors?.filter((e) => e.section === section).length ?? 0;

  // The fleet editor shows unit 1's value; setMpcChillerFleet writes all units.
  const u0 = cfg.chiller.units[0];
  const availableCount = cfg.chiller.units.filter((x) => x.available).length;

  const field = (props) => <NumberField disabled={disabled} {...props} />;
  const range = (props) => <RangeField disabled={disabled} {...props} />;

  const groups = (
    <>
      <ConstraintSection title="Chiller" defaultOpen invalidCount={countIn('chiller')} {...groupProps}>
        {field({
          label: 'Available Chillers',
          value: availableCount,
          unit: 'ch',
          step: 1,
          decimals: 0,
          onCommit: onSetAvailable,
        })}
        {field({
          label: 'Rated Capacity',
          value: u0.ratedCapacityRt,
          unit: 'RT',
          step: 50,
          decimals: 0,
          error: errFor('chiller', 'units.0.ratedCapacityRt'),
          onCommit: (v) => onSetFleet('ratedCapacityRt', v),
        })}
        {range({
          label: 'Load',
          unit: '%',
          step: 5,
          decimals: 0,
          minValue: u0.minLoadPct,
          maxValue: u0.maxLoadPct,
          onCommitMin: (v) => onSetFleet('minLoadPct', v),
          onCommitMax: (v) => onSetFleet('maxLoadPct', v),
          error: errFor('chiller', 'units.0.minLoadPct'),
        })}
        {range({
          label: 'CHW Flow',
          unit: 'L/s',
          step: 5,
          minValue: u0.minChwFlowLs,
          maxValue: u0.maxChwFlowLs,
          onCommitMin: (v) => onSetFleet('minChwFlowLs', v),
          onCommitMax: (v) => onSetFleet('maxChwFlowLs', v),
          error: errFor('chiller', 'units.0.minChwFlowLs'),
        })}
        {range({
          label: 'CW Flow',
          unit: 'L/s',
          step: 5,
          minValue: u0.minCwFlowLs,
          maxValue: u0.maxCwFlowLs,
          onCommitMin: (v) => onSetFleet('minCwFlowLs', v),
          onCommitMax: (v) => onSetFleet('maxCwFlowLs', v),
          error: errFor('chiller', 'units.0.minCwFlowLs'),
        })}
        {range({
          label: 'CHWST',
          unit: '°C',
          step: 0.1,
          minValue: cfg.chiller.minChwstC,
          maxValue: cfg.chiller.maxChwstC,
          onCommitMin: (v) => onSet('chiller.minChwstC', v),
          onCommitMax: (v) => onSet('chiller.maxChwstC', v),
          error: errFor('chiller', 'minChwstC'),
        })}
        <p className="mpc-note">
          One common configuration writes all {cfg.chiller.units.length} machines; the model
          stores limits per unit.
        </p>
      </ConstraintSection>

      <ConstraintSection title="Chilled water pumps" invalidCount={countIn('chwp')} {...groupProps}>
        {range({
          label: 'Speed',
          unit: '%',
          step: 5,
          decimals: 0,
          minValue: cfg.chwp.minSpeedPct,
          maxValue: cfg.chwp.maxSpeedPct,
          onCommitMin: (v) => onSet('chwp.minSpeedPct', v),
          onCommitMax: (v) => onSet('chwp.maxSpeedPct', v),
          error: errFor('chwp', 'minSpeedPct'),
        })}
        {range({
          label: 'Flow',
          unit: 'L/s',
          step: 5,
          minValue: cfg.chwp.minFlowLs,
          maxValue: cfg.chwp.maxFlowLs,
          onCommitMin: (v) => onSet('chwp.minFlowLs', v),
          onCommitMax: (v) => onSet('chwp.maxFlowLs', v),
          error: errFor('chwp', 'minFlowLs'),
        })}
        {range({
          label: 'DP',
          unit: 'psi',
          step: 1,
          minValue: cfg.chwp.minDpPsi,
          maxValue: cfg.chwp.maxDpPsi,
          onCommitMin: (v) => onSet('chwp.minDpPsi', v),
          onCommitMax: (v) => onSet('chwp.maxDpPsi', v),
          error: errFor('chwp', 'minDpPsi'),
        })}
        {field({ label: 'Rated Power', value: cfg.chwp.ratedPowerKw, unit: 'kW', step: 1, onCommit: (v) => onSet('chwp.ratedPowerKw', v) })}
        {field({ label: 'Rated Flow', value: cfg.chwp.ratedFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('chwp.ratedFlowLs', v) })}
        {field({ label: 'Rated Head', value: cfg.chwp.ratedHeadM, unit: 'm', step: 1, onCommit: (v) => onSet('chwp.ratedHeadM', v) })}
      </ConstraintSection>

      <ConstraintSection title="Condenser water pumps" invalidCount={countIn('cwp')} {...groupProps}>
        {range({
          label: 'Speed',
          unit: '%',
          step: 5,
          decimals: 0,
          minValue: cfg.cwp.minSpeedPct,
          maxValue: cfg.cwp.maxSpeedPct,
          onCommitMin: (v) => onSet('cwp.minSpeedPct', v),
          onCommitMax: (v) => onSet('cwp.maxSpeedPct', v),
          error: errFor('cwp', 'minSpeedPct'),
        })}
        {range({
          label: 'Flow',
          unit: 'L/s',
          step: 5,
          minValue: cfg.cwp.minFlowLs,
          maxValue: cfg.cwp.maxFlowLs,
          onCommitMin: (v) => onSet('cwp.minFlowLs', v),
          onCommitMax: (v) => onSet('cwp.maxFlowLs', v),
          error: errFor('cwp', 'minFlowLs'),
        })}
        {field({ label: 'Rated Power', value: cfg.cwp.ratedPowerKw, unit: 'kW', step: 1, onCommit: (v) => onSet('cwp.ratedPowerKw', v) })}
        {field({ label: 'Rated Flow', value: cfg.cwp.ratedFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('cwp.ratedFlowLs', v) })}
        {field({ label: 'Rated Head', value: cfg.cwp.ratedHeadM, unit: 'm', step: 1, onCommit: (v) => onSet('cwp.ratedHeadM', v) })}
      </ConstraintSection>

      <ConstraintSection title="Cooling towers" invalidCount={countIn('tower')} {...groupProps}>
        {range({
          label: 'Fan Speed',
          unit: '%',
          step: 5,
          decimals: 0,
          minValue: cfg.tower.minFanSpeedPct,
          maxValue: cfg.tower.maxFanSpeedPct,
          onCommitMin: (v) => onSet('tower.minFanSpeedPct', v),
          onCommitMax: (v) => onSet('tower.maxFanSpeedPct', v),
          error: errFor('tower', 'minFanSpeedPct'),
        })}
        {/* Not a pair: an approach floor and a supply-temperature ceiling are
            different quantities, so rendering them as a range would be a lie. */}
        {field({ label: 'Min Approach', value: cfg.tower.minApproachC, unit: '°C', step: 0.1, error: errFor('tower', 'minApproachC'), onCommit: (v) => onSet('tower.minApproachC', v) })}
        {field({ label: 'Max CWST', value: cfg.tower.maxCwstC, unit: '°C', step: 0.5, onCommit: (v) => onSet('tower.maxCwstC', v) })}
        {field({ label: 'Rated Heat Rejection', value: cfg.tower.ratedHeatRejectionRt, unit: 'RT', step: 100, decimals: 0, onCommit: (v) => onSet('tower.ratedHeatRejectionRt', v) })}
        {field({ label: 'Rated Water Flow', value: cfg.tower.ratedWaterFlowLs, unit: 'L/s', step: 10, decimals: 0, onCommit: (v) => onSet('tower.ratedWaterFlowLs', v) })}
        <p className="mpc-note">CWST ≥ wet bulb + min approach is enforced on every candidate.</p>
      </ConstraintSection>

      <ConstraintSection title="System" invalidCount={countIn('system')} {...groupProps}>
        {range({
          label: 'CHW DP',
          unit: 'psi',
          step: 1,
          minValue: cfg.system.minChwDpPsi,
          maxValue: cfg.system.maxChwDpPsi,
          onCommitMin: (v) => onSet('system.minChwDpPsi', v),
          onCommitMax: (v) => onSet('system.maxChwDpPsi', v),
          error: errFor('system', 'minChwDpPsi'),
        })}
        {field({ label: 'Max CHW Header Flow', value: cfg.system.maxChwHeaderFlowLs, unit: 'L/s', step: 50, decimals: 0, onCommit: (v) => onSet('system.maxChwHeaderFlowLs', v) })}
        {field({ label: 'Max CW Header Flow', value: cfg.system.maxCwHeaderFlowLs, unit: 'L/s', step: 50, decimals: 0, onCommit: (v) => onSet('system.maxCwHeaderFlowLs', v) })}
        {range({
          label: 'Running Chillers',
          unit: 'ch',
          step: 1,
          decimals: 0,
          minValue: cfg.system.minRunningChillers,
          maxValue: cfg.system.maxRunningChillers,
          onCommitMin: (v) => onSet('system.minRunningChillers', v),
          onCommitMax: (v) => onSet('system.maxRunningChillers', v),
          error: errFor('system', 'minRunningChillers'),
        })}
        {field({ label: 'Required Standby', value: cfg.system.requiredStandbyChillers, unit: 'ch', step: 1, decimals: 0, error: errFor('system', 'requiredStandbyChillers'), onCommit: (v) => onSet('system.requiredStandbyChillers', v) })}
        {/* The single most consequential limit in this panel. Raising CHWST and
            slowing the CHW pumps both save power by letting the loop run
            warmer; this is what says how much warmer is acceptable, and
            without it both would look like free money. */}
        {field({ label: 'Max CHWR (return limit)', value: cfg.system.maxChwrC, unit: '°C', step: 0.1, error: errFor('system', 'maxChwrC'), onCommit: (v) => onSet('system.maxChwrC', v) })}
        {field({ label: 'Max Plant Demand', value: cfg.system.maxPlantKw, unit: 'kW', step: 100, decimals: 0, error: errFor('system', 'maxPlantKw'), onCommit: (v) => onSet('system.maxPlantKw', v) })}
        {field({ label: 'Max Chiller Starts / Run', value: cfg.system.maxChillerStartsPerRun, unit: 'starts', step: 1, decimals: 0, error: errFor('system', 'maxChillerStartsPerRun'), onCommit: (v) => onSet('system.maxChillerStartsPerRun', v) })}
        {range({
          label: 'Operating Hours',
          unit: 'h',
          step: 1,
          decimals: 0,
          minValue: cfg.system.operatingHours?.startHour ?? 0,
          maxValue: cfg.system.operatingHours?.endHour ?? 0,
          onCommitMin: (v) => onSet('system.operatingHours.startHour', v),
          onCommitMax: (v) => onSet('system.operatingHours.endHour', v),
          error: errFor('system', 'operatingHours.startHour'),
        })}
        {field({ label: 'Max CHWST Δ / Cycle', value: cfg.system.maxChwstChangePerCycleC, unit: '°C', step: 0.1, onCommit: (v) => onSet('system.maxChwstChangePerCycleC', v) })}
        {field({ label: 'Max DP Δ / Cycle', value: cfg.system.maxDpChangePerCyclePsi, unit: 'psi', step: 0.5, onCommit: (v) => onSet('system.maxDpChangePerCyclePsi', v) })}
        {field({ label: 'Max CWP Δ / Cycle', value: cfg.system.maxCwpSpeedChangePerCyclePct, unit: '%', step: 1, decimals: 0, onCommit: (v) => onSet('system.maxCwpSpeedChangePerCyclePct', v) })}
        {field({ label: 'Max CT Fan Δ / Cycle', value: cfg.system.maxCtFanSpeedChangePerCyclePct, unit: '%', step: 1, decimals: 0, onCommit: (v) => onSet('system.maxCtFanSpeedChangePerCyclePct', v) })}
        {/* Two separate minimums, not a band -- deliberately kept apart. */}
        {field({ label: 'Min Chiller Runtime', value: cfg.system.minChillerRuntimeMin, unit: 'min', step: 5, decimals: 0, onCommit: (v) => onSet('system.minChillerRuntimeMin', v) })}
        {field({ label: 'Min Chiller Off Time', value: cfg.system.minChillerOffTimeMin, unit: 'min', step: 5, decimals: 0, onCommit: (v) => onSet('system.minChillerOffTimeMin', v) })}
        <p className="mpc-note">
          Runtime and off-time timers ARE enforced by the horizon controller: they decide
          which machines are eligible to switch at each step, so a plan that would breach
          them is never reachable. Zero disables the plant-demand cap, the start cap, and
          the operating-hours window (T1 ran 24/7 all December).
        </p>
      </ConstraintSection>
    </>
  );

  if (workspace) return <div className="eng-constraints">{groups}</div>;

  return (
    <div className="mpc-constraint-panel">
      <div className="mpc-constraint-head">
        <h4>Constraint Input</h4>
        <button type="button" className="mpc-reset-link" onClick={onReset} disabled={disabled}>
          Reset to Design
        </button>
      </div>
      <p className="mpc-constraint-hint">
        Physical and operational limits the optimiser must respect. These bound the
        search — they are not commands.
      </p>
      {groups}
    </div>
  );
}
