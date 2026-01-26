/**
 * Twin Schema Validation Tests
 * 
 * Validates that twin state files conform to the defined JSON schema
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TWIN_DIR = path.join(__dirname, '../../twin');
const STATE_FILE = path.join(TWIN_DIR, 'twin.state.json');
const BASELINE_FILE = path.join(TWIN_DIR, 'twin.baseline.json');
const SCHEMA_FILE = path.join(TWIN_DIR, 'twin.schema.json');

let schema, state, baseline;

describe('Twin Schema Validation', () => {
  
  before(() => {
    // Load files
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      
      if (fs.existsSync(SCHEMA_FILE)) {
        schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading twin files:', err.message);
    }
  });

  describe('File Structure', () => {
    test('twin.state.json should exist and be valid JSON', () => {
      assert.ok(state, 'State file should load');
      assert.ok(typeof state === 'object', 'State should be an object');
    });

    test('twin.baseline.json should exist and be valid JSON', () => {
      assert.ok(baseline, 'Baseline file should load');
      assert.ok(typeof baseline === 'object', 'Baseline should be an object');
    });

    test('state and baseline should have same structure', () => {
      const stateKeys = Object.keys(state).sort();
      const baselineKeys = Object.keys(baseline).sort();
      
      assert.deepStrictEqual(stateKeys, baselineKeys, 'Keys should match');
    });
  });

  describe('Metadata Validation', () => {
    test('should have required metadata fields', () => {
      assert.ok(state.metadata, 'Should have metadata');
      assert.ok(state.metadata.id, 'Should have id');
      assert.ok(state.metadata.name, 'Should have name');
      assert.ok(state.metadata.version, 'Should have version');
      assert.ok(state.metadata.simulationTime, 'Should have simulationTime');
    });

    test('simulationTime should be valid ISO date', () => {
      const date = new Date(state.metadata.simulationTime);
      assert.ok(!isNaN(date.getTime()), 'simulationTime should be valid date');
    });

    test('version should be semantic version format', () => {
      const versionRegex = /^\d+\.\d+\.\d+$/;
      assert.ok(
        versionRegex.test(state.metadata.version),
        `Version ${state.metadata.version} should be semantic version`
      );
    });
  });

  describe('Assets Validation', () => {
    test('should have assets array', () => {
      assert.ok(Array.isArray(state.assets), 'Assets should be array');
      assert.ok(state.assets.length > 0, 'Should have at least one asset');
    });

    test('each asset should have required fields', () => {
      state.assets.forEach((asset, i) => {
        assert.ok(asset.id, `Asset ${i} should have id`);
        assert.ok(asset.name, `Asset ${i} should have name`);
        assert.ok(asset.type, `Asset ${i} should have type`);
      });
    });

    test('asset IDs should be unique', () => {
      const ids = state.assets.map(a => a.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, 'Asset IDs should be unique');
    });

    test('asset types should be valid', () => {
      const validTypes = ['building', 'floor', 'zone', 'ahu', 'vav', 'chiller', 'boiler', 'pump', 'filter'];
      
      state.assets.forEach(asset => {
        assert.ok(
          validTypes.includes(asset.type),
          `Asset ${asset.id} has invalid type: ${asset.type}`
        );
      });
    });

    test('zone assets should have required properties', () => {
      const zones = state.assets.filter(a => a.type === 'zone');
      
      zones.forEach(zone => {
        assert.ok(zone.properties, `Zone ${zone.id} should have properties`);
        assert.ok(zone.properties.area !== undefined, `Zone ${zone.id} should have area`);
      });
    });
  });

  describe('Telemetry Validation', () => {
    test('should have telemetry array', () => {
      assert.ok(Array.isArray(state.telemetry), 'Telemetry should be array');
      assert.ok(state.telemetry.length > 0, 'Should have telemetry data');
    });

    test('each telemetry point should have required fields', () => {
      state.telemetry.forEach((tel, i) => {
        assert.ok(tel.id, `Telemetry ${i} should have id`);
        assert.ok(tel.assetId, `Telemetry ${i} should have assetId`);
        assert.ok(tel.pointType, `Telemetry ${i} should have pointType`);
        assert.notStrictEqual(tel.value, undefined, `Telemetry ${i} should have value`);
        assert.ok(tel.unit, `Telemetry ${i} should have unit`);
      });
    });

    test('telemetry IDs should be unique', () => {
      const ids = state.telemetry.map(t => t.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, 'Telemetry IDs should be unique');
    });

    test('telemetry values should be numeric', () => {
      state.telemetry.forEach(tel => {
        if (typeof tel.value !== 'boolean') {
          assert.ok(
            typeof tel.value === 'number',
            `Telemetry ${tel.id} value should be numeric: ${tel.value}`
          );
        }
      });
    });

    test('telemetry should reference valid assets', () => {
      const assetIds = new Set(state.assets.map(a => a.id));
      
      state.telemetry.forEach(tel => {
        assert.ok(
          assetIds.has(tel.assetId),
          `Telemetry ${tel.id} references invalid asset: ${tel.assetId}`
        );
      });
    });
  });

  describe('Controls Validation', () => {
    test('should have controls array', () => {
      assert.ok(Array.isArray(state.controls), 'Controls should be array');
      assert.ok(state.controls.length > 0, 'Should have controls');
    });

    test('each control should have required fields', () => {
      state.controls.forEach((ctrl, i) => {
        assert.ok(ctrl.id, `Control ${i} should have id`);
        assert.ok(ctrl.assetId, `Control ${i} should have assetId`);
        assert.ok(ctrl.name, `Control ${i} should have name`);
        assert.notStrictEqual(ctrl.value, undefined, `Control ${i} should have value`);
      });
    });

    test('control IDs should be unique', () => {
      const ids = state.controls.map(c => c.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, 'Control IDs should be unique');
    });

    test('numeric controls should have min/max bounds', () => {
      state.controls.forEach(ctrl => {
        if (typeof ctrl.value === 'number' && ctrl.type !== 'enum') {
          assert.ok(
            ctrl.min !== undefined || ctrl.max !== undefined,
            `Numeric control ${ctrl.id} should have bounds`
          );
        }
      });
    });

    test('control values should be within bounds', () => {
      state.controls.forEach(ctrl => {
        if (typeof ctrl.value === 'number') {
          if (ctrl.min !== undefined) {
            assert.ok(
              ctrl.value >= ctrl.min,
              `Control ${ctrl.id} value ${ctrl.value} below min ${ctrl.min}`
            );
          }
          if (ctrl.max !== undefined) {
            assert.ok(
              ctrl.value <= ctrl.max,
              `Control ${ctrl.id} value ${ctrl.value} above max ${ctrl.max}`
            );
          }
        }
      });
    });
  });

  describe('KPIs Validation', () => {
    test('should have KPIs array', () => {
      assert.ok(Array.isArray(state.kpis), 'KPIs should be array');
      assert.ok(state.kpis.length > 0, 'Should have KPIs');
    });

    test('each KPI should have required fields', () => {
      state.kpis.forEach((kpi, i) => {
        assert.ok(kpi.id, `KPI ${i} should have id`);
        assert.ok(kpi.name, `KPI ${i} should have name`);
        assert.notStrictEqual(kpi.value, undefined, `KPI ${i} should have value`);
        assert.ok(kpi.unit, `KPI ${i} should have unit`);
      });
    });

    test('KPI IDs should be unique', () => {
      const ids = state.kpis.map(k => k.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, 'KPI IDs should be unique');
    });

    test('KPIs should have valid status', () => {
      const validStatuses = ['good', 'warning', 'critical', 'normal'];
      
      state.kpis.forEach(kpi => {
        if (kpi.status) {
          assert.ok(
            validStatuses.includes(kpi.status),
            `KPI ${kpi.id} has invalid status: ${kpi.status}`
          );
        }
      });
    });

    test('should have required KPI categories', () => {
      const ids = state.kpis.map(k => k.id);
      
      // Energy KPIs
      assert.ok(ids.some(id => id.includes('power')), 'Should have power KPI');
      
      // Comfort KPIs
      assert.ok(ids.some(id => id.includes('comfort') || id.includes('temp')), 'Should have comfort KPI');
      
      // IAQ KPIs
      assert.ok(ids.some(id => id.includes('co2')), 'Should have CO2 KPI');
    });
  });

  describe('Alerts Validation', () => {
    test('should have alerts array', () => {
      assert.ok(Array.isArray(state.alerts), 'Alerts should be array');
    });

    test('each alert should have required fields', () => {
      state.alerts.forEach((alert, i) => {
        assert.ok(alert.id, `Alert ${i} should have id`);
        assert.ok(alert.severity, `Alert ${i} should have severity`);
        assert.ok(alert.message, `Alert ${i} should have message`);
        assert.ok(alert.timestamp, `Alert ${i} should have timestamp`);
      });
    });

    test('alert severities should be valid', () => {
      const validSeverities = ['info', 'warning', 'critical', 'alarm'];
      
      state.alerts.forEach(alert => {
        assert.ok(
          validSeverities.includes(alert.severity),
          `Alert ${alert.id} has invalid severity: ${alert.severity}`
        );
      });
    });

    test('alert timestamps should be valid ISO dates', () => {
      state.alerts.forEach(alert => {
        const date = new Date(alert.timestamp);
        assert.ok(
          !isNaN(date.getTime()),
          `Alert ${alert.id} has invalid timestamp: ${alert.timestamp}`
        );
      });
    });
  });

  describe('Relationships Validation', () => {
    test('should have relationships array', () => {
      assert.ok(Array.isArray(state.relationships), 'Relationships should be array');
    });

    test('each relationship should reference valid assets', () => {
      const assetIds = new Set(state.assets.map(a => a.id));
      
      state.relationships.forEach(rel => {
        assert.ok(
          assetIds.has(rel.source),
          `Relationship references invalid source: ${rel.source}`
        );
        assert.ok(
          assetIds.has(rel.target),
          `Relationship references invalid target: ${rel.target}`
        );
      });
    });

    test('relationships should have valid types', () => {
      const validTypes = ['contains', 'feeds', 'serves', 'monitors', 'controls'];
      
      state.relationships.forEach(rel => {
        if (rel.type) {
          assert.ok(
            validTypes.includes(rel.type),
            `Relationship has invalid type: ${rel.type}`
          );
        }
      });
    });
  });

  describe('Simulator State Validation', () => {
    test('should have simulatorState object', () => {
      assert.ok(state.simulatorState, 'Should have simulatorState');
      assert.ok(typeof state.simulatorState === 'object', 'simulatorState should be object');
    });

    test('should have outdoor temperature', () => {
      assert.ok(
        state.simulatorState.outdoorTemp !== undefined,
        'Should have outdoor temperature'
      );
      assert.ok(
        typeof state.simulatorState.outdoorTemp === 'number',
        'Outdoor temp should be number'
      );
    });
  });
});

console.log('\nRunning Schema Validation Tests...\n');
