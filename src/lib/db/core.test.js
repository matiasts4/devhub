/**
 * @module core.test
 * Tests for core.js — singleton DB, schema, query builders.
 * RED phase: references src/lib/db/core.js which does not exist yet.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// RED: import from the not-yet-existing module
const {
  getDb,
  closeDb,
  ensureRuntimeSchema,
  makeTableOps,
  buildSelectQuery,
  buildWhere,
  tables,
} = require('./core');

test('getDb returns a singleton db handle', () => {
  const db1 = getDb();
  const db2 = getDb();
  assert.strictEqual(db1, db2, 'getDb must return the same instance');
  closeDb();
});

test('closeDb closes the connection and resets singleton', () => {
  const db = getDb();
  assert.ok(db, 'db handle must be truthy');
  closeDb();
  // After close, getDb() must return a NEW open handle
  const db2 = getDb();
  assert.ok(db2, 'new db handle after closeDb must be truthy');
  assert.notStrictEqual(db, db2, 'must be a fresh instance after closeDb');
  closeDb();
});

test('ensureRuntimeSchema runs without error on an in-memory db', () => {
  const db = new Database(':memory:');
  assert.doesNotThrow(() => ensureRuntimeSchema(db), 'ensureRuntimeSchema must not throw');
  db.close();
});

test('ensureRuntimeSchema creates agent_workspaces table', () => {
  const db = new Database(':memory:');
  ensureRuntimeSchema(db);
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_workspaces'")
    .get();
  assert.ok(row, 'agent_workspaces table must exist after ensureRuntimeSchema');
  db.close();
});

test('buildSelectQuery builds basic SELECT', () => {
  const { sql, params } = buildSelectQuery('my_table');
  assert.ok(sql.includes('SELECT * FROM my_table'), 'must include SELECT * FROM my_table');
  assert.deepEqual(params, []);
});

test('buildSelectQuery applies WHERE conditions', () => {
  const { sql, params } = buildSelectQuery('t', {
    where: [['status', '=', 'active']],
  });
  assert.ok(sql.includes('WHERE'), 'must include WHERE clause');
  assert.deepEqual(params, ['active']);
});

test('buildWhere returns 1=1 for empty input', () => {
  const { clauses, values } = buildWhere([]);
  assert.deepEqual(clauses, ['1=1']);
  assert.deepEqual(values, []);
});

test('buildWhere handles IN operator', () => {
  const { clauses, values } = buildWhere([['col', 'IN', ['a', 'b']]]);
  assert.ok(clauses[0].includes('IN'), 'must include IN');
  assert.deepEqual(values, ['a', 'b']);
});

test('tables object is accessible and has expected keys', () => {
  assert.ok(tables, 'tables must be exported');
  assert.equal(typeof tables, 'object', 'tables must be an object');
});

test('makeTableOps returns an object with select and insert', () => {
  const db = new Database(':memory:');
  ensureRuntimeSchema(db);
  const ops = makeTableOps('projects');
  assert.ok(ops, 'ops must be defined');
  assert.equal(typeof ops.select, 'function', 'ops.select must be a function');
  db.close();
});

test('ensureAllSchema upgrades legacy project_members invite columns', () => {
  const { ensureAllSchema } = require('./schema');
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, user_id)
    );
  `);
  assert.doesNotThrow(() => ensureAllSchema(db));
  const cols = db
    .prepare('PRAGMA table_info(project_members)')
    .all()
    .map((row) => row.name);
  assert.ok(cols.includes('invited_email'), 'legacy DB must gain invited_email');
  db.close();
});
