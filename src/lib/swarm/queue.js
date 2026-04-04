/**
 * Swarm Queue — In-memory queue for concurrency-limited agent launches.
 *
 * When the concurrency limit is reached, new requests are enqueued.
 * A polling loop checks every 2s if a slot opened and processes the queue.
 */

const processManager = require('./processManager');
const { getSwarmConfig, getActiveAgentCount } = require('@/lib/db/localDb.js');

class SwarmQueue {
  constructor() {
    this.queue = []; // Array of { id, body, resolve, reject, enqueuedAt }
    this.pollingInterval = null;
    this.started = false;
  }

  /**
   * Enqueue a launch request.
   * Returns { queued: true, queuePosition, estimatedWaitMs }
   */
  enqueue(item) {
    const position = this.queue.length + 1;
    const enqueuedAt = Date.now();

    return new Promise((resolve, reject) => {
      this.queue.push({
        id: item.id || `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        body: item.body,
        enqueuedAt,
        resolve,
        reject,
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
   * Start the polling loop.
   */
  start() {
    if (this.started) return;
    this.started = true;

    this.pollingInterval = setInterval(() => {
      this._poll();
    }, 2000);

    console.log('[SwarmQueue] Polling started (2s interval)');
  }

  /**
   * Stop the polling loop.
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.started = false;
    console.log('[SwarmQueue] Polling stopped');
  }

  /**
   * Poll: check if a slot is available and process the queue.
   */
  async _poll() {
    if (this.queue.length === 0) return;

    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = getActiveAgentCount();

    if (activeCount >= maxConcurrent) return; // No slot available

    // Dequeue the first item
    const item = this.queue.shift();
    if (!item) return;

    console.log(`[SwarmQueue] Processing queued item ${item.id} (slot available)`);

    try {
      // Resolve with the original body so the caller can proceed with launch
      item.resolve({
        success: true,
        queued: false,
        body: item.body,
        waitTime: Date.now() - item.enqueuedAt,
      });
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
}

// Singleton
const instance = new SwarmQueue();
module.exports = instance;
