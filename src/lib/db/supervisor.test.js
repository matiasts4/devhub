'use strict';
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  buildSupervisorApprovalCheckpointKey,
  getSupervisorSnapshot,
  listSupervisorSnapshots,
  upsertSupervisorSnapshot,
  getSupervisorApprovalCheckpoint,
  listSupervisorApprovalCheckpoints,
  upsertSupervisorApprovalCheckpoint,
  getLatestTaskComment,
} = require('./supervisor');

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
// buildSupervisorApprovalCheckpointKey
// ---------------------------------------------------------------------------

describe('buildSupervisorApprovalCheckpointKey', () => {
  it('builds a key from task_id and reason_class', () => {
    const key = buildSupervisorApprovalCheckpointKey({ task_id: 't-1', reason_class: 'blocked' });
    expect(typeof key).toBe('string');
    expect(key).toContain('t-1');
    expect(key).toContain('blocked');
  });

  it('throws if task_id is missing', () => {
    expect(() => buildSupervisorApprovalCheckpointKey({ reason_class: 'blocked' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSupervisorSnapshot / upsertSupervisorSnapshot
// ---------------------------------------------------------------------------

describe('upsertSupervisorSnapshot', () => {
  it('creates a snapshot and retrieves it', () => {
    const snap = upsertSupervisorSnapshot(db, {
      task_id: 'task-s1',
      supervisor_state: 'idle',
    });
    expect(snap.task_id).toBe('task-s1');
    expect(snap.supervisor_state).toBe('idle');
  });

  it('upserts (updates) an existing snapshot', () => {
    upsertSupervisorSnapshot(db, { task_id: 'task-s2', supervisor_state: 'idle' });
    const updated = upsertSupervisorSnapshot(db, {
      task_id: 'task-s2',
      supervisor_state: 'awaiting_approval',
    });
    expect(updated.supervisor_state).toBe('awaiting_approval');
  });
});

describe('getSupervisorSnapshot', () => {
  it('returns null for unknown task', () => {
    expect(getSupervisorSnapshot(db, 'missing')).toBeNull();
  });
});

describe('listSupervisorSnapshots', () => {
  it('returns empty array when none', () => {
    expect(listSupervisorSnapshots(db, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSupervisorApprovalCheckpoint / upsertSupervisorApprovalCheckpoint
// ---------------------------------------------------------------------------

describe('upsertSupervisorApprovalCheckpoint', () => {
  it('creates a checkpoint with pending status', () => {
    const cp = upsertSupervisorApprovalCheckpoint(db, {
      task_id: 'task-cp1',
      reason_class: 'blocked',
      evidence_ref: 'ref://test',
    });
    expect(cp.task_id).toBe('task-cp1');
    expect(cp.status).toBe('pending');
  });
});

describe('getSupervisorApprovalCheckpoint', () => {
  it('returns null for unknown key', () => {
    expect(getSupervisorApprovalCheckpoint(db, 'no-such-key')).toBeNull();
  });
});

describe('listSupervisorApprovalCheckpoints', () => {
  it('returns empty array when none', () => {
    expect(listSupervisorApprovalCheckpoints(db, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getLatestTaskComment
// ---------------------------------------------------------------------------

describe('getLatestTaskComment', () => {
  it('returns null when no comments for task', () => {
    expect(getLatestTaskComment(db, 'task-no-comments')).toBeNull();
  });
});
