/**
 * Helper to call DevHub MCP tools directly via the local stdio server.
 *
 * This avoids depending on an external OpenCode server; it spawns
 * devhub-mcp/server.js in the same repo and performs a JSON-RPC exchange.
 */

import { spawn } from 'child_process';
import path from 'path';

const SERVER_PATH = path.join(process.cwd(), 'devhub-mcp', 'server.js');
const DB_PATH = path.join(process.cwd(), 'devhub-mcp', 'data', 'devhub.db');

let requestId = 0;

function nextId() {
  requestId += 1;
  return requestId;
}

function buildMessages(toolName, args) {
  const id = nextId();
  return [
    {
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'zed-devhub-mcp-client', version: '1.0.0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    },
  ];
}

/**
 * Call a DevHub MCP tool and parse the result.
 *
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<object>}
 */
export async function callDevHubMcp(toolName, args = {}) {
  const messages = buildMessages(toolName, args);
  const callId = messages[2].id;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER_PATH], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DEVHUB_DB_PATH: DB_PATH,
        DEVHUB_MCP_DB_DRIVER: 'sqlite',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    const output = [];
    const errors = [];

    child.stdout.on('data', (data) => output.push(data.toString()));
    child.stderr.on('data', (data) => errors.push(data.toString()));

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`DevHub MCP server exited with ${code}. stderr: ${errors.join('')}`)
        );
      }

      const lines = output
        .join('')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{'));

      let responses;
      try {
        responses = lines.map((l) => JSON.parse(l));
      } catch (err) {
        return reject(new Error(`Invalid JSON from DevHub MCP: ${err.message}`));
      }

      const res = responses.find((r) => r.id === callId);
      if (!res) {
        return reject(new Error('No response for DevHub MCP tool call'));
      }
      if (res.error) {
        return reject(new Error(`DevHub MCP error: ${JSON.stringify(res.error)}`));
      }

      const result = res.result || {};
      const content = result.content?.[0];
      const text = content?.text;

      if (result.isError || content?.isError) {
        return reject(new Error(text || 'DevHub MCP error'));
      }

      if (!text) {
        return resolve(res.result);
      }

      try {
        const parsed = JSON.parse(text);
        resolve(parsed);
      } catch {
        resolve({ text, raw: res.result });
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
