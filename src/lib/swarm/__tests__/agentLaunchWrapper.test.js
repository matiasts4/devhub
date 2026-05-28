/**
 * @module agentLaunchWrapper.test
 * Strict TDD tests for agent launch wrapper — signed curl commands.
 * AUTH-5: Heartbeat and exit commands must be HMAC-signed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const {
  buildAgentEnvExports,
  buildInitialHeartbeatCommand,
  buildExitTrapCommand,
} = require('../../agentLaunchWrapper');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const { ensureRuntimeSchema } = require('../../db/localDb');
  ensureRuntimeSchema(db);
  return db;
}

// Mock getDb so buildAgentEnvExports uses an in-memory schema-current DB
const localDbModule = require('../../db/localDb');
const originalGetDb = localDbModule.getDb;
let _mockDb = null;

beforeAll(() => {
  localDbModule.getDb = () => {
    if (!_mockDb) {
      _mockDb = createTestDb();
    }
    return _mockDb;
  };
});

afterAll(() => {
  localDbModule.getDb = originalGetDb;
  if (_mockDb) {
    _mockDb.close();
    _mockDb = null;
  }
});

beforeEach(() => {
  // Reset mock DB before each test that relies on it
  if (_mockDb) {
    _mockDb.close();
    _mockDb = null;
  }
});

// ---------------------------------------------------------------------------
// AUTH-5: Signed heartbeat and exit commands
// ---------------------------------------------------------------------------

test('buildInitialHeartbeatCommand includes HMAC signing shell commands', () => {
  const cmd = buildInitialHeartbeatCommand({
    supervisorUrl: 'http://localhost:3000',
    agentId: 'agent-1',
    missionId: 'mission-1',
    role: 'executor',
    workspacePath: '/workspace',
  });

  assert.ok(cmd.includes('TIMESTAMP='), 'must compute TIMESTAMP');
  assert.ok(cmd.includes('BODY_HASH='), 'must compute BODY_HASH');
  assert.ok(cmd.includes('SIGNATURE='), 'must compute SIGNATURE');
  assert.ok(cmd.includes('openssl dgst -sha256'), 'must use openssl for body hash');
  assert.ok(cmd.includes('openssl dgst -sha256 -hmac'), 'must use openssl HMAC for signature');
  assert.ok(cmd.includes('X-Agent-Id: agent-1'), 'must include X-Agent-Id header');
  assert.ok(cmd.includes('X-Agent-Timestamp:'), 'must include X-Agent-Timestamp header');
  assert.ok(cmd.includes('X-Agent-Signature:'), 'must include X-Agent-Signature header');
  assert.ok(cmd.includes('/api/agenthub/presence/heartbeat'), 'must target heartbeat endpoint');
});

test('buildInitialHeartbeatCommand skips when no supervisor URL', () => {
  const cmd = buildInitialHeartbeatCommand({
    supervisorUrl: null,
    agentId: 'agent-1',
    missionId: 'mission-1',
    role: 'executor',
    workspacePath: '/workspace',
  });

  assert.ok(cmd.includes('Heartbeat skipped'), 'should skip when no supervisor URL');
});

test('buildExitTrapCommand includes HMAC signing shell commands', () => {
  const cmd = buildExitTrapCommand({
    supervisorUrl: 'http://localhost:3000',
    agentId: 'agent-1',
    missionId: 'mission-1',
  });

  assert.ok(cmd.includes('trap'), 'must use shell trap');
  assert.ok(cmd.includes('EXIT_CODE=$?'), 'must capture exit code');
  assert.ok(cmd.includes('TIMESTAMP='), 'must compute TIMESTAMP');
  assert.ok(cmd.includes('BODY_HASH='), 'must compute BODY_HASH');
  assert.ok(cmd.includes('SIGNATURE='), 'must compute SIGNATURE');
  assert.ok(cmd.includes('openssl dgst -sha256'), 'must use openssl for body hash');
  assert.ok(cmd.includes('openssl dgst -sha256 -hmac'), 'must use openssl HMAC for signature');
  assert.ok(cmd.includes('X-Agent-Id: agent-1'), 'must include X-Agent-Id header');
  assert.ok(cmd.includes('X-Agent-Timestamp:'), 'must include X-Agent-Timestamp header');
  assert.ok(cmd.includes('X-Agent-Signature:'), 'must include X-Agent-Signature header');
  assert.ok(cmd.includes('/api/agenthub/events'), 'must target events endpoint');
  assert.ok(cmd.includes('process_exit'), 'must include process_exit event type');
});

test('buildExitTrapCommand skips when no supervisor URL', () => {
  const cmd = buildExitTrapCommand({
    supervisorUrl: null,
    agentId: 'agent-1',
    missionId: 'mission-1',
  });

  assert.ok(cmd.includes('Exit trap skipped'), 'should skip when no supervisor URL');
});

test('buildAgentEnvExports passes rawSecret to provisionAuthToken', () => {
  const exports = buildAgentEnvExports({
    agentId: 'agent-provision-secret',
    missionId: 'mission-1',
    role: 'executor',
    workspacePath: '/workspace',
    // No workspaceId — avoids FK constraint since test DB is fresh
  });

  assert.ok(exports.includes('DEVHUB_AGENT_TOKEN='), 'must export DEVHUB_AGENT_TOKEN');

  // Verify the secret is a 64-char hex string inside the export
  const secretMatch = exports.match(/DEVHUB_AGENT_TOKEN="([0-9a-f]{64})"/);
  assert.ok(secretMatch, 'DEVHUB_AGENT_TOKEN must contain a 64-char hex secret');

  // Verify the secret was stored in the mock DB
  const { getAgentSecret } = require('../../db/localDb');
  const storedSecret = getAgentSecret(localDbModule.getDb(), 'agent-provision-secret');
  assert.equal(storedSecret, secretMatch[1], 'stored secret must match exported secret');
});

test('buildAgentEnvExports handles missing DB gracefully', () => {
  // Temporarily break getDb
  const getDbFn = localDbModule.getDb;
  localDbModule.getDb = () => {
    throw new Error('DB unavailable');
  };

  try {
    const exports = buildAgentEnvExports({
      agentId: 'agent-no-db',
      missionId: 'mission-1',
      role: 'executor',
      workspacePath: '/workspace',
    });

    // Should still produce exports even if DB is unavailable
    assert.ok(exports.includes('DEVHUB_AGENT_ID='), 'must export DEVHUB_AGENT_ID');
    // DEVHUB_AGENT_TOKEN should NOT be present when DB is unavailable
    assert.ok(
      !exports.includes('DEVHUB_AGENT_TOKEN='),
      'must NOT export DEVHUB_AGENT_TOKEN when DB unavailable'
    );
  } finally {
    localDbModule.getDb = getDbFn;
  }
});
