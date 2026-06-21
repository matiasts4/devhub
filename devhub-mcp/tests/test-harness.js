/**
 * MCP Test Harness — Integration testing via stdio JSON-RPC.
 *
 * The Codex/Kali sandbox used for this project does not reliably expose
 * child-process pipe output to parent Node processes. To keep the tests
 * faithful to the real MCP stdio protocol without depending on live pipes,
 * each request is executed as:
 *
 *   node server.js < request.jsonl > response.jsonl
 *
 * A unique SQLite DB is used per harness and persists across requests.
 */

import { spawnSync } from 'child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server.js');
const ROOT_DIR = join(__dirname, '..', '..');

export async function createTestHarness(options = {}) {
  const runId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = join(tmpdir(), `devhub-mcp-test-${runId}`);
  const dbPath = join(workDir, 'devhub.db');
  const userId = '54fee7d7-340d-4683-b259-b61a39567f94';
  const projectId = randomUUID();
  let messageId = 0;
  let initialized = false;

  mkdirSync(workDir, { recursive: true });

  function serverEnv() {
    return {
      ...process.env,
      DEVHUB_DB_PATH: dbPath,
      DEVHUB_MCP_DB_DRIVER: 'sqlite',
      ...(options.env || {}),
    };
  }

  function runJsonRpc(messages) {
    const id = ++messageId;
    const inputPath = join(workDir, `request-${id}.jsonl`);
    const outputPath = join(workDir, `response-${id}.jsonl`);
    const stderrPath = join(workDir, `stderr-${id}.log`);

    writeFileSync(inputPath, messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n');

    const inFd = openSync(inputPath, 'r');
    const outFd = openSync(outputPath, 'w');
    const errFd = openSync(stderrPath, 'w');
    const result = spawnSync('node', [SERVER_PATH], {
      cwd: ROOT_DIR,
      env: serverEnv(),
      stdio: [inFd, outFd, errFd],
      timeout: 10_000,
    });
    closeSync(inFd);
    closeSync(outFd);
    closeSync(errFd);

    const stdout = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
    const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
    if (result.error) {
      throw new Error(`Failed to run MCP server: ${result.error.message}\n${stderr}`);
    }
    if (result.status !== 0) {
      throw new Error(`MCP server exited with status ${result.status}\n${stderr}\n${stdout}`);
    }

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line));
  }

  function request(method, params = {}) {
    const id = ++messageId;
    const messages = [
      {
        jsonrpc: '2.0',
        id: 'init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-harness', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
      { jsonrpc: '2.0', id, method, params },
    ];

    const responses = runJsonRpc(messages);
    const response = responses.find((msg) => msg.id === id);
    if (!response) {
      throw new Error(`No response for request ${method}. Responses: ${JSON.stringify(responses)}`);
    }
    if (response.error) {
      throw new Error(response.error.message || JSON.stringify(response.error));
    }
    return response.result;
  }

  function seedProject() {
    const db = new Database(dbPath);
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!existing) {
      db.prepare(
        `INSERT INTO projects (
          id, user_id, workspace_id, name, description, color, status, progress,
          planning_prompt, planning_status, project_type, documentation_policy, local_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        projectId,
        'local-user',
        'local-ws',
        'MCP Integration Project',
        'Proyecto semilla para pruebas MCP',
        '#58A6FF',
        'active',
        0,
        'Planificar roadmap de integración',
        'pending',
        'software',
        'personal',
        workDir
      );
    }
    db.close();
  }

  async function initialize() {
    if (initialized) return;
    request('tools/list', {});
    seedProject();
    initialized = true;
  }

  async function callTool(toolName, args = {}) {
    const result = request('tools/call', { name: toolName, arguments: args });
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

  async function listTools() {
    const result = request('tools/list', {});
    return result.tools || [];
  }

  async function cleanup() {
    rmSync(workDir, { recursive: true, force: true });
    initialized = false;
  }

  return { initialize, callTool, listTools, cleanup, getProcess: () => null, dbPath, workDir };
}
