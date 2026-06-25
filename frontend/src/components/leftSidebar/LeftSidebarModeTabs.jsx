import React from 'react';

/** Top-level left sidebar mode: asset tree vs virtual simulator insight. */
export default function LeftSidebarModeTabs({ mode, onModeChange }) {
  return (
    <div className="left-sidebar-mode-tabs">
      <button
        type="button"
        className={mode === 'assets' ? 'active' : ''}
        onClick={() => onModeChange('assets')}
      >
        Assets
      </button>
      <button
        type="button"
        className={mode === 'simulator' ? 'active' : ''}
        onClick={() => onModeChange('simulator')}
      >
        Virtual Simulator
      </button>
    </div>
  );
}
