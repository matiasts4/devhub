/**
 * @module durableQueue.test
 * Strict TDD tests for swarm_queue_items table schema and durable queue operations.
 * Test file written FIRST (RED phase), then implementation follows (GREEN phase).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureRuntimeSchema } = require('../localDb');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with runtime schema applied. */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

// ---------------------------------------------------------------------------
// Task 1.1 — swarm_queue_items table schema
// ---------------------------------------------------------------------------

test('swarm_queue_items table exists after ensureRuntimeSchema', () => {
  const db = createTestDb();
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='swarm_queue_items'")
    .get();
  assert.ok(row, 'swarm_queue_items table must exist after ensureRuntimeSchema');
  db.close();
});

test('swarm_queue_items has all required columns', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(swarm_queue_items)');
  const columnNames = columns.map((c) => c.name);

  const required = [
    'id',
    'queue_name',
    'payload_json',
    'status',
    'enqueued_at',
    'acquired_at',
    'acked_at',
    'retries',
    'max_retries',
    'error_message',
  ];

  for (const col of required) {
    assert.ok(columnNames.includes(col), `missing column: ${col}`);
  }
  db.close();
});

test('swarm_queue_items id is INTEGER PRIMARY KEY AUTOINCREMENT', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(swarm_queue_items)');
  const idCol = columns.find((c) => c.name === 'id');
  assert.ok(idCol, 'id column must exist');
  assert.equal(idCol.pk, 1, 'id must be primary key');
  db.close();
});

test('swarm_queue_items status defaults to pending', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(swarm_queue_items)');
  const statusCol = columns.find((c) => c.name === 'status');
  assert.ok(statusCol, 'status column must exist');
  // SQLite stores default in dflt_value as the SQL expression
  assert.equal(statusCol.dflt_value, "'pending'", 'status must default to pending');
  db.close();
});

test('swarm_queue_items retries defaults to 0 and max_retries defaults to 3', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(swarm_queue_items)');
  const retriesCol = columns.find((c) => c.name === 'retries');
  const maxRetriesCol = columns.find((c) => c.name === 'max_retries');
  assert.equal(retriesCol.dflt_value, '0', 'retries must default to 0');
  assert.equal(maxRetriesCol.dflt_value, '3', 'max_retries must default to 3');
  db.close();
});

test('idx_sqi_queue_status index exists', () => {
  const db = createTestDb();
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sqi_queue_status'")
    .get();
  assert.ok(indexes, 'idx_sqi_queue_status index must exist');
  db.close();
});

test('idx_sqi_status_enqueued index exists', () => {
  const db = createTestDb();
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sqi_status_enqueued'")
    .get();
  assert.ok(indexes, 'idx_sqi_status_enqueued index must exist');
  db.close();
});

// ---------------------------------------------------------------------------
// Task 1.2 — Durable queue operations
// ---------------------------------------------------------------------------

// These tests import from localDb — functions that don't exist yet (RED phase)

test('enqueueDurableItem inserts a row with status pending', () => {
  const { enqueueDurableItem } = require('../localDb');
  const db = createTestDb();
  const item = enqueueDurableItem(db, 'test-queue', { action: 'launch', agentId: 'a1' });
  assert.ok(item, 'enqueueDurableItem must return the inserted row');
  assert.equal(item.queue_name, 'test-queue');
  assert.equal(item.status, 'pending');
  assert.ok(item.id > 0, 'id must be a positive integer');
  assert.ok(item.enqueued_at, 'enqueued_at must be set');

  // Verify payload_json round-trips
  const parsed = JSON.parse(item.payload_json);
  assert.equal(parsed.action, 'launch');
  assert.equal(parsed.agentId, 'a1');
  db.close();
});

test('enqueueDurableItem accepts string payload', () => {
  const { enqueueDurableItem } = require('../localDb');
  const db = createTestDb();
  const item = enqueueDurableItem(db, 'q1', 'just a string');
  assert.ok(item, 'enqueueDurableItem must accept string payload');
  const parsed = JSON.parse(item.payload_json);
  assert.equal(parsed, 'just a string');
  db.close();
});

