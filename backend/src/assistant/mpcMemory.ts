/**
 * The last MPC run, remembered so it can be explained.
 *
 * "Why did MPC increase CHWST?" is a question about a specific run that already
 * happened — usually one the operator started from the Optimization workspace,
 * not from the chat. Without a record of it the assistant would have to solve
 * again and explain a DIFFERENT result, which is the sort of quiet substitution
 * that destroys trust in a tool like this.
 *
 * So both MPC entry points write here: the steady-state optimiser
 * (`POST /api/mpc/optimize`) and the receding-horizon comparison
 * (`POST /api/mpc/horizon/compare`). The assistant reads the record and never
 * re-runs unless there is nothing to read — and when it does re-run, it says so.
 *
 * Deliberately a single slot plus a small history: this is an explanation
 * cache, not an audit log, and an audit log belongs in a database.
 */
import type { ControlState, MpcResult, SimulationInput, SimulationResult } from '../../../shared/types/mpc';
import type { ControlProvenanceMap, HorizonSavings, SolverDiagnostics } from '../../../shared/types/horizon';
import { shortId } from './util';

export interface SteadyStateRunRecord {
  id: string;
  kind: 'steady-state';
  at: number;
  /** True when the run was started by the assistant rather than the UI. */
  viaAssistant: boolean;
  /** Whether the winning control state was committed to the live twin. */
  applied: boolean;
  input: SimulationInput;
  baselineControl: ControlState;
  baselineResult: SimulationResult;
  optimalControl: ControlState | null;
  optimalResult: SimulationResult | null;
  solved: boolean;
  savingKw: number;
  savingPct: number;
  evaluatedCandidates: number;
  feasibleCandidates: number;
  rejectionsByCode: Record<string, number>;
}

export interface HorizonRunRecord {
  id: string;
  kind: 'horizon';
  at: number;
  viaAssistant: boolean;
  applied: false;
  day: string | null;
  steps: number;
  stepMinutes: number;
  forecast: string;
  savings: HorizonSavings;
  baselineControl: ControlState | null;
  appliedControl: ControlState | null;
  provenance: ControlProvenanceMap | null;
  caveats: string[];
  firstDiagnostics: SolverDiagnostics | null;
  solver: Record<string, unknown>;
  baselineTotals: Record<string, unknown>;
  mpcTotals: Record<string, unknown>;
}

export type MpcRunRecord = SteadyStateRunRecord | HorizonRunRecord;

const HISTORY_LIMIT = 8;
const history: MpcRunRecord[] = [];

function push(record: MpcRunRecord): MpcRunRecord {
  history.unshift(record);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  return record;
}

export function recordSteadyStateRun(
  result: MpcResult,
  opts: { applied: boolean; viaAssistant?: boolean }
): SteadyStateRunRecord {
  const record: SteadyStateRunRecord = {
    id: shortId('mpc'),
    kind: 'steady-state',
    at: Date.now(),
    viaAssistant: opts.viaAssistant ?? false,
    applied: opts.applied,
    input: result.input,
    baselineControl: result.baselineControl,
    baselineResult: result.baselineResult,
    optimalControl: result.optimalControl,
    optimalResult: result.optimalResult,
    solved: result.solved,
    savingKw: result.savingKw,
    savingPct: result.savingPct,
    evaluatedCandidates: result.evaluatedCandidates,
    feasibleCandidates: result.feasibleCandidates,
    rejectionsByCode: result.rejectionsByCode,
  };
  push(record);
  return record;
}

export function recordHorizonRun(
  comparison: any,
  opts: { viaAssistant?: boolean } = {}
): HorizonRunRecord {
  const record: HorizonRunRecord = {
    id: shortId('hmpc'),
    kind: 'horizon',
    at: Date.now(),
    viaAssistant: opts.viaAssistant ?? false,
    applied: false,
    day: comparison?.conditions?.day ?? null,
    steps: comparison?.conditions?.steps ?? 0,
    stepMinutes: comparison?.conditions?.stepMinutes ?? 15,
    forecast: comparison?.conditions?.forecast?.kind ?? 'unknown',
    savings: comparison?.savings,
    baselineControl: comparison?.baselineControl ?? null,
    appliedControl: comparison?.appliedControl ?? null,
    provenance: comparison?.optimisedControls ?? null,
    caveats: Array.isArray(comparison?.caveats) ? comparison.caveats : [],
    firstDiagnostics: comparison?.mpc?.trajectory?.[0]?.diagnostics ?? null,
    solver: comparison?.solver ?? {},
    baselineTotals: comparison?.baseline?.totals ?? {},
    mpcTotals: comparison?.mpc?.totals ?? {},
  };
  push(record);
  return record;
}

export function getLastMpcRun(): MpcRunRecord | null {
  return history[0] ?? null;
}

export function getLastRunOfKind<K extends MpcRunRecord['kind']>(
  kind: K
): Extract<MpcRunRecord, { kind: K }> | null {
  return (history.find((r) => r.kind === kind) as Extract<MpcRunRecord, { kind: K }>) ?? null;
}

export function getMpcRunById(id: string): MpcRunRecord | null {
  return history.find((r) => r.id === id) ?? null;
}

export function mpcRunHistory(): MpcRunRecord[] {
  return [...history];
}

/** Test hook. */
export function clearMpcMemory(): void {
  history.length = 0;
}
