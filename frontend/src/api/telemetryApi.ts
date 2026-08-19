/**
 * Live telemetry over WebSocket.
 *
 * The backend now owns the 2-second plant tick and pushes `plant_state`
 * frames; this module turns that socket into a subscription the store can
 * consume. It replaces `startPlantSimulator()`, which used to run the physics
 * on a `setInterval` inside the browser.
 *
 * Reconnects with backoff, because a dropped socket previously meant a frozen
 * schematic with no indication why.
 */
import type { PlantState } from '@shared/types/plant';

type Handlers = {
  onPlantState?: (state: PlantState, baseline?: { input: unknown; control: unknown }) => void;
  onMpcProgress?: (progress: unknown) => void;
  /** Legacy building-twin frames, still emitted by the existing server. */
  onTwinState?: (state: unknown) => void;
  onModelStatus?: (status: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

const MAX_BACKOFF_MS = 15000;

export function connectTelemetry(handlers: Handlers): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let closedByCaller = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (closedByCaller) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${proto}//${window.location.host}/ws`);

    socket.onopen = () => {
      retry = 0;
      handlers.onOpen?.();
    };

    socket.onmessage = (event) => {
      let msg: { type?: string; data?: unknown };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'plant_state':
          handlers.onPlantState?.(msg.data as PlantState, (msg as any).baseline);
          break;
        case 'mpc_progress':
          handlers.onMpcProgress?.(msg.data);
          break;
        case 'state':
        case 'update':
          handlers.onTwinState?.((msg.data as any)?.state ?? msg.data);
          break;
        case 'model_status':
          handlers.onModelStatus?.(msg.data);
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      handlers.onClose?.();
      if (closedByCaller) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry++);
      timer = setTimeout(open, delay);
    };

    socket.onerror = () => {
      // onclose always follows; reconnection is handled there.
      socket?.close();
    };
  };

  open();

  return () => {
    closedByCaller = true;
    if (timer) clearTimeout(timer);
    socket?.close();
    socket = null;
  };
}
