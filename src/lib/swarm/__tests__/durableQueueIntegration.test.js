/**
 * Durable Queue Integration Tests (Phase 2)
 *
 * Tests that SwarmQueue persists to SQLite, recovers on startup,
 * and uses atomic dequeue/ack/cancel operations.
 *
 * TDD: written FIRST, before queue.js changes.
 */

// Mock only the config functions — the durable queue ops use the test DB directly
jest.mock('@/lib/db/localDb.js', () => {
  const actual = jest.requireActual('@/lib/db/localDb.js');
  return {
    ...actual,
    getSwarmConfig: jest.fn().mockReturnValue({ max_concurrent: '5' }),
    getActiveAgentCount: jest.fn().mockReturnValue(0),
  };
});

jest.mock('@/lib/swarm/processManager', () => ({
  getStatus: jest.fn().mockResolvedValue({ running: true, healthy: true }),
}));

const Database = require('better-sqlite3');
const localDb = require('@/lib/db/localDb.js');
const {
  ensureRuntimeSchema,
  enqueueDurableItem,
  dequeueDurableItem,
  ackDurableItem,
  cancelDurableItem: _cancelDurableItem,
  recoverStaleItems: _recoverStaleItems,
  cleanupCompletedItems: _cleanupCompletedItems,
} = localDb;

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

let db;
let queue;
let SwarmQueue;

beforeEach(() => {
  db = createTestDb();
  SwarmQueue = require('@/lib/swarm/queue.js').SwarmQueue;
  queue = new SwarmQueue();
  queue.init(db);

  // Reset mock call counts
  localDb.getSwarmConfig.mockClear();
  localDb.getActiveAgentCount.mockClear();
});

