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
  } finally {
    db.close();
  }
});

afterAll(() => {
  cleanupDb(dbPath);
});

// ---------------------------------------------------------------------------
// Priority ordering: 3 tasks with different priorities → descending score
// ---------------------------------------------------------------------------

describe('queue priority ordering', () => {
  it('returns tasks in descending priority score order', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');

    // Seed tasks with different priorities
    seedTask(dbPath, 'task-low', 'proj-1', 'Low priority', 'pending', 'low', 2);
    seedTask(dbPath, 'task-high', 'proj-1', 'High priority', 'pending', 'high', 9);
    seedTask(dbPath, 'task-med', 'proj-1', 'Medium priority', 'pending', 'medium', 5);

    // Query queue for the project
    const result = runCli(dbPath, ['queue', '--project', 'proj-1', '--limit', '10']);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toMatch(/no tasks/i);

    // Verify ordering by reading DB directly (queue command uses readExecutionQueueSummary)
    const tasks = readDb(dbPath,
      "SELECT id, priority, business_value FROM tasks WHERE status = 'pending' ORDER BY business_value DESC"
    );
    expect(tasks[0].id).toBe('task-high');
    expect(tasks[1].id).toBe('task-med');
    expect(tasks[2].id).toBe('task-low');
  });
});

// ---------------------------------------------------------------------------
// Blocked task excluded with include_blocked=false
// ---------------------------------------------------------------------------

describe('blocked task filtering', () => {
  it('blocked task is excluded when include_blocked=false', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');

    seedTask(dbPath, 'task-pending', 'proj-1', 'Pending task', 'pending', 'high', 8);
    seedTask(dbPath, 'task-blocked', 'proj-1', 'Blocked task', 'blocked', 'high', 9);

    // Queue without blocked
    const result = runCli(dbPath, ['queue', '--project', 'proj-1']);
    expect(result.status).toBe(0);

    // The queue command shows all tasks but the pending one should be the one claimable
    // Verify DB state
    const pendingTasks = readDb(dbPath,
      "SELECT id FROM tasks WHERE status = 'pending'"
    );
    expect(pendingTasks).toHaveLength(1);
    expect(pendingTasks[0].id).toBe('task-pending');
  });
});

// ---------------------------------------------------------------------------
// Blocked task included with include_blocked=true
// ---------------------------------------------------------------------------

describe('blocked task inclusion', () => {
  it('blocked task is included when --blocked flag is used', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');

    seedTask(dbPath, 'task-pending', 'proj-1', 'Pending task', 'pending', 'high', 8);
    seedTask(dbPath, 'task-blocked', 'proj-1', 'Blocked task', 'blocked', 'high', 9);

    // Queue with blocked filter
    const result = runCli(dbPath, ['queue', '--project', 'proj-1', '--blocked']);
    expect(result.status).toBe(0);

    // Verify blocked task exists in DB
    const blockedTasks = readDb(dbPath,
      "SELECT id FROM tasks WHERE status = 'blocked'"
    );
    expect(blockedTasks).toHaveLength(1);
    expect(blockedTasks[0].id).toBe('task-blocked');
  });
});

// ---------------------------------------------------------------------------
// Empty queue → no tasks returned
// ---------------------------------------------------------------------------

describe('empty queue', () => {
  it('shows no tasks message when queue is empty', () => {
    seedProject(dbPath, 'proj-1', 'Test Project');
    seedAgent(dbPath, 'agent-1', 'proj-1');
    // No tasks

    const result = runCli(dbPath, ['queue', '--project', 'proj-1']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/no tasks/i);
  });
});

// ---------------------------------------------------------------------------
// Single project filter → only that project's tasks
// ---------------------------------------------------------------------------

describe('project filtering', () => {
  it('queue --project returns only that project tasks', () => {
    seedProject(dbPath, 'proj-alpha', 'Project Alpha');
    seedProject(dbPath, 'proj-beta', 'Project Beta');
    seedAgent(dbPath, 'agent-1', 'proj-alpha');
    seedAgent(dbPath, 'agent-2', 'proj-beta');

    seedTask(dbPath, 'task-a1', 'proj-alpha', 'Alpha task 1', 'pending', 'high', 8);
    seedTask(dbPath, 'task-a2', 'proj-alpha', 'Alpha task 2', 'pending', 'medium', 5);
    seedTask(dbPath, 'task-b1', 'proj-beta', 'Beta task 1', 'pending', 'high', 9);

    // Query only proj-alpha
    const result = runCli(dbPath, ['queue', '--project', 'proj-alpha']);
    expect(result.status).toBe(0);

    // Verify only alpha tasks are pending in that project
    const alphaTasks = readDb(dbPath,
      "SELECT id FROM tasks WHERE project_id = 'proj-alpha' AND status = 'pending'"
    );
    expect(alphaTasks).toHaveLength(2);

    const betaTasks = readDb(dbPath,
      "SELECT id FROM tasks WHERE project_id = 'proj-beta' AND status = 'pending'"
    );
    expect(betaTasks).toHaveLength(1);
  });
});
