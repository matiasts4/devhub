/**
 * Swarm Queue — Hybrid in-memory + SQLite-backed durable queue.
 *
 * When the concurrency limit is reached, new requests are enqueued.
 * A polling loop checks every 500ms if a slot opened and processes the queue.
 * Every enqueue is persisted to SQLite before the Promise resolves.
 * On startup, pending items are loaded and stale processing items are recovered.
 */

import _processManager from './processManager.js';
import {
  getSwarmConfig,
  getActiveAgentCount,
  enqueueDurableItem,
  dequeueDurableItem,
  ackDurableItem,
  cancelDurableItem,
  recoverStaleItems,
  cleanupCompletedItems,
} from '@/lib/db/localDb.js';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_OLDER_THAN_MINUTES = 60; // 1 hour
const STALE_THRESHOLD_MINUTES = 5;

class SwarmQueue {
  constructor() {
    this.queue = []; // Array of { id, body, resolve, reject, enqueuedAt, db_id }
    this.pollingInterval = null;
    this.cleanupInterval = null;
    this.started = false;
    this.db = null;
  }

  /**
   * Initialize with a database handle for durable operations.
   * If no db is provided, falls back to in-memory only (no persistence).
   * On init, recovers stale items and loads pending items from SQLite.
   */
  init(db) {
    this.db = db;
    if (this.db) {
      this._recoverOnStartup();
    }
  }

  /**
   * Enqueue a launch request.
   * Persists to SQLite first (if db available), then adds to in-memory queue.
   * Returns a Promise that resolves when a slot becomes available.
   */
  enqueue(item) {
    const itemId = item.id || `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const enqueuedAt = Date.now();

    let dbRow = null;
    if (this.db) {
      dbRow = enqueueDurableItem(this.db, 'swarm', { id: itemId, ...item.body });
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        id: itemId,
        body: item.body,
        enqueuedAt,
        resolve,
        reject,
        db_id: dbRow ? dbRow.id : null,
      });

      if (!this.started) this.start();
    });
  }

  /**
   * Get current queue length.
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * Get position of a queued item by ID.
   * Returns null if not found.
   */
  getPosition(itemId) {
    const idx = this.queue.findIndex((item) => item.id === itemId);
    return idx >= 0 ? idx + 1 : null;
  }

  /**
   * Start the polling loop and cleanup interval.
   */
  start() {
    if (this.started) return;
    this.started = true;

    this.pollingInterval = setInterval(() => {
      this._poll();
    }, 500);

    this.cleanupInterval = setInterval(() => {
      this._cleanupStale();
    }, CLEANUP_INTERVAL_MS);

    console.log('[SwarmQueue] Polling started (500ms interval)');
  }

  /**
   * Stop the polling loop and cleanup interval.
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.started = false;
    console.log('[SwarmQueue] Polling stopped');
  }

  /**
   * Poll: check if a slot is available and process the queue.
   * Uses dequeueDurableItem for atomic pending→processing transition.
   * Acks the item in SQLite after successful resolution.
   */
  async _poll() {
    if (this.queue.length === 0) return;

    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();

    if (activeCount >= maxConcurrent) return;

    // Remove from in-memory queue first
    const item = this.queue.shift();
    if (!item) return;

    // Atomic dequeue in SQLite if db available
    if (this.db && item.db_id) {
      const dequeued = dequeueDurableItem(this.db, 'swarm');
      // If the DB dequeue returns null (already processed), skip
      if (!dequeued) {
        return;
      }
    }

    console.log(`[SwarmQueue] Processing queued item ${item.id} (slot available)`);

    try {
      item.resolve({
        success: true,
        queued: false,
        body: item.body,
        waitTime: Date.now() - item.enqueuedAt,
      });

      // Ack in SQLite after successful resolution
      if (this.db && item.db_id) {
        ackDurableItem(this.db, item.db_id);
      }
    } catch (err) {
      item.reject(err);
    }
  }

  /**
   * Get estimated wait time for a position in the queue.
   * Rough estimate: 30s per item ahead (average session completion time).
   */
  getEstimatedWait(position) {
    return position * 30000;
  }

  /**
   * Get queue status.
   */
  getStatus() {
    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();

    return {
      length: this.queue.length,
      activeCount,
      maxConcurrent,
      atLimit: activeCount >= maxConcurrent,
      items: this.queue.map((item, idx) => ({
        id: item.id,
        position: idx + 1,
        enqueuedAt: item.enqueuedAt,
        estimatedWaitMs: this.getEstimatedWait(idx),
      })),
    };
  }

  /**
   * Remove an item from the queue by id.
   * Marks item as cancelled in SQLite and rejects the Promise with cancelled flag.
   * Returns true when removed, false when missing.
   */
  remove(itemId) {
    const index = this.queue.findIndex((item) => item.id === itemId);
    if (index === -1) return false;

    const [item] = this.queue.splice(index, 1);

    // Cancel in SQLite
    if (this.db && item.db_id) {
      cancelDurableItem(this.db, item.db_id);
    }

    if (item?.reject) {
      const error = new Error('Cancelled by user');
      error.cancelled = true;
      item.reject(error);
    }

    return true;
  }

  /**
   * Recover stale processing items and load pending items on startup.
   * Called by init() when a db handle is provided.
   */
  _recoverOnStartup() {
    if (!this.db) return;

    // Reset stale processing items (>5min) back to pending
    const recovered = recoverStaleItems(this.db, STALE_THRESHOLD_MINUTES);
    if (recovered > 0) {
      console.log(`[SwarmQueue] Recovered ${recovered} stale processing items`);
    }

    // Load all pending items into in-memory queue
    const pendingRows = this.db
      .prepare(
        "SELECT * FROM swarm_queue_items WHERE queue_name = 'swarm' AND status = 'pending' ORDER BY enqueued_at ASC"
      )
      .all();

    for (const row of pendingRows) {
      // Check if already in memory (avoid duplicates)
      const alreadyInQueue = this.queue.some((item) => item.db_id === row.id);
      if (alreadyInQueue) continue;

      let payload;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = {};
      }

      const itemId = payload.id || `recovered-${row.id}`;
      const enqueuedAt = new Date(row.enqueued_at).getTime();

      // Create a fresh Promise for the recovered item
      this.queue.push({
        id: itemId,
        body: payload,
        enqueuedAt: isNaN(enqueuedAt) ? Date.now() : enqueuedAt,
        // These resolve/reject will be set when the item is actually processed
        // For now, we need a new Promise wrapper
        resolve: null,
        reject: null,
        db_id: row.id,
        _promise: new Promise((resolve, reject) => {
          // Back-fill resolve/reject into the queue entry
          const entry = this.queue[this.queue.length - 1];
          if (entry) {
            entry.resolve = resolve;
            entry.reject = reject;
          }
        }),
      });
    }

    if (pendingRows.length > 0) {
      console.log(`[SwarmQueue] Loaded ${pendingRows.length} pending items from durable store`);
    }
  }

  /**
   * Periodic cleanup of completed/cancelled items older than 1 hour.
   */
  _cleanupStale() {
    if (!this.db) return;
    const purged = cleanupCompletedItems(this.db, CLEANUP_OLDER_THAN_MINUTES);
    if (purged > 0) {
      console.log(`[SwarmQueue] Cleaned up ${purged} completed/cancelled items`);
    }
  }
}

// Export both class and singleton for testing flexibility
const instance = new SwarmQueue();
export default instance;
export { SwarmQueue };
