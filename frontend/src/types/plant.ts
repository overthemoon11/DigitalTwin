/**
 * Re-export of the shared plant contract.
 *
 * `PlantState` and friends moved to `shared/types/plant.ts` when the frontend
 * and backend were split, so that both sides describe the twin with one set of
 * types. A dozen components still import it by the old relative path, and
 * esbuild never noticed because it strips types without resolving them — only
 * `tsc` does. This shim keeps those imports working and keeps the definition in
 * exactly one place. Point new code at `@shared/types/plant` directly.
 */
export * from '@shared/types/plant';