test('dequeueDurableItem atomically moves pending to processing', () => {
  const { enqueueDurableItem, dequeueDurableItem } = require('../localDb');
  const db = createTestDb();

  // Enqueue two items
  const item1 = enqueueDurableItem(db, 'q1', { idx: 1 });
  const item2 = enqueueDurableItem(db, 'q1', { idx: 2 });

  // Dequeue first
  const dequeued = dequeueDurableItem(db, 'q1');
  assert.ok(dequeued, 'dequeueDurableItem must return an item');
  assert.equal(dequeued.id, item1.id, 'should dequeue in FIFO order');
  assert.equal(dequeued.status, 'processing', 'status should be processing after dequeue');
  assert.ok(dequeued.acquired_at, 'acquired_at must be set on dequeue');

  // Dequeue second
  const dequeued2 = dequeueDurableItem(db, 'q1');
  assert.equal(dequeued2.id, item2.id);
  assert.equal(dequeued2.status, 'processing');

  // No more items
  const empty = dequeueDurableItem(db, 'q1');
  assert.equal(empty, null, 'should return null when queue is empty');
  db.close();
});

test('dequeueDurableItem only dequeues from specified queue', () => {
  const { enqueueDurableItem, dequeueDurableItem } = require('../localDb');
  const db = createTestDb();
  enqueueDurableItem(db, 'queue-a', { target: 'a' });
  enqueueDurableItem(db, 'queue-b', { target: 'b' });

  const result = dequeueDurableItem(db, 'queue-a');
  assert.ok(result, 'should dequeue from queue-a');
  const parsed = JSON.parse(result.payload_json);
  assert.equal(parsed.target, 'a', 'should only dequeue from the specified queue');
  db.close();
});

test('ackDurableItem moves processing to completed', () => {
  const { enqueueDurableItem, dequeueDurableItem, ackDurableItem } = require('../localDb');
  const db = createTestDb();
  const _item = enqueueDurableItem(db, 'q1', { data: 'test' });
  const dequeued = dequeueDurableItem(db, 'q1');

  const acked = ackDurableItem(db, dequeued.id);
  assert.ok(acked, 'ackDurableItem must return the updated row');
  assert.equal(acked.status, 'completed', 'status must be completed after ack');
  assert.ok(acked.acked_at, 'acked_at must be set');
  db.close();
});

test('ackDurableItem returns null for non-existent item', () => {
  const { ackDurableItem } = require('../localDb');
  const db = createTestDb();
  const result = ackDurableItem(db, 99999);
  assert.equal(result, null, 'should return null for non-existent item');
  db.close();
});

test('cancelDurableItem moves processing to cancelled and rejects the Promise', () => {
  const { enqueueDurableItem, dequeueDurableItem, cancelDurableItem } = require('../localDb');
  const db = createTestDb();
  const _item = enqueueDurableItem(db, 'q1', { data: 'cancel-test' });
  const dequeued = dequeueDurableItem(db, 'q1');

  const cancelled = cancelDurableItem(db, dequeued.id);
  assert.ok(cancelled, 'cancelDurableItem must return the updated row');
  assert.equal(cancelled.status, 'cancelled', 'status must be cancelled');
  db.close();
});

test('recoverStaleItems resets processing items older than stale threshold', () => {
  const { enqueueDurableItem, dequeueDurableItem, recoverStaleItems } = require('../localDb');
  const db = createTestDb();

  // Enqueue and dequeue to make it processing
  const _item = enqueueDurableItem(db, 'q1', { stale: true });
  const dequeued = dequeueDurableItem(db, 'q1');

  // Manually set acquired_at to 10 minutes ago to simulate staleness
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.prepare('UPDATE swarm_queue_items SET acquired_at = ? WHERE id = ?').run(
    tenMinAgo,
    dequeued.id
  );

  // Recover stale items (items processing for > 5 minutes)
  const count = recoverStaleItems(db, 5);
  assert.equal(count, 1, 'should recover 1 stale item');

  // Verify the item is back to pending
  const recovered = db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(dequeued.id);
  assert.equal(recovered.status, 'pending', 'recovered item should be pending again');
  assert.equal(recovered.retries, 1, 'retries should be incremented');
  assert.equal(recovered.acquired_at, null, 'acquired_at should be cleared');
  db.close();
});

test('recoverStaleItems does NOT reset recently acquired items', () => {
  const { enqueueDurableItem, dequeueDurableItem, recoverStaleItems } = require('../localDb');
  const db = createTestDb();

  const _item = enqueueDurableItem(db, 'q1', { stale: false });
  const _dequeued = dequeueDurableItem(db, 'q1');

  // Item was just dequeued (acquired_at is recent), threshold is 5 min
  const count = recoverStaleItems(db, 5);
  assert.equal(count, 0, 'should not recover recently acquired item');
  db.close();
});

