/** Map asset-tree / diagram selection → campus building branch (or null for overview). */
export function resolveEtsBuildingId(selectedId: string | null): string | null {
  if (!selectedId || selectedId === 'dcs-plant') return null;
  if (selectedId === 'orq' || selectedId === 'mbfc' || selectedId === 'mbs') return selectedId;
  const m = selectedId.match(/^(?:hx|ahu|dcv|flow|meter|pump|bypass)-(?:orq|mbfc|mbs)(?:-\d+)?$/);
  if (m) {
    const id = selectedId.split('-').find((p) => p === 'orq' || p === 'mbfc' || p === 'mbs');
    return id ?? null;
  }
  return null;
}

export function buildingDisplayName(id: string): string {
  return id.toUpperCase();
}
