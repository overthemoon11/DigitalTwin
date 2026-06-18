import type { PlantControl } from '../types/plant';

export interface AppliedPlantControl {
  controlId: string;
  label: string;
  oldValue: number;
  newValue: number;
  unit: string;
}

export interface PlantControlParseResult {
  applied: AppliedPlantControl[];
  errors: string[];
}

function getControlByType(controls: PlantControl[], controlType: string): PlantControl | undefined {
  return controls.find((c) => c.controlType === controlType);
}

function snapToStep(value: number, control: PlantControl): number {
  const step = control.step || 1;
  const snapped = Math.round(value / step) * step;
  return Math.min(control.max, Math.max(control.min, snapped));
}

function queueChange(
  pending: Map<string, AppliedPlantControl>,
  controls: PlantControl[],
  controlType: string,
  newValue: number
) {
  const ctrl = getControlByType(controls, controlType);
  if (!ctrl || typeof ctrl.value !== 'number') return;

  const snapped = snapToStep(newValue, ctrl);
  const existing = pending.get(ctrl.id);
  const oldValue = existing?.oldValue ?? ctrl.value;

  if (snapped === oldValue) return;

  pending.set(ctrl.id, {
    controlId: ctrl.id,
    label: ctrl.label,
    oldValue,
    newValue: snapped,
    unit: ctrl.unit,
  });
}

/**
 * Parse natural-language requests to adjust chiller plant simulator controls.
 */
export function parsePlantControlIntents(message: string, controls: PlantControl[]): PlantControlParseResult {
  const pending = new Map<string, AppliedPlantControl>();
  const errors: string[] = [];
  const text = message.trim();

  const loadCtrl = getControlByType(controls, 'buildingLoad');
  if (loadCtrl && typeof loadCtrl.value === 'number') {
    let m = text.match(
      /\b(?:set|change|adjust|move)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (!m) {
      m = text.match(/\b(?:building\s+)?(?:cooling\s+)?load\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*rt\b/i);
    }
    if (!m) m = text.match(/\bload\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*rt\b/i);
    if (m) queueChange(pending, controls, 'buildingLoad', parseFloat(m[1]));

    m = text.match(
      /\b(increase|raise|boost)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (m) {
      const current = pending.get(loadCtrl.id)?.newValue ?? loadCtrl.value;
      queueChange(pending, controls, 'buildingLoad', current + parseFloat(m[2]));
    }

    m = text.match(
      /\b(decrease|lower|reduce|drop)\s+(?:the\s+)?(?:building\s+)?(?:cooling\s+)?load\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:rt)?\b/i
    );
    if (m) {
      const current = pending.get(loadCtrl.id)?.newValue ?? loadCtrl.value;
      queueChange(pending, controls, 'buildingLoad', current - parseFloat(m[2]));
    }
  }

  const ambCtrl = getControlByType(controls, 'ambientTemperature');
  if (ambCtrl && typeof ambCtrl.value === 'number') {
    let m = text.match(
      /\b(?:set|change|adjust|move)\s+(?:the\s+)?(?:outdoor|ambient|outside)\s+(?:air\s+)?(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (!m) {
      m = text.match(
        /\b(?:outdoor|ambient|outside)\s+temp(?:erature)?\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
      );
    }
    if (m) queueChange(pending, controls, 'ambientTemperature', parseFloat(m[1]));

    m = text.match(
      /\b(increase|raise|heat\s+up)\s+(?:the\s+)?(?:outdoor|ambient|outside)\s+(?:temp(?:erature)?)?\s*(?:by\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) {
      const current = pending.get(ambCtrl.id)?.newValue ?? ambCtrl.value;
      queueChange(pending, controls, 'ambientTemperature', current + parseFloat(m[2]));
    }

    m = text.match(
      /\b(decrease|lower|cool\s+down)\s+(?:the\s+)?(?:outdoor|ambient|outside)\s+(?:temp(?:erature)?)?\s*(?:by\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) {
      const current = pending.get(ambCtrl.id)?.newValue ?? ambCtrl.value;
      queueChange(pending, controls, 'ambientTemperature', current - parseFloat(m[2]));
    }
  }

  const humCtrl = getControlByType(controls, 'humiditySetpoint');
  if (humCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:outdoor\s+)?humidity\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?\s*(?:rh)?\b/i
    );
    if (m) queueChange(pending, controls, 'humiditySetpoint', parseFloat(m[1]));
  }

  const chwsCtrl = getControlByType(controls, 'chwsSetpoint');
  if (chwsCtrl) {
    const m = text.match(
      /\b(?:set|change|adjust)\s+(?:the\s+)?(?:chws|chilled\s+water\s+supply)\s+(?:temp(?:erature)?)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*°?\s*c?\b/i
    );
    if (m) queueChange(pending, controls, 'chwsSetpoint', parseFloat(m[1]));
  }

  if (
    /\b(set|change|adjust|increase|decrease|raise|lower)\b/i.test(text)
    && pending.size === 0
    && /\b(load|temp|humidity|chws|outdoor|ambient)\b/i.test(text)
  ) {
    errors.push('Could not parse a control value — try e.g. "Set building load to 1100 RT" or "Set outdoor temperature to 35°C".');
  }

  return { applied: [...pending.values()], errors };
}

export function formatPlantControlConfirmation(applied: AppliedPlantControl[]): string {
  if (!applied.length) return '';
  const lines = applied.map(
    (a) => `- **${a.label}:** ${a.oldValue} → **${a.newValue}** ${a.unit}`
  );
  return `## Controls Updated\n\n${lines.join('\n')}\n\nPlant simulation updated with new setpoints.`;
}

export function buildPlantControlsSummary(controls: PlantControl[]) {
  return controls
    .filter((c) => typeof c.value === 'number')
    .map((c) => ({
      id: c.id,
      label: c.label,
      controlType: c.controlType,
      value: c.value,
      min: c.min,
      max: c.max,
      unit: c.unit,
    }));
}
