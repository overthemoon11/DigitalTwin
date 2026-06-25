import type { PlantAlert, PlantEquipment, PlantHeaders, PlantState } from '../types/plant';

export interface AlarmContext {
  headers: PlantHeaders;
  equipment: Record<string, PlantEquipment>;
  chwsSetpoint: number;
  chwrSetpoint: number;
  cwsSetpoint: number;
  cwrSetpoint: number;
  deltaT: number;
  dpSetpoint: number;
  measuredDp: number;
  faults: {
    chillerTripId: string | null;
    pumpTripId: string | null;
    makeupPumpFail: boolean;
    ctFanFaultId: string | null;
  };
  pumpCommandedOn: Record<string, boolean>;
}

function round(v: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function evaluateAlarms(ctx: AlarmContext): PlantAlert[] {
  const alerts: PlantAlert[] = [];
  const ts = new Date().toISOString();

  if (ctx.headers.chws > ctx.chwsSetpoint + 2) {
    alerts.push({
      id: 'alm-chws-high',
      severity: 'warning',
      message: `High CHWS Temperature (${ctx.headers.chws.toFixed(1)}°C vs SP ${ctx.chwsSetpoint}°C)`,
      assetId: 'ch-29-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: CHWS Setpoint → ${(ctx.headers.chws - 0.5).toFixed(1)}°C (now ${ctx.chwsSetpoint}°C); enable additional chiller if load > 80%`,
      recommendedAdjustments: [
        { controlId: 'ctrl-chws-sp', label: 'CHWS Setpoint', currentValue: ctx.chwsSetpoint, suggestedValue: round(ctx.headers.chws - 0.5, 1), unit: '°C' },
        { controlId: 'ctrl-ch-enable', label: 'Chillers Enabled', currentValue: 'check staging', suggestedValue: '+1 chiller' },
      ],
    });
  }

  if (ctx.headers.chwr > ctx.chwrSetpoint + 2) {
    alerts.push({
      id: 'alm-chwr-high',
      severity: 'warning',
      message: `High CHWR Temperature (${ctx.headers.chwr.toFixed(1)}°C vs SP ${ctx.chwrSetpoint}°C)`,
      assetId: 'chwp-29-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: Building Cooling Load → ${Math.round(ctx.headers.buildingLoadRt * 0.9)} RT (now ${Math.round(ctx.headers.buildingLoadRt)} RT); CHWS Setpoint → ${(ctx.chwsSetpoint - 0.5).toFixed(1)}°C`,
      recommendedAdjustments: [
        { controlId: 'ctrl-building-load', label: 'Building Cooling Load', currentValue: Math.round(ctx.headers.buildingLoadRt), suggestedValue: Math.round(ctx.headers.buildingLoadRt * 0.9), unit: 'RT' },
        { controlId: 'ctrl-chws-sp', label: 'CHWS Setpoint', currentValue: ctx.chwsSetpoint, suggestedValue: round(ctx.chwsSetpoint - 0.5, 1), unit: '°C' },
      ],
    });
  }

  if (ctx.headers.cws > ctx.cwsSetpoint + 3) {
    const suggestedCws = round(ctx.cwsSetpoint - 1, 1);
    alerts.push({
      id: 'alm-cws-high',
      severity: 'warning',
      message: `High Condenser Temperature (${ctx.headers.cws.toFixed(1)}°C vs SP ${ctx.cwsSetpoint}°C)`,
      assetId: 'ct-41-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: Cooling Tower Fan → 100% (max); CWS Setpoint → ${suggestedCws}°C (now ${ctx.cwsSetpoint}°C)`,
      recommendedAdjustments: [
        { controlId: 'ctrl-ct-fan', label: 'Cooling Tower Fan', currentValue: 'raise', suggestedValue: 100, unit: '%' },
        { controlId: 'ctrl-cws-sp', label: 'CWS Setpoint', currentValue: ctx.cwsSetpoint, suggestedValue: suggestedCws, unit: '°C' },
      ],
    });
  }

  if (ctx.deltaT < 4) {
    const suggestedDp = Math.max(10, round(ctx.dpSetpoint - 5, 0));
    alerts.push({
      id: 'alm-low-dt',
      severity: 'warning',
      message: `Low Delta-T Detected (${ctx.deltaT.toFixed(1)}°C — target ≥ 4°C)`,
      assetId: 'bv-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: `Adjust: Header DP Setpoint → ${suggestedDp} psi (now ${ctx.dpSetpoint} psi); reduce bypass via pump speed`,
      recommendedAdjustments: [
        { controlId: 'ctrl-dp-sp', label: 'Header DP Setpoint', currentValue: ctx.dpSetpoint, suggestedValue: suggestedDp, unit: 'psi' },
        { controlId: 'ctrl-pump-spd', label: 'Pump Speed', currentValue: 'reduce', suggestedValue: '-10%', unit: '' },
      ],
    });
  }

  Object.entries(ctx.pumpCommandedOn).forEach(([id, commanded]) => {
    const pump = ctx.equipment[id];
    if (
      commanded &&
      pump &&
      pump.type === 'pump' &&
      pump.speedPercent <= 0 &&
      pump.status !== 'running'
    ) {
      alerts.push({
        id: `alm-pump-trip-${id}`,
        severity: 'critical',
        message: `Pump Trip — ${pump.name}`,
        assetId: id,
        resolved: false,
        acknowledged: false,
        timestamp: ts,
      });
    }
  });

  ['ch-29-1', 'ch-29-2', 'ch-29-3'].forEach((id) => {
    const ch = ctx.equipment[id];
    if (ch && ch.type === 'chiller' && ch.loadPercent > 95) {
      alerts.push({
        id: `alm-ch-overload-${id}`,
        severity: 'warning',
        message: 'Chiller Overload',
        assetId: id,
        resolved: false,
        acknowledged: false,
        timestamp: ts,
      });
    }
  });

  const tank = ctx.equipment['cwmutnk-41-1'];
  if (tank && tank.type === 'makeup_tank') {
    if (tank.levelPercent < 20) {
      alerts.push({
        id: 'alm-makeup-low',
        severity: 'critical',
        message: 'Low Tank Level — CWMUTnk 41-1',
        assetId: 'cwmutnk-41-1',
        resolved: false,
        acknowledged: false,
        timestamp: ts,
      });
    }
    if (tank.highLevel) {
      alerts.push({
        id: 'alm-makeup-high',
        severity: 'warning',
        message: 'High Tank Level — CWMUTnk 41-1',
        assetId: 'cwmutnk-41-1',
        resolved: false,
        acknowledged: false,
        timestamp: ts,
      });
    }
  }

  if (ctx.faults.chillerTripId) {
    alerts.push({
      id: 'alm-ch-fault',
      severity: 'critical',
      message: `Chiller Fault — ${ctx.equipment[ctx.faults.chillerTripId]?.name || ctx.faults.chillerTripId}`,
      assetId: ctx.faults.chillerTripId,
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: 'Inspect compressor and safeties',
    });
  }

  if (ctx.faults.makeupPumpFail) {
    alerts.push({
      id: 'alm-makeup-fail',
      severity: 'critical',
      message: 'Make-up Pump Failure',
      assetId: 'cwmup-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
    });
  }

  if (ctx.faults.ctFanFaultId) {
    alerts.push({
      id: 'alm-ct-fan',
      severity: 'warning',
      message: `Cooling Tower Fan Fault — ${ctx.equipment[ctx.faults.ctFanFaultId]?.name}`,
      assetId: ctx.faults.ctFanFaultId,
      resolved: false,
      acknowledged: false,
      timestamp: ts,
    });
  }

  return alerts;
}

export function mergeAcknowledged(
  alerts: PlantAlert[],
  acknowledgedIds: Set<string>
): PlantAlert[] {
  return alerts.map((a) =>
    acknowledgedIds.has(a.id) ? { ...a, acknowledged: true } : a
  );
}

/** Expose summary for copilot / diagnostics. */
export function alarmSummary(state: PlantState): string[] {
  return state.alerts.filter((a) => !a.resolved).map((a) => a.message);
}
