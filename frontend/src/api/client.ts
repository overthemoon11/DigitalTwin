/**
 * HTTP client for the Digital Twin backend.
 *
 * The single place in the frontend that knows how to talk to the server. Raw
 * `fetch` must not appear in components or the store — they call the typed
 * functions in `simulationApi` / `mpcApi`, which call through here.
 *
 * Paths are relative (`/api/...`) so Vite's dev proxy forwards them to :3005
 * and a production build works against whatever origin serves the app. No
 * environment switching, no hard-coded hosts.
 */

const BASE = '/api';

/** Backend error shape: `{ error: string }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly url: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    // A network failure here almost always means the backend is not running,
    // which is worth saying plainly rather than surfacing "Failed to fetch".
    throw new ApiError(0, `cannot reach the backend at ${url} — is it running on :3005?`, url);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body; keep the status text */
    }
    throw new ApiError(res.status, detail, url);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}
