import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureRuntimeSchema } from './localDb.js';
import { applyTestSchema } from '../../../lib/test-schema.js';

function createLegacyProjectsDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#58A6FF',
      status TEXT DEFAULT 'active',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      planning_prompt TEXT,
      planning_status TEXT DEFAULT 'none',
      project_type TEXT DEFAULT 'software',
      local_path TEXT
    );
  `);
  return db;
}

test('adds documentation_policy to legacy projects tables', () => {
  const db = createLegacyProjectsDb();

  assert.doesNotThrow(() => ensureRuntimeSchema(db));

  const columns = db.prepare('PRAGMA table_info(projects)').all();
  const documentationPolicy = columns.find((column) => column.name === 'documentation_policy');

  assert.ok(documentationPolicy);
  assert.equal(documentationPolicy.dflt_value, "'personal'");

  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Legacy Project');
  const row = db.prepare('SELECT documentation_policy FROM projects WHERE id = ?').get('project-1');

  assert.equal(row.documentation_policy, 'personal');

  db.close();
});

test('adds documentation_policy to legacy projects tables via test schema helper', () => {
  const db = createLegacyProjectsDb();

  assert.doesNotThrow(() => applyTestSchema(db));

  const columns = db.prepare('PRAGMA table_info(projects)').all();
  const documentationPolicy = columns.find((column) => column.name === 'documentation_policy');

  assert.ok(documentationPolicy);
  assert.equal(documentationPolicy.dflt_value, "'personal'");

  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-2', 'Helper Project');
  const row = db.prepare('SELECT documentation_policy FROM projects WHERE id = ?').get('project-2');

  assert.equal(row.documentation_policy, 'personal');

  db.close();
});
