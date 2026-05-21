#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(__dirname, '..');
const repoRoot = resolve(mcpDir, '..');
const serverPath = resolve(mcpDir, 'server.js');
const tempDir = mkdtempSync(join(tmpdir(), 'devhub-mcp-smoke-'));
const dbPath = process.env.DEVHUB_DB_PATH || join(tempDir, 'devhub-smoke.db');
const inputPath = join(tempDir, 'input.jsonl');
const outputPath = join(tempDir, 'output.jsonl');
const stderrPath = join(tempDir, 'stderr.log');

const expectedTools = [
  'add_task_comment',
  'bulk_create_milestones',
  'bulk_create_tasks',
  'claim_next_task',
  'create_milestone',
  'create_project',
  'create_task',
  'delete_project',
  'get_dashboard',
  'get_execution_queue',
  'get_next_task',
  'get_project',
  'get_project_context',
  'heartbeat_agent',
  'list_milestones',
  'list_projects',
  'list_tasks',
  'register_agent',
  'unregister_agent',
  'update_agent_status',
  'update_milestone',
  'update_project',
  'update_task',
].sort();

const messages = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'devhub-mcp-smoke', version: '1.0.0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_dashboard', arguments: {} } },
];

writeFileSync(inputPath, messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n');
const inFd = openSync(inputPath, 'r');
const outFd = openSync(outputPath, 'w');
const errFd = openSync(stderrPath, 'w');
const result = spawnSync(process.execPath, [serverPath], {
  cwd: repoRoot,
  env: { ...process.env, DEVHUB_DB_PATH: dbPath, DEVHUB_MCP_DB_DRIVER: 'sqlite' },
  stdio: [inFd, outFd, errFd],
  timeout: 10_000,
});
closeSync(inFd);
closeSync(outFd);
closeSync(errFd);

const stdout = readFileSync(outputPath, 'utf8');
const stderr = readFileSync(stderrPath, 'utf8');
if (result.error || result.status !== 0) {
  console.error(stderr);
  console.error(stdout);
  throw result.error || new Error(`MCP server exited with status ${result.status}`);
}

const responses = stdout
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line));
const tools = responses.find((msg) => msg.id === 2)?.result?.tools?.map((tool) => tool.name).sort();
if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) {
  throw new Error(`Unexpected tool catalog. Expected ${expectedTools.length}, got ${tools?.length}: ${tools?.join(', ')}`);
}
const dashboardText = responses.find((msg) => msg.id === 3)?.result?.content?.[0]?.text;
if (!dashboardText) throw new Error('get_dashboard did not return text content');

console.log(`✅ DevHub MCP smoke passed (${tools.length} tools). DB: ${dbPath}`);
if (!process.env.DEVHUB_DB_PATH) rmSync(tempDir, { recursive: true, force: true });
