/**
 * @module withAuth.test
 * Strict TDD tests for Next.js Route Handler HMAC auth wrapper.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { generateAgentSecret, hashToken, signRequest } = require('../auth');
const { ensureRuntimeSchema, provisionAuthToken, revokeAuthToken } = require('../../db/localDb');
const { withAuth } = require('../withAuth');

// Jest timeout for these DB-heavy tests
jest.setTimeout(30000);

// Mock NextResponse.json so tests can inspect status/body synchronously
jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return { status: init.status || 200, json: () => body };
    },
  },
}));

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

/** Create Next.js-style mock request object. */
function createMockRequest({ method = 'POST', headers = {}, body = {} } = {}) {
  const headerMap = new Map();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }

  return {
    method,
    headers: {
      get(key) {
        return headerMap.get(key.toLowerCase()) || null;
      },
    },
    clone() {
      return {
        json: async () => body,
      };
    },
    agentId: undefined,
  };
}

/** Dummy handler that returns success. */
async function dummyHandler(request) {
  return { status: 200, json: () => ({ success: true, agentId: request.agentId }) };
}

// ---------------------------------------------------------------------------
// withAuth wrapper tests
// ---------------------------------------------------------------------------

test('withAuth returns a function', () => {
  const wrapped = withAuth(dummyHandler);
  assert.equal(typeof wrapped, 'function');
});

test('withAuth passes through GET requests without auth checks', async () => {
  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const wrapped = withAuth(dummyHandler, { methods: ['POST'] });
    const req = createMockRequest({ method: 'GET' });
    const res = await wrapped(req);

    assert.equal(res.status, 200, 'GET should pass through without auth');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
  }
});

test('valid signature passes through in enforced mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-valid-sig', tokenHash, rawSecret: secret });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat', agent_id: 'agent-valid-sig' };
    const signature = signRequest(secret, timestamp, body);

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-valid-sig',
      },
      body,
    });

    const res = await wrapped(req);
    assert.equal(res.status, 200, 'valid auth should pass through');
    assert.equal(req.agentId, 'agent-valid-sig', 'request.agentId should be set');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('missing all auth headers returns 401 in enforced mode', async () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({ method: 'POST', headers: {}, body: {} });
    const res = await wrapped(req);

    assert.equal(res.status, 401);
    const body = res.json();
    assert.equal(body.code, 'AUTH_MISSING');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('partial auth headers return 401 in enforced mode', async () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-timestamp': new Date().toISOString(),
        'x-agent-id': 'agent-partial',
      },
      body: {},
    });
    const res = await wrapped(req);

    assert.equal(res.status, 401);
    const body = res.json();
    assert.equal(body.code, 'AUTH_INCOMPLETE');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('invalid signature returns 401 in enforced mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-invalid-sig', tokenHash, rawSecret: secret });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': '0'.repeat(64),
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-invalid-sig',
      },
      body,
    });
    const res = await wrapped(req);

    assert.equal(res.status, 401);
    const resBody = res.json();
    assert.equal(resBody.code, 'AUTH_INVALID_SIG');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('unregistered agent returns 401 in enforced mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, timestamp, body);

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-not-registered',
      },
      body,
    });
    const res = await wrapped(req);

    assert.equal(res.status, 401);
    const resBody = res.json();
    assert.equal(resBody.code, 'AUTH_NO_TOKEN');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('no auth headers pass through with warning in permissive mode', async () => {
  const db = createTestDb();

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'false';

  try {
    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({ method: 'POST', headers: {}, body: {} });
    const res = await wrapped(req);

    assert.equal(res.status, 200, 'permissive mode should pass through');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('invalid auth passes through with warning in permissive mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-permissive-invalid', tokenHash, rawSecret: secret });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'false';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': '0'.repeat(64),
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-permissive-invalid',
      },
      body,
    });
    const res = await wrapped(req);

    assert.equal(res.status, 200, 'permissive mode should pass through');
    assert.equal(req.agentId, 'agent-permissive-invalid', 'agentId should be set from header');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('expired timestamp returns 401 in enforced mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-expired-ts', tokenHash, rawSecret: secret });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const expiredTimestamp = new Date(Date.now() - 60000).toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, expiredTimestamp, body);

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': signature,
        'x-agent-timestamp': expiredTimestamp,
        'x-agent-id': 'agent-expired-ts',
      },
      body,
    });
    const res = await wrapped(req);

    assert.equal(res.status, 401, 'expired timestamp should be rejected');
    const resBody = res.json();
    assert.equal(resBody.code, 'AUTH_INVALID_SIG');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('hard-deleted token returns 401 in enforced mode', async () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, { agentId: 'agent-revoked', tokenHash, rawSecret: secret });
  revokeAuthToken(db, 'agent-revoked', { reason: 'test' });

  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    const timestamp = new Date().toISOString();
    const body = { action: 'heartbeat' };
    const signature = signRequest(secret, timestamp, body);

    const wrapped = withAuth(dummyHandler, { getDb: () => db });
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
        'x-agent-id': 'agent-revoked',
      },
      body,
    });
    const res = await wrapped(req);

    assert.equal(res.status, 401, 'revoked token should be rejected');
    const resBody = res.json();
    assert.equal(resBody.code, 'AUTH_NO_TOKEN');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});

test('withAuth respects custom methods option', async () => {
  const db = createTestDb();
  const originalEnv = process.env.AGENT_AUTH_ENFORCED;
  process.env.AGENT_AUTH_ENFORCED = 'true';

  try {
    // Only protect DELETE, not POST
    const wrapped = withAuth(dummyHandler, { methods: ['DELETE'], getDb: () => db });
    const req = createMockRequest({ method: 'POST', headers: {}, body: {} });
    const res = await wrapped(req);

    assert.equal(res.status, 200, 'POST should pass when only DELETE is protected');
  } finally {
    process.env.AGENT_AUTH_ENFORCED = originalEnv;
    db.close();
  }
});
