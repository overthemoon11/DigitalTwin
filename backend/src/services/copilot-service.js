/**
 * Enhanced HVAC Digital Twin Copilot Service
 * 
 * Provides intelligent assistance for building operators with:
 * - Natural language understanding for HVAC queries
 * - Action execution (setpoints, simulation, fault injection)
 * - Grounded responses using twin state data
 * - Trend analysis and recommendations
 * - Powered by remote OpenAI-compatible LLM or Foundry Local SDK
 */

import { chatCompletion, getStatus } from './llm-service.js';

/**
 * Intent classification for user messages
 */
const INTENT_PATTERNS = {
  // Information queries
  ENERGY_QUERY: /\b(energy|power|kw|kwh|consumption|usage|electricity|cost)\b/i,
  COMFORT_QUERY: /\b(comfort|temperature|temp|hot|cold|warm|cool|setpoint)\b/i,
  AIR_QUALITY_QUERY: /\b(air quality|co2|carbon|iaq|ventilation|fresh air|ppm)\b/i,
  ALERT_QUERY: /\b(alert|alarm|warning|issue|problem|fault|error)\b/i,
  EQUIPMENT_QUERY: /\b(ahu|chiller|boiler|pump|vav|filter|equipment|hvac)\b/i,
  KPI_QUERY: /\b(kpi|metric|performance|efficiency|cop|compliance)\b/i,
  ZONE_QUERY: /\b(zone|room|floor|lobby|office|meeting|executive|area)\b/i,

  // Action requests
  SET_TEMPERATURE: /\b(set|change|adjust|raise|lower|increase|decrease).*(temp|setpoint|degree)/i,
  RUN_SIMULATION: /\b(simulate|run|step|advance|fast forward|time)\b/i,
  INJECT_FAULT: /\b(inject|create|simulate|test).*(fault|failure|problem|scenario)\b/i,
  RESET_SYSTEM: /\b(reset|restore|baseline|default|undo)\b/i,
  OPTIMIZE: /\b(optimize|auto|automatic|recommend|suggest|improve|best)\b/i,

  // Analysis requests
  COMPARE: /\b(compare|versus|vs|difference|between)\b/i,
  TREND: /\b(trend|history|over time|chart|graph|forecast|predict)\b/i,
  EXPLAIN: /\b(explain|why|how|what causes|reason|root cause)\b/i,
  SUMMARY: /\b(summary|overview|status|report|brief|dashboard)\b/i
};

/**
 * Extract numeric values from text
 */
function extractNumber(text) {
  const match = text.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract zone name from text
 */
function extractZoneName(text, assets) {
  const zones = assets.filter(a => a.type === 'zone');
  const lowerText = text.toLowerCase();

  // Try exact match first
  for (const zone of zones) {
    if (lowerText.includes(zone.name.toLowerCase())) {
      return zone;
    }
  }

  // Try partial match
  const keywords = ['lobby', 'office', 'meeting', 'executive', 'mechanical', 'conference'];
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      const match = zones.find(z => z.name.toLowerCase().includes(keyword));
      if (match) return match;
    }
  }

  // Try floor match
  const floorMatch = lowerText.match(/floor\s*(\d)/i);
  if (floorMatch) {
    return zones.find(z => z.name.includes(`Floor ${floorMatch[1]}`));
  }

  return null;
}

/**
 * Build comprehensive system prompt with twin state context
 */
