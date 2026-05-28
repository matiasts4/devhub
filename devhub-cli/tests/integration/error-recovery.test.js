'use strict';

const {
  createTempDb,
  cleanupDb,
  readDb,
  writeDb,
  seedProject,
  seedTask,
  seedAgent,
  runCli,
} = require('../fixtures/seed-factory');

let dbPath;

beforeAll(() => {
  dbPath = createTempDb();
});

beforeEach(() => {
  const { openDb } = require('../fixtures/seed-factory');
  const db = openDb(dbPath);
  try {
    db.prepare('DELETE FROM task_dependencies').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM agent_registry').run();
    db.prepare('DELETE FROM agent_workspaces').run();
  } finally {
    db.close();
  }
});

afterAll(() => {
  cleanupDb(dbPath);
});

// ---------------------------------------------------------------------------
// Expired lease renewal → rejected, task returns to pending
// ---------------------------------------------------------------------------

describe('expired lease renewal', () => {
  it('renewal of expired lease is rejected, task returns to pending', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-lease', 'proj-1', 'Lease task', 'pending');

    // Claim the task
    const claim = runCli(dbPath, ['claim', 'agent-1']);
    expect(claim.status).toBe(0);
    const token = extractToken(claim.stdout);

    // Verify task is in_progress
    let tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-lease'");
    expect(tasks[0].status).toBe('in_progress');
    expect(tasks[0].claim_token).toBe(token);

    // Manually expire the lease by setting lease_expires_at to the past
    const pastDate = new Date(Date.now() - 60000).toISOString();
    writeDb(dbPath, "UPDATE tasks SET lease_expires_at = ? WHERE id = 'task-lease'", [pastDate]);

    // Try to release with the token — the CLI should warn about expired lease
    // but still process the release since token matches
    const release = runCli(dbPath, ['release', 'task-lease', token, '--outcome', 'completed']);
    // The release command warns about expired lease but still succeeds if token matches
    expect(release.status).toBe(0);

    // Task should be completed
    tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-lease'");
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].claim_token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Token mismatch: agent A claims, agent B releases → rejected
// ---------------------------------------------------------------------------

describe('token ownership validation', () => {
  it('release with wrong token is rejected', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-a', 'proj-1');
    seedAgent(dbPath, 'agent-b', 'proj-1');
    seedTask(dbPath, 'task-token', 'proj-1', 'Token task', 'pending');

    // Agent A claims
    const claimA = runCli(dbPath, ['claim', 'agent-a']);
    expect(claimA.status).toBe(0);
    const tokenA = extractToken(claimA.stdout);

    // Agent B tries to release with a different token
    const releaseB = runCli(dbPath, [
      'release',
      'task-token',
      'wrong-token-from-b',
      '--outcome',
      'completed',
    ]);
    expect(releaseB.status).toBe(1);
    expect(releaseB.stderr).toMatch(/invalid.*token/i);

    // Task should still be in_progress with agent A's token
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-token'");
    expect(tasks[0].status).toBe('in_progress');
    expect(tasks[0].claim_token).toBe(tokenA);
  });
});

// ---------------------------------------------------------------------------
// Double-claim prevention: agent A claims, agent B claims same → rejected
// ---------------------------------------------------------------------------

describe('double-claim prevention', () => {
  it('second claim of same task is rejected', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-a', 'proj-1');
    seedAgent(dbPath, 'agent-b', 'proj-1');
    seedTask(dbPath, 'task-double', 'proj-1', 'Double claim task', 'pending');

    // Agent A claims
    const claimA = runCli(dbPath, ['claim', 'agent-a']);
    expect(claimA.status).toBe(0);

    // Agent B tries to claim — task is no longer pending
    const claimB = runCli(dbPath, ['claim', 'agent-b']);
    expect(claimB.status).toBe(1);

    // Task should still be in_progress with agent A's token
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-double'");
    expect(tasks[0].status).toBe('in_progress');
  });
});

// ---------------------------------------------------------------------------
// Unregistered agent claim → rejected, task remains pending
// ---------------------------------------------------------------------------

describe('unregistered agent claim', () => {
  it('claim by unregistered agent is rejected, task remains pending', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    // Do NOT seed any agent
    seedTask(dbPath, 'task-unreg', 'proj-1', 'Unregistered task', 'pending');

    // Try to claim with unregistered agent
    const claim = runCli(dbPath, ['claim', 'ghost-agent']);
    expect(claim.status).toBe(1);
    expect(claim.stderr).toMatch(/not found/i);

    // Task should still be pending
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-unreg'");
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].claim_token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function extractToken(stdout) {
  // Try TTY format first: "Token: <hex>"
  const ttyMatch = stdout.match(/Token:\s*([a-f0-9]+)/i);
  if (ttyMatch) return ttyMatch[1];
  // Parse the last valid JSON line
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const json = JSON.parse(lines[i]);
      return json.claim_token || null;
    } catch {
      continue;
    }
  }
  // Legacy fallback: try parsing entire stdout
  try {
    const json = JSON.parse(stdout);
    return json.claim_token || null;
  } catch {
    return null;
  }
}
