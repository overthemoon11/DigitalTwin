/**
 * HVAC Digital Twin Simulator Engine
 * 
 * Deterministic physics-based simulation for HVAC operations.
 * Uses simplified thermal models and mass balance equations.
 * 
 * Supports fault injection for testing fault detection and diagnostics.
 */

// Physical constants
const CONSTANTS = {
  CO2_GENERATION_RATE: 0.0084,  // CFM CO2 per person (ASHRAE)
  OUTDOOR_CO2: 400,              // ppm baseline
  BTU_PER_PERSON: 400,           // BTU/hr sensible heat per person
  BTU_PER_EQUIPMENT: 3.412,      // BTU/hr per watt
  AIR_DENSITY: 0.075,            // lb/ft³
  AIR_SPECIFIC_HEAT: 0.24,       // BTU/(lb·°F)
  ELECTRICITY_RATE: 0.12,        // $/kWh
  CHILLER_MIN_LOAD: 0.15,        // Minimum chiller load (15%)
  PUMP_MIN_SPEED: 20,            // Minimum VFD speed (%)
  MOTOR_OVERHEAT_TEMP: 180,      // Motor winding temperature alarm (°F)
  REFRIGERANT_LOW_PRESSURE: 45,  // Low refrigerant pressure alarm (psi)
  REFRIGERANT_HIGH_PRESSURE: 250, // High refrigerant pressure alarm (psi)
};

// Fault types and their effects
const FAULT_CATALOG = {
  // Plant Equipment Failures
  chiller_compressor_failure: {
    description: 'Chiller compressor motor failure',
    severity: 'critical',
    effects: { chillerCapacity: 0, chillerPower: 0 },
    symptoms: ['No cooling output', 'Compressor not running', 'High suction pressure']
  },
  chiller_low_refrigerant: {
    description: 'Low refrigerant charge in chiller',
    severity: 'warning',
    effects: { chillerCapacity: 0.6, copDegradation: 0.3 },
    symptoms: ['Reduced cooling capacity', 'Low suction pressure', 'Superheat too high']
  },
  chiller_condenser_fouling: {
    description: 'Fouled condenser coils reducing heat rejection',
    severity: 'warning', 
    effects: { copDegradation: 0.25, headPressureIncrease: 15 },
    symptoms: ['High head pressure', 'Reduced COP', 'Higher power consumption']
  },
  boiler_flame_failure: {
    description: 'Boiler burner flame failure',
    severity: 'critical',
    effects: { boilerCapacity: 0, boilerPower: 0 },
    symptoms: ['No heat output', 'Flame sensor fault', 'Lockout']
  },
  boiler_low_water: {
    description: 'Low water level in boiler',
    severity: 'critical',
    effects: { boilerCapacity: 0 },
    symptoms: ['Low water cutoff activated', 'Boiler shutdown', 'Make-up water issue']
  },
  pump_failure: {
    description: 'Circulation pump motor failure',
    severity: 'critical',
    effects: { pumpFlow: 0, pumpPower: 0 },
    symptoms: ['No flow', 'Motor not running', 'High temperature differential']
  },
  pump_cavitation: {
    description: 'Pump cavitation due to low suction pressure',
    severity: 'warning',
    effects: { pumpEfficiency: 0.5, flowReduction: 0.3 },
    symptoms: ['Vibration', 'Noise', 'Reduced flow', 'Erratic pressure']
  },
  vfd_failure: {
    description: 'Variable frequency drive failure',
    severity: 'critical',
    effects: { equipmentSpeed: 0 },
    symptoms: ['Drive fault code', 'Motor not responding', 'No speed control']
  },
  motor_overload: {
    description: 'Motor thermal overload',
    severity: 'warning',
    effects: { equipmentCapacity: 0.5 },
    symptoms: ['High amp draw', 'Motor hot', 'Thermal overload tripped']
  },
  
  // AHU Failures
  supply_fan_failure: {
    description: 'Supply fan motor failure',
    severity: 'critical',
    effects: { ahuAirflow: 0, ahuPower: 0 },
    symptoms: ['No airflow', 'Fan not running', 'High static pressure']
  },
  return_fan_failure: {
    description: 'Return fan motor failure',
    severity: 'warning',
    effects: { ahuAirflow: 0.7, buildingPressure: -0.1 },
    symptoms: ['Negative building pressure', 'Reduced return air']
  },
  cooling_coil_freeze: {
    description: 'Frozen cooling coil due to low CHW temp',
    severity: 'critical',
    effects: { coolingCapacity: 0, airflowRestriction: 0.8 },
    symptoms: ['Ice on coil', 'Blocked airflow', 'High discharge temp']
  },
  heating_coil_failure: {
    description: 'Heating coil valve failure',
    severity: 'warning',
    effects: { heatingCapacity: 0 },
    symptoms: ['No heating', 'Valve stuck closed', 'Cold discharge air']
  },
  economizer_failure: {
    description: 'Economizer damper stuck',
    severity: 'warning',
    effects: { outsideAirFixed: true },
    symptoms: ['Damper not modulating', 'Mixed air temp wrong', 'Energy waste']
  },
  
  // VAV/Zone Failures
  stuck_damper: {
    description: 'VAV damper stuck in position',
    severity: 'warning',
    effects: { damperFixed: true },
    symptoms: ['Zone temp drift', 'Damper not responding', 'Comfort complaints']
  },
  reheat_coil_failure: {
    description: 'VAV reheat coil failure',
    severity: 'warning',
    effects: { reheatCapacity: 0 },
    symptoms: ['Zone too cold', 'No reheat', 'Comfort complaints']
  },
  
  // Sensor Failures
  sensor_drift: {
    description: 'Temperature sensor calibration drift',
    severity: 'info',
    effects: { sensorOffset: 5 },
    symptoms: ['Readings inconsistent', 'Control hunting', 'Comfort issues']
  },
  sensor_failure: {
    description: 'Sensor complete failure',
    severity: 'warning',
    effects: { sensorValue: null },
    symptoms: ['No reading', 'Default mode', 'Loss of control']
  },
  
  // Communication Failures
  network_failure: {
    description: 'BACnet/network communication loss',
    severity: 'warning',
    effects: { communicationLoss: true },
    symptoms: ['Points offline', 'No data', 'Default operation']
  },
  controller_failure: {
    description: 'DDC controller failure',
    severity: 'critical',
    effects: { controllerOffline: true },
    symptoms: ['All points lost', 'Equipment in manual', 'No response']
  },
  
  // Utility Failures  
  power_failure: {
    description: 'Electrical power loss',
    severity: 'critical',
    effects: { allEquipmentOff: true },
    symptoms: ['Everything off', 'No power', 'Emergency mode']
  },
  partial_power_loss: {
    description: 'Partial power loss (one circuit)',
    severity: 'warning',
    effects: { affectedEquipment: [] },
    symptoms: ['Some equipment off', 'Breaker tripped']
  }
};

