import { useEffect } from 'react';
import { useTwinStore } from './useTwinStore';

/** Starts 2s BMS control simulation and syncs into Zustand store. */
export function usePlantTelemetry() {
  const initPlantTelemetry = useTwinStore((s) => s.initPlantTelemetry);

  useEffect(() => {
    const stop = initPlantTelemetry();
    return stop;
  }, [initPlantTelemetry]);
}
