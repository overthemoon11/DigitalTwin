import React, { useState } from 'react';
import { ASSET_TYPE_ICONS, BuildingIcon, AlertIcon } from '../common/Icons';

// Fallback emoji icons if SVG not available
const ASSET_EMOJI = {
  building: '🏢',
  floor: '📐',
  zone: '🏠',
  ahu: '🌀',
  vav: '📦',
  chiller: '❄️',
  boiler: '🔥',
  pump: '💧',
  filter: '🔲',
};

function AssetTreeNode({ asset, assets, relationships, selectedAsset, onSelectAsset, telemetry, alerts, level = 0 }) {
  const [expanded, setExpanded] = useState(level < 2);
  
  // Find children (assets with this asset as parentId)
  const children = assets.filter(a => a.parentId === asset.id);
  
  // Get telemetry for this asset
  const assetTelemetry = telemetry.filter(t => t.assetId === asset.id);
  const temp = assetTelemetry.find(t => t.pointType === 'temperature')?.value;
  const co2 = assetTelemetry.find(t => t.pointType === 'co2')?.value;
  
  // Check for alerts
  const hasAlert = alerts.some(a => a.assetId === asset.id && !a.resolved);
  
  // Get icon component or fallback to emoji
  const IconComponent = ASSET_TYPE_ICONS[asset.type];
  const fallbackEmoji = ASSET_EMOJI[asset.type] || '📍';
  
  return (
    <div className="asset-node" style={{ marginLeft: `${level * 8}px` }}>
      <div
        className={`asset-item ${selectedAsset === asset.id ? 'selected' : ''}`}
        onClick={() => onSelectAsset(asset.id)}
      >
        {children.length > 0 && (
          <span
            className="expand-toggle"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{ cursor: 'pointer', marginRight: '4px', fontSize: '0.7rem' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <span className="icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {IconComponent ? <IconComponent size={16} /> : fallbackEmoji}
        </span>
        <span className="name">{asset.name}</span>
        {temp && <span style={{ fontSize: '0.7rem', marginLeft: '4px', color: '#88ccff' }}>{temp.toFixed(0)}°</span>}
        {co2 && <span style={{ fontSize: '0.7rem', marginLeft: '4px', color: co2 > 800 ? '#ffaa00' : '#88ff88' }}>{co2}ppm</span>}
        <span className={`status ${hasAlert ? 'warning' : asset.status}`} />
      </div>
      
      {expanded && children.length > 0 && (
        <div className="children">
          {children.map(child => (
            <AssetTreeNode
              key={child.id}
              asset={child}
              assets={assets}
              relationships={relationships}
              selectedAsset={selectedAsset}
              onSelectAsset={onSelectAsset}
              telemetry={telemetry}
              alerts={alerts}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetTree({ assets, relationships, selectedAsset, onSelectAsset, telemetry, alerts }) {
  // Find root assets (no parentId)
  const rootAssets = assets.filter(a => !a.parentId);
  
  return (
    <div className="asset-tree">
      {rootAssets.map(asset => (
        <AssetTreeNode
          key={asset.id}
          asset={asset}
          assets={assets}
          relationships={relationships}
          selectedAsset={selectedAsset}
          onSelectAsset={onSelectAsset}
          telemetry={telemetry}
          alerts={alerts}
        />
      ))}
    </div>
  );
}

export default AssetTree;