function buildSystemPrompt(twinState) {
  const { assets, telemetry, controls, kpis, alerts, simulatorState } = twinState;

  // Build detailed context
  const kpiContext = kpis.map(k => ({
    name: k.name,
    value: k.value,
    unit: k.unit,
    status: k.status,
    trend: k.trend,
    target: k.target
  }));

  const activeAlerts = alerts.filter(a => !a.resolved);

  const zoneContext = assets
    .filter(a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical')
    .map(zone => {
      const temp = telemetry.find(t => t.assetId === zone.id && t.pointType === 'temperature')?.value;
      const co2 = telemetry.find(t => t.assetId === zone.id && t.pointType === 'co2')?.value;
      const humidity = telemetry.find(t => t.assetId === zone.id && t.pointType === 'humidity')?.value;
      const occupancy = zone.properties?.currentOccupancy || 0;
      const coolingSetpoint = controls.find(c => c.assetId === zone.id && c.controlType === 'coolingSetpoint')?.value;
      const heatingSetpoint = controls.find(c => c.assetId === zone.id && c.controlType === 'heatingSetpoint')?.value;

      return {
        name: zone.name,
        id: zone.id,
        temperature: temp,
        co2,
        humidity,
        occupancy,
        coolingSetpoint,
        heatingSetpoint,
        status: zone.status
      };
    });

  const equipmentContext = assets
    .filter(a => ['ahu', 'chiller', 'boiler', 'pump'].includes(a.type))
    .map(equip => {
      const power = telemetry.find(t => t.assetId === equip.id && t.pointType === 'power')?.value;
      const status = equip.status;
      const enabled = equip.enabled !== false;

      return {
        name: equip.name,
        type: equip.type,
        power: power ? `${power} kW` : 'N/A',
        status,
        enabled
      };
    });

  return `You are the HVAC Operations assistant (Local LLM) for the "${twinState.metadata.name}" digital twin.
You assist building operators with monitoring, analysis, and control of HVAC systems.

## CAPABILITIES
You can:
1. Answer questions about current building conditions, energy usage, and air quality
2. Provide specific recommendations with expected impact
3. Execute actions when the user asks (setpoint changes, simulations, fault tests)
4. Explain KPI calculations and system behavior
5. Analyze trends and predict issues

## RESPONSE RULES
1. ALWAYS cite specific values from the twin state - never invent data
2. When recommending actions, include expected energy/comfort impact
3. For setpoint changes, confirm the zone and new value before executing
4. Use bullet points for multiple items
5. Keep responses concise but complete
6. If data is unavailable, say so clearly

## CURRENT CONDITIONS (${twinState.metadata.simulationTime})

### Environment
- Outdoor Temperature: ${simulatorState.outdoorTemp}°F
- Outdoor Humidity: ${simulatorState.outdoorHumidity}%
- Solar Load: ${(simulatorState.solarLoad * 100).toFixed(0)}%
- Time of Day: ${simulatorState.timeOfDay}:00
- Demand Response Active: ${simulatorState.demandResponseActive ? 'YES' : 'NO'}

### KPIs
${kpiContext.map(k => `- ${k.name}: ${k.value} ${k.unit} (target: ${k.target}, ${k.status}, ${k.trend})`).join('\n')}

### Active Alerts (${activeAlerts.length})
${activeAlerts.length > 0
      ? activeAlerts.map(a => `- [${a.severity.toUpperCase()}] ${a.message}`).join('\n')
      : 'No active alerts'}

### Zone Conditions
${zoneContext.map(z =>
        `- ${z.name}: ${z.temperature}°F, ${z.co2} ppm CO2, ${z.occupancy} occupants, setpoint ${z.coolingSetpoint}°F cooling / ${z.heatingSetpoint}°F heating`
      ).join('\n')}

### Equipment Status
${equipmentContext.map(e => `- ${e.name}: ${e.power}, ${e.status}${!e.enabled ? ' (DISABLED)' : ''}`).join('\n')}

## AVAILABLE ACTIONS
When the user wants to make changes, you can trigger these actions:
- SET_TEMPERATURE: Change zone setpoint (specify zone and temperature)
- RUN_SIMULATION: Advance simulation time (specify minutes)
- INJECT_FAULT: Test fault scenarios (stuck damper, sensor drift, high CO2)
- RESET_SYSTEM: Restore to baseline state
- OPTIMIZE: Apply recommended optimizations

When executing an action, respond with a clear confirmation of what was done and the result.`;
}

/**
 * Extract the operator's actual question when legacy clients embed plant context in message.
 */
function extractUserMessage(message) {
  const match = message.match(/Operator question:\s*([\s\S]+)$/i);
  return (match ? match[1] : message).trim();
}

/**
 * Short greetings / small talk should reach the LLM, not HVAC templates.
 */
function isCasualMessage(message) {
  const text = message.trim().toLowerCase();
  if (!text) return true;
  if (text.length <= 3) return true;
  return /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|help|good morning|good afternoon|good evening)\b/.test(text);
}

/**
 * Analyze intent and extract parameters from user message
 */
