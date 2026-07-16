import type { PlantAlert, PlantEquipment, PlantHeaders, PlantState } from '../../types/plant';
import {
  recommendForBypassHigh,
  recommendForChillerFault,
  recommendForChillerOverload,
  recommendForChwsHigh,
  recommendForChwrHigh,
  recommendForCtFanFault,
  recommendForCwsHigh,
  recommendForDpHigh,
  recommendForLowDeltaT,
  recommendForMakeupFail,
  recommendForMakeupHigh,
  recommendForMakeupLow,
  recommendForPumpTrip,
} from './chillerAlertRecommendations.js';

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
  bypassPercent: number;
  baseLoadRt: number;
  chillerEnabled: boolean;
  ctFanSpeed: number;
  pumpOverride: number;
  faults: {
    chillerTripId: string | null;
    pumpTripId: string | null;
    makeupPumpFail: boolean;
    ctFanFaultId: string | null;
  };
  pumpCommandedOn: Record<string, boolean>;
}

function attachRecommendation(
  alert: PlantAlert,
  rec: { adjustments: PlantAlert['recommendedAdjustments']; text: string }
): PlantAlert {
  return {
    ...alert,
    recommendedAction: rec.text,
    recommendedAdjustments: rec.adjustments?.length ? rec.adjustments : undefined,
  };
}

export function evaluateAlarms(ctx: AlarmContext): PlantAlert[] {
  const alerts: PlantAlert[] = [];
  const ts = new Date().toISOString();

  if (ctx.headers.chws > ctx.chwsSetpoint + 2) {
    const rec = recommendForChwsHigh(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-chws-high',
          severity: 'warning',
          message: `High CHWS Temperature (${ctx.headers.chws.toFixed(1)}°C vs SP ${ctx.chwsSetpoint}°C)`,
          assetId: 'ch-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.headers.chwr > ctx.chwrSetpoint + 2) {
    const rec = recommendForChwrHigh(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-chwr-high',
          severity: 'warning',
          message: `High CHWR Temperature (${ctx.headers.chwr.toFixed(1)}°C vs SP ${ctx.chwrSetpoint}°C)`,
          assetId: 'chwp-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.headers.cws > ctx.cwsSetpoint + 3) {
    const rec = recommendForCwsHigh(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-cws-high',
          severity: 'warning',
          message: `High Condenser Temperature (${ctx.headers.cws.toFixed(1)}°C vs SP ${ctx.cwsSetpoint}°C)`,
          assetId: 'ct-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.deltaT < 4) {
    const rec = recommendForLowDeltaT(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-low-dt',
          severity: 'warning',
          message: `Low Delta-T Detected (${ctx.deltaT.toFixed(1)}°C — target ≥ 4°C)`,
          assetId: 'bv-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.bypassPercent > 15) {
    const rec = recommendForBypassHigh(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-bypass-high',
          severity: 'warning',
          message: `High Bypass Valve Position (${ctx.bypassPercent.toFixed(0)}% — target ≤ 10%)`,
          assetId: 'bv-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.measuredDp > ctx.dpSetpoint + 5) {
    const rec = recommendForDpHigh(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-dp-high',
          severity: 'warning',
          message: `High Header DP (${ctx.measuredDp.toFixed(1)} psi vs SP ${ctx.dpSetpoint} psi)`,
          assetId: 'chwp-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
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
      const rec = recommendForPumpTrip(ctx, id);
      alerts.push(
        attachRecommendation(
          {
            id: `alm-pump-trip-${id}`,
            severity: 'critical',
            message: `Pump Trip — ${pump.name}`,
            assetId: id,
            resolved: false,
            acknowledged: false,
            timestamp: ts,
          },
          rec
        )
      );
    }
  });

  Object.values(ctx.equipment).forEach((ch) => {
    const id = ch.id;
    if (ch && ch.type === 'chiller' && ch.loadPercent > 95) {
      const rec = recommendForChillerOverload(ctx);
      alerts.push(
        attachRecommendation(
          {
            id: `alm-ch-overload-${id}`,
            severity: 'warning',
            message: `Chiller Overload — ${ch.name} at ${ch.loadPercent.toFixed(0)}%`,
            assetId: id,
            resolved: false,
            acknowledged: false,
            timestamp: ts,
          },
          rec
        )
      );
    }
  });

  const tank = ctx.equipment['cwmutnk-41-1'];
  if (tank && tank.type === 'makeup_tank') {
    if (tank.levelPercent < 20) {
      const rec = recommendForMakeupLow();
      alerts.push(
        attachRecommendation(
          {
            id: 'alm-makeup-low',
            severity: 'critical',
            message: 'Low Tank Level — CWMUTnk 41-1',
            assetId: 'cwmutnk-41-1',
            resolved: false,
            acknowledged: false,
            timestamp: ts,
          },
          rec
        )
      );
    }
    if (tank.highLevel) {
      const rec = recommendForMakeupHigh();
      alerts.push(
        attachRecommendation(
          {
            id: 'alm-makeup-high',
            severity: 'warning',
            message: 'High Tank Level — CWMUTnk 41-1',
            assetId: 'cwmutnk-41-1',
            resolved: false,
            acknowledged: false,
            timestamp: ts,
          },
          rec
        )
      );
    }
  }

  if (ctx.faults.chillerTripId) {
    const rec = recommendForChillerFault(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-ch-fault',
          severity: 'critical',
          message: `Chiller Fault — ${ctx.equipment[ctx.faults.chillerTripId]?.name || ctx.faults.chillerTripId}`,
          assetId: ctx.faults.chillerTripId,
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.faults.makeupPumpFail) {
    const rec = recommendForMakeupFail();
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-makeup-fail',
          severity: 'critical',
          message: 'Make-up Pump Failure',
          assetId: 'cwmup-1',
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
  }

  if (ctx.faults.ctFanFaultId) {
    const rec = recommendForCtFanFault(ctx);
    alerts.push(
      attachRecommendation(
        {
          id: 'alm-ct-fan',
          severity: 'warning',
          message: `Cooling Tower Fan Fault — ${ctx.equipment[ctx.faults.ctFanFaultId]?.name}`,
          assetId: ctx.faults.ctFanFaultId,
          resolved: false,
          acknowledged: false,
          timestamp: ts,
        },
        rec
      )
    );
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
