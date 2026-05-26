'use strict';

const { getDb } = require('./shared');

function resolveQueueArgs(dbOrQueueName, maybeQueueName, maybePayload) {
  const hasDb = dbOrQueueName && typeof dbOrQueueName.prepare === 'function';
  return {
    db: hasDb ? dbOrQueueName : getDb(),
    queueName: hasDb ? maybeQueueName : dbOrQueueName,
    payload: hasDb ? maybePayload : maybeQueueName,
  };
}

function resolveItemArgs(dbOrItemId, maybeItemId) {
  const hasDb = dbOrItemId && typeof dbOrItemId.prepare === 'function';
  return {
    db: hasDb ? dbOrItemId : getDb(),
    itemId: hasDb ? maybeItemId : dbOrItemId,
  };
}

function resolveNumberArgs(dbOrValue, maybeValue, fallback) {
  const hasDb = dbOrValue && typeof dbOrValue.prepare === 'function';
  return {
    db: hasDb ? dbOrValue : getDb(),
    value: hasDb ? maybeValue : (dbOrValue ?? fallback),
  };
}

function enqueueDurableItem(dbOrQueueName, maybeQueueName, maybePayload) {
  const { db, queueName, payload } = resolveQueueArgs(dbOrQueueName, maybeQueueName, maybePayload);
  const payloadJson = JSON.stringify(payload || {});
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO swarm_queue_items (queue_name, payload_json, status, enqueued_at, acquired_at, acked_at)
       VALUES (?, ?, 'pending', ?, NULL, NULL)`
    )
    .run(queueName, payloadJson, now);
  return db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(result.lastInsertRowid);
}

function dequeueDurableItem(dbOrQueueName, maybeQueueName) {
  const { db, queueName } = resolveQueueArgs(dbOrQueueName, maybeQueueName, undefined);
  const now = new Date().toISOString();
  const item = db
    .prepare(
      `SELECT * FROM swarm_queue_items WHERE queue_name = ? AND status = 'pending' ORDER BY enqueued_at ASC LIMIT 1`
    )
    .get(queueName);
  if (!item) return null;

  const updated = db
    .prepare(
      "UPDATE swarm_queue_items SET status = 'processing', acquired_at = ? WHERE id = ? AND status = 'pending'"
    )
    .run(now, item.id);
  if (updated.changes === 0) return null;
  return db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(item.id);
}

function ackDurableItem(dbOrItemId, maybeItemId) {
  const { db, itemId } = resolveItemArgs(dbOrItemId, maybeItemId);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      "UPDATE swarm_queue_items SET status = 'completed', acked_at = ? WHERE id = ? AND status = 'processing'"
    )
    .run(now, itemId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(itemId);
}

function cancelDurableItem(dbOrItemId, maybeItemId) {
  const { db, itemId } = resolveItemArgs(dbOrItemId, maybeItemId);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      "UPDATE swarm_queue_items SET status = 'cancelled', acked_at = ? WHERE id = ? AND status IN ('pending', 'processing')"
    )
    .run(now, itemId);
  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM swarm_queue_items WHERE id = ?').get(itemId);
}

function recoverStaleItems(dbOrMinutes, maybeMinutes) {
  const { db, value } = resolveNumberArgs(dbOrMinutes, maybeMinutes, 5);
  const cutoff = new Date(Date.now() - value * 60_000).toISOString();
  const result = db
    .prepare(
      `UPDATE swarm_queue_items
       SET status = 'pending', acquired_at = NULL, retries = retries + 1
       WHERE status = 'processing' AND acquired_at < ?`
    )
    .run(cutoff);
  return result.changes;
}

function cleanupCompletedItems(dbOrMinutes, maybeMinutes) {
  const { db, value } = resolveNumberArgs(dbOrMinutes, maybeMinutes, 60);
  const cutoff = new Date(Date.now() - value * 60_000).toISOString();
  const result = db
    .prepare(
      "DELETE FROM swarm_queue_items WHERE status IN ('completed', 'cancelled') AND acked_at < ?"
    )
    .run(cutoff);
  return result.changes;
}

module.exports = {
  enqueueDurableItem,
  dequeueDurableItem,
  ackDurableItem,
  cancelDurableItem,
  recoverStaleItems,
  cleanupCompletedItems,
};
