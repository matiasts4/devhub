'use strict';

const { getDb, tableHasColumn } = require('./shared');

function deleteByProjectId(db, tableName, projectId) {
  if (!tableHasColumn(db, tableName, 'project_id')) return;
  db.prepare(`DELETE FROM ${tableName} WHERE project_id = ?`).run(projectId);
}

function deleteByValues(db, tableName, columnName, values) {
  if (!values || values.length === 0 || !tableHasColumn(db, tableName, columnName)) return;
  const placeholders = values.map(() => '?').join(', ');
  db.prepare(`DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`).run(...values);
}

function deleteProjectCascadeUnsafe(dbOrProjectId, maybeProjectId) {
  const hasDb = dbOrProjectId && typeof dbOrProjectId.prepare === 'function';
  const db = hasDb ? dbOrProjectId : getDb();
  const projectId = hasDb ? maybeProjectId : dbOrProjectId;

  if (!projectId) return { changes: 0 };

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return { changes: 0 };

  const taskIds = tableHasColumn(db, 'tasks', 'project_id')
    ? db
        .prepare('SELECT id FROM tasks WHERE project_id = ?')
        .all(projectId)
        .map((row) => row.id)
    : [];

  deleteByValues(db, 'task_dependencies', 'task_id', taskIds);
  deleteByValues(db, 'task_dependencies', 'depends_on', taskIds);
  deleteByValues(db, 'task_comments', 'task_id', taskIds);

  deleteByProjectId(db, 'tasks', projectId);
  deleteByProjectId(db, 'milestones', projectId);
  deleteByProjectId(db, 'agent_registry', projectId);
  deleteByProjectId(db, 'ai_interactions', projectId);
  deleteByProjectId(db, 'project_files', projectId);
  deleteByProjectId(db, 'agent_memory', projectId);
  deleteByProjectId(db, 'agent_hub_sessions', projectId);

  return db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

module.exports = {
  deleteByProjectId,
  deleteByValues,
  deleteProjectCascadeUnsafe,
};
