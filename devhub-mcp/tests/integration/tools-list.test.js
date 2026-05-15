/**
 * Integration test for the official MCP tool catalog.
 *
 * This is intentionally strict: the 25 tools below are the current supported
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
        'release_task',
        'register_agent',
        'renew_task_lease',
        'unregister_agent',
        'update_agent_status',
        'update_milestone',
        'update_project',
        'update_task',
      ].sort()
    );
  });
});
