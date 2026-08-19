/**
 * MPC endpoints.
 *
 * The optimiser runs on the backend. This module is the only thing the UI knows
 * about it: send an input + constraints, get an MpcResult back. Candidate
 * generation, constraint validation and the objective function are no longer
 * present in the browser at all.
 */
import { get, post } from './client';
import type {
  ConstraintConfig,
  ConstraintConfigError,
  ControlState,
  MpcResult,
  SimulationInput,
  SimulationResult,
} from '@shared/types/mpc';
import type { PlantState } from '@shared/types/plant';

export interface MpcOptimizeRequest {
  simulationInput?: SimulationInput;
  currentControls?: ControlState;
  constraints?: ConstraintConfig;
  maxCycles?: number;
  /** Commit the winner to the live twin. Defaults to true server-side. */
  apply?: boolean;
}

export interface MpcOptimizeResponse {
  status: 'COMPLETED' | 'INFEASIBLE' | 'INVALID_CONSTRAINTS';
  constraintErrors: ConstraintConfigError[];
  result: MpcResult | null;
  violationLabels?: Record<string, string>;
  plantState?: PlantState | null;
}

export interface MpcConfigResponse {
  designConstraints: ConstraintConfig;
  violationLabels: Record<string, string>;
  defaultMaxCycles: number;
  optimizer: string;
}

/** Design defaults + violation labels. Fetched once; replaces importing
 *  `designConstraints()` and `VIOLATION_LABELS` from the MPC module. */
export const fetchMpcConfig = () => get<MpcConfigResponse>('/mpc/config');

/** The live plant expressed as disturbances + control state — the BEFORE column. */
export const fetchBaseline = () =>
  get<{ input: SimulationInput; control: ControlState }>('/mpc/baseline');

/** Run the optimisation. This is the "Run MPC Simulation" button. */
export const runMpc = (request: MpcOptimizeRequest) =>
  post<MpcOptimizeResponse>('/mpc/optimize', request);

/** Score a single control state without optimising — used for the baseline row
 *  and to preview a hand-edited candidate. */
export const simulateControl = (body: {
  simulationInput?: SimulationInput;
  control?: ControlState;
  constraints?: ConstraintConfig;
}) =>
  post<{ input: SimulationInput; control: ControlState; result: SimulationResult }>(
    '/mpc/simulate',
    body
  );

/** Put the twin back on a captured control state ("Restore Before"). */
export const restoreControl = (body: {
  simulationInput?: SimulationInput;
  control?: ControlState;
  constraints?: ConstraintConfig;
}) => post<{ plantState: PlantState }>('/mpc/restore', body);
