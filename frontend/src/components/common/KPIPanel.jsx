import React from 'react';
import { 
  CATEGORY_ICONS, 
  TREND_ICONS,
  EnergyIcon,
  TemperatureIcon,
  AirQualityIcon,
  OperationalIcon,
  CostIcon,
  ChartIcon,
  TrendStableIcon 
} from './Icons';

// Fallback to emoji if icon not found
const CATEGORY_EMOJI = {
  energy: '⚡',
  comfort: '🌡️',
  iaq: '💨',
  operational: '⚙️',
  environment: '🌤️',
};

function KPICard({ kpi }) {
  const IconComponent = CATEGORY_ICONS[kpi.category] || ChartIcon;
  const TrendIcon = TREND_ICONS[kpi.trend] || TrendStableIcon;
  
  return (
    <div className={`kpi-card ${kpi.status}`}>
      <div className="name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <IconComponent size={16} />
        {kpi.name}
      </div>
      <div className="value">
        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
        <span className="unit">{kpi.unit}</span>
      </div>
      <div className="meta">
        <span>
          Target: {typeof kpi.target === 'number' ? `${kpi.target} ${kpi.unit}` : kpi.target}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TrendIcon size={14} />
          {kpi.trend}
        </span>
      </div>
    </div>
  );
}

function KPIPanel({ kpis }) {
  // Group KPIs by category
  const categories = ['energy', 'comfort', 'iaq', 'operational', 'cost', 'environment'];
  
  return (
    <div className="kpi-grid">
      {categories.map(category => {
        const categoryKpis = kpis.filter(k => k.category === category);
        if (categoryKpis.length === 0) return null;
        
        return (
          <div key={category}>
            <h4 style={{ 
              fontSize: '0.7rem', 
              textTransform: 'uppercase', 
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              marginTop: '0.5rem'
            }}>
              {CATEGORY_ICONS[category]} {category}
            </h4>
            {categoryKpis.map(kpi => (
              <KPICard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default KPIPanel;
