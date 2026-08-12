import React from 'react';
import ConstraintSection from './ConstraintSection';
import NumberField from './NumberField';

/**
 * CONSTRAINT INPUT — the MPC's search boundaries.
 *
 * This is NOT a manual command panel: nothing here writes a setpoint to the
 * plant. Each field defines what the optimiser is ALLOWED to propose, and every
 * one of them is read by the candidate generator or the constraint validator.
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
}) {
  const cfg = constraints;
  const errFor = (section, field) =>
    errors?.find((e) => e.section === section && e.field === field)?.message;
  const countIn = (section) => errors?.filter((e) => e.section === section).length ?? 0;

  // The fleet editor shows unit 1's value; setMpcChillerFleet writes all units.
  const u0 = cfg.chiller.units[0];
  const availableCount = cfg.chiller.units.filter((x) => x.available).length;

  const field = (props) => <NumberField disabled={disabled} {...props} />;

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

      <ConstraintSection title="Chiller Constraints" defaultOpen invalidCount={countIn('chiller')}>
        {field({
          label: 'Available Chillers',
          value: availableCount,
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
        {field({
          label: 'Min Load',
          value: u0.minLoadPct,
          unit: '%',
          step: 5,
          decimals: 0,
          error: errFor('chiller', 'units.0.minLoadPct'),
          onCommit: (v) => onSetFleet('minLoadPct', v),
        })}
        {field({
          label: 'Max Load',
          value: u0.maxLoadPct,
          unit: '%',
          step: 5,
          decimals: 0,
          onCommit: (v) => onSetFleet('maxLoadPct', v),
        })}
        {field({
          label: 'Min CHW Flow',
          value: u0.minChwFlowLs,
          unit: 'L/s',
          step: 5,
          error: errFor('chiller', 'units.0.minChwFlowLs'),
          onCommit: (v) => onSetFleet('minChwFlowLs', v),
        })}
        {field({
          label: 'Max CHW Flow',
          value: u0.maxChwFlowLs,
          unit: 'L/s',
          step: 5,
          onCommit: (v) => onSetFleet('maxChwFlowLs', v),
        })}
        {field({
          label: 'Min CW Flow',
          value: u0.minCwFlowLs,
          unit: 'L/s',
          step: 5,
          error: errFor('chiller', 'units.0.minCwFlowLs'),
          onCommit: (v) => onSetFleet('minCwFlowLs', v),
        })}
        {field({
          label: 'Max CW Flow',
          value: u0.maxCwFlowLs,
          unit: 'L/s',
          step: 5,
          onCommit: (v) => onSetFleet('maxCwFlowLs', v),
        })}
        {field({
          label: 'Min CHWST',
          value: cfg.chiller.minChwstC,
          unit: '°C',
          step: 0.1,
          error: errFor('chiller', 'minChwstC'),
          onCommit: (v) => onSet('chiller.minChwstC', v),
        })}
        {field({
          label: 'Max CHWST',
          value: cfg.chiller.maxChwstC,
          unit: '°C',
          step: 0.1,
          onCommit: (v) => onSet('chiller.maxChwstC', v),
        })}
        <p className="mpc-note">
          One common configuration writes all {cfg.chiller.units.length} machines; the model
          stores limits per unit.
        </p>
      </ConstraintSection>

      <ConstraintSection title="CHWP Constraints" invalidCount={countIn('chwp')}>
        {field({ label: 'Min Speed', value: cfg.chwp.minSpeedPct, unit: '%', step: 5, decimals: 0, error: errFor('chwp', 'minSpeedPct'), onCommit: (v) => onSet('chwp.minSpeedPct', v) })}
        {field({ label: 'Max Speed', value: cfg.chwp.maxSpeedPct, unit: '%', step: 5, decimals: 0, onCommit: (v) => onSet('chwp.maxSpeedPct', v) })}
        {field({ label: 'Min Flow', value: cfg.chwp.minFlowLs, unit: 'L/s', step: 5, error: errFor('chwp', 'minFlowLs'), onCommit: (v) => onSet('chwp.minFlowLs', v) })}
        {field({ label: 'Max Flow', value: cfg.chwp.maxFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('chwp.maxFlowLs', v) })}
        {field({ label: 'Min DP', value: cfg.chwp.minDpPsi, unit: 'psi', step: 1, error: errFor('chwp', 'minDpPsi'), onCommit: (v) => onSet('chwp.minDpPsi', v) })}
        {field({ label: 'Max DP', value: cfg.chwp.maxDpPsi, unit: 'psi', step: 1, onCommit: (v) => onSet('chwp.maxDpPsi', v) })}
        {field({ label: 'Rated Power', value: cfg.chwp.ratedPowerKw, unit: 'kW', step: 1, onCommit: (v) => onSet('chwp.ratedPowerKw', v) })}
        {field({ label: 'Rated Flow', value: cfg.chwp.ratedFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('chwp.ratedFlowLs', v) })}
        {field({ label: 'Rated Head', value: cfg.chwp.ratedHeadM, unit: 'm', step: 1, onCommit: (v) => onSet('chwp.ratedHeadM', v) })}
      </ConstraintSection>

      <ConstraintSection title="CWP Constraints" invalidCount={countIn('cwp')}>
        {field({ label: 'Min Speed', value: cfg.cwp.minSpeedPct, unit: '%', step: 5, decimals: 0, error: errFor('cwp', 'minSpeedPct'), onCommit: (v) => onSet('cwp.minSpeedPct', v) })}
        {field({ label: 'Max Speed', value: cfg.cwp.maxSpeedPct, unit: '%', step: 5, decimals: 0, onCommit: (v) => onSet('cwp.maxSpeedPct', v) })}
        {field({ label: 'Min Flow', value: cfg.cwp.minFlowLs, unit: 'L/s', step: 5, error: errFor('cwp', 'minFlowLs'), onCommit: (v) => onSet('cwp.minFlowLs', v) })}
        {field({ label: 'Max Flow', value: cfg.cwp.maxFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('cwp.maxFlowLs', v) })}
        {field({ label: 'Rated Power', value: cfg.cwp.ratedPowerKw, unit: 'kW', step: 1, onCommit: (v) => onSet('cwp.ratedPowerKw', v) })}
        {field({ label: 'Rated Flow', value: cfg.cwp.ratedFlowLs, unit: 'L/s', step: 5, onCommit: (v) => onSet('cwp.ratedFlowLs', v) })}
        {field({ label: 'Rated Head', value: cfg.cwp.ratedHeadM, unit: 'm', step: 1, onCommit: (v) => onSet('cwp.ratedHeadM', v) })}
      </ConstraintSection>

      <ConstraintSection title="Cooling Tower Constraints" invalidCount={countIn('tower')}>
        {field({ label: 'Min Fan Speed', value: cfg.tower.minFanSpeedPct, unit: '%', step: 5, decimals: 0, error: errFor('tower', 'minFanSpeedPct'), onCommit: (v) => onSet('tower.minFanSpeedPct', v) })}
        {field({ label: 'Max Fan Speed', value: cfg.tower.maxFanSpeedPct, unit: '%', step: 5, decimals: 0, onCommit: (v) => onSet('tower.maxFanSpeedPct', v) })}
        {field({ label: 'Min Approach', value: cfg.tower.minApproachC, unit: '°C', step: 0.1, error: errFor('tower', 'minApproachC'), onCommit: (v) => onSet('tower.minApproachC', v) })}
        {field({ label: 'Max CWST', value: cfg.tower.maxCwstC, unit: '°C', step: 0.5, onCommit: (v) => onSet('tower.maxCwstC', v) })}
        {field({ label: 'Rated Heat Rejection', value: cfg.tower.ratedHeatRejectionRt, unit: 'RT', step: 100, decimals: 0, onCommit: (v) => onSet('tower.ratedHeatRejectionRt', v) })}
        {field({ label: 'Rated Water Flow', value: cfg.tower.ratedWaterFlowLs, unit: 'L/s', step: 10, decimals: 0, onCommit: (v) => onSet('tower.ratedWaterFlowLs', v) })}
        <p className="mpc-note">CWST ≥ wet bulb + min approach is enforced on every candidate.</p>
      </ConstraintSection>

      <ConstraintSection title="System Constraints" invalidCount={countIn('system')}>
        {field({ label: 'Min CHW DP', value: cfg.system.minChwDpPsi, unit: 'psi', step: 1, error: errFor('system', 'minChwDpPsi'), onCommit: (v) => onSet('system.minChwDpPsi', v) })}
        {field({ label: 'Max CHW DP', value: cfg.system.maxChwDpPsi, unit: 'psi', step: 1, onCommit: (v) => onSet('system.maxChwDpPsi', v) })}
        {field({ label: 'Max CHW Header Flow', value: cfg.system.maxChwHeaderFlowLs, unit: 'L/s', step: 50, decimals: 0, onCommit: (v) => onSet('system.maxChwHeaderFlowLs', v) })}
        {field({ label: 'Max CW Header Flow', value: cfg.system.maxCwHeaderFlowLs, unit: 'L/s', step: 50, decimals: 0, onCommit: (v) => onSet('system.maxCwHeaderFlowLs', v) })}
        {field({ label: 'Min Running Chillers', value: cfg.system.minRunningChillers, step: 1, decimals: 0, error: errFor('system', 'minRunningChillers'), onCommit: (v) => onSet('system.minRunningChillers', v) })}
        {field({ label: 'Max Running Chillers', value: cfg.system.maxRunningChillers, step: 1, decimals: 0, onCommit: (v) => onSet('system.maxRunningChillers', v) })}
        {field({ label: 'Required Standby', value: cfg.system.requiredStandbyChillers, step: 1, decimals: 0, error: errFor('system', 'requiredStandbyChillers'), onCommit: (v) => onSet('system.requiredStandbyChillers', v) })}
        {field({ label: 'Max CHWST Δ / Cycle', value: cfg.system.maxChwstChangePerCycleC, unit: '°C', step: 0.1, onCommit: (v) => onSet('system.maxChwstChangePerCycleC', v) })}
        {field({ label: 'Max DP Δ / Cycle', value: cfg.system.maxDpChangePerCyclePsi, unit: 'psi', step: 0.5, onCommit: (v) => onSet('system.maxDpChangePerCyclePsi', v) })}
        {field({ label: 'Min Chiller Runtime', value: cfg.system.minChillerRuntimeMin, unit: 'min', step: 5, decimals: 0, onCommit: (v) => onSet('system.minChillerRuntimeMin', v) })}
        {field({ label: 'Min Chiller Off Time', value: cfg.system.minChillerOffTimeMin, unit: 'min', step: 5, decimals: 0, onCommit: (v) => onSet('system.minChillerOffTimeMin', v) })}
        <p className="mpc-note mpc-note--warn">
          Runtime / off-time timers are stored and validated but not yet simulated — the
          engine has no equipment run-hour clock. Everything above them is enforced on
          every candidate.
        </p>
      </ConstraintSection>
    </div>
  );
}
