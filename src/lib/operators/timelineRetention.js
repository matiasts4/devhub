/**
 * timelineRetention.js — 90-day rolling window purge (D-4)
 *
 * Retention: entries older than 90 days are purged via SQLite DELETE.
 * Purge runs:
 *   - Lazily on every successful POST (fire-and-forget)
 *   - Daily via setInterval (survives process restart)
 *
 * @module lib/operators/timelineRetention
 */

const { getDb } = require('@/lib/db/localDb.js');

/**
 * Delete all timeline entries older than 90 days.
 * Safe to call multiple times — idempotent DELETE.
 *
 * @returns {number} count of deleted rows
 */
function purgeOldEntries() {
  const db = getDb();
  const result = db
    .prepare(
      `DELETE FROM operator_timeline
       WHERE datetime(occurred_at) < datetime('now', '-90 days')`
    )
    .run();
  return result.changes;
}

/** @type {ReturnType<typeof setInterval>|null} */
let _dailyIntervalId = null;

/**
 * Schedule the daily purge job.
 * Idempotent — calling twice does not stack intervals.
 */
function schedulePurge() {
  if (_dailyIntervalId !== null) return; // already scheduled

  _dailyIntervalId = setInterval(
    () => {
      try {
        const deleted = purgeOldEntries();
        if (deleted > 0) {
          console.info(`[timelineRetention] Purged ${deleted} stale timeline entries.`);
        }
      } catch (err) {
        console.error('[timelineRetention] Purge failed:', err.message);
      }
    },
    24 * 60 * 60 * 1000
  ); // 24 hours in ms
}

module.exports = {
  purgeOldEntries,
  schedulePurge,
};
