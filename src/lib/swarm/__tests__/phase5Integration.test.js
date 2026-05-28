const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const {
  ensureRuntimeSchema,
  provisionAuthToken,
  verifyAuthTokenExists,
} = require('../../db/localDb');
const { generateAgentSecret, hashToken, signRequest } = require('../auth');
const { createAuthMiddleware } = require('../authMiddleware');
const { evaluateSupervisorTick } = require('../supervisorDaemon');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

test('Phase 5.1: launch provisioning stores token hash and signed heartbeat passes auth', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  db.exec("INSERT INTO projects (id, name) VALUES ('proj-phase5-1', 'Phase 5 Integration')");
  db.exec(
    "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, branch_name, status, observed_branch, observed_head) VALUES ('ws-phase5-1', 'proj-phase5-1', 'agent-phase5-1', '/repo', '/repo/.devhub/worktrees/phase5-1', '/repo/.devhub/worktrees/phase5-1', 'main', 'agent/phase5-1', 'active', 'agent/phase5-1', 'head-phase5-1')"
  );

  const token = provisionAuthToken(db, {
    agentId: 'agent-phase5-1',
    workspaceId: 'ws-phase5-1',
    tokenHash,
  });

  assert.ok(token, 'token should be provisioned during launch flow');
  assert.equal(token.token_hash, tokenHash, 'launch provisioning should persist the token hash');
  assert.equal(
    verifyAuthTokenExists(db, 'agent-phase5-1'),
    true,
    'agent should have an active token after provisioning'
  );

  const middleware = createAuthMiddleware({
    getDb: () => db,
    getAgentSecret: () => secret,
  });

  const timestamp = new Date().toISOString();
  const body = {
    agent_id: 'agent-phase5-1',
    mission_id: 'mission-phase5-1',
    workspace_id: 'ws-phase5-1',
    state: 'booting',
  };
  const signature = signRequest(secret, timestamp, body);
  const req = {
    headers: {
      'x-agent-id': 'agent-phase5-1',
      'x-agent-timestamp': timestamp,
      'x-agent-signature': signature,
    },
    body,
    get(key) {
      return this.headers[key.toLowerCase()];
    },
  };
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, 'signed heartbeat should pass auth middleware');
  assert.equal(req.agentId, 'agent-phase5-1', 'auth middleware should inject req.agentId');

  db.close();
});

test('Phase 5.1: heartbeat without auth headers is rejected in enforced mode', () => {
  const db = createTestDb();
  const originalEnforced = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const middleware = createAuthMiddleware({ getDb: () => db });
    const req = {
      headers: {},
      body: { agent_id: 'agent-phase5-missing' },
      get() {
        return undefined;
      },
    };
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'unauthenticated heartbeat must be blocked in enforced mode');
    assert.equal(res.statusCode, 401, 'unauthenticated heartbeat must return 401');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnforced;
    db.close();
  }
});

test('Phase 5.3: orphan detection revokes the active auth token and rejects the stale agent afterwards', () => {
  const db = createTestDb();
  const originalEnforced = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    db.exec(
      "INSERT INTO projects (id, name) VALUES ('proj-phase5-3', 'Phase 5 Orphan Integration')"
    );
    db.exec(
      "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, branch_name, status, observed_branch, observed_head, last_heartbeat) VALUES ('ws-phase5-3', 'proj-phase5-3', 'agent-phase5-3', '/repo', '/repo/.devhub/worktrees/phase5-3', '/repo/.devhub/worktrees/phase5-3', 'main', 'agent/phase5-3', 'active', 'agent/phase5-3', 'head-phase5-3', datetime('now', '-2 minutes'))"
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', claim_token TEXT, assigned_to TEXT, started_at TEXT, lease_expires_at TEXT)"
    );

    const secret = generateAgentSecret();
    provisionAuthToken(db, {
      agentId: 'agent-phase5-3',
      workspaceId: 'ws-phase5-3',
      tokenHash: hashToken(secret),
    });

    assert.equal(
      verifyAuthTokenExists(db, 'agent-phase5-3'),
      true,
      'agent should start with an active token'
    );

    evaluateSupervisorTick(db);

    const workspace = db
      .prepare("SELECT status FROM agent_workspaces WHERE id = 'ws-phase5-3'")
      .get();
    assert.equal(workspace.status, 'orphaned', 'stale workspace must be marked orphaned');

    const orphanEvent = db
      .prepare(
        "SELECT * FROM agent_events WHERE event_type = 'workspace_orphaned' AND workspace_id = 'ws-phase5-3'"
      )
      .get();
    assert.ok(orphanEvent, 'orphan detection must emit a workspace_orphaned event');

    const supervisorAction = db
      .prepare(
        "SELECT * FROM agent_events WHERE event_type = 'supervisor_action' AND workspace_id = 'ws-phase5-3'"
      )
      .get();
    assert.ok(supervisorAction, 'orphan detection must emit a supervisor_action event');

    assert.equal(
      verifyAuthTokenExists(db, 'agent-phase5-3'),
      false,
      'orphaning a workspace must revoke the active auth token'
    );

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });
    const timestamp = new Date().toISOString();
    const body = { agent_id: 'agent-phase5-3', state: 'busy' };
    const signature = signRequest(secret, timestamp, body);
    const req = {
      headers: {
        'x-agent-id': 'agent-phase5-3',
        'x-agent-timestamp': timestamp,
        'x-agent-signature': signature,
      },
      body,
      get(key) {
        return this.headers[key.toLowerCase()];
      },
    };
    const res = createMockResponse();

    middleware(req, res, () => {
      throw new Error('orphaned agent should not pass auth after token revocation');
    });

    assert.equal(res.statusCode, 401, 'stale orphaned agent token must be rejected');
    assert.equal(
      res.body.code,
      'AUTH_NO_TOKEN',
      'rejected orphaned token should surface as missing active token'
    );
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnforced;
    db.close();
  }
});

test('Phase 5.4: key phase modules resolve from the current tree', async () => {
  const agentEvents = require('../agentEvents');
  const supervisorDaemon = require('../supervisorDaemon');
  const processManager = require('../processManager');

  assert.equal(typeof agentEvents.emitAgentEvent, 'function', 'agentEvents module should resolve');
  assert.equal(
    typeof supervisorDaemon.evaluateSupervisorTick,
    'function',
    'supervisorDaemon module should resolve'
  );
  assert.equal(
    typeof processManager.startSupervisorDaemon,
    'function',
    'processManager daemon API should resolve'
  );

  const heartbeatRoute = await import('../../../app/api/agenthub/presence/heartbeat/route.js');
  assert.equal(typeof heartbeatRoute.POST, 'function', 'presence heartbeat route should resolve');
});
