/**
 * @module agentEvents.test
 * Strict TDD tests for agentEvents.js — emit, query, dedup, validation.
 * Tasks 3.8 RED, 3.9 RED, then 3.10 GREEN.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// These will fail until agentEvents.js is created (RED phase)
const { emitAgentEvent, queryAgentEvents, VALID_EVENT_TYPES } = require('../agentEvents');
const { ensureRuntimeSchema } = require('../../db/localDb');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

function seedWorkspace(db, id = 'ws-ev-1', projectStatus = 'planned') {
  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-ev', 'Event Test')`);
  const cols = 'id, project_id, agent_id, repo_root, workspace_path, base_branch, status';
  const vals = `'${id}', 'proj-ev', 'agent-ev', '/repo', '/ws', 'main', '${projectStatus}'`;
  db.exec(`INSERT INTO agent_workspaces (${cols}) VALUES (${vals})`);
}

// ---------------------------------------------------------------------------
// 3.8 RED: emitAgentEvent — inserts row into agent_events
// ---------------------------------------------------------------------------

test('emitAgentEvent inserts a row into agent_events', () => {
  const db = createTestDb();
  seedWorkspace(db, 'ws-ev-1');

  const result = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    workspace_id: 'ws-ev-1',
  });

  assert.ok(result, 'emitAgentEvent must return a result');
  assert.ok(result.id, 'result must have an id');
  assert.equal(result.status, 201, 'status should be 201 for new events');

  const row = db.prepare('SELECT * FROM agent_events WHERE id = ?').get(result.id);
  assert.ok(row, 'row must exist in agent_events');
  assert.equal(row.agent_id, 'agent-1');
  assert.equal(row.event_type, 'agent_booted');
  assert.equal(row.workspace_id, 'ws-ev-1');
  db.close();
});

test('emitAgentEvent stores payload_json as string', () => {
  const db = createTestDb();

  const result = emitAgentEvent(db, {
    agent_id: 'agent-2',
    event_type: 'supervisor_action',
    payload: { action: 'scale_up', reason: 'queue_depth' },
  });

  const row = db.prepare('SELECT * FROM agent_events WHERE id = ?').get(result.id);
  assert.ok(row.payload_json, 'payload_json must be stored');
  const parsed = JSON.parse(row.payload_json);
  assert.equal(parsed.action, 'scale_up');
  db.close();
});

test('emitAgentEvent stores mission_id', () => {
  const db = createTestDb();

  const result = emitAgentEvent(db, {
    agent_id: 'agent-3',
    event_type: 'mission_joined',
    mission_id: 'mission-1',
  });

  const row = db.prepare('SELECT * FROM agent_events WHERE id = ?').get(result.id);
  assert.equal(row.mission_id, 'mission-1');
  db.close();
});

test('emitAgentEvent accepts task_completed with canonical linked payload metadata', () => {
  const db = createTestDb();
  seedWorkspace(db, 'ws-task-complete');

  const result = emitAgentEvent(db, {
    agent_id: 'agent-task-complete',
    event_type: 'task_completed',
    mission_id: 'mission-complete-1',
    workspace_id: 'ws-task-complete',
    payload: {
      task_id: 'task-complete-1',
      run_id: 'run-complete-1',
      artifact_id: 'artifact-complete-1',
      approval_checkpoint_key: 'approval-complete-1',
      delivery_status: 'binding_missing',
      summary: 'Worker finished implementation.',
    },
  });

  const row = db.prepare('SELECT * FROM agent_events WHERE id = ?').get(result.id);
  const parsed = JSON.parse(row.payload_json);

  assert.equal(row.event_type, 'task_completed');
  assert.equal(parsed.related_task_id, 'task-complete-1');
  assert.equal(parsed.related_workspace_id, 'ws-task-complete');
  assert.equal(parsed.related_run_id, 'run-complete-1');
  assert.equal(parsed.related_artifact_id, 'artifact-complete-1');
  assert.equal(parsed.related_approval_checkpoint_key, 'approval-complete-1');
  assert.equal(parsed.delivery_status, 'binding_missing');
  assert.equal(parsed.summary, 'Worker finished implementation.');
  db.close();
});

test('emitAgentEvent accepts handoff_ready with canonical linked payload metadata', () => {
  const db = createTestDb();
  seedWorkspace(db, 'ws-handoff-ready');

  const result = emitAgentEvent(db, {
    agent_id: 'agent-handoff-ready',
    event_type: 'handoff_ready',
    mission_id: 'mission-handoff-1',
    workspace_id: 'ws-handoff-ready',
    payload: {
      related_task_id: 'task-handoff-1',
      related_run_id: 'run-handoff-1',
      related_artifact_id: 'artifact-handoff-1',
      related_approval_checkpoint_key: 'approval-handoff-1',
      delivery_status: 'binding_missing',
      next_action: 'director_review',
      summary: 'Handoff package ready for director review.',
    },
  });

  const row = db.prepare('SELECT * FROM agent_events WHERE id = ?').get(result.id);
  const parsed = JSON.parse(row.payload_json);

  assert.equal(row.event_type, 'handoff_ready');
  assert.equal(parsed.related_task_id, 'task-handoff-1');
  assert.equal(parsed.related_workspace_id, 'ws-handoff-ready');
  assert.equal(parsed.related_run_id, 'run-handoff-1');
  assert.equal(parsed.related_artifact_id, 'artifact-handoff-1');
  assert.equal(parsed.related_approval_checkpoint_key, 'approval-handoff-1');
  assert.equal(parsed.delivery_status, 'binding_missing');
  assert.equal(parsed.next_action, 'director_review');
  db.close();
});

// ---------------------------------------------------------------------------
// 3.9 RED: emitAgentEvent — unknown type → 400, dedup within 5s
// ---------------------------------------------------------------------------

test('emitAgentEvent rejects unknown event_type with 400 status', () => {
  const db = createTestDb();

  const err = new Error('should not reach here');
  try {
    emitAgentEvent(db, {
      agent_id: 'agent-1',
      event_type: 'totally_invalid',
    });
    throw err;
  } catch (e) {
    assert.ok(
      e.message.includes('invalid') || e.message.includes('Invalid'),
      'error must mention invalid type'
    );
    assert.equal(e.status, 400, 'error status must be 400');
  }
  db.close();
});

test('emitAgentEvent rejects task_completed without mission-linked task context', () => {
  const db = createTestDb();

  try {
    emitAgentEvent(db, {
      agent_id: 'agent-invalid-task-complete',
      event_type: 'task_completed',
      mission_id: 'mission-invalid-task-complete',
      payload: {
        summary: 'Missing linked task id should fail.',
      },
    });
    assert.fail('emitAgentEvent should reject task_completed without related task id');
  } catch (error) {
    assert.equal(error.status, 400, 'error status must be 400');
    assert.match(error.message, /task context|related_task_id|task_id/i);
  }

  db.close();
});

test('emitAgentEvent deduplicates by client_event_id within 5s window', () => {
  const db = createTestDb();

  // First emit with client_event_id
  const first = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-123',
  });

  // Second emit with same client_event_id — should return existing
  const second = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-123',
  });

  assert.equal(second.id, first.id, 'dedup should return same event id');
  assert.equal(second.status, 200, 'dedup should return 200 status');
  db.close();
});

test('emitAgentEvent allows same client_event_id after 5s window', () => {
  const db = createTestDb();

  // First emit with client_event_id
  const first = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-old',
  });

  // Manually backdate the created_at to simulate 5s+ elapsed
  db.prepare(
    "UPDATE agent_events SET created_at = datetime('now', '-10 seconds') WHERE id = ?"
  ).run(first.id);

  // Second emit with same client_event_id — should create new since >5s
  const second = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-old',
  });

  assert.notEqual(second.id, first.id, 'after 5s window, new event should be created');
  assert.equal(second.status, 201, 'new event should return 201');
  db.close();
});

test('emitAgentEvent allows different client_event_ids', () => {
  const db = createTestDb();

  const first = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-aaa',
  });

  const second = emitAgentEvent(db, {
    agent_id: 'agent-1',
    event_type: 'agent_booted',
    client_event_id: 'client-evt-bbb',
  });

  assert.notEqual(second.id, first.id, 'different client_event_id should create new event');
  assert.equal(second.status, 201, 'new event should return 201');
  db.close();
});

// ---------------------------------------------------------------------------
// 3.10 GREEN: queryAgentEvents — filtering and capping
// ---------------------------------------------------------------------------

test('queryAgentEvents returns events ordered by created_at DESC', () => {
  const db = createTestDb();

  emitAgentEvent(db, { agent_id: 'agent-a', event_type: 'agent_booted' });
  emitAgentEvent(db, { agent_id: 'agent-b', event_type: 'agent_shutdown' });

  const events = queryAgentEvents(db, {});
  assert.ok(events.length >= 2, 'should return at least 2 events');
  // Most recent first
  assert.ok(events[0].created_at >= events[1].created_at, 'events should be ordered DESC');
  db.close();
});

test('queryAgentEvents filters by agent_id', () => {
  const db = createTestDb();

  emitAgentEvent(db, { agent_id: 'agent-x', event_type: 'agent_booted' });
  emitAgentEvent(db, { agent_id: 'agent-y', event_type: 'agent_shutdown' });

  const events = queryAgentEvents(db, { agent_id: 'agent-x' });
  assert.ok(events.length >= 1, 'should return at least 1 event');
  for (const ev of events) {
    assert.equal(ev.agent_id, 'agent-x', 'all events should belong to agent-x');
  }
  db.close();
});

test('queryAgentEvents filters by event type', () => {
  const db = createTestDb();

  emitAgentEvent(db, { agent_id: 'agent-1', event_type: 'agent_booted' });
  emitAgentEvent(db, { agent_id: 'agent-1', event_type: 'workspace_orphaned' });

  const events = queryAgentEvents(db, { type: 'agent_booted' });
  assert.ok(events.length >= 1, 'should return at least 1 event');
  for (const ev of events) {
    assert.equal(ev.event_type, 'agent_booted', 'all events should be agent_booted');
  }
  db.close();
});

test('queryAgentEvents filters by since timestamp', () => {
  const db = createTestDb();

  // Create an event and backdate it
  const oldEvent = emitAgentEvent(db, { agent_id: 'agent-1', event_type: 'agent_booted' });
  db.prepare("UPDATE agent_events SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(
    oldEvent.id
  );

  // Create a recent event
  emitAgentEvent(db, { agent_id: 'agent-1', event_type: 'agent_shutdown' });

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
  const events = queryAgentEvents(db, { since });
  // Should only include recent events
  for (const ev of events) {
    assert.ok(ev.created_at >= since, 'all events should be after since');
  }
  db.close();
});

test('queryAgentEvents caps results at 100 by default', () => {
  const db = createTestDb();

  // Insert more than 100 events
  for (let i = 0; i < 110; i++) {
    emitAgentEvent(db, { agent_id: `agent-${i}`, event_type: 'agent_booted' });
  }

  const events = queryAgentEvents(db, {});
  assert.ok(events.length <= 100, `should cap at 100, got ${events.length}`);
  db.close();
});

test('queryAgentEvents respects explicit limit parameter', () => {
  const db = createTestDb();

  for (let i = 0; i < 20; i++) {
    emitAgentEvent(db, { agent_id: `agent-limit-${i}`, event_type: 'agent_booted' });
  }

  const events = queryAgentEvents(db, { limit: 5 });
  assert.equal(events.length, 5, 'should return exactly 5 events');
  db.close();
});

test('VALID_EVENT_TYPES contains all expected types', () => {
  assert.ok(Array.isArray(VALID_EVENT_TYPES), 'VALID_EVENT_TYPES must be an array');
  const expected = [
    'agent_booted',
    'agent_shutdown',
    'workspace_orphaned',
    'quota_blocked',
    'supervisor_action',
    'mission_joined',
    'mission_left',
    'task_completed',
    'handoff_ready',
  ];
  for (const t of expected) {
    assert.ok(VALID_EVENT_TYPES.includes(t), `must include ${t}`);
  }
  assert.equal(VALID_EVENT_TYPES.length, expected.length, 'must have exactly the expected types');
});
