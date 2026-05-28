'use strict';

const supervisor = require('./supervisor');
const { resolveDbArgs } = require('./shared');

function recordTaskHistory(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const now = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  db.prepare(
    `INSERT INTO task_history (task_id, actor_id, action, from_status, to_status, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.taskId,
    input.actorId || null,
    input.action,
    input.fromStatus || null,
    input.toStatus || null,
    metadataJson,
    now
  );
}

function getTaskHistory(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  let query = 'SELECT * FROM task_history WHERE 1=1';
  const params = [];

  if (input.taskId) {
    query += ' AND task_id = ?';
    params.push(input.taskId);
  }
  if (input.action) {
    query += ' AND action = ?';
    params.push(input.action);
  }

  query += ' ORDER BY history_id DESC LIMIT ? OFFSET ?';
  params.push(input.limit || 50, input.offset || 0);
  return db.prepare(query).all(...params);
}

module.exports = {
  ...supervisor,
  recordTaskHistory,
  getTaskHistory,
};