function analyzeIntent(message, twinState) {
  const lowerMsg = message.toLowerCase();
  const intents = [];
  const params = {};

  // Check each intent pattern
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(message)) {
      intents.push(intent);
    }
  }

  // Extract specific parameters
  if (intents.includes('SET_TEMPERATURE')) {
    params.temperature = extractNumber(message);
    params.zone = extractZoneName(message, twinState.assets);
  }

  if (intents.includes('RUN_SIMULATION')) {
    const timeMatch = message.match(/(\d+)\s*(minute|min|hour|hr)/i);
    if (timeMatch) {
      params.timeStep = parseInt(timeMatch[1]) * (timeMatch[2].startsWith('hour') ? 60 : 1);
    } else {
      params.timeStep = 60; // Default 1 hour
    }
  }

  if (intents.includes('INJECT_FAULT')) {
    if (lowerMsg.includes('damper') || lowerMsg.includes('stuck')) {
      params.faultType = 'stuck_damper';
    } else if (lowerMsg.includes('sensor') || lowerMsg.includes('drift')) {
      params.faultType = 'sensor_drift';
    } else if (lowerMsg.includes('co2') || lowerMsg.includes('ventilation')) {
      params.faultType = 'high_co2';
    } else if (lowerMsg.includes('filter') || lowerMsg.includes('clog')) {
      params.faultType = 'filter_clog';
    }
  }

  return { intents, params };
}

/**
 * Generate grounded response for queries
 */
