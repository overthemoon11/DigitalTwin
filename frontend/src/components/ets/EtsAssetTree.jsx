import React, { useState } from 'react';

/** Asset hierarchy for ETS A-B03-01 — names match SCADA faceplates. */
const ETS_TREE = [
  {
    id: 'ets-a-b03-01',
    name: 'ETS A-B03-01 (ASM)',
    children: [
      { id: 'asm', name: 'ASM Building Load' },
      {
        name: 'Hydronic',
        children: [{ id: 'fetnk-a-04-01', name: 'FETnk-A-04-01' }],
      },
      {
        name: 'Valves',
        children: [
          { id: 'lt-bypass', name: 'LT Bypass Valve' },
          { id: 'minflow-bypass', name: 'Min Flow Bypass Valve' },
          { id: 'hx-01-valve', name: 'HX-A-B03-01 Valve' },
          { id: 'hx-02-valve', name: 'HX-A-B03-02 Valve' },
        ],
      },
      {
        name: 'Flow Meters',
        children: [
          { id: 'lt-bypass-flow', name: 'LT Bypass Flow' },
          { id: 'flow-chwr', name: 'CHWR Flow' },
        ],
      },
      {
        name: 'CHWP (Secondary)',
        children: [
          { id: 'chwp-a-b03-01', name: 'CHWP-A-B03-01' },
          { id: 'chwp-a-b03-02', name: 'CHWP-A-B03-02' },
          { id: 'chwp-a-b03-03', name: 'CHWP-A-B03-03' },
        ],
      },
      {
        name: 'Plate Heat Exchangers',
        children: [
          { id: 'hx-a-b03-01', name: 'HX-A-B03-01' },
          { id: 'hx-a-b03-02', name: 'HX-A-B03-02' },
        ],
      },
      {
        name: 'Side-Stream / CycSP',
        children: [
          { id: 'cycsp-a-b03-01', name: 'CycSP-A-B03-01' },
          { id: 'cycsp-a-b03-02', name: 'CycSP-A-B03-02' },
          { id: 'side-stream-vessel', name: 'Side-Stream Vessel' },
        ],
      },
      {
        name: 'Metering',
        children: [{ id: 'meter-cws-a-b03-01', name: 'CWS-A-B03-01 Energy Meter' }],
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

export default function EtsAssetTree({ equipment, selectedAsset, onSelectAsset }) {
  return (
    <div className="asset-tree">
      {ETS_TREE.map((root) => (
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