// VAV-Zone mapping
const VAV_ZONE_MAP = {
  'vav-001-01': 'zone-lobby-001',
  'vav-002-01': 'zone-office-001',
  'vav-002-02': 'zone-meeting-001',
  'vav-002-03': 'zone-meeting-002',
  'vav-003-01': 'zone-office-002',
  'vav-003-02': 'zone-exec-001',
};

// AHU-Zone mapping (which zones each AHU serves)
const AHU_ZONE_MAP = {
  'ahu-001': ['zone-lobby-001', 'zone-office-001', 'zone-meeting-001', 'zone-meeting-002'],
  'ahu-002': ['zone-office-002', 'zone-exec-001'],
};

/**
 * Main simulator class
 */
class HVACSimulator {
  constructor(twinState) {
    this.state = JSON.parse(JSON.stringify(twinState)); // Deep clone
    this.simulationLog = [];
    this.newAlerts = [];
  }

  /**
   * Run one simulation step
   * @param {number} timeStepSeconds - Simulation time step in seconds
   * @param {Object} controlChanges - Optional control changes to apply
   * @returns {Object} Updated twin state with simulation results
   */
  step(timeStepSeconds = 60, controlChanges = {}) {
    const dt = timeStepSeconds / 3600; // Convert to hours for calculations
    const timestamp = new Date().toISOString();
    
    this.simulationLog = [];
    this.newAlerts = [];

    // Apply control changes first
    if (Object.keys(controlChanges).length > 0) {
      this._applyControlChanges(controlChanges);
    }

    // Update simulation time
    this.state.metadata.simulationTime = timestamp;
    this.state.metadata.lastUpdated = timestamp;

    // 1. Simulate zone thermal response
    this._simulateZones(dt, timestamp);

    // 2. Simulate AHU operation
    this._simulateAHUs(dt, timestamp);

    // 3. Simulate plant equipment
    this._simulatePlant(dt, timestamp);

    // 4. Calculate KPIs
    this._calculateKPIs(timestamp);

    // 5. Run fault detection rules
    this._runFaultDetection(timestamp);

    return {
      state: this.state,
      log: this.simulationLog,
      newAlerts: this.newAlerts
    };
  }

  /**
   * Apply control changes to state
   */
  _applyControlChanges(changes) {
    for (const [controlId, newValue] of Object.entries(changes)) {
      const control = this.state.controls.find(c => c.id === controlId);
      if (control) {
        const oldValue = control.value;
        control.value = newValue;
        control.mode = 'manual';
        this.simulationLog.push({
          type: 'control_change',
          controlId,
          oldValue,
          newValue,
          message: `Control ${controlId} changed from ${oldValue} to ${newValue}`
        });
      }
    }
  }

  /**
   * Simulate zone thermal and IAQ response
   */
  _simulateZones(dt, timestamp) {
    const zones = this.state.assets.filter(a => a.type === 'zone' && a.properties.zoneType !== 'mechanical');
    
    for (const zone of zones) {
      const zoneId = zone.id;
      const props = zone.properties;
      
      // Get zone telemetry
      const tempTel = this._getTelemetry(zoneId, 'temperature');
      const co2Tel = this._getTelemetry(zoneId, 'co2');
      const occTel = this._getTelemetry(zoneId, 'occupancy');
      
      if (!tempTel || !co2Tel) continue;
      
      // Get zone setpoint
      const coolingSp = this._getControlValue(zoneId, 'coolingSetpoint') || 74;
      const heatingSp = this._getControlValue(zoneId, 'heatingSetpoint') || 70;
      
      // Get VAV info for this zone
      const vavId = Object.entries(VAV_ZONE_MAP).find(([v, z]) => z === zoneId)?.[0];
      const vavFlow = vavId ? this._getTelemetryValue(`tel-${vavId}-flow`) : 0;
      const ahuSat = this._getAHUSupplyTempForZone(zoneId);
      
      // Calculate occupancy heat gain (BTU/hr)
      const occupancy = occTel?.value || 0;
      const occupancyHeatGain = occupancy * CONSTANTS.BTU_PER_PERSON;
      
      // Calculate equipment heat gain (simplified)
      const equipmentHeatGain = props.area * 2; // ~2 BTU/hr/sqft for office
      
      // Calculate solar heat gain (simplified based on time and solar load)
      const solarLoad = this.state.simulatorState.solarLoad || 0.5;
      const solarHeatGain = props.area * 5 * solarLoad; // Peak ~5 BTU/hr/sqft
      
      // Total internal heat gain
      const totalHeatGain = occupancyHeatGain + equipmentHeatGain + solarHeatGain;
      
      // Cooling from supply air (BTU/hr)
      // Q = CFM × 1.08 × ΔT
      const deltaT = tempTel.value - ahuSat;
      const coolingCapacity = vavFlow * 1.08 * Math.max(0, deltaT);
      
      // Net heat gain
      const netHeatGain = totalHeatGain - coolingCapacity;
      
      // Temperature change using thermal mass
      // dT = Q × dt / C where C is thermal capacitance
      const thermalMass = props.thermalMass || 5000;
      const tempChange = (netHeatGain * dt) / thermalMass;
      
      // Update temperature
      const newTemp = Math.round((tempTel.value + tempChange) * 10) / 10;
      this._updateTelemetry(tempTel.id, newTemp, timestamp);
      
      // CO2 mass balance
      // dCO2 = (G_people × n - V × (CO2_zone - CO2_outdoor)) × dt / Volume
      const co2Generation = occupancy * CONSTANTS.CO2_GENERATION_RATE * 60000; // Convert to ppm·CFM
      const ventilationRemoval = vavFlow * (co2Tel.value - CONSTANTS.OUTDOOR_CO2) * 0.3; // 30% OA assumed
      const co2Change = ((co2Generation - ventilationRemoval) * dt * 60) / (props.volume / 1000);
      
      // Update CO2
      const newCo2 = Math.max(CONSTANTS.OUTDOOR_CO2, Math.round(co2Tel.value + co2Change));
      this._updateTelemetry(co2Tel.id, newCo2, timestamp);
      
      this.simulationLog.push({
        type: 'zone_update',
        zoneId,
        temperature: { old: tempTel.value, new: newTemp, change: tempChange },
        co2: { old: co2Tel.value, new: newCo2, change: co2Change },
        inputs: { occupancy, vavFlow, ahuSat, totalHeatGain, coolingCapacity }
      });
    }
  }