function generateGroundedResponse(intents, twinState) {
  const { assets, telemetry, controls, kpis, alerts, simulatorState } = twinState;

  let response = '';

  if (intents.includes('SUMMARY')) {
    const totalPower = kpis.find(k => k.id === 'kpi-total-power');
    const comfort = kpis.find(k => k.id === 'kpi-comfort-compliance');
    const iaq = kpis.find(k => k.id === 'kpi-iaq-compliance');
    const activeAlerts = alerts.filter(a => !a.resolved);

    response = `## Building Status Summary\n\n`;
    response += `**Energy:** ${totalPower?.value || 'N/A'} kW (${totalPower?.status || 'unknown'})\n`;
    response += `**Comfort Compliance:** ${comfort?.value || 'N/A'}% (target: ${comfort?.target}%)\n`;
    response += `**IAQ Compliance:** ${iaq?.value || 'N/A'}% (target: ${iaq?.target}%)\n`;
    response += `**Active Alerts:** ${activeAlerts.length}\n`;
    response += `**Outdoor Conditions:** ${simulatorState.outdoorTemp}°F, ${simulatorState.outdoorHumidity}% RH\n`;

    if (activeAlerts.length > 0) {
      response += `\n**Priority Issues:**\n`;
      activeAlerts.slice(0, 3).forEach(a => {
        response += `- [${a.severity}] ${a.message}\n`;
      });
    }
    return response;
  }

  if (intents.includes('ENERGY_QUERY')) {
    const power = kpis.find(k => k.id === 'kpi-total-power');
    const dailyEnergy = kpis.find(k => k.id === 'kpi-daily-energy');
    const cost = kpis.find(k => k.id === 'kpi-energy-cost');
    const chillerEff = kpis.find(k => k.id === 'kpi-chiller-efficiency');

    response += `## Energy Analysis\n\n`;
    response += `- **Current Power:** ${power?.value || 'N/A'} kW (target: <${power?.target} kW) - ${power?.status}\n`;
    response += `- **Projected Daily Usage:** ${dailyEnergy?.value || 'N/A'} kWh\n`;
    response += `- **Estimated Daily Cost:** $${cost?.value?.toFixed(2) || 'N/A'}\n`;
    response += `- **Chiller COP:** ${chillerEff?.value || 'N/A'} (target: >${chillerEff?.target})\n\n`;

    // Equipment breakdown
    const equipPower = assets
      .filter(a => ['ahu', 'chiller', 'boiler', 'pump'].includes(a.type))
      .map(e => {
        const pwr = telemetry.find(t => t.assetId === e.id && t.pointType === 'power')?.value;
        return { name: e.name, power: pwr || 0 };
      })
      .sort((a, b) => b.power - a.power);

    response += `**Power Breakdown:**\n`;
    equipPower.forEach(e => {
      response += `- ${e.name}: ${e.power.toFixed(1)} kW\n`;
    });

    return response;
  }

  if (intents.includes('AIR_QUALITY_QUERY')) {
    const avgCO2 = kpis.find(k => k.id === 'kpi-avg-co2');
    const iaqCompliance = kpis.find(k => k.id === 'kpi-iaq-compliance');
    const ventilation = kpis.find(k => k.id === 'kpi-ventilation-adequacy');

    response += `## Air Quality Analysis\n\n`;
    response += `- **Average CO2:** ${avgCO2?.value || 'N/A'} ppm (target: <${avgCO2?.target} ppm) - ${avgCO2?.status}\n`;
    response += `- **IAQ Compliance:** ${iaqCompliance?.value || 'N/A'}%\n`;
    response += `- **Ventilation Adequacy:** ${ventilation?.value || 'N/A'}%\n\n`;

    // Zone-by-zone CO2
    const zones = assets.filter(a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical');
    response += `**Zone CO2 Levels:**\n`;
    zones.forEach(z => {
      const co2 = telemetry.find(t => t.assetId === z.id && t.pointType === 'co2')?.value;
      const status = co2 > 1000 ? '🔴' : co2 > 800 ? '🟡' : '🟢';
      response += `- ${z.name}: ${co2 || 'N/A'} ppm ${status}\n`;
    });

    // CO2 alerts
    const co2Alerts = alerts.filter(a => !a.resolved && a.message.toLowerCase().includes('co2'));
    if (co2Alerts.length > 0) {
      response += `\n**CO2 Alerts:**\n`;
      co2Alerts.forEach(a => {
        response += `- ${a.message} → ${a.recommendedAction}\n`;
      });
    }

    return response;
  }

  if (intents.includes('COMFORT_QUERY')) {
    const deviation = kpis.find(k => k.id === 'kpi-avg-temp-deviation');
    const compliance = kpis.find(k => k.id === 'kpi-comfort-compliance');

    response += `## Comfort Analysis\n\n`;
    response += `- **Avg Temperature Deviation:** ${deviation?.value || 'N/A'}°F from setpoint\n`;
    response += `- **Comfort Compliance:** ${compliance?.value || 'N/A'}% (target: ${compliance?.target}%)\n\n`;

    // Zone temperatures
    const zones = assets.filter(a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical');
    response += `**Zone Temperatures:**\n`;
    zones.forEach(z => {
      const temp = telemetry.find(t => t.assetId === z.id && t.pointType === 'temperature')?.value;
      const setpoint = controls.find(c => c.assetId === z.id && c.controlType === 'coolingSetpoint')?.value;
      const deviation = temp && setpoint ? (temp - setpoint).toFixed(1) : 'N/A';
      const status = Math.abs(parseFloat(deviation)) > 2 ? '🔴' : Math.abs(parseFloat(deviation)) > 1 ? '🟡' : '🟢';
      response += `- ${z.name}: ${temp?.toFixed(1) || 'N/A'}°F (setpoint: ${setpoint}°F, deviation: ${deviation}°F) ${status}\n`;
    });

    return response;
  }

  if (intents.includes('ALERT_QUERY')) {
    const activeAlerts = alerts.filter(a => !a.resolved);

    if (activeAlerts.length === 0) {
      return `## Alert Status\n\nNo active alerts. All systems operating normally.`;
    }

    response += `## Active Alerts (${activeAlerts.length})\n\n`;
    activeAlerts.forEach(a => {
      const severity = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🟢';
      response += `### ${severity} ${a.message}\n`;
      response += `- **Severity:** ${a.severity}\n`;
      response += `- **Asset:** ${a.assetId}\n`;
      response += `- **Cause:** ${a.cause || 'Unknown'}\n`;
      response += `- **Recommended Action:** ${a.recommendedAction}\n`;
      response += `- **Time:** ${a.timestamp}\n`;
      response += `- **Acknowledged:** ${a.acknowledged ? 'Yes' : 'No'}\n\n`;
    });

    return response;
  }

  if (intents.includes('EQUIPMENT_QUERY')) {
    response += `## Equipment Status\n\n`;

    // AHUs
    const ahus = assets.filter(a => a.type === 'ahu');
    response += `**Air Handling Units:**\n`;
    ahus.forEach(ahu => {
      const sat = telemetry.find(t => t.assetId === ahu.id && t.pointType === 'supplyAirTemp')?.value;
      const flow = telemetry.find(t => t.assetId === ahu.id && t.pointType === 'supplyAirFlow')?.value;
      const power = telemetry.find(t => t.assetId === ahu.id && t.pointType === 'power')?.value;
      const fanSpeed = telemetry.find(t => t.assetId === ahu.id && t.pointType === 'fanSpeed')?.value;
      response += `- **${ahu.name}:** SAT ${sat}°F, ${flow} CFM, ${power} kW, Fan ${fanSpeed}%\n`;
    });

    // Chiller
    const chillers = assets.filter(a => a.type === 'chiller');
    response += `\n**Chillers:**\n`;
    chillers.forEach(ch => {
      const load = telemetry.find(t => t.assetId === ch.id && t.pointType === 'chillerLoad')?.value;
      const power = telemetry.find(t => t.assetId === ch.id && t.pointType === 'power')?.value;
      response += `- **${ch.name}:** ${(load * 100).toFixed(0)}% load, ${power} kW\n`;
    });

    // Boiler
    const boilers = assets.filter(a => a.type === 'boiler');
    response += `\n**Boilers:**\n`;
    boilers.forEach(b => {
      const load = telemetry.find(t => t.assetId === b.id && t.pointType === 'boilerLoad')?.value;
      const power = telemetry.find(t => t.assetId === b.id && t.pointType === 'power')?.value;
      response += `- **${b.name}:** ${(load * 100).toFixed(0)}% load, ${power} kW\n`;
    });

    // Filters
    const filterKPI = kpis.find(k => k.id === 'kpi-filter-life-ahu1');
    response += `\n**Filter Status:**\n`;
    response += `- AHU-1 Filter: ${filterKPI?.value || 'N/A'}% life remaining\n`;

    return response;
  }

  if (intents.includes('OPTIMIZE')) {
    response += `## Optimization Recommendations\n\n`;

    // Check for specific optimization opportunities
    const recommendations = [];

    // Check energy
    const power = kpis.find(k => k.id === 'kpi-total-power');
    if (power && power.value > power.target * 0.9) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Raise cooling setpoints by 2°F across all zones',
        impact: 'Estimated 8-12% power reduction',
        tradeoff: 'Minor comfort impact during peak hours'
      });
    }

    // Check CO2
    const avgCO2 = kpis.find(k => k.id === 'kpi-avg-co2');
    const co2Alerts = alerts.filter(a => !a.resolved && a.message.toLowerCase().includes('co2'));
    if (co2Alerts.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Increase VAV minimum airflow by 20% in affected zones',
        impact: 'CO2 reduction within 15-20 minutes',
        tradeoff: 'Slightly higher energy consumption'
      });
    }

    // Check comfort compliance
    const comfort = kpis.find(k => k.id === 'kpi-comfort-compliance');
    if (comfort && comfort.value < comfort.target) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Review zone setpoints for overcooled/underheated areas',
        impact: 'Improved comfort compliance',
        tradeoff: 'May require individual zone adjustments'
      });
    }

    // Check filter
    const filterLife = kpis.find(k => k.id === 'kpi-filter-life-ahu1');
    if (filterLife && filterLife.value < 40) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Schedule AHU-1 filter replacement within 2 weeks',
        impact: 'Maintain optimal airflow and efficiency',
        tradeoff: 'Maintenance cost and brief service interruption'
      });
    }

    // Demand response
    if (simulatorState.outdoorTemp > 85 && !simulatorState.demandResponseActive) {
      recommendations.push({
        priority: 'LOW',
        action: 'Consider enabling Demand Response Level 1',
        impact: '10-15% peak demand reduction',
        tradeoff: 'Slightly wider temperature deadband'
      });
    }

    if (recommendations.length === 0) {
      response += `System is operating optimally. No immediate actions recommended.\n`;
    } else {
      recommendations.forEach((rec, idx) => {
        const icon = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
        response += `### ${idx + 1}. ${icon} ${rec.action}\n`;
        response += `- **Priority:** ${rec.priority}\n`;
        response += `- **Expected Impact:** ${rec.impact}\n`;
        response += `- **Tradeoff:** ${rec.tradeoff}\n\n`;
      });
    }

    return response;
  }

  // Default: provide helpful guidance
  return null;
}

