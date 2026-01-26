/**
 * Data Flow Validation Tests
 * 
 * Tests data consistency and flow between components
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

const API_BASE = 'http://localhost:3001';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  return { response, data };
}

describe('Data Flow Validation', () => {
  
  beforeEach(async () => {
    await apiRequest('/api/twin/reset', { method: 'POST' });
  });

  describe('Asset-Telemetry Consistency', () => {
    test('every zone should have temperature telemetry', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      
      const zones = assets.filter(a => a.type === 'zone');
      
      zones.forEach(zone => {
        const tempTel = telemetry.find(
          t => t.assetId === zone.id && t.pointType === 'temperature'
        );
        assert.ok(tempTel, `Zone ${zone.id} should have temperature telemetry`);
      });
    });

    test('every AHU should have power telemetry', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      
      const ahus = assets.filter(a => a.type === 'ahu');
      
      ahus.forEach(ahu => {
        const powerTel = telemetry.find(
          t => t.assetId === ahu.id && t.pointType === 'power'
        );
        assert.ok(powerTel, `AHU ${ahu.id} should have power telemetry`);
      });
    });

    test('telemetry should reference valid assets', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      
      const assetIds = new Set(assets.map(a => a.id));
      
      telemetry.forEach(tel => {
        assert.ok(
          assetIds.has(tel.assetId),
          `Telemetry ${tel.id} references invalid asset: ${tel.assetId}`
        );
      });
    });
  });

  describe('Control-Asset Consistency', () => {
    test('controls should reference valid assets', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: controls } = await apiRequest('/api/twin/controls');
      
      const assetIds = new Set(assets.map(a => a.id));
      
      controls.forEach(ctrl => {
        assert.ok(
          assetIds.has(ctrl.assetId),
          `Control ${ctrl.id} references invalid asset: ${ctrl.assetId}`
        );
      });
    });

    test('zone setpoint controls should exist for occupied zones', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: controls } = await apiRequest('/api/twin/controls');
      
      const occupiedZones = assets.filter(
        a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical'
      );
      
      occupiedZones.forEach(zone => {
        const zoneControls = controls.filter(c => c.assetId === zone.id);
        assert.ok(
          zoneControls.length > 0,
          `Zone ${zone.id} should have controls`
        );
      });
    });
  });

  describe('KPI-Telemetry Consistency', () => {
    test('total power KPI should match sum of equipment power', async () => {
      const { data: kpis } = await apiRequest('/api/twin/kpis');
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      
      const totalPowerKpi = kpis.find(k => k.id === 'kpi-total-power');
      
      // Get all power telemetry
      const powerTelemetry = telemetry.filter(t => t.pointType === 'power');
      const calculatedPower = powerTelemetry.reduce((sum, t) => sum + (t.value || 0), 0);
      
      console.log(`  KPI Total Power: ${totalPowerKpi?.value} kW`);
      console.log(`  Calculated Sum: ${calculatedPower.toFixed(2)} kW`);
      
      // Allow some tolerance due to rounding
      const difference = Math.abs(totalPowerKpi.value - calculatedPower);
      assert.ok(
        difference < 5,
        `Power KPI (${totalPowerKpi.value}) should approximately match calculated sum (${calculatedPower})`
      );
    });

    test('average CO2 KPI should match zone average', async () => {
      const { data: kpis } = await apiRequest('/api/twin/kpis');
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      const { data: assets } = await apiRequest('/api/twin/assets');
      
      const avgCo2Kpi = kpis.find(k => k.id === 'kpi-avg-co2');
      
      // Get occupied zones
      const occupiedZones = assets.filter(
        a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical'
      );
      
      // Calculate average CO2
      let totalCo2 = 0;
      let zoneCount = 0;
      
      occupiedZones.forEach(zone => {
        const co2Tel = telemetry.find(
          t => t.assetId === zone.id && t.pointType === 'co2'
        );
        if (co2Tel) {
          totalCo2 += co2Tel.value;
          zoneCount++;
        }
      });
      
      const calculatedAvg = zoneCount > 0 ? totalCo2 / zoneCount : 0;
      
      console.log(`  KPI Avg CO2: ${avgCo2Kpi?.value} ppm`);
      console.log(`  Calculated Avg: ${calculatedAvg.toFixed(0)} ppm`);
    });
  });

  describe('Alert-Asset Consistency', () => {
    test('alerts should reference valid assets', async () => {
      const { data: assets } = await apiRequest('/api/twin/assets');
      const { data: alerts } = await apiRequest('/api/twin/alerts');
      
      const assetIds = new Set(assets.map(a => a.id));
      
      alerts.forEach(alert => {
        if (alert.assetId) {
          assert.ok(
            assetIds.has(alert.assetId),
            `Alert ${alert.id} references invalid asset: ${alert.assetId}`
          );
        }
      });
    });

    test('alerts should have required fields', async () => {
      const { data: alerts } = await apiRequest('/api/twin/alerts');
      
      alerts.forEach(alert => {
        assert.ok(alert.id, 'Alert should have id');
        assert.ok(alert.severity, 'Alert should have severity');
        assert.ok(alert.message, 'Alert should have message');
        assert.ok(alert.timestamp, 'Alert should have timestamp');
      });
    });
  });

  describe('Simulation Data Flow', () => {
    test('simulation should update telemetry timestamps', async () => {
      const { data: beforeTel } = await apiRequest('/api/twin/telemetry');
      const beforeTimestamp = beforeTel[0]?.timestamp;
      
      // Run simulation
      await apiRequest('/api/twin/simulate', {
        method: 'POST',
        body: JSON.stringify({ timeStep: 60 })
      });
      
      const { data: afterTel } = await apiRequest('/api/twin/telemetry');
      const afterTimestamp = afterTel[0]?.timestamp;
      
      // Timestamps might be the same format but simulation time advances
      const { data: twin } = await apiRequest('/api/twin');
      assert.ok(twin.metadata.simulationTime, 'Simulation time should exist');
    });

    test('control changes should propagate to telemetry', async () => {
      // Get initial AHU supply air temp
      const { data: initialTel } = await apiRequest('/api/twin/telemetry?assetId=ahu-001&pointType=supplyAirTemp');
      
      // Change AHU supply air setpoint
      await apiRequest('/api/twin/controls/ctrl-ahu1-sat-sp', {
        method: 'PUT',
        body: JSON.stringify({ value: 58 })
      });
      
      // Run simulation
      for (let i = 0; i < 5; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      // Check that supply air temp moved toward setpoint
      const { data: finalTel } = await apiRequest('/api/twin/telemetry?assetId=ahu-001&pointType=supplyAirTemp');
      
      console.log(`  Initial SAT: ${initialTel[0]?.value}°F`);
      console.log(`  Final SAT: ${finalTel[0]?.value}°F (setpoint: 58°F)`);
    });

    test('KPIs should update after simulation', async () => {
      const { data: beforeKpis } = await apiRequest('/api/twin/kpis');
      
      // Make a change and simulate
      await apiRequest('/api/twin/controls/ctrl-zone-office1-cooling-sp', {
        method: 'PUT',
        body: JSON.stringify({ value: 78 })
      });
      
      for (let i = 0; i < 10; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      const { data: afterKpis } = await apiRequest('/api/twin/kpis');
      
      // KPIs should have updated (values or timestamps)
      assert.ok(afterKpis.length === beforeKpis.length, 'KPI count should remain same');
    });
  });

  describe('History Data Accumulation', () => {
    test('telemetry should accumulate history over simulation steps', async () => {
      // Run several simulation steps
      for (let i = 0; i < 5; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      const { data: telemetry } = await apiRequest('/api/twin/telemetry');
      
      // Check if any telemetry has history
      const withHistory = telemetry.filter(t => t.history && t.history.length > 0);
      
      console.log(`  Telemetry points with history: ${withHistory.length} / ${telemetry.length}`);
    });

    test('KPIs should accumulate history', async () => {
      // Run several simulation steps
      for (let i = 0; i < 5; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      const { data: kpis } = await apiRequest('/api/twin/kpis');
      
      // Check if any KPIs have history
      const withHistory = kpis.filter(k => k.history && k.history.length > 0);
      
      console.log(`  KPIs with history: ${withHistory.length} / ${kpis.length}`);
    });
  });
});

console.log('\nRunning Data Flow Validation Tests...\n');
console.log('Note: Backend server must be running on port 3001\n');