  /**
   * Simulate AHU operation
   */
  _simulateAHUs(dt, timestamp) {
    const ahus = this.state.assets.filter(a => a.type === 'ahu');
    
    for (const ahu of ahus) {
      const ahuId = ahu.id;
      const props = ahu.properties;
      
      // Get AHU telemetry
      const satTel = this._getTelemetry(ahuId, 'supplyAirTemp');
      const safTel = this._getTelemetry(ahuId, 'supplyAirFlow');
      const fanSpeedTel = this._getTelemetry(ahuId, 'fanSpeed');
      const powerTel = this._getTelemetry(ahuId, 'power');
      const spTel = this._getTelemetry(ahuId, 'staticPressure');
      
      // Get setpoints
      const satSp = this._getControlValue(ahuId, 'supplyAirTempSetpoint') || 55;
      const spSp = this._getControlValue(ahuId, 'staticPressureSetpoint') || 2.0;
      
      // Get filter for this AHU
      const filter = this.state.assets.find(a => a.type === 'filter' && a.parentId === ahuId);
      const filterLoading = filter?.properties?.loading || 0.3;
      
      // Calculate total zone airflow demand
      const servedZones = AHU_ZONE_MAP[ahuId] || [];
      let totalFlowDemand = 0;
      for (const zoneId of servedZones) {
        const vavId = Object.entries(VAV_ZONE_MAP).find(([v, z]) => z === zoneId)?.[0];
        if (vavId) {
          totalFlowDemand += this._getTelemetryValue(`tel-${vavId}-flow`) || 0;
        }
      }
      
      // Fan speed responds to static pressure needs
      // Higher filter loading = higher fan speed needed
      const filterEffect = 1 + (filterLoading * 0.3); // Up to 30% more speed at full loading
      const designCfm = props.designCfm || 25000;
      const loadRatio = totalFlowDemand / designCfm;
      const fanSpeed = Math.min(100, Math.round(loadRatio * 100 * filterEffect));
      
      // Fan power (cube law): P = P_rated × (speed/100)³
      const ratedPower = (props.fanMotorHp || 30) * 0.746; // Convert HP to kW
      const fanPower = ratedPower * Math.pow(fanSpeed / 100, 3) * filterEffect;
      
      // Static pressure
      const staticPressure = Math.round((spSp * (fanSpeed / 85)) * 10) / 10;
      
      // Update telemetry
      if (fanSpeedTel) this._updateTelemetry(fanSpeedTel.id, fanSpeed, timestamp);
      if (powerTel) this._updateTelemetry(powerTel.id, Math.round(fanPower * 10) / 10, timestamp);
      if (safTel) this._updateTelemetry(safTel.id, Math.round(totalFlowDemand), timestamp);
      if (spTel) this._updateTelemetry(spTel.id, staticPressure, timestamp);
      
      this.simulationLog.push({
        type: 'ahu_update',
        ahuId,
        fanSpeed,
        power: fanPower,
        airflow: totalFlowDemand,
        staticPressure,
        filterLoading
      });
    }
  }

  /**
   * Simulate plant equipment (chiller, boiler, pumps)
   */
  _simulatePlant(dt, timestamp) {
    // Calculate total cooling load from AHUs
    let totalCoolingLoad = 0;
    const ahus = this.state.assets.filter(a => a.type === 'ahu');
    for (const ahu of ahus) {
      const saf = this._getTelemetryValue(`tel-${ahu.id === 'ahu-001' ? 'ahu1' : 'ahu2'}-saf`) || 0;
      const rat = this._getTelemetryValue(`tel-${ahu.id === 'ahu-001' ? 'ahu1' : 'ahu2'}-rat`) || 74;
      const sat = this._getTelemetryValue(`tel-${ahu.id === 'ahu-001' ? 'ahu1' : 'ahu2'}-sat`) || 55;
      totalCoolingLoad += saf * 1.08 * (rat - sat) / 12000; // Convert to tons
    }
    
    // Chiller simulation
    const chiller = this.state.assets.find(a => a.id === 'chiller-001');
    if (chiller) {
      const capacityTons = chiller.properties.capacityTons || 200;
      const designCop = chiller.properties.designCop || 5.5;
      
      const chillerLoad = Math.min(1.0, Math.max(0.2, totalCoolingLoad / capacityTons));
      
      // COP varies with load (part load efficiency curve)
      const partLoadFactor = 0.8 + 0.2 * Math.sin(chillerLoad * Math.PI / 2);
      const actualCop = designCop * partLoadFactor;
      
      // Power = Load / COP (tons × 3.517 = kW thermal)
      const chillerPower = (totalCoolingLoad * 3.517) / actualCop;
      
      this._updateTelemetry('tel-chiller-load', Math.round(chillerLoad * 100) / 100, timestamp);
      this._updateTelemetry('tel-chiller-power', Math.round(chillerPower), timestamp);
      
      // CHW pump speed follows chiller load
      const pumpSpeed = Math.round(40 + chillerLoad * 55);
      const pumpPower = 11.2 * Math.pow(pumpSpeed / 100, 3);
      this._updateTelemetry('tel-pump-chw-speed', pumpSpeed, timestamp);
      this._updateTelemetry('tel-pump-chw-power', Math.round(pumpPower * 10) / 10, timestamp);
    }
    
    // Boiler (minimal load in cooling season)
    const boilerLoad = 0.15;
    const boilerPower = 8.5 * boilerLoad / 0.15;
    this._updateTelemetry('tel-boiler-load', boilerLoad, timestamp);
    this._updateTelemetry('tel-boiler-power', Math.round(boilerPower * 10) / 10, timestamp);
    
    // HW pump follows boiler
    const hwPumpSpeed = Math.round(30 + boilerLoad * 40);
    const hwPumpPower = 5.6 * Math.pow(hwPumpSpeed / 100, 3);
    this._updateTelemetry('tel-pump-hw-speed', hwPumpSpeed, timestamp);
    this._updateTelemetry('tel-pump-hw-power', Math.round(hwPumpPower * 10) / 10, timestamp);
  }

