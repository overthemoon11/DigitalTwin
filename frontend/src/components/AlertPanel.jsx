import React from 'react';
import { useTwinStore } from '../hooks/useTwinStore';
import { AlertIcon, CheckIcon } from './Icons';

// Lightbulb icon for recommendations
const LightbulbIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="18" x2="15" y2="18" />
    <line x1="10" y1="22" x2="14" y2="22" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);

function AlertItem({ alert, assets, onAcknowledge }) {
  const asset = assets.find(a => a.id === alert.assetId);
  const time = new Date(alert.timestamp).toLocaleTimeString();
  
  return (
    <div className={`alert-item ${alert.severity}`}>
      <div className="header">
        <span className="severity">{alert.severity}</span>
        <span className="time">{time}</span>
      </div>
      <div className="message">{alert.message}</div>
      {asset && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
          Asset: {asset.name}
        </div>
      )}
      {alert.recommendedAction && (
        <div className="action" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <LightbulbIcon size={14} />
          {alert.recommendedAction}
        </div>
      )}
      {!alert.acknowledged && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          style={{
            marginTop: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: 'var(--bg-dark)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <CheckIcon size={12} /> Acknowledge
        </button>
      )}
      {alert.acknowledged && (
        <div style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckIcon size={12} /> Acknowledged
        </div>
      )}
    </div>
  );
}

function AlertPanel({ alerts, assets }) {
  const { acknowledgeAlert } = useTwinStore();
  
  const activeAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved).slice(0, 5);
  
  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ 
          fontSize: '0.75rem', 
          textTransform: 'uppercase', 
          color: 'var(--text-muted)',
          marginBottom: '0.5rem'
        }}>
          Active Alerts ({activeAlerts.length})
        </h4>
        {activeAlerts.length === 0 ? (
          <p style={{ color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckIcon size={14} /> No active alerts
          </p>
        ) : (
          <div className="alert-list">
            {activeAlerts.map(alert => (
              <AlertItem
                key={alert.id}
                alert={alert}
                assets={assets}
                onAcknowledge={acknowledgeAlert}
              />
            ))}
          </div>
        )}
      </div>
      
      {resolvedAlerts.length > 0 && (
        <div>
          <h4 style={{ 
            fontSize: '0.75rem', 
            textTransform: 'uppercase', 
            color: 'var(--text-muted)',
            marginBottom: '0.5rem'
          }}>
            Recently Resolved
          </h4>
          <div className="alert-list">
            {resolvedAlerts.map(alert => (
              <div
                key={alert.id}
                style={{
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  borderLeft: '2px solid var(--success)',
                  marginBottom: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckIcon size={12} /> {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertPanel;
