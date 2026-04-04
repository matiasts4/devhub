/**
 * Unit tests for Trace API routes
 *
 * Tests the REST API endpoints for agent traces:
 * - POST   /api/agenthub/sessions/:id/traces
 * - GET    /api/agenthub/sessions/:id/traces
 * - PATCH  /api/agenthub/sessions/:id/traces/:traceId
 * - GET    /api/agenthub/sessions/:id/traces/search
 *
 * Uses an in-memory SQLite database to isolate tests from the real DB.
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');

// ── In-memory test database ─────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE agent_hub_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      agent_model TEXT,
      telegram_chat_id TEXT,
      directory TEXT,
      status TEXT DEFAULT 'active',
      opencode_session_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_traces (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trace_type TEXT NOT NULL,
      agent_name TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_status TEXT,
      content TEXT,
      duration_ms INTEGER,
      time_start REAL,
      time_end REAL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
    CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name);
    CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status);

    CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(
      tool_name, tool_input, tool_output, content,
      content='agent_traces',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS traces_fts_insert AFTER INSERT ON agent_traces BEGIN
      INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
      VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
    END;
  `);

  return db;
}

// ── Simulated route handlers (mirroring the actual route.js logic) ──────────

function createTraceHandler(db) {
  const insertStmt = db.prepare(`
    INSERT INTO agent_traces 
      (id, session_id, trace_type, agent_name, tool_name, tool_input, tool_output, 
       tool_status, content, duration_ms, time_start, time_end, metadata)
    VALUES (@id, @session_id, @trace_type, @agent_name, @tool_name, @tool_input, @tool_output,
            @tool_status, @content, @duration_ms, @time_start, @time_end, @metadata)
  `);

  const getBySessionStmt = db.prepare(`
    SELECT * FROM agent_traces WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
  `);

  const getBySessionAndTypeStmt = db.prepare(`
    SELECT * FROM agent_traces WHERE session_id = ? AND trace_type = ? ORDER BY created_at ASC LIMIT ?
  `);

  const getBySessionAndToolStmt = db.prepare(`
    SELECT * FROM agent_traces WHERE session_id = ? AND tool_name = ? ORDER BY created_at ASC LIMIT ?
  `);

  const getBySessionAndStatusStmt = db.prepare(`
    SELECT * FROM agent_traces WHERE session_id = ? AND tool_status = ? ORDER BY created_at ASC LIMIT ?
  `);

  const searchStmt = db.prepare(`
    SELECT t.*, fts.rank 
    FROM agent_traces t
    JOIN agent_traces_fts fts ON t.rowid = fts.rowid
    WHERE t.session_id = ? AND agent_traces_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `);

  return {
    // POST /api/agenthub/sessions/:id/traces
    async createTrace(sessionId, body) {
      if (!body.trace_type) {
        return { status: 400, body: { error: 'trace_type is required' } };
      }

      try {
        const result = insertStmt.run({
          id: body.id || crypto.randomUUID(),
          session_id: sessionId,
          trace_type: body.trace_type,
          agent_name: body.agent_name || null,
          tool_name: body.tool_name || null,
          tool_input: body.tool_input ? JSON.stringify(body.tool_input) : null,
          tool_output: body.tool_output || null,
          tool_status: body.tool_status || null,
          content: body.content || null,
          duration_ms: body.duration_ms || null,
          time_start: body.time_start || null,
          time_end: body.time_end || null,
          metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        });

        return { status: 200, body: { success: true, id: result.lastInsertRowid || body.id } };
      } catch (err) {
        return { status: 500, body: { error: err.message } };
      }
    },

    // GET /api/agenthub/sessions/:id/traces
    async getTraces(sessionId, queryParams = {}) {
      try {
        const limit = parseInt(queryParams.limit, 10) || 100;
        let rows;

        if (queryParams.type) {
          rows = getBySessionAndTypeStmt.all(sessionId, queryParams.type, limit);
        } else if (queryParams.tool) {
          rows = getBySessionAndToolStmt.all(sessionId, queryParams.tool, limit);
        } else if (queryParams.status) {
          rows = getBySessionAndStatusStmt.all(sessionId, queryParams.status, limit);
        } else {
          rows = getBySessionStmt.all(sessionId, limit);
        }

        const parsed = rows.map((r) => ({
          ...r,
          tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
          metadata: r.metadata ? JSON.parse(r.metadata) : null,
        }));

        return { status: 200, body: parsed };
      } catch (err) {
        return { status: 500, body: { error: err.message } };
      }
    },

    // PATCH /api/agenthub/sessions/:id/traces/:traceId
    async updateTrace(traceId, body) {
      try {
        const allowedFields = [
          'tool_status',
          'tool_output',
          'tool_input',
          'duration_ms',
          'time_end',
          'content',
          'metadata',
        ];

        const updates = {};
        for (const field of allowedFields) {
          if (body[field] !== undefined) {
            updates[field] = body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return { status: 400, body: { error: 'No valid fields to update' } };
        }

        const setClauses = [];
        const params = [];
        for (const [key, value] of Object.entries(updates)) {
          if (key === 'tool_input' || key === 'metadata') {
            setClauses.push(`${key} = ?`);
            params.push(value ? JSON.stringify(value) : null);
          } else {
            setClauses.push(`${key} = ?`);
            params.push(value);
          }
        }
        setClauses.push("created_at = datetime('now')");
        params.push(traceId);

        const query = `UPDATE agent_traces SET ${setClauses.join(', ')} WHERE id = ?`;
        const result = db.prepare(query).run(...params);

        if (result.changes === 0) {
          return { status: 404, body: { error: 'Trace not found' } };
        }

        return { status: 200, body: { success: true, changes: result.changes } };
      } catch (err) {
        return { status: 500, body: { error: err.message } };
      }
    },

    // GET /api/agenthub/sessions/:id/traces/search
    async searchTraces(sessionId, queryParams = {}) {
      try {
        const q = queryParams.q;
        if (!q) {
          return { status: 400, body: { error: 'Query parameter "q" is required' } };
        }

        const limit = parseInt(queryParams.limit, 10) || 50;
        const rows = searchStmt.all(sessionId, q, limit);

        let results = rows.map((r) => ({
          ...r,
          tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
          metadata: r.metadata ? JSON.parse(r.metadata) : null,
        }));

        // Type filter in-memory
        if (queryParams.type) {
          results = results.filter((r) => r.trace_type === queryParams.type);
        }

        return { status: 200, body: results };
      } catch (err) {
        return { status: 500, body: { error: err.message } };
      }
    },
  };
}

// ── Assertion helper ────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests = [
  {
    name: 'POST /api/agenthub/sessions/:id/traces creates trace',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);
      const sessionId = crypto.randomUUID();

      // Create session
      db.prepare(`INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)`).run(
        sessionId,
        'proj-1',
        'Test Session'
      );

      const response = await handler.createTrace(sessionId, {
        trace_type: 'tool_call',
        agent_name: 'test-agent',
        tool_name: 'read_file',
        tool_input: { path: '/test/file.js' },
        tool_status: 'success',
        content: 'File content here',
        duration_ms: 150,
      });

      assert(response.status === 200, `Expected 200, got ${response.status}`);
      assert(response.body.success === true, 'should have success: true');
      assert(response.body.id !== undefined, 'should return an ID');

      // Verify trace was inserted
      const trace = db.prepare('SELECT * FROM agent_traces WHERE session_id = ?').get(sessionId);
      assert(trace !== undefined, 'trace should exist in DB');
      assert(trace.trace_type === 'tool_call', 'trace_type should match');
      assert(trace.tool_name === 'read_file', 'tool_name should match');
      assert(trace.tool_status === 'success', 'tool_status should match');
      assert(trace.duration_ms === 150, 'duration_ms should match');

      db.close();
    },
  },
  {
    name: 'POST /api/agenthub/sessions/:id/traces rejects without trace_type',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);
      const sessionId = crypto.randomUUID();

      const response = await handler.createTrace(sessionId, {
        agent_name: 'test-agent',
        content: 'no trace type',
      });

      assert(response.status === 400, `Expected 400, got ${response.status}`);
      assert(response.body.error === 'trace_type is required', 'should have error message');

      db.close();
    },
  },
  {
    name: 'GET /api/agenthub/sessions/:id/traces returns traces',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);
      const sessionId = crypto.randomUUID();

      db.prepare(`INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)`).run(
        sessionId,
        'proj-1',
        'Test Session'
      );

      // Insert test traces
      for (let i = 0; i < 3; i++) {
        await handler.createTrace(sessionId, {
          trace_type: 'text',
          content: `Message ${i}`,
        });
      }

      const response = await handler.getTraces(sessionId);

      assert(response.status === 200, `Expected 200, got ${response.status}`);
      assert(Array.isArray(response.body), 'should return an array');
      assert(response.body.length === 3, `Expected 3 traces, got ${response.body.length}`);

      // Test with type filter
      await handler.createTrace(sessionId, {
        trace_type: 'tool_call',
        tool_name: 'write_file',
        content: 'tool trace',
      });

      const filtered = await handler.getTraces(sessionId, { type: 'tool_call' });
      assert(filtered.body.length === 1, 'type filter should return 1 trace');

      db.close();
    },
  },
  {
    name: 'PATCH /api/agenthub/sessions/:id/traces/:traceId updates trace',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);
      const sessionId = crypto.randomUUID();
      const traceId = crypto.randomUUID();

      db.prepare(`INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)`).run(
        sessionId,
        'proj-1',
        'Test Session'
      );

      // Create a trace
      await handler.createTrace(sessionId, {
        id: traceId,
        trace_type: 'tool_call',
        tool_name: 'read_file',
        tool_status: 'pending',
        content: 'initial content',
      });

      // Update the trace
      const response = await handler.updateTrace(traceId, {
        tool_status: 'success',
        tool_output: 'File contents',
        duration_ms: 200,
      });

      assert(response.status === 200, `Expected 200, got ${response.status}`);
      assert(response.body.success === true, 'should have success: true');
      assert(response.body.changes > 0, 'should have changes');

      // Verify update
      const trace = db.prepare('SELECT * FROM agent_traces WHERE id = ?').get(traceId);
      assert(trace.tool_status === 'success', 'tool_status should be updated');
      assert(trace.tool_output === 'File contents', 'tool_output should be updated');
      assert(trace.duration_ms === 200, 'duration_ms should be updated');

      db.close();
    },
  },
  {
    name: 'PATCH returns 404 for non-existent trace',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);

      const response = await handler.updateTrace('non-existent-id', {
        tool_status: 'success',
      });

      assert(response.status === 404, `Expected 404, got ${response.status}`);

      db.close();
    },
  },
  {
    name: 'PATCH returns 400 when no valid fields provided',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);

      const response = await handler.updateTrace('some-id', {
        invalid_field: 'value',
      });

      assert(response.status === 400, `Expected 400, got ${response.status}`);
      assert(response.body.error === 'No valid fields to update', 'should have error message');

      db.close();
    },
  },
  {
    name: 'GET /api/agenthub/sessions/:id/traces/search finds traces',
    async run() {
      const db = createTestDb();
      const handler = createTraceHandler(db);
      const sessionId = crypto.randomUUID();

      db.prepare(`INSERT INTO agent_hub_sessions (id, project_id, title) VALUES (?, ?, ?)`).run(
        sessionId,
        'proj-1',
        'Test Session'
      );

      // Insert searchable traces
      await handler.createTrace(sessionId, {
        trace_type: 'tool_call',
        tool_name: 'read_file',
        tool_input: { path: '/src/auth/middleware.ts' },
        content: 'JWT authentication middleware',
      });

      await handler.createTrace(sessionId, {
        trace_type: 'tool_call',
        tool_name: 'write_file',
        tool_input: { path: '/src/api/users.js' },
        content: 'User management API endpoint',
      });

      await handler.createTrace(sessionId, {
        trace_type: 'text',
        content: 'General text message without tool references',
      });

      // Search for "auth"
      const searchAuth = await handler.searchTraces(sessionId, { q: 'auth' });
      assert(searchAuth.status === 200, `Expected 200, got ${searchAuth.status}`);
      assert(searchAuth.body.length >= 1, 'should find auth-related traces');

      // Search for "write"
      const searchWrite = await handler.searchTraces(sessionId, { q: 'write' });
      assert(searchWrite.body.length >= 1, 'should find write-related traces');

      // Search with type filter
      const searchTool = await handler.searchTraces(sessionId, { q: 'file', type: 'tool_call' });
      assert(searchTool.body.length >= 1, 'should find tool_call traces with "file"');

      // Search without query should return 400
      const noQuery = await handler.searchTraces(sessionId, {});
      assert(noQuery.status === 400, `Expected 400 for missing query, got ${noQuery.status}`);

      db.close();
    },
  },
];

// ── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('Running trace-api tests...\n');

  for (const test of tests) {
    try {
      await test.run();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${test.name}`);
      console.log(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    console.log(`${failed} test(s) failed`);
    process.exit(1);
  }
}

runTests();
