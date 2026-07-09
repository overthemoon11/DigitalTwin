/**
 * Isometric equipment sprites for the T1 SCADA schematic.
 *
 * These resolve to files under `frontend/public/assets/equipment/`, served by
 * Vite at `/assets/equipment/…`. Drop the PNGs there with these exact names.
 */
const base = '/assets/equipment';

export const EQUIP_IMG = {
  chiller: `${base}/chiller.png`, // water-cooled screw chiller (beige)
  coolingTower: `${base}/cooling-tower.png`, // cooling tower with fan (blue)
  pumpVertical: `${base}/pump-vertical.png`, // vertical inline pump (CHWP / make-up)
  pumpHorizontal: `${base}/pump-horizontal.png`, // horizontal end-suction pump (CWP)
  valve: `${base}/valve.png`, // actuated valve (bypass)
  tank: `${base}/tank.png`, // vertical vessel (expansion / make-up tank)
} as const;

/** ETS (energy-transfer / heat-exchanger station) sprites. */
export const ETS_IMG = {
  hx: `${base}/ets-hx.png`, // plate heat exchanger (blue)
  pump: `${base}/ets-pump.png`, // horizontal pump, green motor
  pumpSm: `${base}/ets-pump-sm.png`, // smaller horizontal pump
  cycsp: `${base}/ets-cycsp-pump.png`, // side-stream CycSP pump
  valve: `${base}/ets-valve.png`, // actuated ball valve (white actuator)
  valveGreen: `${base}/ets-valve-green.png`, // actuated ball valve (green actuator)
  tank: `${base}/ets-tank.png`, // vertical vessel (white)
  transmitter: `${base}/ets-transmitter.png`, // DP / pressure transmitter
} as const;