  /**
   * Calculate KPIs
   */
  _calculateKPIs(timestamp) {
    // Total power
    const powers = ['tel-ahu1-power', 'tel-ahu2-power', 'tel-chiller-power', 
                    'tel-boiler-power', 'tel-pump-chw-power', 'tel-pump-hw-power'];
    const totalPower = powers.reduce((sum, id) => sum + (this._getTelemetryValue(id) || 0), 0);
    this._updateKPI('kpi-total-power', Math.round(totalPower * 10) / 10, timestamp);
    
    // Daily energy estimate
    const dailyEnergy = totalPower * 24;
    this._updateKPI('kpi-daily-energy', Math.round(dailyEnergy * 10) / 10, timestamp);
    
    // Energy cost
    const energyCost = dailyEnergy * CONSTANTS.ELECTRICITY_RATE;
    this._updateKPI('kpi-energy-cost', Math.round(energyCost * 100) / 100, timestamp);
    
    // Temperature deviation
    const zones = ['zone-lobby-001', 'zone-office-001', 'zone-meeting-001', 
                   'zone-meeting-002', 'zone-office-002', 'zone-exec-001'];
    let totalDeviation = 0;
    let zonesInCompliance = 0;
    
    for (const zoneId of zones) {
      const temp = this._getTelemetryValue(`tel-${zoneId.replace('zone-', 'zone-').replace('-001', zoneId.includes('meeting') ? (zoneId.includes('001') ? '1' : '2') : '').replace('zone-lobby-', 'zone-lobby-').replace('zone-office-', 'zone-office').replace('zone-exec-', 'zone-exec-')}-temp`);
      const tempTel = this.state.telemetry.find(t => t.assetId === zoneId && t.pointType === 'temperature');
      const coolingSp = this._getControlValue(zoneId, 'coolingSetpoint') || 74;
      
      if (tempTel) {
        const deviation = Math.abs(tempTel.value - coolingSp);
        totalDeviation += deviation;
        if (deviation <= 2) zonesInCompliance++;
      }
    }
    
    const avgDeviation = totalDeviation / zones.length;
    const comfortCompliance = (zonesInCompliance / zones.length) * 100;
    
    this._updateKPI('kpi-avg-temp-deviation', Math.round(avgDeviation * 10) / 10, timestamp);
    this._updateKPI('kpi-comfort-compliance', Math.round(comfortCompliance), timestamp);
    
    // CO2 / IAQ
    let totalCo2 = 0;
    let zonesGoodIaq = 0;
    for (const zoneId of zones) {
      const co2Tel = this.state.telemetry.find(t => t.assetId === zoneId && t.pointType === 'co2');
      if (co2Tel) {
        totalCo2 += co2Tel.value;
        if (co2Tel.value < 800) zonesGoodIaq++;
      }
    }
    
    const avgCo2 = Math.round(totalCo2 / zones.length);
    const iaqCompliance = Math.round((zonesGoodIaq / zones.length) * 100);
    
    this._updateKPI('kpi-avg-co2', avgCo2, timestamp);
    this._updateKPI('kpi-iaq-compliance', iaqCompliance, timestamp);
    
    // Filter life
    const filter1 = this.state.assets.find(a => a.id === 'filter-ahu-001');
    if (filter1) {
      const filterLife = Math.round((1 - filter1.properties.loading) * 100);
      this._updateKPI('kpi-filter-life-ahu1', filterLife, timestamp);
    }
    
    // Chiller efficiency
    const chillerLoad = this._getTelemetryValue('tel-chiller-load') || 0.5;
    const chillerPower = this._getTelemetryValue('tel-chiller-power') || 100;
    const cop = chillerLoad > 0 ? (chillerLoad * 200 * 3.517) / chillerPower : 5.0;
    this._updateKPI('kpi-chiller-efficiency', Math.round(cop * 10) / 10, timestamp);
  }