/**
 * Execute an action on the twin
 */
async function executeAction(intent, params, twinState, simulator) {
  const result = { success: false, message: '', changes: null };

  if (intent === 'SET_TEMPERATURE') {
    if (!params.zone) {
      result.message = 'Please specify which zone you want to adjust (e.g., "Set lobby temperature to 72°F").';
      return result;
    }
    if (!params.temperature) {
      result.message = 'Please specify the target temperature (e.g., "Set lobby temperature to 72°F").';
      return result;
    }

    // Find the control
    const coolingControl = twinState.controls.find(
      c => c.assetId === params.zone.id && c.controlType === 'coolingSetpoint'
    );

    if (!coolingControl) {
      result.message = `Cannot find temperature control for ${params.zone.name}.`;
      return result;
    }

    // Validate temperature range
    if (params.temperature < coolingControl.min || params.temperature > coolingControl.max) {
      result.message = `Temperature must be between ${coolingControl.min}°F and ${coolingControl.max}°F.`;
      return result;
    }

    // Apply the change
    const oldValue = coolingControl.value;
    const simResult = simulator.step(60, { [coolingControl.id]: params.temperature });

    result.success = true;
    result.message = `✅ **Setpoint Changed**\n\n` +
      `- **Zone:** ${params.zone.name}\n` +
      `- **Old Setpoint:** ${oldValue}°F\n` +
      `- **New Setpoint:** ${params.temperature}°F\n\n` +
      `The change has been applied. Zone temperature will adjust over the next few minutes.`;
    result.changes = simResult;

    return result;
  }

  if (intent === 'RUN_SIMULATION') {
    const timeStep = params.timeStep || 60;
    const simResult = simulator.step(timeStep);

    result.success = true;
    result.message = `✅ **Simulation Advanced**\n\n` +
      `- **Time Step:** ${timeStep} minutes\n` +
      `- **New Time:** ${simResult.state.metadata.simulationTime}\n` +
      (simResult.newAlerts?.length > 0
        ? `\n**New Alerts Generated:**\n${simResult.newAlerts.map(a => `- ${a.message}`).join('\n')}`
        : '\nNo new alerts generated.');
    result.changes = simResult;

    return result;
  }

  if (intent === 'INJECT_FAULT') {
    if (!params.faultType) {
      result.message = 'Please specify the type of fault to inject:\n' +
        '- **Stuck damper**: VAV damper fails in current position\n' +
        '- **Sensor drift**: Temperature sensor reads incorrectly\n' +
        '- **High CO2**: Simulate poor ventilation scenario\n' +
        '- **Filter clog**: Simulate blocked filter condition';
      return result;
    }

    simulator.applyFault(params.faultType, params);
    const simResult = simulator.step(60);

    result.success = true;
    result.message = `✅ **Fault Injected**\n\n` +
      `- **Fault Type:** ${params.faultType}\n` +
      `- **Status:** Active\n\n` +
      `The fault scenario has been applied. Monitor alerts and KPIs to observe system response.`;
    result.changes = simResult;

    return result;
  }

  if (intent === 'RESET_SYSTEM') {
    result.success = true;
    result.message = `✅ **Reset Requested**\n\n` +
      `To reset the digital twin to baseline state, use the "Reset Twin" button in the Control Panel.`;
    result.requiresConfirmation = true;
    result.action = 'RESET';

    return result;
  }

  return result;
}

