/**
 * MCP Test Harness — Integration testing via stdio JSON-RPC
 *
 * Spawns the real MCP server as a child process and communicates
 * via stdin/stdout using the MCP JSON-RPC protocol.
 *
 * Usage:
 *   const { callTool, initialize, cleanup } = await createTestHarness();
 *   await initialize();
 *   const result = await callTool('list_projects', { status: 'all' });
 *   await cleanup();
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server.js');

export async function createTestHarness() {
  let child = null;
  let messageId = 0;
  const pending = new Map();
  let buffer = '';
  let initialized = false;

  function spawnServer() {
    return new Promise((resolve, reject) => {
      child = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      child.stderr.on('data', (data) => {
        // Server logs go to stderr — ignore for tests
      });

      child.stdout.on('data', (data) => {
        buffer += data.toString();
        processBuffer();
      });

      child.on('error', reject);
      child.on('spawn', () => resolve(child));
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          // Server exited unexpectedly
        }
      });

      // Timeout if server doesn't spawn
      setTimeout(() => reject(new Error('Server spawn timeout')), 5000);
    });
  }

  function processBuffer() {
    // MCP uses JSON-RPC messages separated by newlines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve, reject, timer } = pending.get(msg.id);
          clearTimeout(timer);
          pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // Not JSON — skip (server log on stdout)
      }
    }
  }

  function send(msg) {
    if (!child || !child.stdin) {
      throw new Error('Server not running');
    }
    child.stdin.write(JSON.stringify(msg) + '\n');
  }

  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
      pending.set(id, { resolve, reject, method, timer });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async function initialize() {
    if (initialized) return;
    await spawnServer();
    // MCP initialize handshake
    await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-harness', version: '1.0.0' },
    });
    // Notify initialized
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    initialized = true;
  }

  async function callTool(toolName, args = {}) {
    const result = await request('tools/call', { name: toolName, arguments: args });
    // MCP wraps tool output in { content: [{ type: 'text', text: '...' }] }
    if (result.content && result.content[0]) {
      const text = result.content[0].text;
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }
    return result;
  }

  async function cleanup() {
    if (child) {
      // Close stdin to signal the server to stop reading
      child.stdin?.end();
      // Unref so it doesn't keep the event loop alive
      child.unref?.();
      child.kill('SIGTERM');
      // Wait for exit with timeout
      await Promise.race([
        new Promise((r) => child.on('exit', r)),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      // Force kill if still alive
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
    initialized = false;
    // Clear all pending timers
    for (const [, p] of pending) {
      clearTimeout(p.timer);
    }
    pending.clear();
    buffer = '';
  }

  return { initialize, callTool, cleanup, getProcess: () => child };
}