  /**
   * Run fault detection rules
   */
  _runFaultDetection(timestamp) {
    const activeAlerts = this.state.alerts.filter(a => !a.resolved);
    
    // Check CO2 levels
    const zones = this.state.assets.filter(a => a.type === 'zone' && a.properties.zoneType !== 'mechanical');
    for (const zone of zones) {
      const co2Tel = this.state.telemetry.find(t => t.assetId === zone.id && t.pointType === 'co2');
      if (!co2Tel) continue;
      
      const existingAlert = activeAlerts.find(a => a.assetId === zone.id && a.ruleId?.includes('co2'));
      
      if (co2Tel.value > 1200) {
        if (!existingAlert || existingAlert.ruleId !== 'rule-co2-critical') {
          this._createAlert('critical', zone.id, 
            `Critical CO2 level (${co2Tel.value} ppm) in ${zone.name}`,
            'CO2 concentration exceeds safe limits',
            'rule-co2-critical',
            'Immediately increase ventilation or evacuate space',
            timestamp
          );
        }
      } else if (co2Tel.value > 800) {
        if (!existingAlert) {
          this._createAlert('warning', zone.id,
            `CO2 level elevated (${co2Tel.value} ppm) in ${zone.name}`,
            'High occupancy with ventilation not fully compensating',
            'rule-co2-high',
            'Increase VAV damper position or reduce occupancy',
            timestamp
          );
        }
      } else if (existingAlert && co2Tel.value < 750) {
        existingAlert.resolved = true;
        existingAlert.resolvedAt = timestamp;
      }
    }
    
    // Check filter loading
    const filters = this.state.assets.filter(a => a.type === 'filter');
    for (const filter of filters) {
      const loading = filter.properties.loading || 0;
      const existingAlert = activeAlerts.find(a => a.assetId === filter.id);
      
      if (loading > 0.85) {
        if (!existingAlert || existingAlert.ruleId !== 'rule-filter-critical') {
          this._createAlert('critical', filter.id,
            `${filter.name} critically loaded (${Math.round(loading * 100)}%)`,
            'Filter pressure drop exceeds safe operating range',
            'rule-filter-critical',
            'Replace filter immediately',
            timestamp
          );
        }
      } else if (loading > 0.7) {
        if (!existingAlert) {
          this._createAlert('warning', filter.id,
            `${filter.name} approaching end of life (${Math.round(loading * 100)}%)`,
            'Filter loading above maintenance threshold',
            'rule-filter-loading',
            'Schedule filter replacement within 2 weeks',
            timestamp
          );
        }
      } else if (existingAlert && loading < 0.65) {
        existingAlert.resolved = true;
        existingAlert.resolvedAt = timestamp;
      }
    }
    
    // Check temperature deviations
    for (const zone of zones) {
      const tempTel = this.state.telemetry.find(t => t.assetId === zone.id && t.pointType === 'temperature');
      const coolingSp = this._getControlValue(zone.id, 'coolingSetpoint') || 74;
      
      if (!tempTel) continue;
      
      const deviation = Math.abs(tempTel.value - coolingSp);
      const existingAlert = activeAlerts.find(a => a.assetId === zone.id && a.ruleId === 'rule-temp-deviation');
      
      if (deviation > 3) {
        if (!existingAlert) {
          this._createAlert('warning', zone.id,
            `Temperature deviation (${tempTel.value}°F vs ${coolingSp}°F setpoint) in ${zone.name}`,
            'Zone temperature significantly off setpoint',
            'rule-temp-deviation',
            'Check VAV operation and zone load',
            timestamp
          );
        }
      } else if (existingAlert && deviation < 2) {
        existingAlert.resolved = true;
        existingAlert.resolvedAt = timestamp;
      }
    }
  }

  // Helper methods
  _getTelemetry(assetId, pointType) {
    return this.state.telemetry.find(t => t.assetId === assetId && t.pointType === pointType);
  }

  _getTelemetryValue(telId) {
    const tel = this.state.telemetry.find(t => t.id === telId);
    return tel?.value;
  }

  _updateTelemetry(telId, value, timestamp) {
    const tel = this.state.telemetry.find(t => t.id === telId);
    if (tel) {
      // Add to history
      if (tel.history.length >= 60) tel.history.shift();
      tel.history.push({ value: tel.value, timestamp: tel.timestamp });
      
      tel.value = value;
      tel.timestamp = timestamp;
    }
  }

  _getControlValue(assetId, controlType) {
    const control = this.state.controls.find(c => c.assetId === assetId && c.controlType === controlType);
    return control?.value;
  }

  _updateKPI(kpiId, value, timestamp) {
    const kpi = this.state.kpis.find(k => k.id === kpiId);
    if (kpi) {
      const oldValue = kpi.value;
      kpi.value = value;
      
      // Update trend
      if (value < oldValue * 0.98) kpi.trend = 'improving';
      else if (value > oldValue * 1.02) kpi.trend = 'degrading';
      else kpi.trend = 'stable';
      
      // Update status based on target
      if (kpi.target) {
        const ratio = value / kpi.target;
        if (kpi.category === 'energy' || kpi.category === 'cost') {
          kpi.status = ratio <= 0.9 ? 'good' : ratio <= 1.1 ? 'warning' : 'critical';
        } else {
          kpi.status = ratio >= 0.9 ? 'good' : ratio >= 0.7 ? 'warning' : 'critical';
        }
      }
      
      // Add to history
      if (kpi.history.length >= 60) kpi.history.shift();
      kpi.history.push({ value, timestamp });
    }
  }

  _getAHUSupplyTempForZone(zoneId) {
    for (const [ahuId, zones] of Object.entries(AHU_ZONE_MAP)) {
      if (zones.includes(zoneId)) {
        const satTel = this.state.telemetry.find(t => t.assetId === ahuId && t.pointType === 'supplyAirTemp');
        return satTel?.value || 55;
      }
    }
    return 55;
  }

  _createAlert(severity, assetId, message, cause, ruleId, recommendedAction, timestamp) {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const alert = {
      id: alertId,
      severity,
      assetId,
      message,
      cause,
      ruleId,
      recommendedAction,
      timestamp,
      acknowledged: false,
      resolved: false
    };
    
    this.state.alerts.push(alert);
    this.newAlerts.push(alert);
    
    // Update asset status
    const asset = this.state.assets.find(a => a.id === assetId);
    if (asset) {
      asset.status = severity === 'critical' ? 'alarm' : 'warning';
    }
  }