/**
 * Main Copilot chat handler
 */
async function handleCopilotChat(
  message,
  conversationHistory,
  twinState,
  simulator,
  plantContext = '',
  plantControls = [],
  appliedControls = []
) {
  const userMessage = extractUserMessage(message);
  const { intents, params } = analyzeIntent(userMessage, twinState);

  // Check if this is an action request
  const actionIntents = ['SET_TEMPERATURE', 'RUN_SIMULATION', 'INJECT_FAULT', 'RESET_SYSTEM'];
  const requestedAction = intents.find(i => actionIntents.includes(i));

  let response = '';
  let actionResult = null;

  // Try to execute action if requested
  if (requestedAction) {
    actionResult = await executeAction(requestedAction, params, twinState, simulator);
    if (actionResult.message) {
      response = actionResult.message;
    }
  }

  // Template responses use building twin data — skip in chiller plant mode (plantContext set)
  if (!response && !plantContext && !isCasualMessage(userMessage)) {
    response = generateGroundedResponse(intents, twinState);
  }

  // If still no response, try LLM (remote API or Foundry Local)
  if (!response) {
    const modelStatus = getStatus();
    if (modelStatus.ready) {
      try {
        let systemPrompt = buildSystemPrompt(twinState);
        if (plantContext) {
          systemPrompt += `\n\n## CHILLER PLANT SIMULATOR (client-side physics)\n${plantContext}`;
        }
        if (plantControls.length > 0) {
          systemPrompt += `\n\n## ADJUSTABLE PLANT CONTROLS\nOperators change these via chat (building load, outdoor temp, humidity, water setpoints). Current values:\n${plantControls.map((c) => `- ${c.label}: ${c.value} ${c.unit} (range ${c.min}–${c.max})`).join('\n')}`;
        }
        if (appliedControls.length > 0) {
          systemPrompt += `\n\n## APPLIED CONTROL CHANGES (already executed in the simulator)\n${appliedControls.map((c) => `- ${c.label}: ${c.oldValue} → ${c.newValue} ${c.unit}`).join('\n')}\nAcknowledge these changes and briefly explain the expected impact on plant load, COP, and condenser performance.`;
        }
        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-6),
          { role: 'user', content: userMessage }
        ];

        const llmContent = await chatCompletion(messages, {
          temperature: 0.7,
          maxTokens: 1024,
        });

        if (llmContent) {
          response = llmContent;
        } else {
          throw new Error('Empty response from model');
        }
      } catch (err) {
        // Fallback response
        response = generateFallbackResponse(modelStatus);
      }
    } else {
      response = generateFallbackResponse(modelStatus);
    }
  }

  return {
    response,
    actionExecuted: actionResult?.success || false,
    actionChanges: actionResult?.changes || null,
    controlsApplied: appliedControls.length > 0,
    intents,
    groundedIn: {
      kpis: twinState.kpis.map(k => ({ id: k.id, value: k.value, status: k.status })),
      activeAlerts: twinState.alerts.filter(a => !a.resolved).length,
      simulationTime: twinState.metadata.simulationTime
    }
  };
}

