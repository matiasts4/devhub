'use strict';

const { resolveDbArgs } = require('./shared');

const VALID_INBOX_CATEGORIES = [
  'approval_request',
  'approval_result',
  'supervisor_action',
  'task_claimed',
  'task_released',
  'task_blocked',
  'agent_event',
  'system',
];

function recordInboxItem(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!VALID_INBOX_CATEGORIES.includes(input.category)) {
    throw new Error(
      `Invalid inbox category: ${input.category}. Must be one of: ${VALID_INBOX_CATEGORIES.join(', ')}`
    );
  }

  const inboxId = `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO operator_inbox (inbox_id, project_id, actor_id, category, source_table, source_id, message, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)`
  ).run(
    inboxId,
    input.projectId,
    input.actorId,
    input.category,
    input.sourceTable,
    input.sourceId,
    input.message,
    now,
    now
  );

  return { inbox_id: inboxId, status: 'unread', created_at: now };
}

function queryOperatorInbox(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  let query = 'SELECT * FROM operator_inbox WHERE 1=1';
  const params = [];

  if (input.projectId) {
    query += ' AND project_id = ?';
    params.push(input.projectId);
  }
  if (input.status) {
    query += ' AND status = ?';
    params.push(input.status);
  }
  if (input.category) {
    query += ' AND category = ?';
    params.push(input.category);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(input.limit || 50, input.offset || 0);
  return db.prepare(query).all(...params);
}

function markInboxItemRead(dbOrInboxId, maybeInboxId) {
  const { db, input } = resolveDbArgs(dbOrInboxId, maybeInboxId);
  const inboxId = typeof input === 'string' ? input : input?.inboxId;
  const result = db
    .prepare(
      "UPDATE operator_inbox SET status = 'read', updated_at = ? WHERE inbox_id = ? AND status = 'unread'"
    )
    .run(new Date().toISOString(), inboxId);
  return result.changes > 0;
}

function dismissInboxItem(dbOrInboxId, maybeInboxId) {
  const { db, input } = resolveDbArgs(dbOrInboxId, maybeInboxId);
  const inboxId = typeof input === 'string' ? input : input?.inboxId;
  const result = db
    .prepare(
      "UPDATE operator_inbox SET status = 'dismissed', updated_at = ? WHERE inbox_id = ? AND status IN ('unread', 'read')"
    )
    .run(new Date().toISOString(), inboxId);
  return result.changes > 0;
}

module.exports = {
  recordInboxItem,
  queryOperatorInbox,
  markInboxItemRead,
  dismissInboxItem,
};
