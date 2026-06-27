import React, { useState } from 'react';

/** Decimals implied by the step (e.g. 0.1 → 1, 5 → 0) for clean bubble text. */
function stepDecimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/**
 * Range input with a value bubble that previews the value at the *mouse hover
 * point* over the track (snapped to the step), so the user can see exactly
 * where a click would land before releasing. On keyboard focus it shows the
 * currently selected value at the thumb.
 */
export function RangeSlider({ min, max, step, value, unit, title, display: displayProp, onChange }) {
  const [hover, setHover] = useState(null); // { pct, val } at the hover point, or null
  const [focused, setFocused] = useState(false);
  const dec = stepDecimals(step);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || max <= min) return;
    let ratio = (e.clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    const raw = min + ratio * (max - min);
    const snapped = Math.min(max, Math.max(min, Math.round((raw - min) / step) * step + min));
    const val = Number(snapped.toFixed(dec));
    setHover({ pct: ((val - min) / (max - min)) * 100, val });
  };

  const showBubble = hover != null || focused;
  const bubbleVal = hover != null ? hover.val : value;
  const pct = hover != null ? hover.pct : (max > min ? ((value - min) / (max - min)) * 100 : 0);
  // Correct for the ~16px thumb width so the bubble centres over the point at both ends.
  const offsetPx = 8 - (pct / 100) * 16;
  const bubbleText =
    hover != null
      ? `${bubbleVal}${unit ? ` ${unit}` : ''}`
      : displayProp ?? `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="slider-wrap">
      <div
        className={`slider-bubble ${showBubble ? 'visible' : ''}`}
        style={{ left: `calc(${pct}% + ${offsetPx}px)` }}
        aria-hidden="true"
      >
        {bubbleText}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        title={title ?? `${value}${unit ? ` ${unit}` : ''}`}
        onChange={onChange}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
