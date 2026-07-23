/**
 * Calibration envelope guard — tells every consumer (UI, MPC, ML pipelines)
 * whether the twin is interpolating inside the region covered by real T1 data
 * or extrapolating physics assumptions.
 *
 * Bounds are the p1–p99 of 44,410 valid 3-chiller minutes of the Dec-2025
 * trend (RT 2595–3465 · CHWS 7.45–7.64 · achieved CWS 27.4–28.9 · all VSDs on
 * auto · staging locked at 3 chillers), with a small margin. Outside this box
 * the model's answers are physics-shaped assumptions, NOT data-validated —
 * an optimizer must treat them as low-confidence.
 */

export interface CalibrationCheck {
  status: 'calibrated' | 'extrapolated';
  reasons: string[];
}

const BOUNDS: Record<string, { min: number; max: number; label: string; unit: string }> = {
  'ctrl-building-load': { min: 2600, max: 3470, label: 'Cooling load', unit: 'RT' },
  'ctrl-chws-sp': { min: 7.4, max: 7.7, label: 'CHWS setpoint', unit: '°C' },
  'ctrl-cws-sp': { min: 27.4, max: 29.5, label: 'CWS setpoint', unit: '°C' },
  'ctrl-cw-dt-sp': { min: 4.0, max: 4.8, label: 'CW ΔT setpoint', unit: '°C' },
  'ctrl-ambient-temp': { min: 29, max: 33, label: 'Outdoor temp', unit: '°C' },
  'ctrl-humidity': { min: 55, max: 80, label: 'Humidity', unit: '%RH' },
};

/** The real plant ran these in auto (0 = auto) for every calibration minute. */
const AUTO_ONLY: Record<string, string> = {
  'ctrl-ct-fan': 'CT fan override',
  'ctrl-pump-spd': 'CHWP VSD override',
  'ctrl-cwp-spd': 'CWP VSD override',
};

export function assessCalibrationEnvelope(
  getControl: (id: string) => number,
  runningChillers: number,
): CalibrationCheck {
  const reasons: string[] = [];
  for (const [id, b] of Object.entries(BOUNDS)) {
    const v = getControl(id);
    if (Number.isFinite(v) && (v < b.min || v > b.max)) {
      reasons.push(`${b.label} ${v} ${b.unit} outside calibrated ${b.min}–${b.max} ${b.unit}`);
    }
  }
  for (const [id, label] of Object.entries(AUTO_ONLY)) {
    if (getControl(id) > 0) reasons.push(`${label} active — all calibration data ran auto`);
  }
  if (runningChillers !== 3) {
    reasons.push(`${runningChillers} chillers staged — all calibration data ran 3`);
  }
  return { status: reasons.length ? 'extrapolated' : 'calibrated', reasons };
}
