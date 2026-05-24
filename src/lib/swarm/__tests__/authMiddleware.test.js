/**
 * @module authMiddleware.test
 * Strict TDD tests for HMAC auth middleware — dual-mode transition.
 * Test file written FIRST (RED phase), then implementation follows (GREEN phase).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { generateAgentSecret, hashToken, signRequest } = require('../auth');
const { ensureRuntimeSchema, provisionAuthToken, revokeAuthToken } = require('../../db/localDb');
const { createAuthMiddleware } = require('../authMiddleware');

// Jest timeout for these DB-heavy tests
jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with runtime schema applied. */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

/** Create Express-style mock request object. */
function createMockRequest(headers = {}, body = {}) {
  return {
    headers,
    body,
    get(key) {
      const lower = key.toLowerCase();
      for (const [k, v] of Object.entries(this.headers)) {
        if (k.toLowerCase() === lower) return v;
      }
      return undefined;
    },
  };
}

/** Create Express-style mock response object. */
function createMockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    setHeader(key, value) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// AUTH-2: HMAC Verification Middleware
// ---------------------------------------------------------------------------

test('createAuthMiddleware is a function', () => {
  assert.equal(typeof createAuthMiddleware, 'function');
});

test('valid signature passes through in enforced mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-valid-sig', tokenHash });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat', agent_id: 'agent-valid-sig' };
    const signature = signRequest(secret, timestamp, body);

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-valid-sig',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, true, 'next() should be called for valid auth');
    assert.equal(req.agentId, 'agent-valid-sig', 'req.agentId should be set');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('missing all auth headers returns 401 in enforced mode', () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const middleware = createAuthMiddleware({
      getDb: () => db,
    });

    const req = createMockRequest({}, {});
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_MISSING');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('partial auth headers return 401 in enforced mode', () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const middleware = createAuthMiddleware({
      getDb: () => db,
    });

    // Has timestamp and agent-id but no signature
    const req = createMockRequest(
      {
        'x-agent-timestamp': new Date().toISOString(),
        'x-agent-id': 'agent-partial',
      },
      {}
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_INCOMPLETE');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('invalid signature returns 401 in enforced mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-invalid-sig', tokenHash });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };

    const req = createMockRequest(
      {
        'x-agent-signature': '0'.repeat(64),
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-invalid-sig',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_INVALID_SIG');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('expired timestamp returns 401 in enforced mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-expired-ts', tokenHash });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const expiredTimestamp = new Date(Date.now() - 60000).toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, expiredTimestamp, body);

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': signature,
        'x-agent-timestamp': expiredTimestamp,
        'x-agent-id': 'agent-expired-ts',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called for expired timestamp');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_INVALID_SIG');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('token revoked returns 401 in enforced mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-revoked', tokenHash });
  revokeAuthToken(db, 'agent-revoked', { reason: 'test' });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, timestamp, body);

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-revoked',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called for revoked token');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_NO_TOKEN');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

// ---------------------------------------------------------------------------
// AUTH-3: Dual-Mode Transition
// ---------------------------------------------------------------------------

test('no auth headers pass through with warning in permissive mode', () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'false';

  try {
    const middleware = createAuthMiddleware({
      getDb: () => db,
    });

    const req = createMockRequest({}, {});
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, true, 'next() should be called in permissive mode');
    assert.equal(res.statusCode, 200, 'status should remain 200 in permissive mode');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('invalid auth passes through with warning in permissive mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-permissive-invalid', tokenHash });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'false';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': '0'.repeat(64),
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-permissive-invalid',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, true, 'next() should be called in permissive mode');
    assert.equal(res.statusCode, 200, 'status should remain 200 in permissive mode');
    assert.equal(
      req.agentId,
      'agent-permissive-invalid',
      'agentId should still be set from header'
    );
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('valid auth sets req.agentId', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-set-id', tokenHash });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat', agent_id: 'agent-set-id' };
    const signature = signRequest(secret, timestamp, body);

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-set-id',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, true, 'next() should be called');
    assert.equal(req.agentId, 'agent-set-id', 'req.agentId must be set to the agent ID');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('missing agent ID header returns 401 in enforced mode', () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const middleware = createAuthMiddleware({
      getDb: () => db,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': 'a'.repeat(64),
        'x-agent-timestamp': new Date().toISOString(),
      },
      {}
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_INCOMPLETE');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('unregistered agent returns 401 in enforced mode', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, timestamp, body);

    const middleware = createAuthMiddleware({
      getDb: () => db,
      getAgentSecret: () => secret,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-not-registered',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false, 'next() should NOT be called for unregistered agent');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTH_NO_TOKEN');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('unregistered agent passes through in permissive mode', () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'false';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };

    const middleware = createAuthMiddleware({
      getDb: () => db,
    });

    const req = createMockRequest(
      {
        'x-agent-signature': 'b'.repeat(64),
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-not-registered-permissive',
      },
      body
    );
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, true, 'next() should be called in permissive mode');
    assert.equal(res.statusCode, 200);
    assert.equal(
      req.agentId,
      'agent-not-registered-permissive',
      'agentId should be set from header even without DB token'
    );
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});