/**
 * Generate a fallback response when the model is not available
 */
function generateFallbackResponse(modelStatus) {
  let statusNote = '';
  const isRemote = modelStatus.provider === 'openai';

  if (modelStatus.status === 'downloading') {
    statusNote = `> **Model downloading:** ${modelStatus.downloadProgress.toFixed(0)}% complete. AI-powered responses will be available shortly.\n\n`;
  } else if (modelStatus.status === 'loading' || modelStatus.status === 'initializing') {
    statusNote = `> **Model loading:** The AI model is being prepared. AI-powered responses will be available shortly.\n\n`;
  } else if (modelStatus.status === 'error' || modelStatus.status === 'unavailable') {
    if (isRemote) {
      statusNote = `> **AI model offline.** Using built-in responses. Connect OpenVPN and verify \`${modelStatus.baseUrl || process.env.OPENAI_BASE_URL}\` is reachable.\n\n`;
    } else {
      statusNote = `> **AI model offline.** Using built-in responses. Install Foundry Local or set \`OPENAI_BASE_URL\` for a remote LLM.\n\n`;
    }
  }

  return statusNote +
    `I can help you with:\n\n` +
    `- **"Show me a summary"** - Building status overview\n` +
    `- **"How is energy usage?"** - Power and cost analysis\n` +
    `- **"Check air quality"** - CO2 and ventilation status\n` +
    `- **"Are there any alerts?"** - Active issues\n` +
    `- **"What should I optimize?"** - Recommendations\n` +
    `- **"Set lobby temperature to 72"** - Change setpoints\n` +
    `- **"Run simulation for 30 minutes"** - Advance time\n\n` +
    `What would you like to know?`;
}

export {
  handleCopilotChat,
  analyzeIntent,
  buildSystemPrompt,
  generateGroundedResponse,
  executeAction
};
