/**
 * T1 Chiller-Plant Digital-Twin API — stateless scoring service.
 *
 * A thin HTTP wrapper over the calibrated physics engine so external clients
 * (ML optimisers, notebooks, BMS integrations) can POST control inputs and get
 * the computed efficiency + full plant state back. Every request is evaluated
 * in a snapshot sandbox, so calls are stateless, concurrent-safe and
 * deterministic (same input → same output).
 *
 *   npx tsx frontend/api/server.ts          # listens on :8787 (or $PORT)
 *
 * Endpoints
 *   GET  /health              → liveness + model id
 *   GET  /schema              → manipulable inputs (bounds/step/default) +
 *                               calibrated envelope + output field list
 *   POST /evaluate            → { controls, duty? } → one PlantEvaluation
 *   POST /evaluate/batch      → { cases: [{ controls, duty? }, …] } → [PlantEvaluation]
 *
 * Zero external dependencies — Node's built-in http only.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { evaluatePlant, getPlantInputSchema } from '../src/services/chiller/controlEngine';
import { CALIBRATION_BOUNDS } from '../src/services/chiller/calibrationEnvelope';
import { CALIBRATION_FIT } from '../src/services/chiller/t1MonthCalibration';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BATCH = 2000;

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 8_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Validate one case's control map: object of finite numbers keyed by ctrl-id. */
function coerceCase(c: any): { controls: Record<string, number>; duty?: any } {
  const controls = c?.controls ?? c ?? {};
  if (typeof controls !== 'object' || Array.isArray(controls)) {
    throw new Error('`controls` must be an object of { "ctrl-…": number }');
  }
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(controls)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`control "${k}" must be a finite number`);
    }
    clean[k] = v;
  }
  return { controls: clean, duty: c?.duty };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, {
        status: 'ok',
        model: 'T1 chiller-plant digital twin',
        deterministic: true,
        calibration: {
          basis: `whole Dec-2025 BMS trend, ${CALIBRATION_FIT.rowsUsed.toLocaleString()} usable minutes`,
          blockedCvMaePct: CALIBRATION_FIT.blockedCvMaePct,
          monthReplayMaePct: 0.97,
          note:
            'Grey-box: the physics equations are fixed and only their constants ' +
            'are fitted. Pump affinity exponents and the evaporator-reset ' +
            'sensitivity are NOT identifiable from this data and are held at ' +
            'physical/literature values — see /schema.',
        },
      });
    }

    if (req.method === 'GET' && path === '/schema') {
      return send(res, 200, {
        inputs: getPlantInputSchema(),
        calibratedEnvelope: CALIBRATION_BOUNDS,
        note: 'Inputs outside calibratedEnvelope return calibration.status="extrapolated" (low confidence).',
        knownLimits: {
          pumpSpeed:
            'CHWP/CWP flow varies only 3.3% / 1.5% (p5→p95) in the calibration data, ' +
            'so the affinity exponent is unidentifiable and the cube law is retained ' +
            'on physics grounds. Pump power is accurate at the observed operating ' +
            'point but unvalidated for large commanded VSD changes.',
          condenserLift:
            'Fitted at 4.52 %/°C by stratifying on load to break the load↔CWS ' +
            'correlation (r = 0.67); a naive joint fit returns 5.08 %/°C. Still above ' +
            'the 1.5–3.0 %/°C literature range, so confirm with a CWS step test ' +
            'before closed-loop setpoint optimisation.',
          coolingTowers:
            'Fan speed is not instrumented in the source data, only the resulting ' +
            'VSD kW. Tower kW carries ~8% MAE — the weakest block, though only ' +
            '~3.3% of plant kW.',
          evaporatorReset:
            'The CHWS setpoint moves 0.07 °C p5→p95 in the data, so the 3 %/°C ' +
            'sensitivity is the literature value, not a fitted one.',
        },
        outputs: {
          'efficiency.kwPerRt': 'plant efficiency (kW per RT) — the objective',
          'efficiency.cop': 'plant COP (Q/P identity)',
          'power.totalKw': 'total plant electrical kW',
          'power.{chillerKw,chwpKw,cwpKw,ctKw}': 'per-block power',
          'thermal.*': 'loads, ΔT, header temps, condenser flow, wet-bulb, approach',
          'staging.*': 'units online per category',
          'calibration.{status,reasons}': 'inside vs outside the data-calibrated region',
          alarms: 'count of critical alarms at this operating point',
        },
      });
    }

    if (req.method === 'POST' && path === '/evaluate') {
      const body = await readJson(req);
      const { controls, duty } = coerceCase(body);
      return send(res, 200, evaluatePlant(controls, duty ? { duty } : {}));
    }

    if (req.method === 'POST' && path === '/evaluate/batch') {
      const body = await readJson(req);
      const cases = body?.cases;
      if (!Array.isArray(cases)) {
        return send(res, 400, { error: 'body must be { "cases": [ … ] }' });
      }
      if (cases.length > MAX_BATCH) {
        return send(res, 400, { error: `batch limited to ${MAX_BATCH} cases (got ${cases.length})` });
      }
      const results = cases.map((c: any) => {
        const { controls, duty } = coerceCase(c);
        return evaluatePlant(controls, duty ? { duty } : {});
      });
      return send(res, 200, { count: results.length, results });
    }

    return send(res, 404, { error: `no route for ${req.method} ${path}` });
  } catch (err) {
    return send(res, 400, { error: err instanceof Error ? err.message : 'bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`T1 twin API listening on http://localhost:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  GET  /schema`);
  console.log(`  POST /evaluate         { "controls": { "ctrl-building-load": 3200, "ctrl-chws-sp": 7.5 } }`);
  console.log(`  POST /evaluate/batch   { "cases": [ { "controls": { … } }, … ] }`);
});
