'use strict';
/**
 * @module workspaces.test
 * TDD tests for src/lib/db/workspaces.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  buildWorkspaceIntentId,
  buildPrepareAgentWorkspaceAck,
  prepareAgentWorkspaceLease,
} = require('./workspaces');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// buildWorkspaceIntentId
// ---------------------------------------------------------------------------

describe('buildWorkspaceIntentId', () => {
  it('combines taskId and agentId with workspace- prefix', () => {
    expect(buildWorkspaceIntentId('task-1', 'agent-1')).toBe('workspace-task-1-agent-1');
  });

  it('handles missing agentId', () => {
    expect(typeof buildWorkspaceIntentId('task-1')).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// buildPrepareAgentWorkspaceAck
// ---------------------------------------------------------------------------

describe('buildPrepareAgentWorkspaceAck', () => {
  it('returns an object with workspace_id and status fields', () => {
    const ack = buildPrepareAgentWorkspaceAck({ id: 'ws-1', status: 'ready' });
    expect(ack).not.toBeNull();
    expect(ack.workspace_id).toBe('ws-1');
  });
});

// ---------------------------------------------------------------------------
// prepareAgentWorkspaceLease
// ---------------------------------------------------------------------------

describe('prepareAgentWorkspaceLease', () => {
  it('creates a new workspace when none exists for task+agent', () => {
    const result = prepareAgentWorkspaceLease(db, {
      agent_id: 'agent-abc',
      task_id: 'task-99',
      project_id: 'proj-1',
      base_branch: 'main',
      workspace_path: '/tmp/ws',
      repo_root: '/tmp/repo',
      correlation_id: 'corr-test-1',
    });
    expect(result).not.toBeNull();
    expect(result.created).toBe(true);
    expect(result.workspace.agent_id).toBe('agent-abc');
    expect(result.workspace.status).toBeDefined();
  });
});
