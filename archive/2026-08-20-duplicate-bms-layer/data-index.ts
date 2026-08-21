/**
 * Historical data sources for model fitting and evaluation.
 *
 * Two paths, deliberately never merged:
 *
 *     'bms'        real measured T1 history   -> loadBmsHistory()
 *     'synthetic'  fabricated benchmark data  -> generateSyntheticHistory()
 *
 * `loadHistory(source)` dispatches between them, but the source is always an
 * explicit argument. There is no "fall back to synthetic if the real data is
 * missing" behaviour anywhere: a missing dataset raises, because a silent
 * substitution would let a synthetic-trained model be reported as
 * site-calibrated.
 */
import type { PlantRecord, BmsDatasetSummary } from '../../../shared/types/bms';
import { loadBmsHistory, isBmsDataAvailable, type LoadOptions } from './bms/loader';

export {
  loadBmsHistory,
  loadBmsSummary,
  isBmsDataAvailable,
  splitByTime,
  BmsDataUnavailableError,
} from './bms/loader';

export type HistorySource = 'bms' | 'synthetic';

export interface History {
  source: HistorySource;
  summary: BmsDatasetSummary;
  records: PlantRecord[];
}

/**
 * Load historical operating data from an explicitly chosen source.
 *
 * The synthetic generator is not yet ported from `mpc_program`; asking for it
 * raises with a pointer rather than returning something that looks real. That
 * is intentional — see the note above about silent substitution.
 */
export function loadHistory(source: HistorySource, opts: LoadOptions = {}): History {
  if (source === 'bms') {
    const { summary, records } = loadBmsHistory(opts);
    return { source, summary, records };
  }
  throw new Error(
    'synthetic history is not wired up yet. The generator lives in ' +
      'mpc_program/chiller_mpc/simulate.py:generate_history and has not been ' +
      'ported; it must not be approximated here.'
  );
}

export function availableSources(): Array<{ source: HistorySource; available: boolean; note: string }> {
  return [
    {
      source: 'bms',
      available: isBmsDataAvailable(),
      note: 'Real T1 BMS history, Dec-2025. Run calibration/scripts/exportBmsRecords.py to (re)build.',
    },
    {
      source: 'synthetic',
      available: false,
      note: 'Not yet ported from mpc_program/chiller_mpc/simulate.py:generate_history.',
    },
  ];
}
