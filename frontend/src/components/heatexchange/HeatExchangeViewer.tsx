import type { DistrictCoolingHeaders, DcsBuildingBranch } from '../../types/districtCooling';
import HeatExchangePlant2DView from './HeatExchangePlant2DView';
import EtsDetail2DView from './EtsDetail2DView';
import { resolveEtsBuildingId } from './resolveEtsBuilding';

interface Props {
  headers: DistrictCoolingHeaders;
  buildings: DcsBuildingBranch[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function HeatExchangeViewer({ headers, buildings, selectedId, onSelect }: Props) {
  const buildingId = resolveEtsBuildingId(selectedId);

  if (buildingId) {
    const branch =
      buildings.find((b) => b.id === buildingId) ??
      ({
        id: buildingId,
        name: buildingId.toUpperCase(),
        loadRt: headers.buildingLoadRt,
        chws: headers.chws,
        chwr: headers.chwr,
        hxApproach: headers.hxApproach,
        valvePct: 70,
        status: 'running',
      } as DcsBuildingBranch);

    return (
      <EtsDetail2DView
        buildingId={buildingId}
        branch={branch}
        headers={headers}
        selectedId={selectedId}
        onSelect={onSelect}
        onBackToCampus={() => onSelect('dcs-plant')}
      />
    );
  }

  return (
    <HeatExchangePlant2DView
      headers={headers}
      buildings={buildings}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
