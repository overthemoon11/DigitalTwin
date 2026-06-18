import React, { useState } from 'react';
import type { DistrictCoolingHeaders } from '../../types/districtCooling';

interface Props {
  headers: DistrictCoolingHeaders;
}

/** Floating snapshot button — opens panel without blocking the P&ID */
export function SystemSnapshotButton({ headers }: Props) {
  const [open, setOpen] = useState(false);

  const rows: [string, string][] = [
    ['Building Load', `${headers.buildingLoadRt} RT`],
    ['Cooling Demand', `${headers.coolingDemandRt} RT`],
    ['Contract Limit', `${headers.contractDemandRt} RT`],
    ['CHWS / CHWR', `${headers.chws} / ${headers.chwr} °C`],
    ['DCS / DCR', `${headers.dcsTemp} / ${headers.dcrTemp} °C`],
    ['Primary ΔT', `${headers.primaryDeltaT} °C`],
    ['Secondary ΔT', `${headers.secondaryDeltaT} °C`],
    ['Secondary DP', `${headers.secondaryDpKpa} kPa`],
    ['HX Approach', `${headers.hxApproach} °C`],
    ['Pump Speed', `${headers.pumpSpeedPct}%`],
    ['Pump Power', `${headers.pumpPowerKw} kW`],
    ['Efficiency', `${headers.kwPerRt} kW/RT`],
    ['Occupancy', headers.occupancy],
    ['Outdoor', `${headers.ambientTempC}°C / ${headers.ambientRhPct}%RH`],
    ['CHWS Setpoint', `${headers.chwsSetpoint} °C`],
  ];

  return (
    <div className="scada-snapshot-wrap">
      <button
        type="button"
        className="scada-snapshot-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="System snapshot (live)"
      >
        📊 Snapshot
      </button>
      {open && (
        <>
          <button
            type="button"
            className="scada-snapshot-backdrop"
            aria-label="Close snapshot"
            onClick={() => setOpen(false)}
          />
          <div className="scada-snapshot-panel" role="dialog" aria-label="System snapshot">
            <div className="scada-snapshot-panel-header">
              <strong>System Snapshot (Live)</strong>
              <button type="button" className="scada-snapshot-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <table className="scada-snapshot-table">
              <tbody>
                {rows.map(([label, val]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="scada-snapshot-note">
              Per EMSD DCS reference: primary ~5/13°C, secondary ~6/14°C at ETS.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
