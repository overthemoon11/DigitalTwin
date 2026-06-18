/**
 * Backend API Endpoint Tests
 * 
 * Tests all REST API endpoints of the HVAC Digital Twin backend
 */

const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert');

const API_BASE = 'http://localhost:3003';

// Helper function to make API requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  return { response, data };
}

describe('REST API Endpoints', () => {
  
  describe('GET /api/twin', () => {
    test('should return complete twin state', async () => {
      const { response, data } = await apiRequest('/api/twin');
      
      assert.strictEqual(response.status, 200);
      assert.ok(data.metadata, 'Should have metadata');
      assert.ok(data.assets, 'Should have assets');
      assert.ok(data.telemetry, 'Should have telemetry');
      assert.ok(data.controls, 'Should have controls');
      assert.ok(data.kpis, 'Should have kpis');
      assert.ok(data.alerts, 'Should have alerts');
    });

    test('should include proper metadata fields', async () => {
      const { data } = await apiRequest('/api/twin');
      
      assert.ok(data.metadata.id, 'Should have twin ID');
      assert.ok(data.metadata.name, 'Should have name');
      assert.ok(data.metadata.version, 'Should have version');
      assert.ok(data.metadata.simulationTime, 'Should have simulation time');
    });
  });

  describe('GET /api/twin/assets', () => {
    test('should return all assets', async () => {
      const { response, data } = await apiRequest('/api/twin/assets');
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data), 'Should return array');
      assert.ok(data.length > 0, 'Should have assets');
    });

    test('assets should have required fields', async () => {
      const { data } = await apiRequest('/api/twin/assets');
      
      data.forEach(asset => {
        assert.ok(asset.id, 'Asset should have id');
        assert.ok(asset.name, 'Asset should have name');
        assert.ok(asset.type, 'Asset should have type');
      });
    });

    test('should include zone assets', async () => {
      const { data } = await apiRequest('/api/twin/assets');
      
      const zones = data.filter(a => a.type === 'zone');
      assert.ok(zones.length > 0, 'Should have zone assets');
    });

    test('should include HVAC equipment assets', async () => {
      const { data } = await apiRequest('/api/twin/assets');
      
      const ahus = data.filter(a => a.type === 'ahu');
      const vavs = data.filter(a => a.type === 'vav');
      
      assert.ok(ahus.length > 0, 'Should have AHU assets');
      assert.ok(vavs.length > 0, 'Should have VAV assets');
    });
  });

  describe('GET /api/twin/assets/:id', () => {
    test('should return specific asset by ID', async () => {
      const { response, data } = await apiRequest('/api/twin/assets/ahu-001');
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.id, 'ahu-001');
      assert.strictEqual(data.type, 'ahu');
    });

    test('should return 404 for non-existent asset', async () => {
      const { response } = await apiRequest('/api/twin/assets/non-existent-id');
      
      assert.strictEqual(response.status, 404);
    });
  });

  describe('GET /api/twin/telemetry', () => {
    test('should return all telemetry points', async () => {
      const { response, data } = await apiRequest('/api/twin/telemetry');
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data), 'Should return array');
      assert.ok(data.length > 0, 'Should have telemetry data');
    });

    test('telemetry should have required fields', async () => {
      const { data } = await apiRequest('/api/twin/telemetry');
      
      data.forEach(tel => {
        assert.ok(tel.id, 'Telemetry should have id');
        assert.ok(tel.assetId, 'Telemetry should have assetId');
        assert.ok(tel.pointType, 'Telemetry should have pointType');
        assert.notStrictEqual(tel.value, undefined, 'Telemetry should have value');
      });
    });

    test('should filter by assetId', async () => {
      const { data } = await apiRequest('/api/twin/telemetry?assetId=ahu-001');
      
      data.forEach(tel => {
        assert.strictEqual(tel.assetId, 'ahu-001');
      });
    });

    test('should filter by pointType', async () => {
      const { data } = await apiRequest('/api/twin/telemetry?pointType=temperature');
      
      data.forEach(tel => {
        assert.strictEqual(tel.pointType, 'temperature');
      });
    });
  });

  describe('GET /api/twin/controls', () => {
    test('should return all controls', async () => {
      const { response, data } = await apiRequest('/api/twin/controls');
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data), 'Should return array');
      assert.ok(data.length > 0, 'Should have controls');
    });

    test('controls should have required fields', async () => {
      const { data } = await apiRequest('/api/twin/controls');
      
      data.forEach(ctrl => {
        assert.ok(ctrl.id, 'Control should have id');
        assert.ok(ctrl.assetId, 'Control should have assetId');
        assert.ok(ctrl.name, 'Control should have name');
        assert.notStrictEqual(ctrl.value, undefined, 'Control should have value');
      });
    });

    test('should filter by assetId', async () => {
      const { data } = await apiRequest('/api/twin/controls?assetId=zone-office-001');
      
      assert.ok(data.length > 0, 'Should have controls for zone');
      data.forEach(ctrl => {
        assert.strictEqual(ctrl.assetId, 'zone-office-001');
      });
    });
  });

  describe('PUT /api/twin/controls/:id', () => {
    test('should update control value', async () => {
      const controlId = 'ctrl-zone-office1-cooling-sp';
      const newValue = 75;
      
      const { response, data } = await apiRequest(`/api/twin/controls/${controlId}`, {
        method: 'PUT',
        body: JSON.stringify({ value: newValue })
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.control.value, newValue);
    });

    test('should reject value below minimum', async () => {
      const controlId = 'ctrl-zone-office1-cooling-sp';
      
      const { response } = await apiRequest(`/api/twin/controls/${controlId}`, {
        method: 'PUT',
        body: JSON.stringify({ value: 50 }) // Below typical min of 68
      });
      
      assert.strictEqual(response.status, 400);
    });

    test('should reject value above maximum', async () => {
      const controlId = 'ctrl-zone-office1-cooling-sp';
      
      const { response } = await apiRequest(`/api/twin/controls/${controlId}`, {
        method: 'PUT',
        body: JSON.stringify({ value: 100 }) // Above typical max of 80
      });
      
      assert.strictEqual(response.status, 400);
    });

    test('should return 404 for non-existent control', async () => {
      const { response } = await apiRequest('/api/twin/controls/non-existent', {
        method: 'PUT',
        body: JSON.stringify({ value: 72 })
      });
      
      assert.strictEqual(response.status, 404);
    });
  });

  describe('GET /api/twin/kpis', () => {
    test('should return all KPIs', async () => {
      const { response, data } = await apiRequest('/api/twin/kpis');
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data), 'Should return array');
      assert.ok(data.length > 0, 'Should have KPIs');
    });

    test('KPIs should have required fields', async () => {
      const { data } = await apiRequest('/api/twin/kpis');
      
      data.forEach(kpi => {
        assert.ok(kpi.id, 'KPI should have id');
        assert.ok(kpi.name, 'KPI should have name');
        assert.notStrictEqual(kpi.value, undefined, 'KPI should have value');
        assert.ok(kpi.unit, 'KPI should have unit');
      });
    });

    test('should include energy KPIs', async () => {
      const { data } = await apiRequest('/api/twin/kpis');
      
      const powerKpi = data.find(k => k.id === 'kpi-total-power');
      assert.ok(powerKpi, 'Should have total power KPI');
    });

    test('should include comfort KPIs', async () => {
      const { data } = await apiRequest('/api/twin/kpis');
      
      const comfortKpi = data.find(k => k.id === 'kpi-comfort-compliance');
      assert.ok(comfortKpi, 'Should have comfort compliance KPI');
    });
  });

  describe('GET /api/twin/alerts', () => {
    test('should return all alerts', async () => {
      const { response, data } = await apiRequest('/api/twin/alerts');
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data), 'Should return array');
    });

    test('should filter active alerts', async () => {
      const { data: allAlerts } = await apiRequest('/api/twin/alerts');
      const { data: activeAlerts } = await apiRequest('/api/twin/alerts?active=true');
      
      activeAlerts.forEach(alert => {
        assert.strictEqual(alert.resolved, undefined);
      });
      
      assert.ok(activeAlerts.length <= allAlerts.length);
    });
  });

  describe('POST /api/twin/simulate', () => {
    test('should run simulation step', async () => {
      const { response, data } = await apiRequest('/api/twin/simulate', {
        method: 'POST',
        body: JSON.stringify({ timeStep: 60 })
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.simulationTime, 'Should return simulation time');
      assert.ok(data.kpis, 'Should return updated KPIs');
    });

    test('should accept control changes during simulation', async () => {
      const { response, data } = await apiRequest('/api/twin/simulate', {
        method: 'POST',
        body: JSON.stringify({
          timeStep: 60,
          controlChanges: {
            'ctrl-dr-level': 1
          }
        })
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.success, true);
    });
  });

  describe('POST /api/twin/reset', () => {
    test('should reset twin state to baseline', async () => {
      const { response, data } = await apiRequest('/api/twin/reset', {
        method: 'POST'
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.success, true);
    });
  });

  describe('POST /api/copilot/chat', () => {
    test('should return chat response', async () => {
      const { response, data } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'What is the current energy usage?'
        })
      });
      
      assert.strictEqual(response.status, 200);
      assert.ok(data.response, 'Should return response text');
    });

    test('should return 400 without message', async () => {
      const { response } = await apiRequest('/api/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      assert.strictEqual(response.status, 400);
    });
  });
});

console.log('\nRunning Backend API Tests...\n');
