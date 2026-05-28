/**
 * @module auth.test
 * Strict TDD tests for HMAC auth token utilities and DB provisioning.
 * Test file written FIRST (RED phase), then implementation follows (GREEN phase).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const { generateAgentSecret, hashToken, signRequest, verifySignature } = require('../auth');
const {
  ensureRuntimeSchema,
  provisionAuthToken,
  revokeAuthToken,
  getActiveAuthToken,
  getAgentSecret,
  verifyAuthTokenExists,
} = require('../../db/localDb');

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

// ---------------------------------------------------------------------------
// AUTH-4: Token Generation Utility
// ---------------------------------------------------------------------------

test('generateAgentSecret returns 64-char hex string', () => {
  const secret = generateAgentSecret();
  assert.ok(secret, 'generateAgentSecret must return a value');
  assert.equal(typeof secret, 'string', 'secret must be a string');
  assert.equal(secret.length, 64, 'secret must be 64 hex chars (32 bytes)');
  assert.ok(/^[0-9a-f]{64}$/.test(secret), 'secret must be hex-encoded');
});

test('generateAgentSecret produces unique values on each call', () => {
  const s1 = generateAgentSecret();
  const s2 = generateAgentSecret();
  assert.notEqual(s1, s2, 'two generated secrets must differ');
});

test('hashToken returns SHA-256 hex hash', () => {
  const secret = generateAgentSecret();
  const hash = hashToken(secret);
  assert.ok(hash, 'hashToken must return a value');
  assert.equal(typeof hash, 'string', 'hash must be a string');
  assert.equal(hash.length, 64, 'SHA-256 hex hash must be 64 chars');
  assert.ok(/^[0-9a-f]{64}$/.test(hash), 'hash must be hex-encoded');

  // Deterministic: same input → same hash
  const hash2 = hashToken(secret);
  assert.equal(hash, hash2, 'hashToken must be deterministic');
});

test('hashToken produces different hashes for different inputs', () => {
  const s1 = generateAgentSecret();
  const s2 = generateAgentSecret();
  assert.notEqual(hashToken(s1), hashToken(s2), 'different inputs must produce different hashes');
});

test('signRequest produces verifiable HMAC-SHA256 signature', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, body);

  assert.ok(signature, 'signRequest must return a value');
  assert.equal(typeof signature, 'string', 'signature must be a string');
  assert.equal(signature.length, 64, 'HMAC-SHA256 hex must be 64 chars');
  assert.ok(/^[0-9a-f]{64}$/.test(signature), 'signature must be hex-encoded');
});

test('verifySignature validates correct signatures', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, body);

  const result = verifySignature(secret, timestamp, body, signature);
  assert.equal(result, true, 'verifySignature must return true for correct signature');
});

test('verifySignature rejects wrong signatures', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const wrongSig = '0'.repeat(64);

  const result = verifySignature(secret, timestamp, body, wrongSig);
  assert.equal(result, false, 'verifySignature must return false for wrong signature');
});

test('verifySignature rejects wrong secret', () => {
  const secret = generateAgentSecret();
  const wrongSecret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, body);

  const result = verifySignature(wrongSecret, timestamp, body, signature);
  assert.equal(result, false, 'verifySignature must return false for wrong secret');
});

test('verifySignature rejects tampered body', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const originalBody = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, originalBody);

  const tamperedBody = { action: 'heartbeat', agent_id: 'agent-1-tampered' };
  const result = verifySignature(secret, timestamp, tamperedBody, signature);
  assert.equal(result, false, 'verifySignature must reject tampered body');
});

test('verifySignature rejects expired timestamps (>30s drift)', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date(Date.now() - 60000).toISOString(); // 60s ago
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, body);

  const result = verifySignature(secret, timestamp, body, signature);
  assert.equal(result, false, 'verifySignature must reject timestamps older than 30s');
});

test('verifySignature accepts timestamps within 30s drift', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date(Date.now() - 10000).toISOString(); // 10s ago
  const body = { action: 'heartbeat', agent_id: 'agent-1' };
  const signature = signRequest(secret, timestamp, body);

  const result = verifySignature(secret, timestamp, body, signature);
  assert.equal(result, true, 'verifySignature must accept timestamps within 30s');
});

test('signRequest handles string body (pre-serialized JSON)', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const bodyString = JSON.stringify({ action: 'heartbeat', agent_id: 'agent-1' });
  const signature = signRequest(secret, timestamp, bodyString);

  // Should produce a valid signature for string bodies too
  assert.ok(signature, 'signRequest must accept string body');
  assert.equal(signature.length, 64, 'signature must be 64 hex chars');
});

test('verifySignature handles string body', () => {
  const secret = generateAgentSecret();
  const timestamp = new Date().toISOString();
  const bodyString = JSON.stringify({ action: 'heartbeat', agent_id: 'agent-1' });
  const signature = signRequest(secret, timestamp, bodyString);

  const result = verifySignature(secret, timestamp, bodyString, signature);
  assert.equal(result, true, 'verifySignature must accept string body');
});

// ---------------------------------------------------------------------------
// AUTH-1: Agent Auth Token Table + DB Provisioning
// ---------------------------------------------------------------------------

test('agent_auth_tokens table exists after ensureRuntimeSchema', () => {
  const db = createTestDb();
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_auth_tokens'")
    .get();
  assert.ok(row, 'agent_auth_tokens table must exist after ensureRuntimeSchema');
  db.close();
});

test('agent_auth_tokens has all required columns', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_auth_tokens)');
  const columnNames = columns.map((c) => c.name);

  const required = [
    'id',
    'agent_id',
    'workspace_id',
    'token_hash',
    'secret',
    'algorithm',
    'status',
    'created_at',
    'revoked_at',
    'expires_at',
  ];

  for (const col of required) {
    assert.ok(columnNames.includes(col), `missing column: ${col}`);
  }
  db.close();
});

test('agent_auth_tokens status has CHECK constraint', () => {
  const db = createTestDb();

  // Valid insert should succeed
  db.prepare(
    'INSERT INTO agent_auth_tokens (agent_id, token_hash, algorithm, status) VALUES (?, ?, ?, ?)'
  ).run('test-agent', 'somehash', 'hmac-sha256', 'active');

  // Invalid status should fail
  assert.throws(
    () => {
      db.prepare(
        'INSERT INTO agent_auth_tokens (agent_id, token_hash, algorithm, status) VALUES (?, ?, ?, ?)'
      ).run('test-agent2', 'somehash2', 'hmac-sha256', 'invalid_status');
    },
    /CHECK/i,
    'invalid status must be rejected by CHECK constraint'
  );
  db.close();
});

test('idx_auth_tokens_agent index exists', () => {
  const db = createTestDb();
  const index = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_auth_tokens_agent'")
    .get();
  assert.ok(index, 'idx_auth_tokens_agent index must exist');
  db.close();
});

test('idx_auth_tokens_status index exists', () => {
  const db = createTestDb();
  const index = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_auth_tokens_status'")
    .get();
  assert.ok(index, 'idx_auth_tokens_status index must exist');
  db.close();
});

test('provisionAuthToken creates a token in the DB', () => {
  const db = createTestDb();
  const tokenHash = hashToken(generateAgentSecret());

  const token = provisionAuthToken(db, {
    agentId: 'agent-provision-1',
    tokenHash,
    algorithm: 'hmac-sha256',
  });

  assert.ok(token, 'provisionAuthToken must return the created token');
  assert.ok(token.id > 0, 'token id must be a positive integer');
  assert.equal(token.agent_id, 'agent-provision-1');
  assert.equal(token.workspace_id, null);
  assert.equal(token.token_hash, tokenHash);
  assert.equal(token.algorithm, 'hmac-sha256');
  assert.equal(token.status, 'active');
  assert.ok(token.created_at, 'created_at must be set');
  db.close();
});

test('provisionAuthToken defaults algorithm to hmac-sha256', () => {
  const db = createTestDb();
  const tokenHash = hashToken(generateAgentSecret());

  const token = provisionAuthToken(db, {
    agentId: 'agent-provision-2',
    tokenHash,
  });

  assert.equal(token.algorithm, 'hmac-sha256', 'algorithm must default to hmac-sha256');
  db.close();
});

test('getActiveAuthToken retrieves active token for agent', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, {
    agentId: 'agent-getactive-1',
    tokenHash,
  });

  const token = getActiveAuthToken(db, 'agent-getactive-1');
  assert.ok(token, 'getActiveAuthToken must return a token');
  assert.equal(token.agent_id, 'agent-getactive-1');
  assert.equal(token.status, 'active');
  assert.equal(token.token_hash, tokenHash);
  db.close();
});

test('getActiveAuthToken returns null when no active token exists', () => {
  const db = createTestDb();

  const token = getActiveAuthToken(db, 'agent-none');
  assert.equal(token, null, 'getActiveAuthToken must return null when no token exists');
  db.close();
});

test('revokeAuthToken hard-deletes the active token', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, {
    agentId: 'agent-revoke-1',
    tokenHash,
    rawSecret: secret,
  });

  const beforeCount = db
    .prepare('SELECT count(*) as c FROM agent_auth_tokens WHERE agent_id = ?')
    .get('agent-revoke-1').c;
  assert.equal(beforeCount, 1, 'token should exist before revocation');

  const revoked = revokeAuthToken(db, 'agent-revoke-1', { reason: 'rotation' });
  assert.ok(revoked, 'revokeAuthToken must return the deleted token');

  const afterCount = db
    .prepare('SELECT count(*) as c FROM agent_auth_tokens WHERE agent_id = ?')
    .get('agent-revoke-1').c;
  assert.equal(afterCount, 0, 'token row must be hard-deleted');
  db.close();
});

test('revoked tokens are not returned by getActiveAuthToken', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, {
    agentId: 'agent-revoked-active',
    tokenHash,
  });

  revokeAuthToken(db, 'agent-revoked-active', { reason: 'compromised' });

  const token = getActiveAuthToken(db, 'agent-revoked-active');
  assert.equal(token, null, 'getActiveAuthToken must not return revoked tokens');
  db.close();
});

test('verifyAuthTokenExists returns true when active token exists', () => {
  const db = createTestDb();
  const tokenHash = hashToken(generateAgentSecret());

  provisionAuthToken(db, {
    agentId: 'agent-verify-1',
    tokenHash,
  });

  const exists = verifyAuthTokenExists(db, 'agent-verify-1');
  assert.equal(exists, true, 'verifyAuthTokenExists must return true for active token');
  db.close();
});

test('verifyAuthTokenExists returns false when no token exists', () => {
  const db = createTestDb();

  const exists = verifyAuthTokenExists(db, 'agent-never-existed');
  assert.equal(exists, false, 'verifyAuthTokenExists must return false for missing agent');
  db.close();
});

test('verifyAuthTokenExists returns false for revoked token', () => {
  const db = createTestDb();
  const tokenHash = hashToken(generateAgentSecret());

  provisionAuthToken(db, {
    agentId: 'agent-verify-revoked',
    tokenHash,
  });

  revokeAuthToken(db, 'agent-verify-revoked', { reason: 'test' });

  const exists = verifyAuthTokenExists(db, 'agent-verify-revoked');
  assert.equal(exists, false, 'verifyAuthTokenExists must return false for revoked token');
  db.close();
});

// ---------------------------------------------------------------------------
// AUTH-2: Secret storage for HMAC verification
// ---------------------------------------------------------------------------

test('provisionAuthToken stores raw secret when provided', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  const token = provisionAuthToken(db, {
    agentId: 'agent-secret-1',
    tokenHash,
    rawSecret: secret,
  });

  assert.equal(token.secret, secret, 'secret must be stored in DB');
  db.close();
});

test('getAgentSecret returns raw secret for active token', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, {
    agentId: 'agent-secret-2',
    tokenHash,
    rawSecret: secret,
  });

  const retrieved = getAgentSecret(db, 'agent-secret-2');
  assert.equal(retrieved, secret, 'getAgentSecret must return the raw secret');
  db.close();
});

test('getAgentSecret returns null when no active token exists', () => {
  const db = createTestDb();
  const retrieved = getAgentSecret(db, 'agent-no-secret');
  assert.equal(retrieved, null, 'getAgentSecret must return null when no token exists');
  db.close();
});

test('getAgentSecret returns null when token has no secret stored', () => {
  const db = createTestDb();
  const tokenHash = hashToken(generateAgentSecret());

  provisionAuthToken(db, {
    agentId: 'agent-secret-null',
    tokenHash,
    // rawSecret not provided
  });

  const retrieved = getAgentSecret(db, 'agent-secret-null');
  assert.equal(retrieved, null, 'getAgentSecret must return null when secret column is NULL');
  db.close();
});

// ---------------------------------------------------------------------------
// AUTH-4: Hard delete on revocation
// ---------------------------------------------------------------------------

test('revokeAuthToken hard-deletes the token row', () => {
  const db = createTestDb();
  const secret = generateAgentSecret();
  const tokenHash = hashToken(secret);

  provisionAuthToken(db, {
    agentId: 'agent-revoke-hard',
    tokenHash,
    rawSecret: secret,
  });

  const beforeCount = db
    .prepare('SELECT count(*) as c FROM agent_auth_tokens WHERE agent_id = ?')
    .get('agent-revoke-hard').c;
  assert.equal(beforeCount, 1, 'token should exist before revocation');

  const revoked = revokeAuthToken(db, 'agent-revoke-hard', { reason: 'rotation' });
  assert.ok(revoked, 'revokeAuthToken must return the deleted token');

  const afterCount = db
    .prepare('SELECT count(*) as c FROM agent_auth_tokens WHERE agent_id = ?')
    .get('agent-revoke-hard').c;
  assert.equal(afterCount, 0, 'token row must be hard-deleted');
  db.close();
});

test('provisioning a new active token after hard-delete works', () => {
  const db = createTestDb();
  const secret1 = generateAgentSecret();
  const secret2 = generateAgentSecret();

  // Provision first token
  provisionAuthToken(db, {
    agentId: 'agent-rotate-hard',
    tokenHash: hashToken(secret1),
    rawSecret: secret1,
  });

  // Revoke it (hard delete)
  revokeAuthToken(db, 'agent-rotate-hard', { reason: 'rotation' });

  // Provision a new one
  const newToken = provisionAuthToken(db, {
    agentId: 'agent-rotate-hard',
    tokenHash: hashToken(secret2),
    rawSecret: secret2,
  });

  assert.equal(newToken.status, 'active', 'new token must be active');

  // getActiveAuthToken should return the newest active token
  const active = getActiveAuthToken(db, 'agent-rotate-hard');
  assert.ok(active, 'should find an active token after re-provisioning');
  assert.equal(active.id, newToken.id, 'active token should be the newly provisioned one');

  // getAgentSecret should return the new secret
  const retrievedSecret = getAgentSecret(db, 'agent-rotate-hard');
  assert.equal(
    retrievedSecret,
    secret2,
    'getAgentSecret must return the new secret after rotation'
  );
  db.close();
});
