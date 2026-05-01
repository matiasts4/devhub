const Database = require('better-sqlite3');

const { ensureRuntimeSchema } = require('../../src/lib/db/localDb');
const { applyTestSchema } = require('../../lib/test-schema');

function seedSession(db, sessionId) {
  db.prepare(`INSERT INTO projects (id, name, status) VALUES (?, ?, 'active')`).run(
    'project-1',
    'Test Project'
  );

  db.prepare(`INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)`).run(
    sessionId,
    'project-1',
    'Test Session'
  );
}

function assertSessionUsageUpsertContract(db, sessionId) {
  const upsert = db.prepare(`
    INSERT INTO agent_session_usage
      (id, session_id, prompt_tokens, completion_tokens, total_tokens,
       context_window_size, context_utilization, tool_calls_count, total_duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      total_tokens = excluded.total_tokens,
      context_window_size = excluded.context_window_size,
      context_utilization = excluded.context_utilization,
      tool_calls_count = excluded.tool_calls_count,
      total_duration_ms = excluded.total_duration_ms,
      updated_at = datetime('now')
  `);

  upsert.run('usage-1', sessionId, 10, 20, 30, 100, 0.3, 1, 500);
  upsert.run('usage-2', sessionId, 11, 21, 32, 200, 0.5, 2, 900);

  const rows = db.prepare(`SELECT * FROM agent_session_usage WHERE session_id = ?`).all(sessionId);

  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe('usage-1');
  expect(rows[0].prompt_tokens).toBe(11);
  expect(rows[0].completion_tokens).toBe(21);
  expect(rows[0].total_tokens).toBe(32);
  expect(rows[0].context_window_size).toBe(200);
  expect(rows[0].context_utilization).toBe(0.5);
  expect(rows[0].tool_calls_count).toBe(2);
  expect(rows[0].total_duration_ms).toBe(900);
}

describe('agent_session_usage schema contract', () => {
  it('ensureRuntimeSchema supports UPSERT by session_id', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    ensureRuntimeSchema(db);
    seedSession(db, 'session-runtime');

    assertSessionUsageUpsertContract(db, 'session-runtime');

    db.close();
  });

  it('applyTestSchema matches the runtime UPSERT contract', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    applyTestSchema(db);
    seedSession(db, 'session-test-schema');

    assertSessionUsageUpsertContract(db, 'session-test-schema');

    db.close();
  });
});
