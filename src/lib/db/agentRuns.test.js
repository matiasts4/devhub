'use strict';
/**
 * @module agentRuns.test
 * TDD tests for src/lib/db/agentRuns.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema, AGENT_WORKSPACE_BASE_COMMIT } = require('./core');
const {
  listAgentRuns,
  getLatestAgentRunForTask,
  createAgentRun,
  updateAgentRunTerminal,
  buildMissionBindingResult,
} = require('./agentRuns');

// Helper: create a workspace row (required FK for agent_runs)
function insertWorkspace(db, id = 'ws-1') {
  db.prepare(
    `INSERT INTO agent_workspaces (id, project_id, agent_id, current_task_id, repo_root, workspace_path, base_branch, base_commit, status, updated_at)
     VALUES (?, 'proj-1', 'agent-1', 'task-1', '/tmp', '/tmp/ws', 'main', ?, 'planned', datetime('now'))`
  ).run(id, AGENT_WORKSPACE_BASE_COMMIT);
}

// Helper: create a minimal agent run
function insertRun(db, runId, wsId = 'ws-1', taskId = 'task-1') {
  db.prepare(
    `INSERT INTO agent_runs (run_id, workspace_id, agent_id, task_id, requested_base_ref, baseline_commit, status, started_at, created_at, updated_at)
     VALUES (?, ?, 'agent-1', ?, 'main', ?, 'planned', datetime('now'), datetime('now'), datetime('now'))`
  ).run(runId, wsId, taskId, AGENT_WORKSPACE_BASE_COMMIT);
}

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  insertWorkspace(db, 'ws-1');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// listAgentRuns
// ---------------------------------------------------------------------------

describe('listAgentRuns', () => {
  it('returns empty array when no runs', () => {
    const result = listAgentRuns(db, {});
    expect(result).toEqual([]);
  });

  it('returns runs filtered by workspace_id', () => {
    insertRun(db, 'run-1', 'ws-1');
    const result = listAgentRuns(db, { workspace_id: 'ws-1' });
    expect(result).toHaveLength(1);
    expect(result[0].run_id).toBe('run-1');
  });
});

// ---------------------------------------------------------------------------
// getLatestAgentRunForTask
// ---------------------------------------------------------------------------

describe('getLatestAgentRunForTask', () => {
  it('returns null when no runs for task', () => {
    const result = getLatestAgentRunForTask(db, 'task-missing');
    expect(result).toBeNull();
  });

  it('returns the latest run for a task', () => {
    insertRun(db, 'run-a', 'ws-1', 'task-1');
    const result = getLatestAgentRunForTask(db, 'task-1');
    expect(result).not.toBeNull();
    expect(result.run_id).toBe('run-a');
  });
});

// ---------------------------------------------------------------------------
// createAgentRun
// ---------------------------------------------------------------------------

describe('createAgentRun', () => {
  it('creates a run and returns it', () => {
    const run = createAgentRun(db, {
      workspace_id: 'ws-1',
      agent_id: 'agent-1',
      requested_base_ref: 'main',
      baseline_commit: AGENT_WORKSPACE_BASE_COMMIT,
      task_id: 'task-1',
    });
    expect(run).not.toBeNull();
    expect(run.workspace_id).toBe('ws-1');
    expect(run.status).toBe('planned');
  });

  it('throws if workspace_id is missing', () => {
    expect(() =>
      createAgentRun(db, {
        agent_id: 'agent-1',
        requested_base_ref: 'main',
        baseline_commit: AGENT_WORKSPACE_BASE_COMMIT,
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// updateAgentRunTerminal
// ---------------------------------------------------------------------------

describe('updateAgentRunTerminal', () => {
  it('updates run to succeeded status', () => {
    insertRun(db, 'run-t1');
    const updated = updateAgentRunTerminal(db, 'run-t1', { status: 'succeeded' });
    expect(updated.status).toBe('succeeded');
    expect(updated.completed_at).not.toBeNull();
  });

  it('throws for non-terminal status', () => {
    insertRun(db, 'run-t2');
    expect(() => updateAgentRunTerminal(db, 'run-t2', { status: 'running' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildMissionBindingResult
// ---------------------------------------------------------------------------

describe('buildMissionBindingResult', () => {
  it('builds a binding result with overrides applied', () => {
    const result = buildMissionBindingResult(
      { status: 'unbound', agent_id: 'a1' },
      { status: 'bound', run_id: 'r-1' }
    );
    expect(result.status).toBe('bound');
    expect(result.run_id).toBe('r-1');
    expect(result.agent_id).toBe('a1');
  });

  it('falls back to binding values when no overrides', () => {
    const result = buildMissionBindingResult({ status: 'unbound', agent_id: 'a2' });
    expect(result.status).toBe('unbound');
    expect(result.agent_id).toBe('a2');
  });
});
