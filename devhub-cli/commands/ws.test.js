'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

/**
 * Seed the test DB with required tables.
 */
function seedTestData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      progress REAL DEFAULT 0, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_workspaces (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      repo_root TEXT NOT NULL, workspace_path TEXT NOT NULL,
      worktree_path TEXT, base_branch TEXT NOT NULL,
      base_commit TEXT NOT NULL DEFAULT '', branch_name TEXT,
      status TEXT NOT NULL DEFAULT 'planned', current_task_id TEXT,
      observed_branch TEXT, observed_head TEXT, observed_dirty TEXT,
      last_error TEXT, recovery_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id TEXT PRIMARY KEY, workspace_id TEXT, agent_id TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_artifacts (
      artifact_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
      phase TEXT NOT NULL, kind TEXT NOT NULL, producer TEXT NOT NULL,
      summary TEXT NOT NULL, evidence_ref TEXT NOT NULL, observed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.pragma('foreign_keys = OFF');
  // agent_artifacts is append-only (trigger blocks DELETE)
  db.exec('DROP TABLE IF EXISTS agent_artifacts');
  db.exec(`
    CREATE TABLE agent_artifacts (
      artifact_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
      phase TEXT NOT NULL, kind TEXT NOT NULL, producer TEXT NOT NULL,
      summary TEXT NOT NULL, evidence_ref TEXT NOT NULL, observed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.prepare('DELETE FROM agent_runs').run();
  db.prepare('DELETE FROM agent_workspaces').run();
  db.prepare('DELETE FROM projects').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

/**
 * Seed a workspace with optional runs and artifacts.
 */
function seedWorkspace(ws, runs = [], artifacts = []) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)"
  ).run(ws.project_id || 'proj-1', 'Test Project');

  db.prepare(
    `INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, base_commit, branch_name, status, current_task_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ws.id,
    ws.project_id || 'proj-1',
    ws.agent_id || 'agent-1',
    ws.repo_root || '/tmp/repo',
    ws.workspace_path || '/tmp/ws',
    ws.base_branch || 'main',
    ws.base_commit || 'abc123',
    ws.branch_name || null,
    ws.status || 'active',
    ws.current_task_id || null,
    ws.updated_at || now,
  );

  for (const r of runs) {
    db.prepare(
      `INSERT INTO agent_runs (run_id, workspace_id, agent_id, requested_base_ref, baseline_commit, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.id,
      r.workspace_id || ws.id,
      r.agent_id || ws.agent_id || 'agent-1',
      'main',
      'abc123',
      r.status || 'succeeded',
      r.created_at || now,
    );

    const matchingArtifacts = artifacts.filter(a => a.run_id === r.id);
    for (const a of matchingArtifacts) {
      db.prepare(
        `INSERT INTO agent_artifacts (artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        a.id,
        a.run_id,
        a.seq || 1,
        a.phase || 'execute',
        a.kind || 'git.commit',
        a.producer || 'executor',
        a.summary || '',
        a.evidence_ref || '{}',
        a.observed_at || now,
        a.created_at || now,
      );
    }
  }

  closeDb();
}

// Clean slate before all tests
seedTestData();

describe('devhub ws command', () => {
  describe('missing ID argument', () => {
    it('exits with code 2 and stderr contains "ID required"', () => {
      const result = spawnSync('node', [CLI, 'ws'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/ID required/i);
    });
  });

  describe('workspace found — TTY output', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows formatted sections and exits 0', () => {
      seedWorkspace({
        id: 'ws-tty-1',
        agent_id: 'agent-alpha',
        branch_name: 'feature/auth',
        status: 'active',
        current_task_id: 'task-1',
      });

      const result = spawnSync('node', [CLI, 'ws', 'ws-tty-1'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/ws-tty-1/);
      expect(result.stdout).toMatch(/agent-alpha/);
      expect(result.stdout).toMatch(/active/);
      expect(result.stdout).toMatch(/feature\/auth/);
      expect(result.stdout).toMatch(/task-1/);
    });

    it('includes ANSI escape codes in TTY mode', () => {
      seedWorkspace({ id: 'ws-ansi-1' });

      const result = spawnSync('node', [CLI, 'ws', 'ws-ansi-1'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\x1b\[/);
    });
  });

  describe('workspace found — non-TTY output', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows key=value pairs and exits 0', () => {
      seedWorkspace({
        id: 'ws-plain-1',
        agent_id: 'agent-beta',
        branch_name: 'main',
        status: 'completed',
        current_task_id: 'task-2',
      });

      const result = spawnSync('node', [CLI, 'ws', 'ws-plain-1'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/workspace_id=ws-plain-1/);
      expect(result.stdout).toMatch(/agent_id=agent-beta/);
      expect(result.stdout).toMatch(/status=completed/);
      expect(result.stdout).toMatch(/branch=main/);
      expect(result.stdout).toMatch(/current_task=task-2/);
    });

    it('contains no ANSI escape sequences', () => {
      seedWorkspace({ id: 'ws-no-ansi' });

      const result = spawnSync('node', [CLI, 'ws', 'ws-no-ansi'], { encoding: 'utf8' });
      expect(result.stdout).not.toMatch(/\x1b\[/);
    });
  });

  describe('workspace not found', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('exits with code 1 and stderr contains "Workspace not found"', () => {
      const result = spawnSync('node', [CLI, 'ws', 'nonexistent-ws'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Workspace not found/i);
    });
  });

  describe('workspace with no runs', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows latest_run=none and latest_artifact=none', () => {
      seedWorkspace({ id: 'ws-no-runs', agent_id: 'agent-x' });

      const result = spawnSync('node', [CLI, 'ws', 'ws-no-runs'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/latest_run=none/i);
      expect(result.stdout).toMatch(/latest_artifact=none/i);
    });
  });

  describe('workspace with runs and artifacts', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows latest run status and artifact kind', () => {
      const now = new Date().toISOString();
      seedWorkspace(
        { id: 'ws-with-runs', agent_id: 'agent-y' },
        [
          { id: 'run-1', workspace_id: 'ws-with-runs', status: 'succeeded', created_at: now },
          { id: 'run-2', workspace_id: 'ws-with-runs', status: 'failed', created_at: new Date(Date.now() + 1000).toISOString() },
        ],
        [
          { id: 'art-1', run_id: 'run-1', kind: 'git.commit' },
          { id: 'art-2', run_id: 'run-2', kind: 'test.result' },
        ],
      );

      const result = spawnSync('node', [CLI, 'ws', 'ws-with-runs'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      // run-2 is latest (later created_at)
      expect(result.stdout).toMatch(/failed/);
      expect(result.stdout).toMatch(/test\.result/);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'ws', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/ws/i);
    });
  });
});
