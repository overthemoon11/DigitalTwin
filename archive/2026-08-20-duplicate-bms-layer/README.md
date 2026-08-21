# Archived: a second, duplicate BMS layer (2026-08-20)

These files are a parallel implementation of BMS loading that was written
without noticing the working tree already contained a more complete one. They
are kept only as a record; nothing imports them and nothing should.

| Archived | Superseded by |
| --- | --- |
| `loader.ts` | `backend/src/data/bmsLoader.ts` |
| `data-index.ts` | `backend/src/data/bmsLoader.ts` + `preprocessing.ts` |
| `exportBmsRecords.py` | `data/scripts/export_bms_records.py` (+ `bms_columns.py`) |
| `t1-bms-15min.json.gz` | `data/processed/t1_2025_12_15min.json` + `_summary.json` |

The surviving implementation was kept because it does strictly more:

- resolves raw columns in a dedicated `bms_columns.py` with an uncertainty
  count (136 mapped, 33 uncertain), rather than inline constants;
- emits a full provenance summary — per-field MEASURED / DERIVED / INFERRED,
  timebase histogram, duplicate and missing row counts;
- validates the reconstructed cooling load three ways (workbook factor,
  physics factor, refit-from-measured) against both the 133 measured rows and
  all 44,640 rows, and records the errors rather than only asserting a
  threshold;
- documents the twelve channels this site does not trend, each with what it
  blocks, so an un-optimisable control is reported as unavailable instead of
  being handed a fabricated optimum;
- carries `artifactVersion` so a stale artifact fails loudly.

The one idea worth carrying forward from the archived version was the explicit
`loadHistory(source: 'bms' | 'synthetic')` door, which throws rather than
substituting synthetic data when real data is missing. The same guarantee is
already present in the surviving layer — `BmsArtifactError` — and the synthetic
generator remains unported in `mpc_program/chiller_mpc/simulate.py`.
