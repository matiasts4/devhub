'use strict';
/**
 * @module artifacts.test
 * TDD tests for src/lib/db/artifacts.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  listAgentArtifacts,
  getLatestAgentArtifactForRun,
  appendAgentArtifact,
} = require('./artifacts');

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  // Seed workspace (FK required by agent_runs)
  db.prepare(
    `INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('ws-001', 'proj-1', 'agent-1', '/tmp', '/tmp/ws', 'main', 'planned');
  // Seed a minimal agent_run so FK constraints are satisfied
  db.prepare(
    `INSERT INTO agent_runs (run_id, workspace_id, agent_id, requested_base_ref, baseline_commit, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('run-001', 'ws-001', 'agent-1', 'main', 'abc123', 'running');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// listAgentArtifacts
// ---------------------------------------------------------------------------

describe('listAgentArtifacts', () => {
  it('returns empty array when no artifacts exist for run', () => {
    const result = listAgentArtifacts(db, 'run-001');
    expect(result).toEqual([]);
  });

  it('returns artifacts ordered by seq ASC', () => {
    const base = {
      run_id: 'run-001',
      phase: 'execute',
      kind: 'command.exec',
      producer: 'executor',
      summary: 'test summary',
      evidence_ref: JSON.stringify({ kind: 'git.commit', locator: 'abc' }),
    };
    appendAgentArtifact(db, { ...base, seq: 1 });
    appendAgentArtifact(db, { ...base, seq: 2 });
    const result = listAgentArtifacts(db, 'run-001');
    expect(result).toHaveLength(2);
    expect(result[0].seq).toBe(1);
    expect(result[1].seq).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getLatestAgentArtifactForRun
// ---------------------------------------------------------------------------

describe('getLatestAgentArtifactForRun', () => {
  it('returns null when no artifacts exist', () => {
    const result = getLatestAgentArtifactForRun(db, 'run-001');
    expect(result).toBeNull();
  });

  it('returns the artifact with highest seq', () => {
    const base = {
      run_id: 'run-001',
      phase: 'execute',
      kind: 'command.exec',
      producer: 'executor',
      summary: 'test summary',
      evidence_ref: JSON.stringify({ kind: 'git.commit', locator: 'abc' }),
    };
    appendAgentArtifact(db, { ...base, seq: 1 });
    appendAgentArtifact(db, { ...base, seq: 2 });
    const result = getLatestAgentArtifactForRun(db, 'run-001');
    expect(result).not.toBeNull();
    expect(result.seq).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// appendAgentArtifact
// ---------------------------------------------------------------------------

describe('appendAgentArtifact', () => {
  const validInput = {
    run_id: 'run-001',
    phase: 'execute',
    kind: 'command.exec',
    producer: 'executor',
    summary: 'ran build step',
    evidence_ref: JSON.stringify({ kind: 'git.commit', locator: 'deadbeef' }),
  };

  it('inserts and returns artifact with correct fields', () => {
    const result = appendAgentArtifact(db, validInput);
    expect(result).not.toBeNull();
    expect(result.run_id).toBe('run-001');
    expect(result.phase).toBe('execute');
    expect(result.kind).toBe('command.exec');
    expect(result.producer).toBe('executor');
    expect(result.summary).toBe('ran build step');
  });

  it('auto-increments seq when not provided', () => {
    const a1 = appendAgentArtifact(db, validInput);
    const a2 = appendAgentArtifact(db, validInput);
    expect(a2.seq).toBe(a1.seq + 1);
  });

  it('throws if run_id does not exist', () => {
    expect(() => appendAgentArtifact(db, { ...validInput, run_id: 'nonexistent-run' })).toThrow();
  });

  it('throws on invalid phase', () => {
    expect(() => appendAgentArtifact(db, { ...validInput, phase: 'invalid-phase' })).toThrow();
  });

  it('accepts db-first calling convention (db, input)', () => {
    const result = appendAgentArtifact(db, validInput);
    expect(result.run_id).toBe('run-001');
  });
});
