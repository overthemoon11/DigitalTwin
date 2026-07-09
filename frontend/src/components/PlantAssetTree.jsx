import React, { useState } from 'react';

const TREE = [
  {
    id: 'plant-root',
    name: 'Chiller Plant',
    children: [
      {
        name: 'Cooling Towers',
        children: Array.from({ length: 5 }, (_, i) => ({
          id: `ct-${i + 1}`,
          name: `CT-${String(i + 1).padStart(2, '0')}`,
        })),
      },
      {
        name: 'Cooling Water Make-up System',
        children: [
          { id: 'cwmutnk-41-1', name: 'CWMUTnk-41-1' },
          { id: 'cwmup-1', name: 'CWMUP-1' },
          { id: 'cwmup-2', name: 'CWMUP-2' },
        ],
      },
      {
        name: 'Chillers',
        children: Array.from({ length: 5 }, (_, i) => ({
          id: `ch-${i + 1}`,
          name: `CH-${i + 1}`,
        })),
      },
      {
        name: 'Condenser Water Pumps',
        children: Array.from({ length: 6 }, (_, i) => ({
          id: `cwp-${i + 1}`,
          name: `CWP-${i + 1}`,
        })),
      },
      {
        name: 'Chilled Water Pumps',
        children: Array.from({ length: 6 }, (_, i) => ({
          id: `chwp-${i + 1}`,
          name: `CHWP-${i + 1}`,
        })),
      },
      {
        name: 'Expansion Tanks',
        children: [
          { id: 'exptnk-01', name: 'ET-01' },
          { id: 'exptnk-02', name: 'ET-02' },
        ],
      },
      {
        name: 'Distribution',
        children: [
          { id: 'm-rise', name: 'Medium Rise (M)' },
          { id: 'h-rise', name: 'High Rise (H)' },
        ],
      },
      {
        name: 'Valves',
        children: [
          { id: 'bv-1', name: 'Bypass Valve 1' },
          { id: 'bv-2', name: 'Bypass Valve 2' },
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

function PlantAssetTree({ equipment, selectedAsset, onSelectAsset }) {
  return (
    <div className="asset-tree">
      {TREE.map((root) => (
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

export default PlantAssetTree;
