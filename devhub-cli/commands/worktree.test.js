'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const { ensureAllSchema } = require('../../src/lib/db/schema');
const { createTempDb, cleanupDb, CLI } = require('../tests/fixtures/seed-factory');

let dbPath;

function runCli(args, opts = {}) {
  const { spawnSync } = require('child_process');
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath, NODE_ENV: 'test', ...(opts.env || {}) },
  });
}

function seedWorkspace(workspace = {}) {
  const db = new Database(dbPath);
  try {
    ensureAllSchema(db);
    db.prepare(
      "INSERT OR REPLACE INTO projects (id, user_id, name, status) VALUES ('proj-worktree', 'user-1', 'Worktree Project', 'active')"
    ).run();
    db.prepare(
      `INSERT OR REPLACE INTO agent_workspaces (
        id, project_id, agent_id, repo_root, workspace_path, worktree_path,
        base_branch, branch_name, observed_branch, observed_head, status
      ) VALUES (?, 'proj-worktree', 'agent-1', ?, ?, ?, 'main', ?, ?, ?, ?)`
    ).run(
      workspace.id || 'ws-1',
      workspace.repo_root || path.resolve(__dirname, '..'),
      workspace.workspace_path || '/tmp/workspace',
      workspace.worktree_path || '/tmp/worktree',
      workspace.branch_name || 'devhub/swarm/launch-1/director',
      workspace.observed_branch || 'devhub/swarm/launch-1/director',
      workspace.observed_head || 'abc123',
      workspace.status || 'active'
    );
  } finally {
    db.close();
  }
}

function seedWorkspaceDiagnostic(workspace = {}) {
  const db = new Database(dbPath);
  try {
    ensureAllSchema(db);
    db.prepare(
      "INSERT OR REPLACE INTO projects (id, user_id, name, status) VALUES ('proj-diagnostic', 'user-1', 'Diagnostic Project', 'active')"
    ).run();
    db.prepare(
      `INSERT OR REPLACE INTO agent_workspaces (
        id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root, workspace_path, worktree_path,
        base_branch, base_commit, branch_name, observed_branch, observed_head, status, created_at, updated_at
      ) VALUES (?, 'proj-diagnostic', 'agent-worker', 'task-1', ?, ?, ?, ?, 'main', 'HEAD', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      workspace.id || 'ws-diagnostic',
      workspace.run_id_or_session_id || 'session-diagnostic',
      workspace.repo_root || path.resolve(__dirname, '..'),
      workspace.workspace_path || '/tmp/workspace-diagnostic',
      workspace.worktree_path || '/tmp/worktree-diagnostic',
      workspace.branch_name || 'feat/diagnostic',
      workspace.observed_branch || 'feat/diagnostic',
      workspace.observed_head || 'abc123',
      workspace.status || 'active'
    );

    db.prepare(
      `INSERT OR REPLACE INTO agent_runs (
        run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status, started_at, created_at, updated_at
      ) VALUES (?, ?, 'task-1', 'agent-worker', 'HEAD', 'HEAD', ?, datetime('now'), datetime('now'), datetime('now'))`
    ).run(
      workspace.run_id || 'run-diagnostic',
      workspace.id || 'ws-diagnostic',
      workspace.run_status || 'running'
    );

    db.prepare(
      `INSERT OR REPLACE INTO agent_artifacts (
        artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at, created_at
      ) VALUES (?, ?, 1, 'execute', 'decision.note', 'executor', ?, 'evidence://artifact/1', datetime('now'), datetime('now'))`
    ).run(
      workspace.artifact_id || 'artifact-diagnostic',
      workspace.run_id || 'run-diagnostic',
      workspace.artifact_summary || 'Artifact summary'
    );

    if (workspace.session !== false) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_hub_sessions (
          id, project_id, title, agent_model, status, visibility, opencode_session_id, directory, created_at, updated_at
        ) VALUES (?, 'proj-diagnostic', 'Diagnostic Session', 'opencode', ?, 'visible', ?, ?, datetime('now'), datetime('now'))`
      ).run(
        workspace.run_id_or_session_id || 'session-diagnostic',
        workspace.session_status || 'active',
        Object.prototype.hasOwnProperty.call(workspace, 'opencode_session_id')
          ? workspace.opencode_session_id
          : 'oc-diagnostic',
        workspace.worktree_path || '/tmp/worktree-diagnostic'
      );
    }
  } finally {
    db.close();
  }
}

describe('worktree.js', () => {
  beforeEach(() => {
    dbPath = createTempDb();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  it('should export worktree command', () => {
    const worktreeCommand = require('./worktree');
    expect(typeof worktreeCommand).toBe('function');
  });

  it('lists worktrees via schema-backed fields', () => {
    seedWorkspace({ id: 'ws-list-1', worktree_path: '/tmp/wt-list-1' });

    const result = runCli(['worktree', 'list', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspace: expect.objectContaining({ id: 'ws-list-1', worktree_path: '/tmp/wt-list-1' }),
        }),
      ])
    );
  });

  it('requires workspace id for clean', () => {
    const result = runCli(['worktree', 'clean', '--force']);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Workspace ID required/);
  });

  it('reports durable evidence summary and orphaned binding state in status json', () => {
    seedWorkspaceDiagnostic({
      id: 'ws-orphaned',
      worktree_path: '/tmp/wt-orphaned',
      status: 'orphaned',
      run_id: 'run-orphaned',
      run_id_or_session_id: 'session-orphaned',
      session: false,
    });

    const result = runCli(['worktree', 'status', 'ws-orphaned', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual(
      expect.objectContaining({
        workspace: expect.objectContaining({ id: 'ws-orphaned', status: 'orphaned' }),
        latest_run: expect.objectContaining({ run_id: 'run-orphaned' }),
        latest_artifact: expect.objectContaining({ artifact_id: 'artifact-diagnostic' }),
        session_binding: expect.objectContaining({
          classification: 'orphaned',
          reason: 'binding_orphaned',
        }),
      })
    );
  });

  it('lists canonical worktree diagnostics through shared readers', () => {
    seedWorkspaceDiagnostic({
      id: 'ws-stale',
      worktree_path: '/tmp/wt-stale',
      status: 'active',
      run_id: 'run-stale',
      run_id_or_session_id: 'session-stale',
      session_status: 'active',
      opencode_session_id: null,
    });

    const result = runCli(['worktree', 'list', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspace: expect.objectContaining({ id: 'ws-stale' }),
          session_binding: expect.objectContaining({
            classification: 'stale',
            reason: 'binding_stale',
          }),
        }),
      ])
    );
  });
});
