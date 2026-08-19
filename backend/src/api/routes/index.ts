/**
 * Route table for the Digital Twin / MPC API.
 *
 * Handlers do three things only: read the body, call a controller, send JSON.
 * No domain logic lives here — that is the whole reason the controllers exist.
 */
import { Router } from 'express';
import * as sim from '../controllers/simulationController';
import * as mpc from '../controllers/mpcController';
import * as copilot from '../controllers/copilotController';
import { ApiError } from '../controllers/simulationController';
import { publishPlantState } from '../../websocket/plantChannel';

/**
 * Wrap a handler so thrown ApiErrors become clean JSON instead of a 500.
 *
 * `mutates` pushes the new plant state to every WebSocket client immediately
 * rather than letting them wait up to 2s for the next tick — without it the
 * schematic would visibly lag every control edit.
 */
function handle(fn: (body: any) => unknown | Promise<unknown>, mutates = false) {
  return async (req: any, res: any) => {
    try {
      const payload = await fn(req.body ?? {});
      res.json(payload);
      if (mutates) publishPlantState();
    } catch (err) {
      if (err instanceof ApiError) {
        return res.status(err.status).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : 'internal error';
      console.error('[api] unhandled:', err);
      res.status(500).json({ error: message });
    }
  };
}

/** Same as `handle`, but broadcasts the new plant state afterwards. */
const handleMut = (fn: (body: any) => unknown | Promise<unknown>) => handle(fn, true);

export function createApiRouter(): Router {
  const r = Router();

  /* ── health ────────────────────────────────────────────────────────────── */
  r.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'digital-twin',
      model: 'T1 chiller plant',
      deterministic: true,
    });
  });

  /* ── simulation: the Digital Twin ──────────────────────────────────────── */
  r.get('/simulation/config', handle(() => sim.getConfig()));
  r.get('/simulation/state', handle(() => sim.getState()));
  r.get('/simulation/dataset/rows', handle(() => sim.getDatasetRows()));

  r.post('/simulation/evaluate', handle((b) => sim.evaluate(b)));
  r.post('/simulation/evaluate/batch', handle((b) => sim.evaluateBatch(b)));
  r.post('/simulation/predict', handle((b) => sim.predict(b)));
  r.post('/simulation/control', handleMut((b) => sim.setControl(b)));
  r.post('/simulation/apply', handleMut((b) => sim.applyChanges(b)));
  r.post('/simulation/advance', handleMut((b) => sim.advance(b)));
  r.post('/simulation/scenario', handleMut((b) => sim.applyScenario(b)));
  r.post('/simulation/reset', handleMut(() => sim.reset()));
  r.post('/simulation/fault', handleMut((b) => sim.fault(b)));
  r.post('/simulation/alert/acknowledge', handleMut((b) => sim.acknowledgeAlert(b)));
  r.post('/simulation/duty', handleMut((b) => sim.toggleDuty(b)));
  r.post('/simulation/dataset/replay', handleMut((b) => sim.replayDatasetRow(b)));

  /* ── mpc: optimisation over the twin ───────────────────────────────────── */
  r.get('/mpc/config', handle(() => mpc.getMpcConfig()));
  r.get('/mpc/baseline', handle(() => mpc.getBaseline()));
  r.post('/mpc/optimize', handleMut((b) => mpc.optimize(b)));
  r.post('/mpc/simulate', handle((b) => mpc.simulate(b)));
  r.post('/mpc/restore', handleMut((b) => mpc.restore(b)));

  /* ── copilot: intent parsing over the twin ─────────────────────────────── */
  r.post('/copilot/chiller', handleMut((b) => copilot.chillerChat(b)));

  return r;
}
