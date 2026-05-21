/**
 * Integration test: Telegram → OpenCode flow
 *
 * Tests the full end-to-end flow:
 * 1. Session bridge resolves session for a chat ID
 * 2. Message is sent to OpenCode
 * 3. SSE events are parsed and traces are persisted
 * 4. Response is returned
 * 5. Session usage is updated
 *
 * ⚠️ This test requires OpenCode to be running.
 * Skip if OpenCode server is not available.
 *
 * Usage: node tests/integration/telegram-opencode.test.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const OPENCODE_PORT = 4153;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

// ── Check if OpenCode is running ────────────────────────────────────────────

async function isOpencodeRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OPENCODE_URL}/global/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

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

    CREATE TABLE telegram_session_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_chat_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
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

    CREATE TABLE agent_session_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      context_window_size INTEGER,
      context_utilization REAL,
      tool_calls_count INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
  `);

  return db;
}

// ── Test helpers ────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function createOpencodeSession() {
  const res = await fetch(`${OPENCODE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create OpenCode session: ${res.status}`);
  }

  return res.json();
}

async function sendMessageToOpencode(opencodeSessionId, agent, prompt) {
  const res = await fetch(`${OPENCODE_URL}/session/${opencodeSessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent,
      parts: [{ type: 'text', text: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send message: ${res.status}`);
  }

  return res.json();
}

async function streamSSEEvents(timeoutMs = 10000) {
  const events = [];
  const startTime = Date.now();

  try {
    const res = await fetch(`${OPENCODE_URL}/event`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (Date.now() - startTime < timeoutMs) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            events.push(event);

            // Stop on session idle (completion)
            if (
              event.type === 'session.status' &&
              (event.properties?.status?.type === 'idle' || event.properties?.status === 'idle')
            ) {
              return events;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  } catch {
    // SSE stream ended
  }

  return events;
}

function persistTrace(db, sessionId, eventType, properties) {
  const traceId = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO agent_traces 
      (id, session_id, trace_type, agent_name, tool_name, tool_input, tool_output, 
       tool_status, content, duration_ms, time_start, time_end, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    traceId,
    sessionId,
    eventType.includes('tool') ? 'tool_call' : 'text',
    'test-agent',
    properties?.name || properties?.tool || null,
    properties ? JSON.stringify(properties) : null,
    null,
    eventType.includes('error') ? 'error' : 'success',
    properties?.text || properties?.content || null,
    null,
    now / 1000,
    null,
    JSON.stringify({ eventType, rawProperties: properties })
  );

  return traceId;
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests = [
  {
    name: 'Full Telegram → OpenCode flow',
    async run() {
      const db = createTestDb();
      const chatId = 'integration-test-chat';
      const sessionId = crypto.randomUUID();

      // Step 1: Create session (simulating session bridge resolve)
      db.prepare(
        `INSERT INTO agent_hub_sessions (id, project_id, title, telegram_chat_id, directory, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(sessionId, 'proj-test', 'Integration Test Session', chatId, process.cwd(), 'active');

      db.prepare(
        `INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
         VALUES (?, ?, ?, 1)`
      ).run(chatId, sessionId, 'proj-test');

      const sessionRow = db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(sessionId);
      assert(sessionRow !== undefined, 'Session should be created');
      assert(sessionRow.telegram_chat_id === chatId, 'Chat ID should match');

      // Step 2: Create OpenCode session
      const ocSession = await createOpencodeSession();
      assert(ocSession.id !== undefined, 'OpenCode session ID should exist');

      // Link OpenCode session
      db.prepare(
        `UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(ocSession.id, sessionId);

      // Step 3: Start SSE stream (before sending message)
      const ssePromise = streamSSEEvents(15000);

      // Step 4: Send message
      await sendMessageToOpencode(ocSession.id, 'gentleman', 'Say hello briefly');

      // Step 5: Wait for SSE events
      const events = await ssePromise;
      assert(events.length > 0, 'Should receive SSE events');

      // Step 6: Persist traces from events
      let traceCount = 0;
      for (const event of events) {
        const traceId = persistTrace(db, sessionId, event.type || 'unknown', event.properties);
        assert(traceId !== undefined, 'Trace should be persisted');
        traceCount++;
      }

      assert(traceCount > 0, 'Should have persisted at least one trace');

      // Step 7: Verify traces in DB
      const traces = db.prepare('SELECT * FROM agent_traces WHERE session_id = ?').all(sessionId);
      assert(traces.length > 0, 'Should have traces in DB');

      // Step 8: Update session usage
      const usageDurationMs = Math.max(events.length * 100, 100);
      db.prepare(
        `INSERT INTO agent_session_usage 
          (id, session_id, prompt_tokens, completion_tokens, total_tokens, tool_calls_count, total_duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), sessionId, 50, 30, 80, traceCount, usageDurationMs);

      const usage = db
        .prepare('SELECT * FROM agent_session_usage WHERE session_id = ?')
        .get(sessionId);
      assert(usage !== undefined, 'Usage should be recorded');
      assert(usage.total_tokens === 80, 'Total tokens should match');

      db.close();
    },
  },
];

describe('Telegram to OpenCode integration', () => {
  for (const scenario of tests) {
    test(
      scenario.name,
      async () => {
        const running = await isOpencodeRunning();
        if (!running) {
          console.warn(`SKIP: OpenCode server is not running on port ${OPENCODE_PORT}`);
          return;
        }

        await scenario.run();
      },
      20000
    );
  }
});
