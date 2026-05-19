const Database = require('better-sqlite3');

const mockGetDb = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  __esModule: true,
  default: {
    getDb: mockGetDb,
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

const { GET } = require('../../src/app/api/telegram/status/route');

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE telegram_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE telegram_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      event_type TEXT,
      direction TEXT,
      source TEXT,
      status TEXT DEFAULT 'ok',
      content_preview TEXT,
      metadata TEXT,
      command TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      agent_name TEXT,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      status TEXT DEFAULT 'ok',
      message TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_workspaces (
      id TEXT PRIMARY KEY,
      status TEXT,
      evidence_ref TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      status TEXT,
      terminal_reason_class TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT,
      evidence_ref TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertAgentLog(db, { eventType, toolName = null, secsAgo = 0 }) {
  db.prepare(
    `
      INSERT INTO agent_logs (event_type, tool_name, created_at)
      VALUES (?, ?, datetime('now', ? || ' seconds'))
    `
  ).run(eventType, toolName, String(-secsAgo));
}

function insertWorkspaceAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_workspaces (id, status, evidence_ref, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.id || 'ws-1',
    overrides.status || 'cleanup_pending',
    overrides.evidence_ref || 'evidence://workspace-1',
    overrides.updated_at || '2026-05-18T22:00:00.000Z'
  );
}

function insertRunAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_runs (run_id, workspace_id, status, terminal_reason_class, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    overrides.run_id || 'run-1',
    overrides.workspace_id || 'ws-1',
    overrides.status || 'succeeded',
    overrides.terminal_reason_class || 'qa_approved',
    overrides.created_at || '2026-05-18T22:01:00.000Z'
  );
}

function insertArtifactAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_artifacts (artifact_id, run_id, seq, kind, evidence_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.artifact_id || 'artifact-1',
    overrides.run_id || 'run-1',
    overrides.seq || 1,
    overrides.kind || 'decision.note',
    overrides.evidence_ref || 'artifact://run-1/1',
    overrides.created_at || '2026-05-18T22:02:00.000Z'
  );
}

describe('GET /api/telegram/status', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    mockGetDb.mockReset();
    db.close();
  });

  it('returns additive busy fields without breaking legacy fields', async () => {
    insertAgentLog(db, { eventType: 'session_busy', secsAgo: 5 });
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'bash', secsAgo: 2 });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      bot_connected: false,
      active_chats: 0,
      total_sessions: 0,
      last_activity: null,
      last_event_type: null,
      recent_errors: 0,
      is_busy: true,
      current_tool: 'bash',
    });
  });

  it('returns idle status and null current_tool when no recent busy logs exist', async () => {
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'bash', secsAgo: 60 });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe('bash');
  });

  it('returns HTTP 200 with false/null when agent_logs is empty', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe(null);
  });

  it('returns the most recent tool_name when multiple tool events exist', async () => {
    insertAgentLog(db, { eventType: 'tool_execute', toolName: 'old_tool', secsAgo: 30 });
    insertAgentLog(db, { eventType: 'tool_start', toolName: 'new_tool', secsAgo: 1 });

    const response = await GET();
    const body = await response.json();

    expect(body.current_tool).toBe('new_tool');
    expect(body.is_busy).toBe(true);
  });

  it('projects durable run and artifact audit fields for telegram consumers', async () => {
    insertWorkspaceAudit(db, {
      id: 'ws-audit-1',
      status: 'cleanup_pending',
      evidence_ref: 'evidence://workspace-audit-1',
    });
    insertRunAudit(db, {
      run_id: 'run-audit-1',
      workspace_id: 'ws-audit-1',
      status: 'failed',
      terminal_reason_class: 'qa_blocked',
    });
    insertArtifactAudit(db, {
      artifact_id: 'artifact-audit-1',
      run_id: 'run-audit-1',
      seq: 1,
      kind: 'decision.note',
      evidence_ref: 'run://run-audit-1/startup-intent',
    });
    insertArtifactAudit(db, {
      artifact_id: 'artifact-audit-2',
      run_id: 'run-audit-1',
      seq: 2,
      kind: 'qa.result',
      evidence_ref: 'artifact://run-audit-1/qa/2',
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      workspace_status: 'cleanup_pending',
      run_status: 'failed',
      terminal_reason_class: 'qa_blocked',
      latest_artifact_kind: 'qa.result',
      latest_artifact_evidence_ref: 'artifact://run-audit-1/qa/2',
      artifact_count: 2,
      evidence_ref: 'evidence://workspace-audit-1',
    });
  });
});
