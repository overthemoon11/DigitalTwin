import React, { useState } from 'react';

const HX_TREE = [
  {
    id: 'dcs-root',
    name: 'District Cooling System',
    children: [
      {
        name: 'Central Plant',
        children: [{ id: 'dcs-plant', name: 'District Chiller Plant' }],
      },
      {
        name: 'MBS — Energy Transfer Station',
        children: [
          { id: 'dcv-mbs', name: 'Primary Control Valve' },
          { id: 'hx-mbs', name: 'Plate Heat Exchanger' },
          { id: 'mbs', name: 'MBS Building' },
          { id: 'ahu-mbs', name: 'AHU / FCU Bank' },
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

function HeatExchangeAssetTree({ equipment, selectedAsset, onSelectAsset }) {
  return (
    <div className="asset-tree">
      {HX_TREE.map((root) => (
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

export default HeatExchangeAssetTree;
