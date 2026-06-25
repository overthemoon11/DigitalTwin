import React, { useState } from 'react';

/** Asset hierarchy for AHU01 — names match SCADA faceplates. */
const AHU_TREE = [
  {
    id: 'ahu01',
    name: 'AHU01',
    children: [
      { id: 'room', name: 'ROOM (1F)' },
      {
        name: 'Fans',
        children: [
          { id: 'ahu01-sa-fan', name: 'SA FAN' },
          { id: 'ahu01-ra-fan', name: 'RA FAN' },
        ],
      },
      {
        name: 'Coils',
        children: [
          { id: 'ahu01-chw-coil', name: 'CHW COIL' },
          { id: 'ahu01-hw-coil', name: 'HW COIL' },
        ],
      },
      { id: 'ahu01-mixing', name: 'Mixing Box' },
      {
        name: 'Filters',
        children: [
          { id: 'ahu01-sa-eu4', name: 'SA EU-4' },
          { id: 'ahu01-sa-eu7', name: 'EU-7 Filter-02' },
          { id: 'ahu01-sa-eu13', name: 'SA EU-13' },
          { id: 'ahu01-ra-eu7', name: 'EU-7 Filter-01' },
        ],
      },
      {
        name: 'Dampers',
        children: [
          { id: 'ahu01-fa-damper-01', name: 'FA Damper-01' },
          { id: 'ahu01-fa-damper-02', name: 'FA Damper-02' },
          { id: 'ahu01-ra-damper', name: 'RA Damper' },
          { id: 'ahu01-ea-damper-01', name: 'EA Damper-01' },
          { id: 'ahu01-ea-damper-02', name: 'EA Damper-02' },
          { id: 'ahu01-ra-fire', name: 'Fire Damper-01' },
          { id: 'ahu01-sa-fire', name: 'Fire Damper-02' },
        ],
      },
      {
        name: 'Sensors',
        children: [
          { id: 'ahu01-smoke-sensor', name: 'Smoke Sensor' },
          { id: 'ahu01-ra-cfm', name: 'RA CFM' },
          { id: 'ahu01-sa-cfm', name: 'SA CFM' },
          { id: 'ahu01-ra-trh', name: 'T & RH' },
          { id: 'ahu01-ambient-trh', name: 'Ambient T & RH' },
        ],
      },
    ],
  },
];

const STATUS_CLASS = {
  running: 'normal',
  stopped: '',
  alarm: 'warning',
  manual: 'warning',
};

function TreeNode({ node, equipment, selectedAsset, onSelect, level = 0 }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children?.length > 0;
  const eq = node.id ? equipment[node.id] : null;
  const status = eq?.status || 'stopped';
  const isSelected = node.id && selectedAsset === node.id;

  if (!hasChildren && node.id) {
    return (
      <div className="asset-node" style={{ marginLeft: `${level * 8}px` }}>
        <div
          className={`asset-item ${isSelected ? 'selected' : ''}`}
          onClick={() => onSelect(node.id)}
        >
          <span className="icon">⚙</span>
          <span className="name">{node.name}</span>
          <span className={`status ${STATUS_CLASS[status] || ''}`} title={status} />
        </div>
      </div>
    );
  }

  return (
    <div className="asset-node" style={{ marginLeft: `${level * 4}px` }}>
      <div
        className="asset-item"
        style={{ fontWeight: level === 0 ? 600 : 500, cursor: hasChildren ? 'pointer' : 'default' }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="expand-toggle" style={{ marginRight: 4, fontSize: '0.7rem' }}>
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <span className="name">{node.name}</span>
      </div>
      {expanded &&
        node.children?.map((child, i) => (
          <TreeNode
            key={child.id || child.name + i}
            node={child}
            equipment={equipment}
            selectedAsset={selectedAsset}
            onSelect={onSelect}
            level={level + 1}
          />
        ))}
    </div>
  );
}

export default function AhuAssetTree({ equipment, selectedAsset, onSelectAsset }) {
  return (
    <div className="asset-tree">
      {AHU_TREE.map((root) => (
        <TreeNode
          key={root.id}
          node={root}
          equipment={equipment || {}}
          selectedAsset={selectedAsset}
          onSelect={onSelectAsset}
        />
      ))}
    </div>
  );
}