  /**
   * Apply a fault scenario for testing
   * @param {string} faultType - Type of fault from FAULT_CATALOG
   * @param {Object} params - Fault-specific parameters
   */
  applyFault(faultType, params = {}) {
    const faultInfo = FAULT_CATALOG[faultType];
    const timestamp = new Date().toISOString();
    
    // Initialize active faults tracking if not exists
    if (!this.state.activeFaults) {
      this.state.activeFaults = [];
    }
    
    // Record the fault
    const faultRecord = {
      id: `fault-${Date.now()}`,
      type: faultType,
      info: faultInfo,
      params,
      appliedAt: timestamp,
      active: true
    };
    this.state.activeFaults.push(faultRecord);
    
    switch (faultType) {
      // ===== Plant Equipment Failures =====
      case 'chiller_compressor_failure': {
        const chiller = this.state.assets.find(a => a.id === (params.chillerId || 'chiller-001'));
        if (chiller) {
          chiller.status = 'alarm';
          chiller.enabled = false;
          chiller.faultCode = 'E01-COMPRESSOR_FAULT';
          this._updateTelemetry('tel-chiller-load', 0, timestamp);
          this._updateTelemetry('tel-chiller-power', 0, timestamp);
          this._createAlert('critical', chiller.id,
            `${chiller.name} compressor failure - unit offline`,
            'Compressor motor failure or electrical fault',
            'rule-chiller-compressor',
            'Check motor windings, electrical supply, and compressor contactors. Call service.',
            timestamp
          );
        }
        break;
      }
      
      case 'chiller_low_refrigerant': {
        const chiller = this.state.assets.find(a => a.id === (params.chillerId || 'chiller-001'));
        if (chiller) {
          chiller.status = 'warning';
          chiller.properties.refrigerantCharge = params.chargePercent || 70;
          // Add refrigerant pressure telemetry if not exists
          let suctionPressure = this.state.telemetry.find(t => t.id === 'tel-chiller-suction-pressure');
          if (!suctionPressure) {
            this.state.telemetry.push({
              id: 'tel-chiller-suction-pressure',
              assetId: chiller.id,
              pointType: 'suctionPressure',
              value: 38, // Low pressure indicating low refrigerant
              unit: 'psi',
              timestamp,
              quality: 'good',
              history: []
            });
          } else {
            this._updateTelemetry('tel-chiller-suction-pressure', 38, timestamp);
          }
          this._createAlert('warning', chiller.id,
            `${chiller.name} low refrigerant charge detected`,
            'Refrigerant leak or improper charge',
            'rule-chiller-refrigerant',
            'Schedule refrigerant leak check and recharge. Operating at reduced capacity.',
            timestamp
          );
        }
        break;
      }
      
      case 'chiller_condenser_fouling': {
        const chiller = this.state.assets.find(a => a.id === (params.chillerId || 'chiller-001'));
        if (chiller) {
          chiller.status = 'warning';
          chiller.properties.condenserFouling = params.foulingFactor || 0.3;
          // Add head pressure telemetry
          let headPressure = this.state.telemetry.find(t => t.id === 'tel-chiller-head-pressure');
          if (!headPressure) {
            this.state.telemetry.push({
              id: 'tel-chiller-head-pressure',
              assetId: chiller.id,
              pointType: 'headPressure',
              value: 275, // High head pressure
              unit: 'psi',
              timestamp,
              quality: 'good',
              history: []
            });
          } else {
            this._updateTelemetry('tel-chiller-head-pressure', 275, timestamp);
          }
          this._createAlert('warning', chiller.id,
            `${chiller.name} condenser fouling - efficiency degraded`,
            'Dirty condenser coils reducing heat rejection',
            'rule-chiller-condenser',
            'Schedule condenser coil cleaning. COP reduced by ~25%.',
            timestamp
          );
        }
        break;
      }
      
      case 'boiler_flame_failure': {
        const boiler = this.state.assets.find(a => a.id === (params.boilerId || 'boiler-001'));
        if (boiler) {
          boiler.status = 'alarm';
          boiler.enabled = false;
          boiler.faultCode = 'E02-FLAME_FAILURE';
          this._updateTelemetry('tel-boiler-load', 0, timestamp);
          this._updateTelemetry('tel-boiler-power', 0, timestamp);
          this._createAlert('critical', boiler.id,
            `${boiler.name} flame failure - unit locked out`,
            'Flame sensor not detecting flame or ignition failure',
            'rule-boiler-flame',
            'Check gas supply, igniter, flame sensor. Manual reset required.',
            timestamp
          );
        }
        break;
      }
      
      case 'boiler_low_water': {
        const boiler = this.state.assets.find(a => a.id === (params.boilerId || 'boiler-001'));
        if (boiler) {
          boiler.status = 'alarm';
          boiler.enabled = false;
          boiler.faultCode = 'E03-LOW_WATER';
          this._updateTelemetry('tel-boiler-load', 0, timestamp);
          this._createAlert('critical', boiler.id,
            `${boiler.name} low water cutoff activated`,
            'Water level below safe operating minimum',
            'rule-boiler-water',
            'Check make-up water supply, expansion tank, and for leaks. Do not bypass.',
            timestamp
          );
        }
        break;
      }
      
      case 'pump_failure': {
        const pumpId = params.pumpId || 'pump-chw-001';
        const pump = this.state.assets.find(a => a.id === pumpId);
        if (pump) {
          pump.status = 'alarm';
          pump.enabled = false;
          pump.faultCode = 'E04-PUMP_FAILURE';
          const telPrefix = pumpId.includes('chw') ? 'tel-pump-chw' : 'tel-pump-hw';
          this._updateTelemetry(`${telPrefix}-speed`, 0, timestamp);
          this._updateTelemetry(`${telPrefix}-power`, 0, timestamp);
          this._createAlert('critical', pump.id,
            `${pump.name} failure - no flow`,
            'Pump motor failure or mechanical seizure',
            'rule-pump-failure',
            'Check motor, VFD, coupling. Switch to standby pump if available.',
            timestamp
          );
        }
        break;
      }
      
      case 'pump_cavitation': {
        const pumpId = params.pumpId || 'pump-chw-001';
        const pump = this.state.assets.find(a => a.id === pumpId);
        if (pump) {
          pump.status = 'warning';
          pump.properties.cavitating = true;
          this._createAlert('warning', pump.id,
            `${pump.name} cavitation detected`,
            'Low suction pressure causing cavitation',
            'rule-pump-cavitation',
            'Check strainer, suction valve position, system pressure. Reduce speed temporarily.',
            timestamp
          );
        }
        break;
      }
      
      case 'vfd_failure': {
        const equipId = params.equipmentId || 'ahu-001';
        const equip = this.state.assets.find(a => a.id === equipId);
        if (equip) {
          equip.status = 'alarm';
          equip.faultCode = 'E05-VFD_FAULT';
          const telPrefix = equipId.startsWith('ahu') ? `tel-${equipId === 'ahu-001' ? 'ahu1' : 'ahu2'}` : `tel-${equipId}`;
          if (equipId.startsWith('ahu')) {
            this._updateTelemetry(`${telPrefix}-fanspeed`, 0, timestamp);
            this._updateTelemetry(`${telPrefix}-power`, 0, timestamp);
          }
          this._createAlert('critical', equip.id,
            `${equip.name} VFD failure`,
            'Variable frequency drive fault or communication loss',
            'rule-vfd-failure',
            'Check VFD fault code, power supply, control signal. May need VFD replacement.',
            timestamp
          );
        }
        break;
      }
      
      case 'motor_overload': {
        const equipId = params.equipmentId || 'ahu-001';
        const equip = this.state.assets.find(a => a.id === equipId);
        if (equip) {
          equip.status = 'warning';
          equip.properties.motorTemp = params.temperature || 175;
          this._createAlert('warning', equip.id,
            `${equip.name} motor running hot (${equip.properties.motorTemp}°F)`,
            'High amp draw or blocked airflow causing motor overheating',
            'rule-motor-overload',
            'Reduce load, check airflow restrictions, verify amp draw within nameplate.',
            timestamp
          );
        }
        break;
      }
      
      // ===== AHU Failures =====
      case 'supply_fan_failure': {
        const ahuId = params.ahuId || 'ahu-001';
        const ahu = this.state.assets.find(a => a.id === ahuId);
        if (ahu) {
          ahu.status = 'alarm';
          ahu.enabled = false;
          ahu.faultCode = 'E06-FAN_FAILURE';
          const telPrefix = ahuId === 'ahu-001' ? 'tel-ahu1' : 'tel-ahu2';
          this._updateTelemetry(`${telPrefix}-fanspeed`, 0, timestamp);
          this._updateTelemetry(`${telPrefix}-saf`, 0, timestamp);
          this._updateTelemetry(`${telPrefix}-power`, 0, timestamp);
          this._createAlert('critical', ahu.id,
            `${ahu.name} supply fan failure - no airflow`,
            'Fan motor failure, belt break, or VFD fault',
            'rule-ahu-fan',
            'Check fan motor, belts, VFD. System cannot condition served zones.',
            timestamp
          );
        }
        break;
      }
      
      case 'cooling_coil_freeze': {
        const ahuId = params.ahuId || 'ahu-001';
        const ahu = this.state.assets.find(a => a.id === ahuId);
        if (ahu) {
          ahu.status = 'alarm';
          ahu.properties.coilFrozen = true;
          const telPrefix = ahuId === 'ahu-001' ? 'tel-ahu1' : 'tel-ahu2';
          this._updateTelemetry(`${telPrefix}-sat`, 35, timestamp); // Very cold
          this._createAlert('critical', ahu.id,
            `${ahu.name} cooling coil freeze detected`,
            'Chilled water temperature too low or control valve malfunction',
            'rule-coil-freeze',
            'IMMEDIATELY close CHW valve. Check freeze stat, CHW temp, valve operation.',
            timestamp
          );
        }
        break;
      }
      
      case 'economizer_failure': {
        const ahuId = params.ahuId || 'ahu-001';
        const ahu = this.state.assets.find(a => a.id === ahuId);
        if (ahu) {
          ahu.status = 'warning';
          ahu.properties.economizerStuck = true;
          ahu.properties.economizerPosition = params.stuckPosition || 50;
          this._createAlert('warning', ahu.id,
            `${ahu.name} economizer damper stuck at ${ahu.properties.economizerPosition}%`,
            'Damper actuator failure or linkage issue',
            'rule-economizer',
            'Check actuator, linkage, control signal. Energy waste until repaired.',
            timestamp
          );
        }
        break;
      }
      
      // ===== VAV/Zone Failures =====  
      case 'stuck_damper': {
        const vavId = params.vavId || 'vav-002-03';
        const vav = this.state.assets.find(a => a.id === vavId);
        const damperTel = this.state.telemetry.find(t => t.assetId === vavId && t.pointType === 'damperPosition');
        if (vav && damperTel) {
          vav.status = 'warning';
          vav.properties.damperStuck = true;
          vav.properties.stuckPosition = damperTel.value;
          damperTel.quality = 'uncertain';
          this._createAlert('warning', vav.id,
            `${vav.name} damper stuck at ${damperTel.value}%`,
            'Actuator failure or mechanical obstruction',
            'rule-vav-damper',
            'Check actuator, linkage for obstruction. Zone temp may drift.',
            timestamp
          );
        }
        break;
      }
      
      case 'reheat_coil_failure': {
        const vavId = params.vavId || 'vav-002-01';
        const vav = this.state.assets.find(a => a.id === vavId);
        if (vav) {
          vav.status = 'warning';
          vav.properties.reheatFailed = true;
          this._createAlert('warning', vav.id,
            `${vav.name} reheat coil not functioning`,
            'Reheat valve stuck closed or actuator failure',
            'rule-vav-reheat',
            'Check valve actuator and hot water supply. Zone may be too cold.',
            timestamp
          );
        }
        break;
      }
      
      // ===== Sensor Failures =====
      case 'sensor_drift': {
        const sensorTelId = params.telemetryId || 'tel-zone-lobby-temp';
        const sensorTel = this.state.telemetry.find(t => t.id === sensorTelId);
        if (sensorTel) {
          const drift = params.drift || 5;
          sensorTel.value += drift;
          sensorTel.quality = 'uncertain';
          sensorTel.properties = sensorTel.properties || {};
          sensorTel.properties.drift = drift;
          this._createAlert('info', sensorTel.assetId,
            `Temperature sensor drift detected (${drift > 0 ? '+' : ''}${drift}°F)`,
            'Sensor calibration drift over time',
            'rule-sensor-drift',
            'Schedule sensor recalibration. Control may be hunting.',
            timestamp
          );
        }
        break;
      }
      
      case 'sensor_failure': {
        const sensorTelId = params.telemetryId || 'tel-zone-lobby-temp';
        const sensorTel = this.state.telemetry.find(t => t.id === sensorTelId);
        if (sensorTel) {
          sensorTel.value = null;
          sensorTel.quality = 'bad';
          this._createAlert('warning', sensorTel.assetId,
            `Sensor failure - no reading from ${sensorTelId}`,
            'Sensor disconnected, damaged, or communication loss',
            'rule-sensor-failure',
            'Check sensor wiring and replace if necessary. System using defaults.',
            timestamp
          );
        }
        break;
      }
      
      // ===== Communication Failures =====
      case 'network_failure': {
        const affectedAssets = params.assets || ['ahu-001'];
        for (const assetId of affectedAssets) {
          const asset = this.state.assets.find(a => a.id === assetId);
          if (asset) {
            asset.status = 'offline';
            asset.communicationLost = true;
          }
        }
        this._createAlert('warning', 'system',
          `Communication loss with ${affectedAssets.length} device(s)`,
          'Network or BACnet communication failure',
          'rule-network',
          'Check network switches, wiring, IP addresses. Devices operating independently.',
          timestamp
        );
        break;
      }
      
      case 'controller_failure': {
        const controllerId = params.controllerId || 'controller-ahu1';
        // Mark all points from this controller as offline
        this.state.telemetry
          .filter(t => t.assetId?.startsWith('ahu-001'))
          .forEach(t => { t.quality = 'bad'; });
        this._createAlert('critical', 'system',
          `DDC controller ${controllerId} failure`,
          'Controller hardware failure or programming error',
          'rule-controller',
          'Replace controller or restore from backup. Equipment in failsafe mode.',
          timestamp
        );
        break;
      }
      
      // ===== Utility Failures =====
      case 'power_failure': {
        // Everything goes offline
        this.state.assets.forEach(a => {
          if (['ahu', 'chiller', 'boiler', 'pump', 'vav'].includes(a.type)) {
            a.status = 'offline';
            a.enabled = false;
          }
        });
        this.state.telemetry.forEach(t => {
          if (t.pointType === 'power') t.value = 0;
        });
        this._createAlert('critical', 'system',
          'POWER FAILURE - All HVAC systems offline',
          'Electrical power loss to HVAC equipment',
          'rule-power',
          'Check main breaker, utility feed, emergency generator status.',
          timestamp
        );
        break;
      }
      
      case 'partial_power_loss': {
        const circuit = params.circuit || 'panel-hvac-1';
        const affectedEquip = params.equipment || ['ahu-001', 'pump-chw-001'];
        for (const equipId of affectedEquip) {
          const equip = this.state.assets.find(a => a.id === equipId);
          if (equip) {
            equip.status = 'offline';
            equip.enabled = false;
          }
        }
        this._createAlert('warning', 'system',
          `Partial power loss - circuit ${circuit}`,
          'Circuit breaker tripped or electrical fault',
          'rule-partial-power',
          `Check breaker ${circuit}. Affected: ${affectedEquip.join(', ')}`,
          timestamp
        );
        break;
      }
      
      // ===== Legacy fault types for backward compatibility =====
      case 'filter_loading': {
        const filterId = params.filterId || 'filter-ahu-001';
        const filter = this.state.assets.find(a => a.id === filterId);
        if (filter) {
          filter.properties.loading = params.loading || 0.8;
        }
        break;
      }
      
      case 'high_occupancy': {
        const zoneId = params.zoneId || 'zone-meeting-002';
        const zone = this.state.assets.find(a => a.id === zoneId);
        const occTel = this.state.telemetry.find(t => t.assetId === zoneId && t.pointType === 'occupancy');
        if (zone && occTel) {
          zone.properties.currentOccupancy = params.occupancy || zone.properties.occupancyCapacity;
          occTel.value = zone.properties.currentOccupancy;
        }
        break;
      }
      
      case 'high_co2': {
        const zoneId = params.zoneId || 'zone-meeting-002';
        const co2Tel = this.state.telemetry.find(t => t.assetId === zoneId && t.pointType === 'co2');
        if (co2Tel) {
          co2Tel.value = params.co2Level || 1200;
        }
        break;
      }
      
      default:
        console.warn(`Unknown fault type: ${faultType}`);
    }
    
    return this.state;
  }
  
