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
  reconcileAgentRuntimeSessionBinding,
} = require('./workspaces');

function seedProject(projectId = 'proj-1') {
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
    projectId,
    `Project ${projectId}`
  );
}

function seedWorkspace(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_workspaces (
      id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root,
      workspace_path, worktree_path, base_branch, base_commit, branch_name, status,
      observed_branch, observed_head, observed_dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id || 'ws-1',
    overrides.project_id || 'proj-1',
    overrides.agent_id || 'agent-1',
    overrides.current_task_id || 'task-1',
    overrides.run_id_or_session_id || 'session-1',
    overrides.repo_root || '/repo/devhub',
    overrides.workspace_path || 'workspace://proj-1/ws-1',
    overrides.worktree_path || '/repo/devhub/.devhub/worktrees/ws-1',
    overrides.base_branch || 'main',
    overrides.base_commit || 'HEAD',
    overrides.branch_name || 'feat/ws-1',
    overrides.status || 'active',
    overrides.observed_branch || 'feat/ws-1',
    overrides.observed_head || 'abc123',
    overrides.observed_dirty || 'clean'
  );
}

function seedRun(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.run_id || 'run-1',
    overrides.workspace_id || 'ws-1',
    overrides.task_id || 'task-1',
    overrides.agent_id || 'agent-1',
    overrides.requested_base_ref || 'HEAD',
    overrides.baseline_commit || 'HEAD',
    overrides.status || 'running'
  );
}

function seedSession(overrides = {}) {
  db.prepare(
    `INSERT INTO agent_hub_sessions (
      id, project_id, title, agent_model, status, visibility, opencode_session_id, directory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id || 'session-1',
    overrides.project_id || 'proj-1',
    overrides.title || 'Agent Session',
    overrides.agent_model || 'opencode',
    overrides.status || 'active',
    overrides.visibility || 'visible',
    Object.prototype.hasOwnProperty.call(overrides, 'opencode_session_id')
      ? overrides.opencode_session_id
      : null,
    overrides.directory || '/repo/devhub/.devhub/worktrees/ws-1'
  );
}

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

describe('reconcileAgentRuntimeSessionBinding', () => {
  it('persists a verified opencode session id only for the active canonical workspace/run/session chain', () => {
    seedProject();
    seedWorkspace();
    seedRun();
    seedSession();

    const result = reconcileAgentRuntimeSessionBinding(db, {
      session_id: 'session-1',
      workspace_id: 'ws-1',
      run_id: 'run-1',
      opencode_session_id: 'oc-real-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'reconciled',
        reason: 'binding_reconciled',
        session_id: 'session-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        opencode_session_id: 'oc-real-1',
      })
    );
    expect(
      db.prepare('SELECT opencode_session_id FROM agent_hub_sessions WHERE id = ?').get('session-1')
        .opencode_session_id
    ).toBe('oc-real-1');
  });

  it('keeps missing bindings missing when the canonical session row is absent', () => {
    seedProject();
    seedWorkspace();
    seedRun();

    const result = reconcileAgentRuntimeSessionBinding(db, {
      session_id: 'session-missing',
      workspace_id: 'ws-1',
      run_id: 'run-1',
      opencode_session_id: 'oc-missing',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'noop',
        reason: 'binding_missing',
        session_id: 'session-missing',
      })
    );
  });

  it('refuses mismatched workspace/run/session evidence without mutating the canonical session row', () => {
    seedProject();
    seedWorkspace({ id: 'ws-1', run_id_or_session_id: 'session-1' });
    seedWorkspace({
      id: 'ws-2',
      agent_id: 'agent-2',
      current_task_id: 'task-2',
      run_id_or_session_id: 'session-2',
      branch_name: 'feat/ws-2',
      observed_branch: 'feat/ws-2',
      observed_head: 'def456',
      worktree_path: '/repo/devhub/.devhub/worktrees/ws-2',
    });
    seedRun({ run_id: 'run-1', workspace_id: 'ws-1' });
    seedRun({ run_id: 'run-2', workspace_id: 'ws-2', agent_id: 'agent-2', task_id: 'task-2' });
    seedSession({ id: 'session-1', opencode_session_id: null });

    const result = reconcileAgentRuntimeSessionBinding(db, {
      session_id: 'session-1',
      workspace_id: 'ws-1',
      run_id: 'run-2',
      opencode_session_id: 'oc-crossed',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'noop',
        reason: 'binding_missing',
        session_id: 'session-1',
        workspace_id: 'ws-1',
        run_id: 'run-2',
      })
    );
    expect(
      db.prepare('SELECT opencode_session_id FROM agent_hub_sessions WHERE id = ?').get('session-1')
        .opencode_session_id
    ).toBeNull();
  });
});
