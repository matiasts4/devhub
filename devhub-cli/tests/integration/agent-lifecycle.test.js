'use strict';

const {
  createTempDb,
  cleanupDb,
  readDb,
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
// Full lifecycle: register → heartbeat → claim → release → unregister
// ---------------------------------------------------------------------------

describe('full agent lifecycle', () => {
  it('register → heartbeat → claim → release → unregister updates DB correctly', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');

    // Register (insert directly — simulates register-agent command)
    seedAgent(dbPath, 'agent-lifecycle', 'proj-1', 'idle');

    // Verify agent exists
    let agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-lifecycle'");
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe('idle');

    // Heartbeat
    const hbResult = runCli(dbPath, ['heartbeat', 'agent-lifecycle']);
    expect(hbResult.status).toBe(0);
    expect(hbResult.stdout).toMatch(/heartbeat.*recorded/i);

    // Verify heartbeat timestamp was set
    agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-lifecycle'");
    expect(agents[0].last_heartbeat).not.toBeNull();

    // Seed a task and claim it
    seedTask(dbPath, 'task-lc', 'proj-1', 'Lifecycle task', 'pending');
    const claimResult = runCli(dbPath, ['claim', 'agent-lifecycle']);
    expect(claimResult.status).toBe(0);
    const token = extractToken(claimResult.stdout);

    // Verify task is in_progress
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-lc'");
    expect(tasks[0].status).toBe('in_progress');

    // Release completed
    const releaseResult = runCli(dbPath, ['release', 'task-lc', token, '--outcome', 'completed']);
    expect(releaseResult.status).toBe(0);

    // Verify task is completed
    const finalTasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-lc'");
    expect(finalTasks[0].status).toBe('completed');

    // Unregister (delete from registry)
    const { writeDb } = require('../fixtures/seed-factory');
    writeDb(dbPath, "DELETE FROM agent_registry WHERE agent_id = 'agent-lifecycle'");

    // Verify agent is gone
    agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-lifecycle'");
    expect(agents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Heartbeat updates timestamp within timeout window
// ---------------------------------------------------------------------------

describe('heartbeat timestamp', () => {
  it('heartbeat updates last_heartbeat to recent time', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-hb', 'proj-1', 'idle');

    const before = Date.now();
    const result = runCli(dbPath, ['heartbeat', 'agent-hb']);
    const after = Date.now();

    expect(result.status).toBe(0);

    const agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-hb'");
    const hbTime = new Date(agents[0].last_heartbeat + 'Z').getTime();

    // Heartbeat timestamp should be within the test execution window
    expect(hbTime).toBeGreaterThanOrEqual(before - 1000);
    expect(hbTime).toBeLessThanOrEqual(after + 1000);
  });
});

// ---------------------------------------------------------------------------
// Agent appears in `devhub agents` output after registration
// ---------------------------------------------------------------------------

describe('agent list output', () => {
  it('registered agent appears in agents command output', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-list-test', 'proj-1', 'idle');

    const result = runCli(dbPath, ['agents']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/agent-list-test/i);
  });
});

// ---------------------------------------------------------------------------
// Agent removed from output after unregister
// ---------------------------------------------------------------------------

describe('agent removal from output', () => {
  it('agent disappears from agents output after unregister', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-unreg', 'proj-1', 'idle');

    // Verify agent appears
    const before = runCli(dbPath, ['agents']);
    expect(before.stdout).toMatch(/agent-unreg/i);

    // Unregister
    const { writeDb } = require('../fixtures/seed-factory');
    writeDb(dbPath, "DELETE FROM agent_registry WHERE agent_id = 'agent-unreg'");

    // Verify agent is gone
    const after = runCli(dbPath, ['agents']);
    expect(after.stdout).not.toMatch(/agent-unreg/i);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function extractToken(stdout) {
  const ttyMatch = stdout.match(/Token:\s*([a-f0-9]+)/i);
  if (ttyMatch) return ttyMatch[1];
  try {
    const json = JSON.parse(stdout);
    return json.claim_token || null;
  } catch {
    return null;
  }
}
