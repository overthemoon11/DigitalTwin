/** Campus building branch id for ETS drill-down. */
export const ETS_BUILDING_ID = 'mbs';

/** Map asset-tree / diagram selection → campus building branch (or null for overview). */
export function resolveEtsBuildingId(selectedId: string | null): string | null {
  if (!selectedId || selectedId === 'dcs-plant') return null;
  if (selectedId === ETS_BUILDING_ID) return ETS_BUILDING_ID;
  if (/^(?:hx|ahu|dcv|flow|meter|pump|bypass)-mbs(?:-\d+)?$/.test(selectedId)) return ETS_BUILDING_ID;
  return null;
}

export function buildingDisplayName(id: string): string {
  return id.toUpperCase();
}
