import type { PlantAlert, PlantEquipment, PlantHeaders, PlantState } from '../types/plant';

export interface AlarmContext {
  headers: PlantHeaders;
  equipment: Record<string, PlantEquipment>;
  chwsSetpoint: number;
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

export function evaluateAlarms(ctx: AlarmContext): PlantAlert[] {
  const alerts: PlantAlert[] = [];
  const ts = new Date().toISOString();

  if (ctx.headers.chws > ctx.chwsSetpoint + 2) {
    alerts.push({
      id: 'alm-chws-high',
      severity: 'warning',
      message: 'High CHWS Temperature',
      assetId: 'ch-29-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: 'Verify chiller staging and CHWP flow',
    });
  }

  if (ctx.headers.cws > 32) {
    alerts.push({
      id: 'alm-cws-high',
      severity: 'warning',
      message: 'High Condenser Temperature',
      assetId: 'ct-41-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: 'Increase cooling tower fan speed or lower CWS setpoint',
    });
  }

  if (ctx.deltaT < 4) {
    alerts.push({
      id: 'alm-low-dt',
      severity: 'warning',
      message: 'Low Delta-T Detected',
      assetId: 'bv-1',
      resolved: false,
      acknowledged: false,
      timestamp: ts,
      recommendedAction: 'Check bypass valve position and CHWP speed',
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
