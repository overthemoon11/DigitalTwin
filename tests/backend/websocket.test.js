/**
 * WebSocket Connectivity Tests
 * 
 * Tests WebSocket connection and real-time updates for the HVAC Digital Twin
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3003/ws';
const API_BASE = 'http://localhost:3003';

describe('WebSocket Connectivity', () => {
  
  describe('Connection', () => {
    test('should connect to WebSocket server', async () => {
      const ws = new WebSocket(WS_URL);
      
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          assert.ok(true, 'WebSocket connected');
          resolve();
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      ws.close();
    });

    test('should receive initial state on connect', async () => {
      const ws = new WebSocket(WS_URL);
      
      const message = await new Promise((resolve, reject) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data));
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Message timeout')), 5000);
      });
      
      assert.strictEqual(message.type, 'state', 'Should receive state message');
      assert.ok(message.data, 'Should include state data');
      assert.ok(message.data.assets, 'State should include assets');
      
      ws.close();
    });
  });

  describe('Real-time Updates', () => {
    test('should receive updates when simulation runs', async () => {
      const ws = new WebSocket(WS_URL);
      
      // Wait for connection and initial state
      await new Promise((resolve) => {
        ws.on('message', () => resolve());
      });
      
      // Trigger simulation via REST API
      const updatePromise = new Promise((resolve, reject) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data);
          if (msg.type === 'update') {
            resolve(msg);
          }
        });
        setTimeout(() => reject(new Error('Update timeout')), 10000);
      });
      
      // Send simulate command via WebSocket
      ws.send(JSON.stringify({
        type: 'simulate',
        timeStep: 60
      }));
      
      const update = await updatePromise;
      
      assert.strictEqual(update.type, 'update', 'Should receive update message');
      assert.ok(update.data.state, 'Update should include state');
      
      ws.close();
    });

    test('should broadcast control changes to all clients', async () => {
      const ws1 = new WebSocket(WS_URL);
      const ws2 = new WebSocket(WS_URL);
      
      // Wait for both connections
      await Promise.all([
        new Promise((resolve) => ws1.on('message', () => resolve())),
        new Promise((resolve) => ws2.on('message', () => resolve()))
      ]);
      
      // Set up listener on ws2 for updates
      const updatePromise = new Promise((resolve, reject) => {
        ws2.on('message', (data) => {
          const msg = JSON.parse(data);
          if (msg.type === 'update') {
            resolve(msg);
          }
        });
        setTimeout(() => reject(new Error('Broadcast timeout')), 10000);
      });
      
      // Send control change from ws1
      ws1.send(JSON.stringify({
        type: 'control_change',
        changes: {
          'ctrl-dr-level': 1
        }
      }));
      
      const update = await updatePromise;
      
      assert.ok(update.data.state, 'Should receive broadcast update');
      
      ws1.close();
      ws2.close();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid message gracefully', async () => {
      const ws = new WebSocket(WS_URL);
      
      await new Promise((resolve) => ws.on('open', resolve));
      
      // Send invalid JSON - should not crash server
      ws.send('not-valid-json');
      
      // Wait a bit to ensure no crash
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Connection should still be open
      assert.strictEqual(ws.readyState, WebSocket.OPEN, 'Connection should remain open');
      
      ws.close();
    });

    test('should handle connection close gracefully', async () => {
      const ws = new WebSocket(WS_URL);
      
      await new Promise((resolve) => ws.on('open', resolve));
      
      const closePromise = new Promise((resolve) => {
        ws.on('close', () => resolve());
      });
      
      ws.close();
      
      await closePromise;
      assert.strictEqual(ws.readyState, WebSocket.CLOSED, 'Connection should be closed');
    });
  });

  describe('Message Types', () => {
    test('should handle simulate message type', async () => {
      const ws = new WebSocket(WS_URL);
      
      await new Promise((resolve) => ws.on('message', () => resolve()));
      
      const responsePromise = new Promise((resolve, reject) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data);
          if (msg.type === 'update') {
            resolve(msg);
          }
        });
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      ws.send(JSON.stringify({
        type: 'simulate',
        timeStep: 60
      }));
      
      const response = await responsePromise;
      assert.ok(response.data.log, 'Should include simulation log');
      
      ws.close();
    });

    test('should handle control_change message type', async () => {
      const ws = new WebSocket(WS_URL);
      
      await new Promise((resolve) => ws.on('message', () => resolve()));
      
      const responsePromise = new Promise((resolve, reject) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data);
          if (msg.type === 'update') {
            resolve(msg);
          }
        });
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      ws.send(JSON.stringify({
        type: 'control_change',
        changes: {
          'ctrl-zone-office1-cooling-sp': 74
        }
      }));
      
      const response = await responsePromise;
      assert.ok(response.data.state.controls, 'Should include updated controls');
      
      ws.close();
    });
  });
});

console.log('\nRunning WebSocket Tests...\n');
console.log('Note: Backend server must be running on port 3003\n');
