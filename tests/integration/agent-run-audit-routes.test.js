const { createTestDb } = require('../../lib/test-schema.js');

const mockGetDb = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        body,
        json: async () => body,
      };
    },
  },
}));

jest.mock('@/lib/db/localDb', () => {
  const actual = jest.requireActual('@/lib/db/localDb');
  return {
    __esModule: true,
    ...actual,
    getDb: (...args) => mockGetDb(...args),
  };
});

const executeRoute = require('../../src/app/api/agent/execute/route.js');
const qaRoute = require('../../src/app/api/agent/qa-result/route.js');
const {
  getAgentRunById,
  listAgentArtifacts,
  upsertSupervisorSnapshot,
  upsertSupervisorApprovalCheckpoint,
} = require('../../src/lib/db/localDb');

function buildWhereClause(where = []) {
  const clauses = [];
  const values = [];
  for (const [column, operator, value] of where) {
    clauses.push(`${column} ${operator} ?`);
    values.push(value);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function attachTableOps(db) {
  const makeOps = (tableName) => ({
    select({ where = [] } = {}) {
      const { sql, values } = buildWhereClause(where);
      return db.prepare(`SELECT * FROM ${tableName} ${sql}`).all(...values);
    },
    single({ where = [] } = {}) {
      const { sql, values } = buildWhereClause(where);
      return db.prepare(`SELECT * FROM ${tableName} ${sql} LIMIT 1`).get(...values) || null;
    },
    update(data, where = []) {
      const keys = Object.keys(data);
      const setSql = keys.map((key) => `${key} = ?`).join(', ');
      const { sql, values } = buildWhereClause(where);
      db.prepare(`UPDATE ${tableName} SET ${setSql} ${sql}`).run(
        ...keys.map((key) => data[key]),
        ...values
      );
      return db.prepare(`SELECT * FROM ${tableName} ${sql} LIMIT 1`).get(...values) || null;
    },
  });

  db.tables = {
    agent_registry: makeOps('agent_registry'),
    tasks: makeOps('tasks'),
    agent_workspaces: makeOps('agent_workspaces'),
  };

  return db;
}

function createFixtureDb() {
  const db = attachTableOps(createTestDb());
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      agent_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      nombre TEXT,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seedExecutionFixture(db, { taskId, agentId, retryCount = 0 }) {
  db.prepare(
    `INSERT INTO projects (id, name, status, documentation_policy, created_at, updated_at)
     VALUES (?, ?, 'active', 'personal', ?, ?)`
  ).run('project-1', 'DevHub', '2026-05-18T22:00:00.000Z', '2026-05-18T22:00:00.000Z');

  db.prepare(
    `INSERT INTO tasks (id, project_id, title, status, retry_count, created_at, updated_at)
     VALUES (?, 'project-1', ?, 'pending', ?, ?, ?)`
  ).run(
    taskId,
    `Task ${taskId}`,
    retryCount,
    '2026-05-18T22:00:00.000Z',
    '2026-05-18T22:00:00.000Z'
  );

  db.prepare(
    `INSERT INTO agent_registry (agent_id, project_id, nombre, status, current_task_id, last_heartbeat, created_at, updated_at)
     VALUES (?, 'project-1', ?, 'idle', NULL, ?, ?, ?)`
  ).run(
    agentId,
    `Agent ${agentId}`,
    '2026-05-18T22:00:00.000Z',
    '2026-05-18T22:00:00.000Z',
    '2026-05-18T22:00:00.000Z'
  );

  upsertSupervisorSnapshot(db, {
    task_id: taskId,
    supervisor_state: 'dispatch_pending',
    outcome: 'dispatch',
    reason_class: null,
    task_retry_count: retryCount,
    attempt_count: 0,
    unchanged_failure_count: 0,
    approval_request_count: 0,
    orphan_recovery_count: 0,
  });
}

describe('agent execute/qa durable audit integration', () => {
  let db;

  beforeEach(() => {
    db = createFixtureDb();
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    mockGetDb.mockReset();
    db.close();
  });

  it('persists ordered startup and QA approval artifacts without introducing git artifact kinds', async () => {
    seedExecutionFixture(db, { taskId: 'task-approve-1', agentId: 'agent-approve-1' });

    const executeResponse = await executeRoute.POST({
      json: async () => ({ task_id: 'task-approve-1', agent_id: 'agent-approve-1' }),
    });

    expect(executeResponse.status).toBe(200);

    upsertSupervisorApprovalCheckpoint(db, {
      task_id: 'task-approve-1',
      workspace_id: executeResponse.body.workspace_id,
      run_id: executeResponse.body.run_id,
      reason_class: 'approval_required',
      evidence_ref: 'evidence://qa-approved-integration-1',
      status: 'pending',
      requested_at: '2026-05-19T01:00:00.000Z',
      updated_at: '2026-05-19T01:00:00.000Z',
    });
    upsertSupervisorSnapshot(db, {
      task_id: 'task-approve-1',
      supervisor_state: 'awaiting_approval',
      outcome: 'request_approval',
      reason_class: 'approval_required',
      task_retry_count: 0,
      attempt_count: 1,
      unchanged_failure_count: 0,
      approval_request_count: 1,
      orphan_recovery_count: 0,
      workspace_id: executeResponse.body.workspace_id,
      run_id: executeResponse.body.run_id,
      evidence_ref: 'evidence://qa-approved-integration-1',
      approval_checkpoint_key: `${'task-approve-1'}|${executeResponse.body.workspace_id}|${executeResponse.body.run_id}|approval_required|evidence://qa-approved-integration-1`,
    });

    const qaResponse = await qaRoute.POST({
      json: async () => ({
        task_id: 'task-approve-1',
        result: 'approved',
        reasons: ['Ship it'],
        workspace_id: executeResponse.body.workspace_id,
        evidence_ref: 'evidence://qa-approved-integration-1',
      }),
    });

    const run = getAgentRunById(db, executeResponse.body.run_id);
    const artifacts = listAgentArtifacts(db, executeResponse.body.run_id);
    const workspace = db
      .prepare(
        'SELECT status, evidence_ref, run_id_or_session_id FROM agent_workspaces WHERE id = ?'
      )
      .get(executeResponse.body.workspace_id);
    const snapshot = db
      .prepare('SELECT * FROM supervisor_snapshots WHERE task_id = ?')
      .get('task-approve-1');
    const checkpoint = db
      .prepare('SELECT * FROM supervisor_approval_checkpoints WHERE task_id = ?')
      .get('task-approve-1');

    expect(qaResponse.status).toBe(200);
    expect(run.status).toBe('succeeded');
    expect(run.terminal_reason_class).toBe('qa_approved');
    expect(workspace).toEqual({
      status: 'cleanup_pending',
      evidence_ref: 'evidence://qa-approved-integration-1',
      run_id_or_session_id: executeResponse.body.run_id,
    });
    expect(snapshot.supervisor_state).toBe('closed');
    expect(snapshot.outcome).toBe('close');
    expect(snapshot.reason_class).toBe('completed');
    expect(checkpoint.status).toBe('approved');
    expect(artifacts.map((artifact) => artifact.seq)).toEqual([1, 2]);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(['decision.note', 'qa.result']);
    expect(artifacts.map((artifact) => artifact.evidence_ref)).toEqual([
      `run://${executeResponse.body.run_id}/startup-intent`,
      'evidence://qa-approved-integration-1',
    ]);
    expect(artifacts.every((artifact) => !artifact.kind.startsWith('git.'))).toBe(true);
  });

  it('records blocked QA outcomes as terminal durable evidence while keeping cleanup as executor intent only', async () => {
    seedExecutionFixture(db, {
      taskId: 'task-blocked-1',
      agentId: 'agent-blocked-1',
      retryCount: 2,
    });

    const executeResponse = await executeRoute.POST({
      json: async () => ({ task_id: 'task-blocked-1', agent_id: 'agent-blocked-1' }),
    });

    upsertSupervisorApprovalCheckpoint(db, {
      task_id: 'task-blocked-1',
      workspace_id: executeResponse.body.workspace_id,
      run_id: executeResponse.body.run_id,
      reason_class: 'approval_required',
      evidence_ref: 'evidence://qa-blocked-integration-1',
      status: 'pending',
      requested_at: '2026-05-19T01:00:00.000Z',
      updated_at: '2026-05-19T01:00:00.000Z',
    });
    upsertSupervisorSnapshot(db, {
      task_id: 'task-blocked-1',
      supervisor_state: 'awaiting_approval',
      outcome: 'request_approval',
      reason_class: 'approval_required',
      task_retry_count: 2,
      attempt_count: 1,
      unchanged_failure_count: 0,
      approval_request_count: 1,
      orphan_recovery_count: 0,
      workspace_id: executeResponse.body.workspace_id,
      run_id: executeResponse.body.run_id,
      evidence_ref: 'evidence://qa-blocked-integration-1',
      approval_checkpoint_key: `${'task-blocked-1'}|${executeResponse.body.workspace_id}|${executeResponse.body.run_id}|approval_required|evidence://qa-blocked-integration-1`,
    });

    const qaResponse = await qaRoute.POST({
      json: async () => ({
        task_id: 'task-blocked-1',
        result: 'rejected',
        reasons: ['Still broken'],
        workspace_id: executeResponse.body.workspace_id,
        evidence_ref: 'evidence://qa-blocked-integration-1',
      }),
    });

    const run = getAgentRunById(db, executeResponse.body.run_id);
    const artifacts = listAgentArtifacts(db, executeResponse.body.run_id);
    const task = db
      .prepare('SELECT status, retry_count FROM tasks WHERE id = ?')
      .get('task-blocked-1');
    const workspace = db
      .prepare('SELECT status, recovery_reason, evidence_ref FROM agent_workspaces WHERE id = ?')
      .get(executeResponse.body.workspace_id);
    const snapshot = db
      .prepare('SELECT * FROM supervisor_snapshots WHERE task_id = ?')
      .get('task-blocked-1');
    const checkpoint = db
      .prepare('SELECT * FROM supervisor_approval_checkpoints WHERE task_id = ?')
      .get('task-blocked-1');

    expect(qaResponse.status).toBe(200);
    expect(run.status).toBe('running');
    expect(run.terminal_reason_class).toBeNull();
    expect(task).toEqual({ status: 'in_progress', retry_count: 2 });
    expect(workspace).toEqual({
      status: 'provisioning',
      recovery_reason: null,
      evidence_ref: null,
    });
    expect(snapshot.supervisor_state).toBe('blocked');
    expect(snapshot.reason_class).toBe('approval_rejected');
    expect(checkpoint.status).toBe('rejected');
    expect(artifacts.map((artifact) => artifact.seq)).toEqual([1]);
    expect(artifacts.every((artifact) => artifact.kind !== 'workspace.cleanup')).toBe(true);
  });
});
