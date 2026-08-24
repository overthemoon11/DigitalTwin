/**
 * Live plant channel.
 *
 * This is the piece that takes the 2-second tick out of the browser. The
 * backend owns the single running twin, steps it on an interval, and broadcasts
 * the resulting PlantState to every connected client over the existing /ws
 * socket. The frontend becomes a renderer of state it is sent, rather than a
 * process that computes state itself.
 *
 * One consequence worth being explicit about: the twin is now a SHARED
 * singleton. Previously each browser tab ran its own private simulation, so two
 * operators could hold different plant states. Now they see the same plant,
 * which is the correct behaviour for a plant twin but is a real semantic change
 * from the pre-refactor build.
 *
 * The interval only runs while at least one client is listening — an idle
 * backend should not be burning CPU stepping a plant nobody is watching.
 */
import { stepPlantSimulation } from '../digital-twin/chiller/index';
import { readBaselineControl, readSimulationInput } from '../mpc/index';
// The assistant answers "has CHWR been climbing?", which needs a history that
// nothing else in the stack kept. The tick that already steps the twin is the
// natural place to sample it.
import { recordPlantSample } from '../assistant/trends';

const TICK_MS = 2000;

type Sender = (payload: string) => void;

const listeners = new Set<Sender>();
let timer: NodeJS.Timeout | null = null;

function broadcast(): void {
  if (listeners.size === 0) return;
  let payload: string;
  try {
    const state = stepPlantSimulation();
    recordPlantSample(state);
    // The MPC "BEFORE" column is derived from this same state. Sending it here
    // keeps one derivation on the server rather than a second copy in the UI.
    payload = JSON.stringify({
      type: 'plant_state',
      data: state,
      baseline: { input: readSimulationInput(state), control: readBaselineControl(state) },
    });
  } catch (err) {
    console.error('[plant-channel] step failed:', err);
    return;
  }
  for (const send of listeners) {
    try {
      send(payload);
    } catch {
      // A dead socket is removed by its own close handler; ignore it here so
      // one broken client cannot stop the broadcast to everyone else.
    }
  }
}

function ensureRunning(): void {
  if (timer || listeners.size === 0) return;
  timer = setInterval(broadcast, TICK_MS);
  // Do not hold the event loop open on account of the tick alone.
  timer.unref?.();
}

function stopIfIdle(): void {
  if (timer && listeners.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Register a client. Sends the current state immediately so a new tab paints
 * without waiting up to 2s for the next tick, then streams subsequent ticks.
 * Returns an unsubscribe function.
 */
export function subscribePlant(send: Sender): () => void {
  listeners.add(send);
  ensureRunning();
  try {
    const state = stepPlantSimulation();
    send(JSON.stringify({
      type: 'plant_state',
      data: state,
      baseline: { input: readSimulationInput(state), control: readBaselineControl(state) },
    }));
  } catch (err) {
    console.error('[plant-channel] initial send failed:', err);
  }
  return () => {
    listeners.delete(send);
    stopIfIdle();
  };
}

/** Push the current state to everyone right now — used after a mutation
 *  (control edit, scenario, MPC apply) so the UI does not wait for the tick. */
export function publishPlantState(): void {
  broadcast();
}

/**
 * Push an MPC progress frame. The optimiser runs server-side in one request, so
 * without this the operator would see a spinner instead of the cycle-by-cycle
 * trace the status panel is built around.
 */
export function publishMpcProgress(progress: unknown): void {
  if (listeners.size === 0) return;
  const payload = JSON.stringify({ type: 'mpc_progress', data: progress });
  for (const send of listeners) {
    try {
      send(payload);
    } catch {
      /* dropped clients are cleaned up by their close handler */
    }
  }
}

export function plantChannelStats() {
  return { listeners: listeners.size, running: timer !== null, tickMs: TICK_MS };
}
