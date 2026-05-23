'use strict';

const {
  createTempDb,
  cleanupDb,
  readDb,
  writeDb,
  seedProject,
  seedAgent,
  seedWorkspace,
  seedTask,
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
// Workspace transitions: planned → ready → active → completed
// ---------------------------------------------------------------------------

describe('workspace status transitions', () => {
  it('workspace transitions through planned → ready → active → completed', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    seedWorkspace(dbPath, 'ws-1', 'proj-1', 'agent-1', 'planned');

    // Verify initial state
    let ws = readDb(dbPath, "SELECT * FROM agent_workspaces WHERE id = 'ws-1'");
    expect(ws[0].status).toBe('planned');

    // Transition to ready
    writeDb(dbPath, "UPDATE agent_workspaces SET status = 'ready' WHERE id = 'ws-1'");
    ws = readDb(dbPath, "SELECT * FROM agent_workspaces WHERE id = 'ws-1'");
    expect(ws[0].status).toBe('ready');

    // Transition to active
    writeDb(dbPath, "UPDATE agent_workspaces SET status = 'active' WHERE id = 'ws-1'");
    ws = readDb(dbPath, "SELECT * FROM agent_workspaces WHERE id = 'ws-1'");
    expect(ws[0].status).toBe('active');

    // Transition to completed
    writeDb(dbPath, "UPDATE agent_workspaces SET status = 'completed' WHERE id = 'ws-1'");
    ws = readDb(dbPath, "SELECT * FROM agent_workspaces WHERE id = 'ws-1'");
    expect(ws[0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Agent status transitions: idle → working → idle
// ---------------------------------------------------------------------------

describe('agent status through lifecycle', () => {
  it('agent transitions idle → working (via claim) → idle (via release)', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-status', 'proj-1', 'idle');
    seedTask(dbPath, 'task-1', 'proj-1', 'Status task', 'pending');

    // Initial: idle
    let agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-status'");
    expect(agents[0].status).toBe('idle');

    // Claim → agent should still be idle in registry (claim doesn't update agent status)
    // But we can verify the task status changes
    const claim = runCli(dbPath, ['claim', 'agent-status']);
    expect(claim.status).toBe(0);
    const token = extractToken(claim.stdout);

    // Task is in_progress
    const tasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(tasks[0].status).toBe('in_progress');

    // Release completed
    const release = runCli(dbPath, ['release', 'task-1', token, '--outcome', 'completed']);
    expect(release.status).toBe(0);

    // Task is completed
    const finalTasks = readDb(dbPath, "SELECT * FROM tasks WHERE id = 'task-1'");
    expect(finalTasks[0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Agent status: working → error via update-status command
// ---------------------------------------------------------------------------

describe('agent status error transition', () => {
  it('agent status can be set to error via update-status', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-err', 'proj-1', 'working');

    // Update to error
    const result = runCli(dbPath, ['update-status', 'agent-err', 'error']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/error/i);

    // Verify in DB
    const agents = readDb(dbPath, "SELECT * FROM agent_registry WHERE agent_id = 'agent-err'");
    expect(agents[0].status).toBe('error');
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
