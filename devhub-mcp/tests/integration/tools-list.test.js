/**
 * Integration test for the official MCP tool catalog.
 *
 * This is intentionally strict: the workspace tools included below are the current supported
 * DevHub MCP surface. If the product adds/removes tools, update this snapshot
 * together with README/docs so clients do not drift from the real server.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(__dirname, '..', '..', 'README.md');

const SUPPORTED_TOOL_NAMES = [
  'add_task_comment',
  'append_agent_artifact',
  'bulk_create_milestones',
  'bulk_create_tasks',
  'claim_next_task',
  'complete_agent_run',
  'create_agent_run',
  'create_agent_workspace',
  'create_milestone',
  'create_project',
  'create_task',
  'delete_project',
  'dismiss_inbox_item',
  'get_execution_queue',
  'get_agent_run',
  'get_agent_workspace',
  'get_project',
  'get_project_context',
  'get_workspace_evidence',
  'list_agent_artifacts',
  'list_agent_runs',
  'list_agent_workspaces',
  'list_milestones',
  'list_operator_inbox',
  'list_projects',
  'list_tasks',
  'prepare_agent_workspace',
  'release_task',
  'renew_task_lease',
  'request_supervisor_approval',
  'report_agent_workspace',
  'team_tell',
  'update_agent_workspace',
  'update_milestone',
  'update_project',
  'update_task',
];

const UNSUPPORTED_TOOL_NAMES = [
  'record_telegram_adapter_intent',
  'record_telegram_delivery',
  'set_telegram_subscription',
  'respond_telegram_approval',
  'get_telegram_channel_snapshot',
  'get_dashboard',
  'get_next_task',
  'register_agent',
  'heartbeat_agent',
  'unregister_agent',
  'update_agent_status',
];

function extractReadmeToolNames(markdown) {
  return [
    ...markdown.matchAll(/^\| `([^`]+)` \| (crud|portable-contract|external-integration) \|/gm),
  ].map((match) => match[1]);
}

function extractContractTable(markdown) {
  return (
    markdown.match(
      /\| Tool \| Category \| CLI Equivalent \| Notes \|[\s\S]*?(?=\n### |\n---|$)/
    )?.[0] || ''
  );
}

function extractSection(markdown, heading) {
  const startMarker = `## ${heading}`;
  const startIndex = markdown.indexOf(startMarker);
  if (startIndex === -1) return '';

  const nextHeadingIndex = markdown.indexOf('\n## ', startIndex + startMarker.length);
  return markdown.slice(startIndex, nextHeadingIndex === -1 ? undefined : nextHeadingIndex);
}

async function listToolNames(env) {
  const harness = await createTestHarness({ env });
  await harness.initialize();
  try {
    return (await harness.listTools()).map((tool) => tool.name).sort();
  } finally {
    await harness.cleanup();
  }
}

describe('MCP Tool Catalog', () => {
  it('exposes the official DevHub MCP tools', async () => {
    const names = await listToolNames({ TELEGRAM_BOT_TOKEN: '' });

    expect(names).toEqual([...SUPPORTED_TOOL_NAMES].sort());
    expect(names).not.toEqual(expect.arrayContaining(UNSUPPORTED_TOOL_NAMES));
  });

  it('keeps the supported catalog stable when TELEGRAM_BOT_TOKEN is set', async () => {
    const names = await listToolNames({ TELEGRAM_BOT_TOKEN: 'test-token' });

    expect(names).toEqual([...SUPPORTED_TOOL_NAMES].sort());
    expect(names).not.toEqual(expect.arrayContaining(UNSUPPORTED_TOOL_NAMES));
  });

  it('documents the same supported MCP contract in the README', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    const supportedContractSection = extractSection(readme, 'Supported MCP Contract (36 tools)');
    const contractTable = extractContractTable(supportedContractSection);

    expect(readme).toContain('Supported MCP Contract (36 tools)');
    expect(extractReadmeToolNames(contractTable).sort()).toEqual([...SUPPORTED_TOOL_NAMES].sort());

    for (const toolName of UNSUPPORTED_TOOL_NAMES) {
      expect(contractTable).not.toContain(`\`${toolName}\``);
    }
  });
});
