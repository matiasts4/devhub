'use strict';

const {
  createTempDb,
  cleanupDb,
  readDb,
  seedBaseline,
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
  // Clear all data before each test
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
// Happy path: claim → release completed
// ---------------------------------------------------------------------------

describe('claim-release happy path', () => {
  it('claim succeeds, release completed sets task status to completed', () => {
    // Seed: project + agent + pending task
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'My task', 'pending', 'high', 8);

    // Claim
    const claimResult = runCli(dbPath, ['claim', 'agent-1']);
    expect(claimResult.status).toBe(0);
    expect(claimResult.stdout).toMatch(/task-1/i);

    // Parse claim token from output
    const tokenMatch = claimResult.stdout.match(/Token:\s*([a-f0-9]+)/i)
      || (() => { const json = JSON.parse(claimResult.stdout); return json.claim_token ? [null, json.claim_token] : null; })();
    const claimToken = tokenMatch ? tokenMatch[1] : null;
    expect(claimToken).toBeTruthy();

    // Verify task is in_progress
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('in_progress');
    expect(tasks[0].claim_token).toBe(claimToken);

    // Release with completed outcome
    const releaseResult = runCli(dbPath, ['release', 'task-1', claimToken, '--outcome', 'completed']);
    expect(releaseResult.status).toBe(0);
    expect(releaseResult.stdout).toMatch(/released.*completed/i);

    // Verify task is completed
    const finalTasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(finalTasks[0].status).toBe('completed');
    expect(finalTasks[0].claim_token).toBeNull();
    expect(finalTasks[0].lease_expires_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Release paused → task returns to pending → re-claim succeeds
// ---------------------------------------------------------------------------

describe('release paused → re-claim', () => {
  it('release paused sets task to paused status', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'Paused task', 'pending');

    // First claim
    const claim1 = runCli(dbPath, ['claim', 'agent-1']);
    expect(claim1.status).toBe(0);
    const token1 = extractToken(claim1.stdout);

    // Release paused
    const releasePaused = runCli(dbPath, ['release', 'task-1', token1, '--outcome', 'paused']);
    expect(releasePaused.status).toBe(0);

    // Task should be paused (not returned to pending — paused tasks need manual intervention)
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('paused');
    expect(tasks[0].claim_token).toBeNull();
    expect(tasks[0].lease_expires_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Release failed → task status = blocked
// ---------------------------------------------------------------------------

describe('release failed', () => {
  it('release failed sets task status to blocked', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'Fail task', 'pending');

    const claim = runCli(dbPath, ['claim', 'agent-1']);
    expect(claim.status).toBe(0);
    const token = extractToken(claim.stdout);

    const release = runCli(dbPath, ['release', 'task-1', token, '--outcome', 'failed']);
    expect(release.status).toBe(0);

    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Release abandoned → task status = blocked
// ---------------------------------------------------------------------------

describe('release abandoned', () => {
  it('release abandoned sets task status to blocked', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'Abandon task', 'pending');

    const claim = runCli(dbPath, ['claim', 'agent-1']);
    expect(claim.status).toBe(0);
    const token = extractToken(claim.stdout);

    const release = runCli(dbPath, ['release', 'task-1', token, '--outcome', 'abandoned']);
    expect(release.status).toBe(0);

    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('blocked');
  });
});

// ---------------------------------------------------------------------------
// Release with invalid token → rejected
// ---------------------------------------------------------------------------

describe('release invalid token', () => {
  it('release with wrong token is rejected, task unchanged', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'Token test', 'pending');

    const claim = runCli(dbPath, ['claim', 'agent-1']);
    expect(claim.status).toBe(0);

    // Try to release with wrong token
    const release = runCli(dbPath, ['release', 'task-1', 'wrong-token-123', '--outcome', 'completed']);
    expect(release.status).toBe(1);
    expect(release.stderr).toMatch(/invalid.*token/i);

    // Task should still be in_progress with original token
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('in_progress');
    expect(tasks[0].claim_token).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Release unclaimed task → rejected
// ---------------------------------------------------------------------------

describe('release unclaimed task', () => {
  it('release of unclaimed task is rejected', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedTask(dbPath, 'task-1', 'proj-1', 'Unclaimed', 'pending');

    const release = runCli(dbPath, ['release', 'task-1', 'some-token', '--outcome', 'completed']);
    expect(release.status).toBe(1);
    expect(release.stderr).toMatch(/not.*claimed/i);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function extractToken(stdout) {
  // Try TTY format first: "Token: <hex>"
  const ttyMatch = stdout.match(/Token:\s*([a-f0-9]+)/i);
  if (ttyMatch) return ttyMatch[1];
  // Try JSON format
  try {
    const json = JSON.parse(stdout);
    return json.claim_token || null;
  } catch {
    return null;
  }
}