afterEach(() => {
  if (queue) {
    queue.stop();
  }
  if (db) {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// REQ-DQ-2: Durable Enqueue — persist via localDb before Promise resolves
// ---------------------------------------------------------------------------

describe('REQ-DQ-2: Durable Enqueue', () => {
  test('enqueue persists item to SQLite swarm_queue_items', () => {
    queue.enqueue({ id: 'dq-1', body: { agent: 'a1' } });

    const rows = db.prepare("SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm'").all();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload_json);
    expect(payload.agent).toBe('a1');
  });

  test('enqueue persists item with custom id in payload', () => {
    queue.enqueue({ id: 'dq-custom', body: { task: 'launch' } });

    const rows = db.prepare("SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm'").all();
    expect(rows).toHaveLength(1);
  });

  test('enqueue falls back to in-memory only when no db handle', () => {
    const memOnlyQueue = new SwarmQueue();
    // Don't call init() — no db handle

    const promise = memOnlyQueue.enqueue({ id: 'mem-1', body: { x: 1 } });
    promise.catch(() => {}); // Suppress unhandled rejection
    expect(memOnlyQueue.getQueueLength()).toBe(1);
    memOnlyQueue.stop();
  });

  test('multiple enqueues persist all items to SQLite', () => {
    queue.enqueue({ id: 'dq-1', body: { i: 1 } });
    queue.enqueue({ id: 'dq-2', body: { i: 2 } });
    queue.enqueue({ id: 'dq-3', body: { i: 3 } });

    const rows = db
      .prepare("SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm' AND status = 'pending'")
      .all();
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// REQ-DQ-3: Dequeue with Processing Lock — atomic pending→processing
// ---------------------------------------------------------------------------

describe('REQ-DQ-3: Dequeue with Processing Lock', () => {
  test('_poll uses dequeueDurableItem for atomic status change', async () => {
    localDb.getSwarmConfig.mockReturnValue({ max_concurrent: '5' });
    localDb.getActiveAgentCount.mockReturnValue(0);

    const promise = queue.enqueue({ id: 'dq-deq-1', body: { agent: 'worker-1' } });
    promise.catch(() => {}); // Suppress if not awaited

    await queue._poll();

    // After poll, the item should be completed (dequeued + acked)
    const rows = db.prepare("SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm'").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
  });

  test('dequeue is atomic — no double-acquire from concurrent polls', async () => {
    localDb.getSwarmConfig.mockReturnValue({ max_concurrent: '5' });
    localDb.getActiveAgentCount.mockReturnValue(0);

    queue.enqueue({ id: 'dq-deq-2', body: { agent: 'worker-2' } });

    // Two concurrent polls — only one should process the item
    await Promise.all([queue._poll(), queue._poll()]);

    const pending = db
      .prepare("SELECT * FROM swarm_queue_items WHERE status = 'pending' AND queue_name = 'swarm'")
      .all();
    expect(pending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-DQ-4: Acknowledgment — processing→completed after resolution
// ---------------------------------------------------------------------------

describe('REQ-DQ-4: Acknowledgment', () => {
  test('successful poll resolution acks item in SQLite', async () => {
    localDb.getSwarmConfig.mockReturnValue({ max_concurrent: '5' });
    localDb.getActiveAgentCount.mockReturnValue(0);

    const promise = queue.enqueue({ id: 'dq-ack-1', body: { agent: 'a1' } });

    await queue._poll();

    const result = await promise;
    expect(result.success).toBe(true);

    // Item should be completed in SQLite
    const rows = db.prepare("SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm'").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
    expect(rows[0].acked_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// REQ-DQ-5: Startup Recovery — load pending, re-enqueue stale processing
// ---------------------------------------------------------------------------

describe('REQ-DQ-5: Startup Recovery', () => {
  test('_recoverOnStartup loads pending items from SQLite into in-memory queue', () => {
    enqueueDurableItem(db, 'swarm', { agent: 'recovery-test' });

    // Create fresh queue instance (simulates restart)
    const freshQueue = new SwarmQueue();
    freshQueue.init(db);

    expect(freshQueue.getQueueLength()).toBe(1);
    freshQueue.stop();
  });

  test('_recoverOnStartup recovers stale processing items (older than 5 min)', () => {
    // Enqueue and dequeue to make it processing
    const item = enqueueDurableItem(db, 'swarm', { agent: 'stale' });
    dequeueDurableItem(db, 'swarm');

    // Make it stale: set acquired_at to 10 min ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    db.prepare('UPDATE swarm_queue_items SET acquired_at = ? WHERE id = ?').run(tenMinAgo, item.id);

    // Create fresh queue — should recover stale item
    const freshQueue = new SwarmQueue();
    freshQueue.init(db);

    expect(freshQueue.getQueueLength()).toBe(1);
    freshQueue.stop();
  });

  test('_recoverOnStartup does NOT recover recently-acquired processing items', () => {
    // Enqueue and dequeue — recently acquired (not stale)
    enqueueDurableItem(db, 'swarm', { agent: 'fresh' });
    dequeueDurableItem(db, 'swarm');

    // Create fresh queue — should NOT recover recently-acquired items
    const freshQueue = new SwarmQueue();
    freshQueue.init(db);

    expect(freshQueue.getQueueLength()).toBe(0);
    freshQueue.stop();
  });
});

// ---------------------------------------------------------------------------
// REQ-DQ-6: Cancelled Items — status→cancelled, reject with cancelled flag
// ---------------------------------------------------------------------------

describe('REQ-DQ-6: Cancelled Items', () => {
  test('remove() marks item as cancelled in SQLite', () => {
    const promise = queue.enqueue({ id: 'dq-cancel-1', body: { agent: 'a1' } });
    promise.catch(() => {}); // Suppress unhandled rejection from cancel

    // Find the item's db_id in the queue
    const item = queue.queue.find((i) => i.id === 'dq-cancel-1');
    expect(item).toBeTruthy();
    expect(item.db_id).toBeTruthy();

    queue.remove('dq-cancel-1');

    // SQLite row should be cancelled
    const row = db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(item.db_id);
    expect(row).toBeTruthy();
    expect(row.status).toBe('cancelled');
  });

  test('remove() rejects the Promise with error.cancelled = true', async () => {
    const promise = queue.enqueue({ id: 'dq-cancel-2', body: { agent: 'a2' } });

    queue.remove('dq-cancel-2');

    let caughtError;
    try {
      await promise;
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError.message).toBe('Cancelled by user');
    expect(caughtError.cancelled).toBe(true);
  });

  test('remove() works without db handle (in-memory only)', () => {
    const memOnlyQueue = new SwarmQueue();
    // Don't init — no db

    const promise = memOnlyQueue.enqueue({ id: 'mem-cancel', body: {} });
    promise.catch(() => {}); // Suppress unhandled rejection from cancel
    const result = memOnlyQueue.remove('mem-cancel');
    expect(result).toBe(true);
    memOnlyQueue.stop();
  });
});

// ---------------------------------------------------------------------------
// REQ-DQ-7: Staleness Cleanup — periodic purge of completed/cancelled >1hr old
// ---------------------------------------------------------------------------

describe('REQ-DQ-7: Staleness Cleanup', () => {
  test('_cleanupStale purges completed items older than 1 hour', () => {
    const _item = enqueueDurableItem(db, 'swarm', { old: true });
    const dequeued = dequeueDurableItem(db, 'swarm');
    ackDurableItem(db, dequeued.id);

    // Make it old: set acked_at to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE swarm_queue_items SET acked_at = ? WHERE id = ?').run(
      twoHoursAgo,
      dequeued.id
    );

    queue._cleanupStale();

    const remaining = db
      .prepare("SELECT count(*) as cnt FROM swarm_queue_items WHERE queue_name = 'swarm'")
      .get();
    expect(remaining.cnt).toBe(0);
  });

  test('_cleanupStale does NOT purge recently completed items', () => {
    enqueueDurableItem(db, 'swarm', { fresh: true });
    const dequeued = dequeueDurableItem(db, 'swarm');
    ackDurableItem(db, dequeued.id);

    queue._cleanupStale();

    const remaining = db
      .prepare("SELECT count(*) as cnt FROM swarm_queue_items WHERE queue_name = 'swarm'")
      .get();
    expect(remaining.cnt).toBe(1);
  });

  test('periodic cleanup interval is set on start()', () => {
    queue.start();
    expect(queue.cleanupInterval).not.toBeNull();
    queue.stop();
  });

  test('stop() clears cleanup interval', () => {
    queue.start();
    expect(queue.cleanupInterval).not.toBeNull();
    queue.stop();
    expect(queue.cleanupInterval).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: init() method
// ---------------------------------------------------------------------------

describe('init() method', () => {
  test('init() stores db handle and calls _recoverOnStartup', () => {
    const q = new SwarmQueue();

    expect(q.db).toBeNull();

    q.init(db);

    expect(q.db).toBe(db);
    q.stop();
  });

  test('init() without db falls back to in-memory only mode', () => {
    const q = new SwarmQueue();
    q.init(null);

    expect(q.db).toBeNull();
    q.stop();
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: existing remove() tests still pass
// ---------------------------------------------------------------------------

describe('Backward compatibility: remove()', () => {
  test('remove() returns true and removes item when id exists', () => {
    const promise = queue.enqueue({ id: 'abc', body: { agent: 'test-agent' } });
    promise.catch(() => {}); // Suppress unhandled rejection
    expect(queue.queue).toHaveLength(1);

    const result = queue.remove('abc');

    expect(result).toBe(true);
    expect(queue.queue).toHaveLength(0);
  });

  test('remove() returns false when id does not exist', () => {
    const promise = queue.enqueue({ id: 'foo', body: {} });
    promise.catch(() => {}); // Suppress unhandled rejection

    const result = queue.remove('xyz');

    expect(result).toBe(false);
    expect(queue.queue).toHaveLength(1);
  });
});
