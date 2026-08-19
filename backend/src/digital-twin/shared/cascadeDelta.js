/**
 * Helpers for rendering "before → after" values in the domino-effect cascade.
 *
 * When a `before` snapshot is supplied (i.e. the operator just applied changes),
 * each affected output is shown as `old→new unit`; otherwise the current value is
 * shown on its own (the live-tick behaviour).
 */

/** Format a number with a fixed number of decimals, passing through non-numbers. */
function fmt(v, digits) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : `${v}`;
}

/**
 * Render `before → after` (or just `after`) for a single value.
 * @param {number|string|null|undefined} beforeVal value before the change (null/undefined ⇒ no diff)
 * @param {number|string} afterVal value after the change
 * @param {{ unit?: string, digits?: number }} [opts]
 * @returns {string}
 */
export function ba(beforeVal, afterVal, opts = {}) {
  const { unit = '', digits = 1 } = opts;
  const suffix = unit ? ` ${unit}` : '';
  const after = fmt(afterVal, digits);
  if (beforeVal == null) return `${after}${suffix}`;
  const before = fmt(beforeVal, digits);
  if (before === after) return `${after}${suffix}`;
  return `${before} → ${after}${suffix}`;
}

/**
 * Build structured before→after rows for the domino-effect table.
 * @param {Record<string, any>} after after-state context
 * @param {Record<string, any>|null} before before-state context (same keys), or null
 * @param {Array<{key:string, label:string, unit?:string, digits?:number, scale?:number}>} spec
 * @returns {Array<{label:string, unit:string, before:(number|string|null), after:(number|string), changed:boolean}>}
 */
export function buildCascadeRows(after, before, spec) {
  return spec.map(({ key, label, unit = '', digits = 1, scale = 1 }) => {
    const rawA = after?.[key];
    const av = typeof rawA === 'number' ? Number((rawA * scale).toFixed(digits)) : rawA;
    let bv = null;
    let changed = false;
    if (before && before[key] != null) {
      const rawB = before[key];
      bv = typeof rawB === 'number' ? Number((rawB * scale).toFixed(digits)) : rawB;
      changed = bv !== av;
    }
    return { label, unit, before: bv, after: av, changed };
  });
}

/**
 * Build the "Applied N change(s): …" header line listing each operator edit
 * as `Label old→new unit`.
 * @param {Array<{label:string, oldValue:number|string, newValue:number|string, unit?:string}>|null|undefined} changes
 * @returns {string|null}
 */
export function changesHeader(changes) {
  if (!changes || changes.length === 0) return null;
  const parts = changes.map((c) => {
    const unit = c.unit ? ` ${c.unit}` : '';
    return `${c.label} ${c.oldValue}→${c.newValue}${unit}`;
  });
  const verb = changes.length === 1 ? 'change' : 'changes';
  return `▶ Applied ${changes.length} ${verb}: ${parts.join(' · ')}`;
}
