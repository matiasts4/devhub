/**
 * Integration test for the official MCP tool catalog.
 *
 * This is intentionally strict: the workspace tools included below are the current supported
 * DevHub MCP surface. If the product adds/removes tools, update this snapshot
 * together with README/docs so clients do not drift from the real server.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Tool Catalog', () => {
  let harness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('exposes the official DevHub MCP tools', async () => {
    const tools = await harness.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual(
      [
        'add_task_comment',
        'append_agent_artifact',
        'bulk_create_milestones',
        'bulk_create_tasks',
        'claim_next_task',
        'complete_agent_run',
        'create_milestone',
        'create_project',
        'create_agent_run',
        'create_agent_workspace',
        'create_task',
        'delete_project',
        'get_dashboard',
        'get_execution_queue',
        'get_agent_run',
        'get_next_task',
        'get_project',
        'get_project_context',
        'get_agent_workspace',
        'get_workspace_evidence',
        'heartbeat_agent',
        'list_agent_artifacts',
        'list_agent_runs',
        'list_milestones',
        'list_projects',
        'list_tasks',
        'list_agent_workspaces',
        'prepare_agent_workspace',
        'release_task',
        'register_agent',
        'renew_task_lease',
        'unregister_agent',
        'update_agent_status',
        'report_agent_workspace',
        'update_agent_workspace',
        'update_milestone',
        'update_project',
        'update_task',
      ].sort()
    );
  });
});
