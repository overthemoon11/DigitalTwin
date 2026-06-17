import React from 'react';
import { useTwinStore } from '../hooks/useTwinStore';

function ModelStatusBanner() {
  const { modelStatus } = useTwinStore();

  if (!modelStatus || modelStatus.ready) return null;

  const { status, message, downloadProgress, modelAlias } = modelStatus;

  let bannerClass = 'model-status-banner';
  let icon = '🤖';

  if (status === 'downloading') {
    bannerClass += ' downloading';
    icon = '⬇️';
  } else if (status === 'loading') {
    bannerClass += ' loading';
    icon = '⏳';
  } else if (status === 'error' || status === 'unavailable') {
    bannerClass += ' error';
    icon = '⚠️';
  } else if (status === 'initializing') {
    bannerClass += ' loading';
    icon = '🔄';
  }

  return (
    <div className={bannerClass}>
      <div className="model-status-content">
        <span className="model-status-icon">{icon}</span>
        <span className="model-status-text">
          {status === 'downloading' && (
            <>Downloading AI model <strong>{modelAlias}</strong> — {downloadProgress?.toFixed(0)}%</>
          )}
          {status === 'loading' && (
            <>Loading AI model <strong>{modelAlias}</strong>…</>
          )}
          {status === 'initializing' && (
            <>{message || 'Connecting to AI model…'}</>
          )}
          {(status === 'error' || status === 'unavailable') && (
            <>AI model unavailable — Copilot will use built-in responses</>
          )}
        </span>
      </div>
      {status === 'downloading' && (
        <div className="model-progress-bar">
          <div
            className="model-progress-fill"
            style={{ width: `${downloadProgress || 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default ModelStatusBanner;