test('cleanupCompletedItems purges completed and cancelled items older than threshold', () => {
  const {
    enqueueDurableItem,
    dequeueDurableItem,
    ackDurableItem,
    cancelDurableItem,
    cleanupCompletedItems,
  } = require('../localDb');
  const db = createTestDb();

  // Create a completed item and set its acked_at to old
  const _item1 = enqueueDurableItem(db, 'q1', { idx: 1 });
  const dequeued1 = dequeueDurableItem(db, 'q1');
  const acked1 = ackDurableItem(db, dequeued1.id);

  // Make it "old" by setting acked_at to 2 hours ago
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE swarm_queue_items SET acked_at = ? WHERE id = ?').run(twoHoursAgo, acked1.id);

  // Create a cancelled item and set its acked_at to old
  const _item2 = enqueueDurableItem(db, 'q1', { idx: 2 });
  const dequeued2 = dequeueDurableItem(db, 'q1');
  const cancelled = cancelDurableItem(db, dequeued2.id);
  db.prepare('UPDATE swarm_queue_items SET acked_at = ? WHERE id = ?').run(
    twoHoursAgo,
    cancelled.id
  );

  // Cleanup items older than 1 hour
  const purged = cleanupCompletedItems(db, 60);
  assert.equal(purged, 2, 'should purge 2 old items');

  // Verify items are gone
  const remaining = db.prepare('SELECT count(*) as cnt FROM swarm_queue_items').get();
  assert.equal(remaining.cnt, 0, 'all items should be purged');
  db.close();
});

test('cleanupCompletedItems does NOT purge recent completed items', () => {
  const {
    enqueueDurableItem,
    dequeueDurableItem,
    ackDurableItem,
    cleanupCompletedItems,
  } = require('../localDb');
  const db = createTestDb();

  const _item = enqueueDurableItem(db, 'q1', { keep: true });
  const dequeued = dequeueDurableItem(db, 'q1');
  ackDurableItem(db, dequeued.id);

  // Item was just acked — not old enough to purge (threshold: 60 min)
  const purged = cleanupCompletedItems(db, 60);
  assert.equal(purged, 0, 'should not purge recently completed items');

  const remaining = db.prepare('SELECT count(*) as cnt FROM swarm_queue_items').get();
  assert.equal(remaining.cnt, 1, 'item should still exist');
  db.close();
});

// ---------------------------------------------------------------------------
// Task 1.3 — core.js thin re-export shim verification
// These tests reference the module that will become a shim. They verify
// that after core.js becomes a re-export, all imports still resolve.
// ---------------------------------------------------------------------------

test('core.js exports getDb and it returns a db handle', () => {
  const { getDb, closeDb } = require('../core');
  const db = getDb();
  assert.ok(db, 'getDb must return a truthy db handle');
  assert.equal(typeof db.prepare, 'function', 'db must have prepare method');
  closeDb();
});

test('core.js exports ensureRuntimeSchema', () => {
  const { ensureRuntimeSchema } = require('../core');
  assert.equal(typeof ensureRuntimeSchema, 'function', 'ensureRuntimeSchema must be a function');
});

test('core.js exports all constants from localDb', () => {
  const core = require('../core');
  const localDb = require('../localDb');

  // Spot-check constants that both should export
  assert.ok(
    core.AGENT_WORKSPACE_TERMINAL_STATUSES,
    'core must export AGENT_WORKSPACE_TERMINAL_STATUSES'
  );
  assert.deepEqual(
    core.AGENT_WORKSPACE_TERMINAL_STATUSES,
    localDb.AGENT_WORKSPACE_TERMINAL_STATUSES,
    'constants must match between core and localDb'
  );
});

test('core.js getDb returns same singleton as localDb getDb', () => {
  // After core.js is a shim, getDb from core should be the same function
  // as getDb from localDb (referential equality)
  const coreModule = require('../core');
  const localDbModule = require('../localDb');

  // They should be the SAME function object (referential equality via re-export)
  assert.strictEqual(
    coreModule.getDb,
    localDbModule.getDb,
    'core.getDb must be referentially equal to localDb.getDb'
  );
  assert.strictEqual(
    coreModule.ensureRuntimeSchema,
    localDbModule.ensureRuntimeSchema,
    'core.ensureRuntimeSchema must be referentially equal to localDb.ensureRuntimeSchema'
  );
});

test('core.js exports tables with swarm_queue_items operations', () => {
  const core = require('../core');
  assert.ok(core.tables, 'core must export tables');
  assert.ok(core.tables.swarm_queue_items, 'core.tables must include swarm_queue_items');
});