  /**
   * Clear a specific fault
   */
  clearFault(faultId) {
    if (!this.state.activeFaults) return;
    
    const faultIndex = this.state.activeFaults.findIndex(f => f.id === faultId);
    if (faultIndex >= 0) {
      const fault = this.state.activeFaults[faultIndex];
      fault.active = false;
      fault.clearedAt = new Date().toISOString();
      
      // Reset affected equipment
      // This is simplified - real implementation would restore previous state
      const timestamp = new Date().toISOString();
      
      // Mark related alerts as resolved
      this.state.alerts
        .filter(a => !a.resolved && a.timestamp >= fault.appliedAt)
        .forEach(a => {
          a.resolved = true;
          a.resolvedAt = timestamp;
        });
    }
    
    return this.state;
  }
  
  /**
   * Get list of active faults
   */
  getActiveFaults() {
    return (this.state.activeFaults || []).filter(f => f.active);
  }
  
  /**
   * Get available fault scenarios
   */
  static getFaultCatalog() {
    return Object.entries(FAULT_CATALOG).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  /**
   * Get explanation for a KPI or alert
   */
  getExplanation(itemId) {
    const kpi = this.state.kpis.find(k => k.id === itemId);
    if (kpi) {
      return {
        type: 'kpi',
        id: kpi.id,
        name: kpi.name,
        value: kpi.value,
        unit: kpi.unit,
        formula: kpi.formula,
        inputs: kpi.inputs,
        status: kpi.status,
        trend: kpi.trend,
        explanation: `${kpi.name} is ${kpi.value} ${kpi.unit} (${kpi.status}). ` +
                    `Calculated using: ${kpi.formula}. ` +
                    `Trend is ${kpi.trend}.`
      };
    }
    
    const alert = this.state.alerts.find(a => a.id === itemId);
    if (alert) {
      return {
        type: 'alert',
        id: alert.id,
        severity: alert.severity,
        assetId: alert.assetId,
        message: alert.message,
        cause: alert.cause,
        ruleId: alert.ruleId,
        recommendedAction: alert.recommendedAction,
        explanation: `Alert: ${alert.message}. Cause: ${alert.cause}. ` +
                    `Triggered by rule: ${alert.ruleId}. ` +
                    `Recommended action: ${alert.recommendedAction}.`
      };
    }
    
    return null;
  }
}

module.exports = { HVACSimulator, CONSTANTS, VAV_ZONE_MAP, AHU_ZONE_MAP, FAULT_CATALOG };
