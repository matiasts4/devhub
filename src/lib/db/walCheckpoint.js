/**
 * WAL Checkpoint Policy — manages SQLite WAL file size.
 *
 * Prevents WAL from growing unbounded during long swarm sessions.
 * Performs safe checkpoints when WAL exceeds threshold.
 */

const fs = require('fs');
const { getDb } = require('./shared');
const { resolveDbPath } = require('./pathResolver');

const DEFAULT_WAL_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Get the current WAL file size.
 * @param {string} dbPath
 * @returns {number} Size in bytes, or 0 if WAL doesn't exist.
 */
function getWalSize(dbPath = resolveDbPath()) {
  const walPath = `${dbPath}-wal`;
  try {
    return fs.statSync(walPath).size;
  } catch {
    return 0;
  }
}

/**
 * Get the current SHM file size.
 * @param {string} dbPath
 * @returns {number} Size in bytes, or 0 if SHM doesn't exist.
 */
function getShmSize(dbPath = resolveDbPath()) {
  const shmPath = `${dbPath}-shm`;
  try {
    return fs.statSync(shmPath).size;
  } catch {
    return 0;
  }
}

/**
 * Perform a safe WAL checkpoint.
 *
 * Uses PASSIVE mode to avoid blocking active readers.
 * Returns the checkpoint result.
 *
 * @param {object} [options]
 * @param {string} [options.mode] - 'PASSIVE', 'FULL', 'RESTART', 'TRUNCATE'
 * @param {object} [options.db] - Optional db instance (uses singleton if not provided)
 * @returns {{ pagesCheckpointed: number, pagesRemaining: number, pagesInWal: number }}
 */
function performWalCheckpoint(options = {}) {
  const mode = options.mode || 'PASSIVE';
  const db = options.db || getDb();

  try {
    const result = db.pragma(`wal_checkpoint(${mode})`, { simple: false });

    console.log(`[WAL] Checkpoint (${mode}): ${JSON.stringify(result)}`);

    return {
      pagesCheckpointed: result?.pages || 0,
      pagesRemaining: result?.pagesRemaining || 0,
      pagesInWal: result?.pagesInWal || 0,
      mode,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[WAL] Checkpoint failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check if WAL needs checkpointing and perform it if so.
 *
 * @param {object} [options]
 * @param {number} [options.thresholdBytes] - WAL size threshold (default: 50MB)
 * @param {string} [options.mode] - Checkpoint mode
 * @returns {{ checked: boolean, checkpointed: boolean, walSize: number, result?: object }}
 */
function checkAndCheckpoint(options = {}) {
  const threshold = options.thresholdBytes || DEFAULT_WAL_THRESHOLD_BYTES;
  const walSize = getWalSize();

  if (walSize < threshold) {
    return {
      checked: true,
      checkpointed: false,
      walSize,
      threshold,
    };
  }

  console.log(`[WAL] Size ${walSize} exceeds threshold ${threshold}, checkpointing...`);

  const result = performWalCheckpoint({ mode: options.mode });

  return {
    checked: true,
    checkpointed: true,
    walSize,
    threshold,
    result,
  };
}

/**
 * Start a periodic WAL checkpoint monitor.
 *
 * @param {object} [options]
 * @param {number} [options.intervalMs] - Check interval (default: 60s)
 * @param {number} [options.thresholdBytes] - WAL size threshold
 * @returns {{ stop: function }}
 */
function startWalMonitor(options = {}) {
  const intervalMs = options.intervalMs || DEFAULT_CHECK_INTERVAL_MS;

  const timer = setInterval(() => {
    try {
      const result = checkAndCheckpoint({
        thresholdBytes: options.thresholdBytes,
        mode: 'PASSIVE',
      });

      if (result.checkpointed) {
        console.log(`[WAL] Auto-checkpoint completed: ${JSON.stringify(result.result)}`);
      }
    } catch (error) {
      console.error(`[WAL] Monitor error: ${error.message}`);
    }
  }, intervalMs);

  // Don't prevent process exit
  if (timer.unref) timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
      console.log('[WAL] Monitor stopped');
    },
  };
}

module.exports = {
  getWalSize,
  getShmSize,
  performWalCheckpoint,
  checkAndCheckpoint,
  startWalMonitor,
  DEFAULT_WAL_THRESHOLD_BYTES,
  DEFAULT_CHECK_INTERVAL_MS,
};
