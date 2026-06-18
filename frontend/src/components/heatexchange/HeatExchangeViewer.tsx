import type { DistrictCoolingHeaders, DcsBuildingBranch } from '../../types/districtCooling';
import HeatExchangePlant2DView from './HeatExchangePlant2DView';
import EtsDetail2DView from './EtsDetail2DView';
import { resolveEtsBuildingId } from './resolveEtsBuilding';

interface Props {
  headers: DistrictCoolingHeaders;
  buildings: DcsBuildingBranch[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When set, shows building ETS schematic (middle-view drill-down only). */
  etsBuildingId?: string | null;
  onDrillToEts?: (buildingId: string) => void;
  onExitEts?: () => void;
}

export default function HeatExchangeViewer({
  headers,
  buildings,
  selectedId,
  onSelect,
  etsBuildingId = null,
  onDrillToEts,
  onExitEts,
}: Props) {
  const handleDiagramSelect = (id: string | null) => {
    onSelect(id);
    if (!id) return;
    const building = resolveEtsBuildingId(id);
    if (building) onDrillToEts?.(building);
  };

  if (etsBuildingId) {
    const branch =
      buildings.find((b) => b.id === etsBuildingId) ??
      ({
        id: etsBuildingId,
        name: etsBuildingId.toUpperCase(),
        loadRt: headers.buildingLoadRt,
        chws: headers.chws,
        chwr: headers.chwr,
        hxApproach: headers.hxApproach,
        valvePct: 70,
        status: 'running',
      } as DcsBuildingBranch);

    return (
      <EtsDetail2DView
        buildingId={etsBuildingId}
        branch={branch}
        headers={headers}
        selectedId={selectedId}
        onSelect={onSelect}
        onBackToCampus={() => onExitEts?.()}
      />
    );
  }

  return (
    <HeatExchangePlant2DView
      headers={headers}
      buildings={buildings}
      selectedId={selectedId}
      onSelect={handleDiagramSelect}
    />
  );
}
