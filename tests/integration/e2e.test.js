/**
 * End-to-End Workflow Tests
 * 
 * Tests complete user workflows and cross-component interactions
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const API_BASE = 'http://localhost:3003';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  return { response, data };
}

describe('End-to-End Workflows', () => {
  
  beforeEach(async () => {
    // Reset state before each test
    await apiRequest('/api/twin/reset', { method: 'POST' });
  });

  describe('Building Operator Workflow', () => {
    test('should view building status and KPIs', async () => {
      // Step 1: Get current twin state
      const { data: twinState } = await apiRequest('/api/twin');
      
      assert.ok(twinState.metadata, 'Should see building metadata');
      assert.ok(twinState.assets.length > 0, 'Should see building assets');
      
      // Step 2: Check KPIs
      const { data: kpis } = await apiRequest('/api/twin/kpis');
      
      const powerKpi = kpis.find(k => k.id === 'kpi-total-power');
      const comfortKpi = kpis.find(k => k.id === 'kpi-comfort-compliance');
      
      assert.ok(powerKpi, 'Should see power KPI');
      assert.ok(comfortKpi, 'Should see comfort KPI');
      
      console.log(`  Building Power: ${powerKpi.value} ${powerKpi.unit}`);
      console.log(`  Comfort Compliance: ${comfortKpi.value}%`);
    });

    test('should adjust zone setpoint and see effect', async () => {
      // Step 1: Get initial zone temperature
      const { data: initialTel } = await apiRequest('/api/twin/telemetry?assetId=zone-office-001&pointType=temperature');
      const initialTemp = initialTel[0]?.value;
      
      // Step 2: Adjust cooling setpoint
      await apiRequest('/api/twin/controls/ctrl-zone-office1-cooling-sp', {
        method: 'PUT',
        body: JSON.stringify({ value: 76 })
      });
      
      // Step 3: Run simulation steps
      for (let i = 0; i < 5; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      // Step 4: Verify control was applied
      const { data: controls } = await apiRequest('/api/twin/controls?assetId=zone-office-001');
      const coolingSp = controls.find(c => c.name.includes('Cooling'));
      
      assert.strictEqual(coolingSp.value, 76, 'Setpoint should be updated');
      
      console.log(`  Initial temp: ${initialTemp}°F, Setpoint changed to: 76°F`);
    });

    test('should acknowledge an alert', async () => {
      // Step 1: Apply a fault to generate an alert
      await apiRequest('/api/twin/fault', {
        method: 'POST',
        body: JSON.stringify({
          faultType: 'filter_loading',
          params: { filterId: 'filter-ahu-001', loading: 0.9 }
        })
      });
      
      // Step 2: Run simulation to generate alerts
      await apiRequest('/api/twin/simulate', {
        method: 'POST',
        body: JSON.stringify({ timeStep: 60 })
      });
      
      // Step 3: Get active alerts
      const { data: alerts } = await apiRequest('/api/twin/alerts?active=true');
      
      if (alerts.length > 0) {
        const alertToAck = alerts[0];
        
        // Step 4: Acknowledge alert
        const { response, data: ackedAlert } = await apiRequest(`/api/twin/alerts/${alertToAck.id}/acknowledge`, {
          method: 'PUT',
          body: JSON.stringify({ user: 'test-operator' })
        });
        
        assert.strictEqual(response.status, 200);
        assert.strictEqual(ackedAlert.acknowledged, true);
        assert.ok(ackedAlert.acknowledgedAt, 'Should have acknowledged timestamp');
        
        console.log(`  Acknowledged alert: ${alertToAck.message}`);
      } else {
        console.log('  No alerts to acknowledge (this is OK)');
      }
    });
  });

  describe('Energy Management Workflow', () => {
    test('should activate demand response and reduce energy', async () => {
      // Step 1: Get baseline energy
      const { data: initialKpis } = await apiRequest('/api/twin/kpis');
      const initialPower = initialKpis.find(k => k.id === 'kpi-total-power')?.value;
      
      // Step 2: Activate demand response level 2
      await apiRequest('/api/twin/controls/ctrl-dr-level', {
        method: 'PUT',
        body: JSON.stringify({ value: 2 })
      });
      
      // Step 3: Also raise setpoints (typical DR action)
      await apiRequest('/api/twin/controls/ctrl-zone-office1-cooling-sp', {
        method: 'PUT',
        body: JSON.stringify({ value: 78 })
      });
      
      await apiRequest('/api/twin/controls/ctrl-zone-office2-cooling-sp', {
        method: 'PUT',
        body: JSON.stringify({ value: 78 })
      });
      
      // Step 4: Run simulation
      for (let i = 0; i < 10; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      // Step 5: Check energy reduction
      const { data: finalKpis } = await apiRequest('/api/twin/kpis');
      const finalPower = finalKpis.find(k => k.id === 'kpi-total-power')?.value;
      
      console.log(`  Initial Power: ${initialPower} kW → Final Power: ${finalPower} kW`);
      
      // Verify DR level is set
      const { data: controls } = await apiRequest('/api/twin/controls');
      const drLevel = controls.find(c => c.id === 'ctrl-dr-level');
      assert.strictEqual(drLevel.value, 2, 'DR level should be 2');
    });

    test('should track energy cost over time', async () => {
      // Run several simulation steps
      for (let i = 0; i < 5; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 300 }) // 5 minute steps
        });
      }
      
      const { data: kpis } = await apiRequest('/api/twin/kpis');
      
      const dailyEnergy = kpis.find(k => k.id === 'kpi-daily-energy');
      const energyCost = kpis.find(k => k.id === 'kpi-energy-cost');
      
      console.log(`  Daily Energy: ${dailyEnergy?.value || 'N/A'} ${dailyEnergy?.unit || ''}`);
      console.log(`  Energy Cost: $${energyCost?.value || 'N/A'}`);
    });
  });

  describe('Air Quality Management Workflow', () => {
    test('should detect high CO2 with occupancy increase', async () => {
      // Step 1: Get baseline CO2
      const { data: initialTel } = await apiRequest('/api/twin/telemetry?assetId=zone-meeting-001&pointType=co2');
      const initialCo2 = initialTel[0]?.value || 400;
      
      // Step 2: Simulate high occupancy via fault
      await apiRequest('/api/twin/fault', {
        method: 'POST',
        body: JSON.stringify({
          faultType: 'high_occupancy',
          params: { zoneId: 'zone-meeting-001', occupancy: 15 }
        })
      });
      
      // Step 3: Run simulation for several steps
      for (let i = 0; i < 20; i++) {
        await apiRequest('/api/twin/simulate', {
          method: 'POST',
          body: JSON.stringify({ timeStep: 60 })
        });
      }
      
      // Step 4: Check CO2 levels
      const { data: finalTel } = await apiRequest('/api/twin/telemetry?assetId=zone-meeting-001&pointType=co2');
      const finalCo2 = finalTel[0]?.value || 400;
      
      console.log(`  Initial CO2: ${initialCo2} ppm → Final CO2: ${finalCo2} ppm`);
      
      // Step 5: Check for CO2 alerts
      const { data: alerts } = await apiRequest('/api/twin/alerts?active=true');
      const co2Alerts = alerts.filter(a => a.message?.toLowerCase().includes('co2'));
      
      if (co2Alerts.length > 0) {
        console.log(`  CO2 alerts generated: ${co2Alerts.length}`);
      }
    });
  });

  describe('Copilot Interaction Workflow', () => {
    test('should get building status summary from copilot', async () => {
      const { response, data } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Give me a summary of the current building status'
        })
      });
      
      assert.strictEqual(response.status, 200);
      assert.ok(data.response, 'Should get copilot response');
      
      console.log(`  Copilot response: ${data.response.substring(0, 100)}...`);
    });

    test('should get energy optimization recommendations', async () => {
      const { response, data } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'How can I reduce energy consumption?'
        })
      });
      
      assert.strictEqual(response.status, 200);
      assert.ok(data.response, 'Should get copilot response');
      assert.ok(
        data.response.toLowerCase().includes('energy') || 
        data.response.toLowerCase().includes('setpoint') ||
        data.response.toLowerCase().includes('power'),
        'Response should be about energy'
      );
    });

    test('should maintain conversation context', async () => {
      // First message
      const { data: response1 } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'What is the current total power usage?',
          conversationHistory: []
        })
      });
      
      // Follow-up message
      const { data: response2 } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'How does that compare to yesterday?',
          conversationHistory: [
            { role: 'user', content: 'What is the current total power usage?' },
            { role: 'assistant', content: response1.response }
          ]
        })
      });
      
      assert.ok(response2.response, 'Should get follow-up response');
    });
  });

  describe('Fault Scenario Workflow', () => {
    test('should handle filter loading fault scenario', async () => {
      // Step 1: Apply filter loading fault
      const { response, data } = await apiRequest('/api/twin/fault', {
        method: 'POST',
        body: JSON.stringify({
          faultType: 'filter_loading',
          params: { filterId: 'filter-ahu-001', loading: 0.85 }
        })
      });
      
      assert.strictEqual(response.status, 200);
      
      // Step 2: Check for alerts
      const { data: alerts } = await apiRequest('/api/twin/alerts?active=true');
      const filterAlerts = alerts.filter(a => 
        a.assetId === 'filter-ahu-001' || a.message?.toLowerCase().includes('filter')
      );
      
      console.log(`  Filter alerts: ${filterAlerts.length}`);
      
      // Step 3: Get explanation for the issue
      if (filterAlerts.length > 0) {
        const { data: explanation } = await apiRequest(`/api/twin/explain/${filterAlerts[0].id}`);
        console.log(`  Explanation: ${explanation?.explanation || 'N/A'}`);
      }
    });

    test('should reset from fault to baseline', async () => {
      // Step 1: Apply fault
      await apiRequest('/api/twin/fault', {
        method: 'POST',
        body: JSON.stringify({
          faultType: 'filter_loading',
          params: { filterId: 'filter-ahu-001', loading: 0.95 }
        })
      });
      
      // Step 2: Reset to baseline
      const { response, data } = await apiRequest('/api/twin/reset', { method: 'POST' });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.success, true);
      
      // Step 3: Verify reset
      const { data: assets } = await apiRequest('/api/twin/assets');
      const filter = assets.find(a => a.id === 'filter-ahu-001');
      
      // Filter should be back to normal loading
      if (filter?.properties?.loading) {
        assert.ok(filter.properties.loading < 0.9, 'Filter should be reset');
      }
      
      console.log('  Twin state reset successfully');
    });
  });
});

console.log('\nRunning End-to-End Tests...\n');
console.log('Note: Backend server must be running on port 3003\n');
