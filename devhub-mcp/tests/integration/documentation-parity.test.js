import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const CLI_README_PATH = join(REPO_ROOT, 'devhub-cli', 'README.md');
const PLYRIUM_DOCS_PATH = join(REPO_ROOT, 'docs', 'Plyrium', 'documentos.md');
const PLYRIUM_COMPARISON_PATH = join(REPO_ROOT, 'docs', 'Plyrium', 'comparacion_devhub.md');
const MCP_PLAN_PATH = join(REPO_ROOT, 'docs', '31_MCP_Decomposition_Plan.md');
const CLI_PLAN_PATH = join(REPO_ROOT, 'docs', '33_CLI_Enhancement_Plan.md');
const ROADMAP_PATH = join(REPO_ROOT, 'docs', '34_Execution_Roadmap.md');
const CLOSURE_CHECKLIST_PATH = join(REPO_ROOT, 'docs', '37_Decomposition_Closure_Checklist.md');
const MCP_BLOCKERS_PATH = join(REPO_ROOT, 'docs', '38_MCP_Blocker_Fixes.md');
const MCP_PROTOCOL_PATH = join(REPO_ROOT, 'docs', '04_Protocolo_MCP_y_Agentes.md');
const AGENTHUB_USER_DOC_PATH = join(REPO_ROOT, 'docs', 'user', '05_AgentHub.md');
const MCP_SPEC_PATH = join(REPO_ROOT, 'openspec', 'specs', 'mcp-public-contract', 'spec.md');
const CLI_SPEC_PATH = join(REPO_ROOT, 'openspec', 'specs', 'cli-documentation', 'spec.md');

const CLI_COMMANDS = [
  'status',
  'queue',
  'agents',
  'swarm',
  'task',
  'ws',
  'heartbeat',
  'update-status',
  'claim',
  'release',
  'tell',
  'swarm-launch',
  'auth',
  'events',
  'inbox',
  'presence',
  'mission',
  'run',
  'worktree',
  'supervisor',
];

const TELEGRAM_TOOL_NAMES = [
  'record_telegram_adapter_intent',
  'record_telegram_delivery',
  'set_telegram_subscription',
  'respond_telegram_approval',
  'get_telegram_channel_snapshot',
];

const DEFERRED_ITEMS = [
  'retrieval/indexing CLI parity',
  'physical DB split',
  'explicit worktree manifest',
  'larger orchestration redesign',
];

function readMarkdown(filePath) {
  return readFileSync(filePath, 'utf8');
}

function extractCliCommands(markdown) {
  const commandReference = markdown.match(/## Command Reference\n([\s\S]*?)\n### status/);
  const commandTable = commandReference?.[1] || '';

  return [...commandTable.matchAll(/^\| \[`([^`]+)`\]/gm)].map((match) => match[1] || match[2]);
}

function extractWorkflowTable(markdown) {
  const workflow = markdown.match(/## Agent Workflow Patterns\n([\s\S]*?)$/);
  return workflow?.[1] || '';
}

describe('Documentation parity baseline', () => {
  it('documents the current 20 top-level CLI commands and an executable workflow', () => {
    const readme = readMarkdown(CLI_README_PATH);
    const workflowSection = extractWorkflowTable(readme);

    expect(extractCliCommands(readme).sort()).toEqual([...CLI_COMMANDS].sort());
    expect(workflowSection).not.toContain('| Register | `devhub register` |');
    expect(readme).toContain(
      'Registration happens during runtime or swarm-launch setup, not as a CLI command.'
    );
  });

  it('keeps Plyrium and roadmap docs on the same non-Telegram baseline', () => {
    const inventory = readMarkdown(PLYRIUM_DOCS_PATH);
    const comparison = readMarkdown(PLYRIUM_COMPARISON_PATH);
    const mcpPlan = readMarkdown(MCP_PLAN_PATH);
    const cliPlan = readMarkdown(CLI_PLAN_PATH);
    const roadmap = readMarkdown(ROADMAP_PATH);
    const mcpProtocol = readMarkdown(MCP_PROTOCOL_PATH);
    const agentHubDoc = readMarkdown(AGENTHUB_USER_DOC_PATH);
    const mcpSpec = readMarkdown(MCP_SPEC_PATH);
    const cliSpec = readMarkdown(CLI_SPEC_PATH);

    expect(inventory).toContain('Baseline soportado hoy: 36 tools MCP y 20 comandos CLI.');
    expect(comparison).toContain('Backlog diferido explícito');
    expect(mcpPlan).toContain('Telegram MCP removal is complete');
    expect(cliPlan).toContain('20 implemented top-level CLI commands');
    expect(roadmap).toContain('Supported baseline now: 36 MCP tools and 20 CLI commands.');
    expect(mcpProtocol).toContain('36-tool env-invariant MCP contract');
    expect(agentHubDoc).toContain('36-tool env-invariant surface');
    expect(mcpSpec).toContain('The system SHALL publish one supported MCP contract of 36 tools');
    expect(cliSpec).toContain(
      'The documentation SHALL describe 20 implemented top-level CLI commands'
    );

    for (const markdown of [
      inventory,
      comparison,
      mcpPlan,
      roadmap,
      mcpProtocol,
      agentHubDoc,
      mcpSpec,
    ]) {
      for (const telegramTool of TELEGRAM_TOOL_NAMES) {
        expect(markdown).not.toContain(telegramTool);
      }
    }

    for (const deferredItem of DEFERRED_ITEMS) {
      expect(comparison).toContain(deferredItem);
      expect(roadmap).toContain(deferredItem);
    }
  });

  it('removes stale Telegram deferral notes from closure docs', () => {
    const checklist = readMarkdown(CLOSURE_CHECKLIST_PATH);
    const blockers = readMarkdown(MCP_BLOCKERS_PATH);

    expect(checklist).not.toContain('Lazy import for Telegram tool registration');
    expect(blockers).not.toContain('Telegram conditional registration');
  });
});
