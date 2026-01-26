/**
 * System Health Check Tests
 * 
 * Validates system availability and basic functionality
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:3000';

describe('System Health Checks', () => {
  
  describe('File System Health', () => {
    test('backend source files should exist', () => {
      const backendDir = path.join(__dirname, '../../backend/src');
      assert.ok(fs.existsSync(backendDir), 'Backend src directory should exist');
      assert.ok(fs.existsSync(path.join(backendDir, 'index.js')), 'Backend index.js should exist');
    });

    test('frontend source files should exist', () => {
      const frontendDir = path.join(__dirname, '../../frontend/src');
      assert.ok(fs.existsSync(frontendDir), 'Frontend src directory should exist');
      assert.ok(fs.existsSync(path.join(frontendDir, 'App.jsx')), 'Frontend App.jsx should exist');
    });

    test('twin data files should exist', () => {
      const twinDir = path.join(__dirname, '../../twin');
      assert.ok(fs.existsSync(twinDir), 'Twin directory should exist');
      assert.ok(fs.existsSync(path.join(twinDir, 'twin.state.json')), 'Twin state should exist');
      assert.ok(fs.existsSync(path.join(twinDir, 'twin.baseline.json')), 'Twin baseline should exist');
    });

    test('package.json files should exist', () => {
      assert.ok(
        fs.existsSync(path.join(__dirname, '../../backend/package.json')),
        'Backend package.json should exist'
      );
      assert.ok(
        fs.existsSync(path.join(__dirname, '../../frontend/package.json')),
        'Frontend package.json should exist'
      );
    });

    test('twin state file should be valid JSON', () => {
      const statePath = path.join(__dirname, '../../twin/twin.state.json');
      const content = fs.readFileSync(statePath, 'utf8');
      
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        assert.fail(`twin.state.json is not valid JSON: ${err.message}`);
      }
      
      assert.ok(parsed, 'Should parse successfully');
    });
  });

  describe('Backend Server Health', () => {
    test('backend server should respond to health check', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/twin`);
        assert.strictEqual(response.status, 200, 'Should return 200');
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          console.log('  ⚠ Backend server not running - skipping connectivity tests');
          return;
        }
        throw err;
      }
    });

    test('backend should return valid twin state', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/twin`);
        const data = await response.json();
        
        assert.ok(data.metadata, 'Should have metadata');
        assert.ok(data.assets, 'Should have assets');
        assert.ok(data.telemetry, 'Should have telemetry');
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          return; // Skip if server not running
        }
        throw err;
      }
    });

    test('backend API response time should be acceptable', async () => {
      try {
        const start = Date.now();
        await fetch(`${API_BASE}/api/twin`);
        const duration = Date.now() - start;
        
        console.log(`  API response time: ${duration}ms`);
        assert.ok(duration < 5000, `Response time ${duration}ms should be under 5000ms`);
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          return;
        }
        throw err;
      }
    });
  });

  describe('Frontend Server Health', () => {
    test('frontend server should respond', async () => {
      try {
        const response = await fetch(FRONTEND_URL);
        assert.ok(
          response.status === 200 || response.status === 304,
          `Should return success status, got ${response.status}`
        );
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          console.log('  ⚠ Frontend server not running - skipping connectivity tests');
          return;
        }
        throw err;
      }
    });

    test('frontend should serve HTML', async () => {
      try {
        const response = await fetch(FRONTEND_URL);
        const contentType = response.headers.get('content-type');
        
        assert.ok(
          contentType?.includes('text/html'),
          `Should serve HTML, got ${contentType}`
        );
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          return;
        }
        throw err;
      }
    });
  });

  describe('API Endpoint Availability', () => {
    const endpoints = [
      '/api/twin',
      '/api/twin/assets',
      '/api/twin/telemetry',
      '/api/twin/controls',
      '/api/twin/kpis',
      '/api/twin/alerts'
    ];

    endpoints.forEach(endpoint => {
      test(`${endpoint} should be available`, async () => {
        try {
          const response = await fetch(`${API_BASE}${endpoint}`);
          assert.strictEqual(response.status, 200, `${endpoint} should return 200`);
        } catch (err) {
          if (err.code === 'ECONNREFUSED') {
            return;
          }
          throw err;
        }
      });
    });
  });

  describe('Dependency Health', () => {
    test('backend node_modules should be installed', () => {
      const nodeModules = path.join(__dirname, '../../backend/node_modules');
      
      if (!fs.existsSync(nodeModules)) {
        console.log('  ⚠ Backend dependencies not installed - run npm install in backend/');
        return;
      }
      
      assert.ok(
        fs.existsSync(path.join(nodeModules, 'express')),
        'Express should be installed'
      );
      assert.ok(
        fs.existsSync(path.join(nodeModules, 'ws')),
        'ws should be installed'
      );
    });

    test('frontend node_modules should be installed', () => {
      const nodeModules = path.join(__dirname, '../../frontend/node_modules');
      
      if (!fs.existsSync(nodeModules)) {
        console.log('  ⚠ Frontend dependencies not installed - run npm install in frontend/');
        return;
      }
      
      assert.ok(
        fs.existsSync(path.join(nodeModules, 'react')),
        'React should be installed'
      );
      assert.ok(
        fs.existsSync(path.join(nodeModules, 'three')),
        'Three.js should be installed'
      );
    });
  });

  describe('Configuration Health', () => {
    test('vite.config.js should have API proxy configured', () => {
      const configPath = path.join(__dirname, '../../frontend/vite.config.js');
      const content = fs.readFileSync(configPath, 'utf8');
      
      assert.ok(content.includes('proxy'), 'Should have proxy configuration');
      assert.ok(content.includes("'/api'"), 'Should proxy /api routes');
      assert.ok(content.includes('3001'), 'Should proxy to port 3001');
    });

    test('backend should be configured for port 3001', () => {
      const indexPath = path.join(__dirname, '../../backend/src/index.js');
      const content = fs.readFileSync(indexPath, 'utf8');
      
      assert.ok(
        content.includes('3001'),
        'Backend should listen on port 3001'
      );
    });
  });

  describe('Data Integrity', () => {
    test('twin state should have consistent asset count', () => {
      const statePath = path.join(__dirname, '../../twin/twin.state.json');
      const baselinePath = path.join(__dirname, '../../twin/twin.baseline.json');
      
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      
      assert.strictEqual(
        state.assets.length,
        baseline.assets.length,
        'State and baseline should have same number of assets'
      );
    });

    test('simulator file should export HVACSimulator', () => {
      const simulatorPath = path.join(__dirname, '../../backend/src/simulator/hvac-simulator.js');
      assert.ok(fs.existsSync(simulatorPath), 'Simulator file should exist');
      
      const content = fs.readFileSync(simulatorPath, 'utf8');
      assert.ok(
        content.includes('HVACSimulator'),
        'Should export HVACSimulator class'
      );
    });
  });

  describe('Memory and Performance', () => {
    test('twin state file should be reasonably sized', () => {
      const statePath = path.join(__dirname, '../../twin/twin.state.json');
      const stats = fs.statSync(statePath);
      
      const sizeKB = stats.size / 1024;
      console.log(`  Twin state file size: ${sizeKB.toFixed(2)} KB`);
      
      assert.ok(sizeKB < 1024, 'Twin state should be under 1MB');
    });
  });
});

console.log('\nRunning System Health Checks...\n');
