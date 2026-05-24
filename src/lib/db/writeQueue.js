/**
 * DB Write Queue — Serializes critical SQLite writes.
 *
 * Prevents concurrent writes from causing SQLITE_BUSY or native crashes.
 * All writes go through a single async queue with timeout protection.
 */

const { getDb } = require('./localDb');

class DbWriteQueue {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.timeout = options.timeout || 10_000; // 10s default
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      timedOut: 0,
    };
  }

  /**
   * Enqueue a database write operation.
   * @param {function} fn - Function that receives db and returns result.
   * @param {object} [options]
   * @param {number} [options.timeout] - Override timeout for this operation.
   * @param {string} [options.label] - Label for logging.
   * @returns {Promise<any>}
   */
  async enqueue(fn, options = {}) {
    const timeout = options.timeout || this.timeout;
    const label = options.label || 'unnamed';

    this.stats.total++;

    return new Promise((resolve, reject) => {
      const item = {
        id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fn,
        label,
        timeout,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(item);

      if (!this.processing) {
        this._processNext();
      }
    });
  }

  async _processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift();

    try {
      const result = await this._withTimeout(item);
      this.stats.completed++;
      item.resolve(result);
    } catch (error) {
      if (error.code === 'WRITE_TIMEOUT') {
        this.stats.timedOut++;
        console.error(`[DbWriteQueue] Timeout: ${item.label} (${item.id})`);
      } else {
        this.stats.failed++;
        console.error(`[DbWriteQueue] Error: ${item.label} — ${error.message}`);
      }
      item.reject(error);
    }

    // Process next item
    this._processNext();
  }

  _withTimeout(item) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Write queue timeout: ${item.label}`);
        error.code = 'WRITE_TIMEOUT';
        reject(error);
      }, item.timeout);

      try {
        const db = getDb();
        const result = item.fn(db);

        // Handle both sync and async fn
        if (result && typeof result.then === 'function') {
          result
            .then((r) => {
              clearTimeout(timer);
              resolve(r);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Get queue statistics.
   */
  getStats() {
    return {
      ...this.stats,
      pending: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * Clear the queue (rejects all pending items).
   */
  clear() {
    const count = this.queue.length;
    for (const item of this.queue) {
      const error = new Error('Write queue cleared');
      error.code = 'QUEUE_CLEARED';
      item.reject(error);
    }
    this.queue = [];
    return count;
  }
}

// Singleton instance
const instance = new DbWriteQueue();

/**
 * Helper: execute a function through the write queue.
 * @param {function} fn
 * @param {object} [options]
 * @returns {Promise<any>}
 */
async function withDbWriteQueue(fn, options = {}) {
  return instance.enqueue(fn, options);
}

module.exports = {
  DbWriteQueue,
  instance,
  withDbWriteQueue,
};
