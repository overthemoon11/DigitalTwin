import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Deferred-apply control state for the virtual-simulator control panels.
 *
 * Slider / toggle edits update only a local *draft* — they do NOT touch the
 * physics engine. The operator can stage several changes and commit them all at
 * once with the "Apply Changes" button. The draft re-syncs to the applied values
 * whenever those actually change (after Apply, Reset, a scenario, or a chatbot
 * action), but is preserved across the live 2 s telemetry ticks (which re-emit
 * the same control values on every render).
 *
 * @param {Array<{id:string,label:string,value:number,unit?:string}>} controls applied controls from the engine
 */
export function useDraftControls(controls) {
  // Signature of the *applied* values — changes only when the engine commits.
  const appliedSig = useMemo(
    () => controls.map((c) => `${c.id}:${c.value}`).join('|'),
    [controls]
  );

  const buildDraft = useCallback(
    () => Object.fromEntries(controls.map((c) => [c.id, c.value])),
    [controls]
  );

  const [draft, setDraft] = useState(buildDraft);

  // Re-sync the draft to applied values when (and only when) those change.
  const lastSig = useRef(appliedSig);
  useEffect(() => {
    if (lastSig.current !== appliedSig) {
      lastSig.current = appliedSig;
      setDraft(buildDraft());
    }
  }, [appliedSig, buildDraft]);

  const setDraftValue = useCallback((id, value) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
  }, []);

  const discardDrafts = useCallback(() => {
    setDraft(buildDraft());
  }, [buildDraft]);

  // Pending = draft values that differ from what the engine has applied.
  const pending = useMemo(() => {
    const out = [];
    for (const c of controls) {
      const next = draft[c.id];
      if (next != null && next !== c.value) {
        out.push({
          controlId: c.id,
          label: c.label,
          oldValue: c.value,
          newValue: next,
          unit: c.unit ?? '',
        });
      }
    }
    return out;
  }, [controls, draft]);

  return { draft, setDraftValue, discardDrafts, pending };
}
