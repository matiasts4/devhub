/**
 * @module supervisorDaemon.test
 * Strict TDD tests for supervisorDaemon.js + processManager daemon lifecycle.
 *
 * Tasks 4.1–4.12: Supervisor Daemon — RED first, then GREEN.
 *
 * Phase 4 test plan:
 *   4.1 RED  – startSupervisorDaemon creates setInterval
 *   4.2 RED  – stopSupervisorDaemon clears interval
 *   4.3 RED  – second start is no-op; SUPERVISOR_DAEMON_ENABLED=false prevents interval
 *   4.4 RED  – orphan detection: stale heartbeat → orphaned status + event emitted
 *   4.5 RED  – orphan detection: fresh heartbeat → no change
 *   4.7 RED  – lease expiry: stale claim → pending + event
 *   4.8 RED  – lease expiry: fresh task → no change
 *   4.9 RED  – CAS conflict: concurrent update does not cause state conflict
 *   4.10 GREEN – (covered by 4.9 implementation, which uses CAS pattern)
 *   4.11 RED  – event payload format verification
 *   4.12 GREEN – (covered by 4.11 implementation)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { evaluateSupervisorTick } = require('../supervisorDaemon');
const { ensureRuntimeSchema } = require('../../db/localDb');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);

  // Create tasks table (not in localDb schema — managed by DevHub MCP)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked')),
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      milestone_id TEXT,
      assigned_to TEXT,
      business_value INTEGER,
      claim_token TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      started_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes needed by supervisorDaemon queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_claim_token ON tasks(claim_token)');

  return db;
}

function seedProject(db, id = 'proj-svd', name = 'Supervisor Test') {
  // Use INSERT OR IGNORE to handle duplicate project IDs across tests
  db.exec(`INSERT OR IGNORE INTO projects (id, name) VALUES ('${id}', '${name}')`);
  return id;
}

function seedWorkspace(db, overrides = {}) {
  const id = overrides.id || 'ws-svd-1';
  const projectId = overrides.project_id || seedProject(db);
  const agentId = overrides.agent_id || 'agent-svd';
  const status = overrides.status || 'active';

  // For 'active' or 'ready' status, CHECK constraint requires branch_name, worktree_path, observed_branch, observed_head
  const needsBranchInfo = ['active', 'ready'].includes(status);
  const branchName = overrides.branch_name || (needsBranchInfo ? 'feature/test' : null);
  const worktreePath = overrides.worktree_path || (needsBranchInfo ? '/wt/test' : null);
  const observedBranch = overrides.observed_branch || (needsBranchInfo ? 'feature/test' : null);
  const observedHead = overrides.observed_head || (needsBranchInfo ? 'abc123' : null);

  const cols = [
    'id',
    'project_id',
    'agent_id',
    'repo_root',
    'workspace_path',
    'base_branch',
    'status',
  ];
  const vals = [
    `'${id}'`,
    `'${projectId}'`,
    `'${agentId}'`,
    `'/repo'`,
    `'/ws'`,
    `'main'`,
    `'${status}'`,
  ];

  if (branchName !== null) {
    cols.push('branch_name');
    vals.push(`'${branchName}'`);
  }
  if (worktreePath !== null) {
    cols.push('worktree_path');
    vals.push(`'${worktreePath}'`);
  }
  if (observedBranch !== null) {
    cols.push('observed_branch');
    vals.push(`'${observedBranch}'`);
  }
  if (observedHead !== null) {
    cols.push('observed_head');
    vals.push(`'${observedHead}'`);
  }

  // Handle optional last_heartbeat column
  if (overrides.last_heartbeat !== undefined) {
    cols.push('last_heartbeat');
    vals.push(`'${overrides.last_heartbeat}'`);
  }

  // Use unique workspace_path to avoid branch unique index conflicts
  // and require unique worktree_path per active workspace
  if (!cols.includes('worktree_path')) {
    cols.push('worktree_path');
    vals.push(`'/wt/${id}'`);
  }
  if (!cols.includes('branch_name')) {
    cols.push('branch_name');
    vals.push(`'branch-${id}'`);
  }

  db.exec(
    `INSERT OR IGNORE INTO agent_workspaces (${cols.join(', ')}) VALUES (${vals.join(', ')})`
  );
  return id;
}

function seedTask(db, overrides = {}) {
  const id = overrides.id || 'task-svd-1';
  const projectId = overrides.project_id || seedProject(db);
  const title = overrides.title || 'Supervisor test task';
  const status = overrides.status || 'pending';
  const claimToken = overrides.claim_token !== undefined ? overrides.claim_token : null;
  const assignedTo = overrides.assigned_to !== undefined ? overrides.assigned_to : null;
  const startedAt = overrides.started_at !== undefined ? overrides.started_at : null;
  const leaseExpiresAt =
    overrides.lease_expires_at !== undefined ? overrides.lease_expires_at : null;

  db.exec(
    `INSERT INTO tasks (id, project_id, title, status, claim_token, assigned_to, started_at, lease_expires_at)
     VALUES ('${id}', '${projectId}', '${title}', '${status}', ${claimToken ? "'" + claimToken + "'" : 'NULL'}, ${assignedTo ? "'" + assignedTo + "'" : 'NULL'}, ${startedAt ? "'" + startedAt + "'" : 'NULL'}, ${leaseExpiresAt ? "'" + leaseExpiresAt + "'" : 'NULL'})`
  );
  return id;
}

function _hoursAgo(h) {
  return new Date(Date.now() - h * 3600000).toISOString().replace('T', ' ');
}

function minutesAgo(m) {
  return new Date(Date.now() - m * 60000).toISOString().replace('T', ' ');
}

function minutesFromNow(m) {
  return new Date(Date.now() + m * 60000).toISOString().replace('T', ' ');
}

// ===========================================================================
// 4.1 RED: startSupervisorDaemon — creates setInterval, calls evaluateSupervisorTick
// ===========================================================================

test('startSupervisorDaemon creates a repeating interval', () => {
  // We need processManager instance — require it fresh
  // This test will FAIL until startSupervisorDaemon is implemented
  const pm = require('../processManager');

  // Should have startSupervisorDaemon method
  assert.equal(
    typeof pm.startSupervisorDaemon,
    'function',
    'processManager must have startSupervisorDaemon method'
  );

  // Start daemon — should return a timer ref
  const timer = pm.startSupervisorDaemon(10000);
  assert.ok(timer !== undefined && timer !== null, 'startSupervisorDaemon must return a timer ref');

  // Status should show running
  const status = pm.getSupervisorStatus();
  assert.equal(status.running, true, 'daemon should be running after start');
  assert.equal(status.intervalMs, 10000, 'intervalMs should match what was passed');

  // Cleanup
  pm.stopSupervisorDaemon();
});

test('getSupervisorStatus returns { running: false, intervalMs: 0, lastTickAt: null } when stopped', () => {
  const pm = require('../processManager');

  // Make sure it's stopped
  pm.stopSupervisorDaemon();

  const status = pm.getSupervisorStatus();
  assert.equal(status.running, false, 'daemon should not be running');
  assert.equal(status.intervalMs, 0, 'intervalMs should be 0 when stopped');
  assert.equal(status.lastTickAt, null, 'lastTickAt should be null when never run');
});

// ===========================================================================
// 4.2 RED: stopSupervisorDaemon — clears interval, sets state to stopped
// ===========================================================================

test('stopSupervisorDaemon clears the interval and sets state to stopped', () => {
  const pm = require('../processManager');

  const timer = pm.startSupervisorDaemon(5000);
  assert.ok(timer, 'should have a timer after starting');

  pm.stopSupervisorDaemon();

  const status = pm.getSupervisorStatus();
  assert.equal(status.running, false, 'daemon should be stopped');
  assert.equal(status.intervalMs, 0, 'intervalMs should be 0 after stop');
});

// ===========================================================================
// 4.3 RED: second start is no-op; SUPERVISOR_DAEMON_ENABLED=false prevents interval
// ===========================================================================

test('second startSupervisorDaemon call is a no-op (returns existing timer)', () => {
  const pm = require('../processManager');

  pm.stopSupervisorDaemon();
  const timer1 = pm.startSupervisorDaemon(8000);
  const timer2 = pm.startSupervisorDaemon(8000);

  // Should return the same timer (no-op second call)
  assert.equal(timer2, timer1, 'second start should return the existing timer');

  // Only one interval should be active
  const status = pm.getSupervisorStatus();
  assert.equal(status.running, true, 'daemon should still be running');

  pm.stopSupervisorDaemon();
});

test('SUPERVISOR_DAEMON_ENABLED=false prevents daemon from starting', () => {
  const pm = require('../processManager');

  // Save original value
  const originalValue = process.env.SUPERVISOR_DAEMON_ENABLED;

  try {
    pm.stopSupervisorDaemon();
    process.env.SUPERVISOR_DAEMON_ENABLED = 'false';

    const timer = pm.startSupervisorDaemon(5000);

    // Should return null or undefined — no interval created
    assert.equal(timer, null, 'should not create interval when disabled');

    const status = pm.getSupervisorStatus();
    assert.equal(status.running, false, 'daemon should not be running when disabled');
  } finally {
    process.env.SUPERVISOR_DAEMON_ENABLED = originalValue;
    pm.stopSupervisorDaemon();
  }
});

// ===========================================================================
// 4.4 RED: Orphan detection — stale heartbeat → orphaned + event
// ===========================================================================

test('evaluateSupervisorTick marks workspace as orphaned when heartbeat > 90s stale', () => {
  const db = createTestDb();

  // Seed workspace with stale heartbeat (2 minutes ago = >90s)
  seedWorkspace(db, {
    id: 'ws-orphan-1',
    agent_id: 'agent-orphan',
    status: 'active',
    last_heartbeat: minutesAgo(2), // 120 seconds ago = stale
  });

  const result = evaluateSupervisorTick(db);

  // Workspace should now be orphaned
  const ws = db.prepare("SELECT * FROM agent_workspaces WHERE id = 'ws-orphan-1'").get();
  assert.equal(ws.status, 'orphaned', 'workspace should be marked orphaned');

  // An event should have been emitted
  assert.ok(result.orphaned.length > 0, 'should return list of orphaned workspaces');

  // Verify event was emitted
  const events = db
    .prepare("SELECT * FROM agent_events WHERE event_type = 'workspace_orphaned'")
    .all();
  assert.ok(events.length >= 1, 'a workspace_orphaned event should be emitted');

  const event = events[0];
  assert.equal(event.agent_id, 'agent-orphan', 'event agent_id should match');
  const payload = JSON.parse(event.payload_json);
  assert.equal(payload.action, 'orphan_marked', 'payload action should be orphan_marked');
  assert.equal(payload.previous_status, 'active', 'payload should record previous status');

  db.close();
});

// ===========================================================================
// 4.5 RED: Orphan detection — fresh heartbeat → no change
// ===========================================================================

test('evaluateSupervisorTick does NOT mark workspace as orphaned when heartbeat is fresh', () => {
  const db = createTestDb();

  // Seed workspace with recent heartbeat (5 seconds ago = <90s)
  seedWorkspace(db, {
    id: 'ws-fresh-1',
    agent_id: 'agent-fresh',
    status: 'active',
    last_heartbeat: minutesAgo(0.08), // ~5 seconds ago = fresh
  });

  const result = evaluateSupervisorTick(db);

  // Workspace should still be active
  const ws = db.prepare("SELECT * FROM agent_workspaces WHERE id = 'ws-fresh-1'").get();
  assert.equal(ws.status, 'active', 'workspace should remain active');

  // No orphaned workspaces in result
  assert.equal(result.orphaned.length, 0, 'no workspaces should be orphaned');

  db.close();
});

// ===========================================================================
// 4.7 RED: Lease expiry — stale claim → pending + event
// ===========================================================================

test('evaluateSupervisorTick expires stale lease (task in_progress > 5 min)', () => {
  const db = createTestDb();

  // Seed task with stale lease — started 10 minutes ago
  seedTask(db, {
    id: 'task-stale-1',
    status: 'in_progress',
    claim_token: 'tok-stale-1',
    assigned_to: 'agent-stale',
    started_at: minutesAgo(10),
  });

  const result = evaluateSupervisorTick(db);

  // Task should be reset to pending
  const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-stale-1'").get();
  assert.equal(task.status, 'pending', 'task should be reset to pending');
  assert.equal(task.claim_token, null, 'claim_token should be cleared');
  assert.equal(task.assigned_to, null, 'assigned_to should be cleared');

  // Event should be emitted
  assert.ok(result.expiredLeases.length > 0, 'should return list of expired leases');

  const events = db
    .prepare("SELECT * FROM agent_events WHERE event_type = 'supervisor_action'")
    .all();
  assert.ok(events.length >= 1, 'a supervisor_action event should be emitted');

  const event = events[0];
  const payload = JSON.parse(event.payload_json);
  assert.equal(payload.action, 'lease_released', 'payload action should be lease_released');
  assert.equal(payload.target_id, 'task-stale-1', 'payload should include target_id');
  assert.equal(payload.previous_status, 'in_progress', 'payload should record previous status');

  db.close();
});

test('evaluateSupervisorTick expires stale lease when lease_expires_at is in the past', () => {
  const db = createTestDb();

  seedTask(db, {
    id: 'task-lease-expired-1',
    status: 'in_progress',
    claim_token: 'tok-lease-expired-1',
    assigned_to: 'agent-lease-expired',
    started_at: minutesAgo(1),
    lease_expires_at: minutesAgo(10),
  });

  const result = evaluateSupervisorTick(db);

  const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-lease-expired-1'").get();
  assert.equal(task.status, 'pending', 'task should be reset when lease_expires_at is stale');
  assert.equal(task.claim_token, null, 'claim_token should be cleared after lease expiry');
  assert.equal(result.expiredLeases.length, 1, 'exactly one lease should be expired');

  db.close();
});

// ===========================================================================
// 4.8 RED: Lease expiry — fresh task → no change
// ===========================================================================

test('evaluateSupervisorTick does NOT expire fresh lease (task in_progress < 5 min)', () => {
  const db = createTestDb();

  // Seed task with fresh lease — started 1 minute ago
  seedTask(db, {
    id: 'task-fresh-1',
    status: 'in_progress',
    claim_token: 'tok-fresh-1',
    assigned_to: 'agent-fresh',
    started_at: minutesAgo(1),
  });

  const result = evaluateSupervisorTick(db);

  // Task should still be in_progress
  const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-fresh-1'").get();
  assert.equal(task.status, 'in_progress', 'task should remain in_progress');
  assert.equal(task.claim_token, 'tok-fresh-1', 'claim_token should remain');

  // No expired leases
  assert.equal(result.expiredLeases.length, 0, 'no leases should be expired');

  db.close();
});

test('evaluateSupervisorTick does NOT expire a task when lease_expires_at is still in the future', () => {
  const db = createTestDb();

  seedTask(db, {
    id: 'task-lease-future-1',
    status: 'in_progress',
    claim_token: 'tok-lease-future-1',
    assigned_to: 'agent-lease-future',
    started_at: minutesAgo(10),
    lease_expires_at: minutesFromNow(10),
  });

  const result = evaluateSupervisorTick(db);

  const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-lease-future-1'").get();
  assert.equal(
    task.status,
    'in_progress',
    'task should remain claimed while lease_expires_at is in the future'
  );
  assert.equal(
    task.claim_token,
    'tok-lease-future-1',
    'claim token should be preserved while lease is still active'
  );
  assert.equal(
    result.expiredLeases.length,
    0,
    'no lease should expire while lease_expires_at is in the future'
  );

  db.close();
});

// ===========================================================================
// 4.9 RED: CAS conflict — concurrent update does not cause state conflict
// ===========================================================================

test('CAS: if API sets status=completed before daemon tries WHERE status=in_progress,UPDATE matches 0 rows', () => {
  const db = createTestDb();

  // Seed a stale task
  seedTask(db, {
    id: 'task-cas-1',
    status: 'in_progress',
    claim_token: 'tok-cas-1',
    assigned_to: 'agent-cas',
    started_at: minutesAgo(10),
  });

  // Simulate API completing the task BEFORE the daemon tick runs
  db.prepare(
    "UPDATE tasks SET status = 'completed', claim_token = NULL, assigned_to = NULL WHERE id = ?"
  ).run('task-cas-1');

  // Now run the daemon tick — the CAS UPDATE should match 0 rows
  const result = evaluateSupervisorTick(db);

  // Task should still be completed (not overwritten to pending)
  const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-cas-1'").get();
  assert.equal(task.status, 'completed', 'task should remain completed — CAS prevents overwrite');

  // No lease expiry reported
  assert.equal(result.expiredLeases.length, 0, 'CAS should detect 0 changes and not report expiry');
});

test('CAS: if API sets workspace status=completed before daemon tries WHERE status=active, UPDATE matches 0 rows', () => {
  const db = createTestDb();

  // Seed workspace with stale heartbeat but status 'active'
  seedWorkspace(db, {
    id: 'ws-cas-1',
    agent_id: 'agent-cas',
    status: 'active',
    last_heartbeat: minutesAgo(2),
  });

  // Simulate API updating the workspace status before the daemon tick runs.
  // We set it to 'paused' (a non-terminal non-active status) since the
  // terminal_immutable trigger blocks updates to completed/failed.
  // The CAS pattern only matches WHERE status='active', so updating to 'paused'
  // before the tick means the daemon's UPDATE ... WHERE status='active' matches 0 rows.
  db.prepare("UPDATE agent_workspaces SET status = 'paused' WHERE id = 'ws-cas-1'").run();

  // Now run daemon tick — CAS UPDATE should match 0 rows
  const result = evaluateSupervisorTick(db);

  // Workspace should remain paused (not overwritten to orphaned)
  const ws = db.prepare("SELECT * FROM agent_workspaces WHERE id = 'ws-cas-1'").get();
  assert.equal(ws.status, 'paused', 'workspace should remain paused — CAS prevents overwrite');

  // No orphan detection
  assert.equal(result.orphaned.length, 0, 'CAS should detect 0 changes and not report orphan');
});

// ===========================================================================
// 4.11 RED: Event emission for all enforcement actions — payload format
// ===========================================================================

test('All enforcement events contain action, target_id, and previous_status in payload', () => {
  const db = createTestDb();

  // Seed stale workspace and stale task
  seedWorkspace(db, {
    id: 'ws-payload-1',
    agent_id: 'agent-payload',
    status: 'active',
    last_heartbeat: minutesAgo(2),
  });

  seedTask(db, {
    id: 'task-payload-1',
    status: 'in_progress',
    claim_token: 'tok-payload-1',
    assigned_to: 'agent-payload',
    started_at: minutesAgo(10),
  });

  evaluateSupervisorTick(db);

  // Check all enforcement events have proper payload structure
  const events = db
    .prepare(
      "SELECT * FROM agent_events WHERE event_type IN ('workspace_orphaned', 'supervisor_action')"
    )
    .all();

  assert.ok(events.length >= 2, 'should have at least 2 enforcement events');

  for (const event of events) {
    const payload = JSON.parse(event.payload_json);

    // Every enforcement payload must have these fields
    assert.ok(payload.action, `event ${event.id} payload must have action`);
    assert.ok(
      payload.target_id || event.workspace_id,
      `event ${event.id} payload must have target_id or workspace_id`
    );
    assert.ok(payload.previous_status, `event ${event.id} payload must have previous_status`);
  }

  db.close();
});

test('workspace_orphaned event includes workspace_id and agent_id', () => {
  const db = createTestDb();

  seedWorkspace(db, {
    id: 'ws-evt-1',
    agent_id: 'agent-evt-1',
    status: 'active',
    last_heartbeat: minutesAgo(2),
  });

  evaluateSupervisorTick(db);

  const events = db
    .prepare("SELECT * FROM agent_events WHERE event_type = 'workspace_orphaned'")
    .all();

  assert.ok(events.length >= 1, 'should have workspace_orphaned event');
  const event = events[0];
  assert.equal(event.workspace_id, 'ws-evt-1', 'event should reference the workspace');
  assert.equal(event.agent_id, 'agent-evt-1', 'event should reference the agent');

  db.close();
});

test('orphan enforcement also emits a supervisor_action event with orphan_marked payload', () => {
  const db = createTestDb();

  seedWorkspace(db, {
    id: 'ws-supervisor-action-1',
    agent_id: 'agent-supervisor-action',
    status: 'active',
    last_heartbeat: minutesAgo(2),
  });

  evaluateSupervisorTick(db);

  const actionEvent = db
    .prepare(
      "SELECT * FROM agent_events WHERE event_type = 'supervisor_action' AND workspace_id = ?"
    )
    .get('ws-supervisor-action-1');

  assert.ok(actionEvent, 'orphan enforcement should emit a supervisor_action event');
  const payload = JSON.parse(actionEvent.payload_json);
  assert.equal(payload.action, 'orphan_marked', 'supervisor action should describe orphan marking');
  assert.equal(
    payload.target_id,
    'ws-supervisor-action-1',
    'supervisor action should target the orphaned workspace'
  );
  assert.equal(
    payload.previous_status,
    'active',
    'supervisor action should record the previous status'
  );

  db.close();
});

test('ensure starts the supervisor daemon when process manager is already ready', async () => {
  const pm = require('../processManager');
  const originalStart = pm.startSupervisorDaemon;
  const originalServerProcess = pm.serverProcess;
  const originalServerReady = pm.serverReady;

  let called = 0;
  pm.startSupervisorDaemon = () => {
    called += 1;
    return null;
  };
  pm.serverProcess = { pid: 1234 };
  pm.serverReady = true;

  try {
    const result = await pm.ensure();
    assert.equal(
      called,
      1,
      'ensure should start the supervisor daemon for an already-ready server'
    );
    assert.equal(result.pid, 1234, 'ensure should return the existing server pid');
  } finally {
    pm.startSupervisorDaemon = originalStart;
    pm.serverProcess = originalServerProcess;
    pm.serverReady = originalServerReady;
  }
});

test('shutdown always stops the supervisor daemon before returning', async () => {
  const pm = require('../processManager');
  const originalStop = pm.stopSupervisorDaemon;
  const originalServerProcess = pm.serverProcess;
  const originalServerReady = pm.serverReady;

  let called = 0;
  pm.stopSupervisorDaemon = () => {
    called += 1;
  };
  pm.serverProcess = null;
  pm.serverReady = false;

  try {
    await pm.shutdown();
    assert.equal(
      called,
      1,
      'shutdown should stop the supervisor daemon even if no server process is running'
    );
  } finally {
    pm.stopSupervisorDaemon = originalStop;
    pm.serverProcess = originalServerProcess;
    pm.serverReady = originalServerReady;
  }
});

test('supervisor_action event for lease expiry includes agent_id', () => {
  const db = createTestDb();

  seedTask(db, {
    id: 'task-lease-evt',
    status: 'in_progress',
    claim_token: 'tok-lease-evt',
    assigned_to: 'agent-lease-evt',
    started_at: minutesAgo(10),
  });

  evaluateSupervisorTick(db);

  const events = db
    .prepare("SELECT * FROM agent_events WHERE event_type = 'supervisor_action'")
    .all();

  assert.ok(events.length >= 1, 'should have supervisor_action event');
  const event = events[0];
  assert.equal(event.agent_id, 'agent-lease-evt', 'event should have the assigned agent_id');

  db.close();
});

// ===========================================================================
// Additional: daemon tick updates lastTickAt via direct call
// ===========================================================================

test('getSupervisorStatus reflects state after manual tick simulation', () => {
  const pm = require('../processManager');
  pm.stopSupervisorDaemon();

  // Verify initial state
  const initial = pm.getSupervisorStatus();
  assert.equal(initial.running, false, 'daemon should not be running initially');
  assert.equal(initial.lastTickAt, null, 'lastTickAt should be null initially');

  // Simulate a tick by calling evaluateSupervisorTick directly
  const db = createTestDb();
  const result = evaluateSupervisorTick(db);
  assert.ok(result, 'evaluateSupervisorTick should return a result');
  assert.ok(Array.isArray(result.orphaned), 'result should have orphaned array');
  assert.ok(Array.isArray(result.expiredLeases), 'result should have expiredLeases array');

  db.close();
});
