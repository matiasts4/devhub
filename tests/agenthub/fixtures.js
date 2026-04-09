/**
 * Test Fixtures for AgentHub Testing
 *
 * Provides deterministic seed data for test databases.
 * All IDs are prefixed with 'test-' for reproducibility and easy cleanup.
 */

/**
 * Generate a deterministic test ID.
 *
 * @param {string} prefix - ID prefix (e.g., 'project', 'task')
 * @param {string|number} [suffix=1] - Suffix for uniqueness
 * @returns {string}
 */
function testId(prefix, suffix = 1) {
  return `test-${prefix}-${suffix}`;
}

/**
 * Seed a test project into the database.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {object} [options]
 * @param {string} [options.id] - Project ID (default: 'test-project-1')
 * @param {string} [options.name] - Project name (default: 'Test Project')
 * @param {string} [options.description] - Project description
 * @param {string} [options.status] - Project status (default: 'active')
 * @param {string} [options.userId] - User ID
 * @returns {object} The inserted project row
 */
function seedProject(db, options = {}) {
  const {
    id = testId('project', 1),
    name = 'Test Project',
    description = 'A project created for testing purposes',
    status = 'active',
    userId = 'test-user-1',
  } = options;

  // Ensure projects table exists
  try {
    db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, description, status, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, name, description, status, userId);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
    // Table doesn't exist — skip silently (schema may not include projects)
    return { id, name, description, status, user_id: userId };
  }

  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

/**
 * Seed a test task into the database.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} projectId - Parent project ID
 * @param {object} [options]
 * @param {string} [options.id] - Task ID (default: 'test-task-1')
 * @param {string} [options.title] - Task title (default: 'Test Task')
 * @param {string} [options.description] - Task description
 * @param {string} [options.status] - Task status (default: 'pending')
 * @param {string} [options.priority] - Task priority (default: 'medium')
 * @returns {object} The inserted task row
 */
function seedTask(db, projectId, options = {}) {
  const {
    id = testId('task', 1),
    title = 'Test Task',
    description = 'A task created for testing purposes',
    status = 'pending',
    priority = 'medium',
  } = options;

  try {
    db.prepare(
      `INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, projectId, title, description, status, priority);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
    return { id, project_id: projectId, title, description, status, priority };
  }

  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/**
 * Seed a test milestone into the database.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} projectId - Parent project ID
 * @param {object} [options]
 * @param {string} [options.id] - Milestone ID (default: 'test-milestone-1')
 * @param {string} [options.title] - Milestone title (default: 'Test Milestone')
 * @param {string} [options.description] - Milestone description
 * @param {string} [options.status] - Milestone status (default: 'active')
 * @param {string} [options.dueDate] - Due date (ISO string)
 * @returns {object} The inserted milestone row
 */
function seedMilestone(db, projectId, options = {}) {
  const {
    id = testId('milestone', 1),
    title = 'Test Milestone',
    description = 'A milestone created for testing purposes',
    status = 'active',
    dueDate = null,
  } = options;

  try {
    db.prepare(
      `INSERT OR IGNORE INTO milestones (id, project_id, title, description, status, due_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, projectId, title, description, status, dueDate);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
    return { id, project_id: projectId, title, description, status, due_date: dueDate };
  }

  return db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
}

/**
 * Seed a test agent_hub_session into the database.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {object} [options]
 * @param {string} [options.id] - Session ID (default: 'test-session-1')
 * @param {string} [options.projectId] - Project ID (default: 'test-project-1')
 * @param {string} [options.title] - Session title (default: 'Test Session')
 * @param {string} [options.agentModel] - Agent model name
 * @param {string} [options.parentId] - Parent session ID
 * @param {string} [options.status] - Session status (default: 'active')
 * @param {string} [options.visibility] - Visibility (default: 'visible')
 * @param {string} [options.telegramChatId] - Telegram chat ID
 * @param {string} [options.directory] - Working directory
 * @param {string} [options.opencodeSessionId] - OpenCode session ID
 * @returns {object} The inserted session row
 */
function seedSession(db, options = {}) {
  const {
    id = testId('session', 1),
    projectId = testId('project', 1),
    title = 'Test Session',
    agentModel = 'test-model',
    parentId = null,
    status = 'active',
    visibility = 'visible',
    telegramChatId = null,
    directory = '/tmp/test-project',
    opencodeSessionId = null,
  } = options;

  db.prepare(
    `INSERT OR IGNORE INTO agent_hub_sessions 
     (id, project_id, title, agent_model, parent_id, status, visibility, 
      telegram_chat_id, directory, opencode_session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    projectId,
    title,
    agentModel,
    parentId,
    status,
    visibility,
    telegramChatId,
    directory,
    opencodeSessionId
  );

  return db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(id);
}

/**
 * Seed a swarm_config entry into the database.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} key - Config key
 * @param {string} value - Config value
 * @returns {object} The inserted config row
 */
function seedSwarmConfig(db, key, value) {
  db.prepare(
    `INSERT OR REPLACE INTO swarm_config (key, value, updated_at)
     VALUES (?, ?, datetime('now'))`
  ).run(key, String(value));

  return db.prepare('SELECT * FROM swarm_config WHERE key = ?').get(key);
}

/**
 * Seed a complete test environment: project, tasks, milestone, session.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {object} [options]
 * @param {string} [options.projectId] - Override project ID
 * @param {number} [options.taskCount] - Number of tasks to create (default: 1)
 * @param {boolean} [options.withMilestone] - Also create a milestone (default: true)
 * @param {boolean} [options.withSession] - Also create a session (default: true)
 * @returns {object} All seeded entities
 */
function seedFullEnvironment(db, options = {}) {
  const {
    projectId = testId('project', 1),
    taskCount = 1,
    withMilestone = true,
    withSession = true,
  } = options;

  const project = seedProject(db, { id: projectId });

  const tasks = [];
  for (let i = 1; i <= taskCount; i++) {
    tasks.push(seedTask(db, projectId, { id: testId('task', i), title: `Test Task ${i}` }));
  }

  let milestone = null;
  if (withMilestone) {
    milestone = seedMilestone(db, projectId);
  }

  let session = null;
  if (withSession) {
    session = seedSession(db, { projectId });
  }

  return { project, tasks, milestone, session };
}

/**
 * Clean up all test data from the database.
 * Removes all rows with IDs prefixed with 'test-'.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @returns {object} Counts of deleted rows per table
 */
function cleanupTestData(db) {
  const tables = [
    'agent_traces',
    'agent_hub_messages',
    'agent_session_usage',
    'telegram_session_map',
    'agent_hub_sessions',
    'tasks',
    'milestones',
    'project_files',
    'projects',
    'swarm_config',
    'swarm_processes',
    'telegram_sessions',
    'telegram_activity',
  ];

  const results = {};
  for (const table of tables) {
    try {
      const result = db.prepare(`DELETE FROM ${table} WHERE id LIKE 'test-%'`).run();
      results[table] = result.changes;
    } catch (e) {
      // Table might not exist
      results[table] = 0;
    }
  }

  return results;
}

module.exports = {
  testId,
  seedProject,
  seedTask,
  seedMilestone,
  seedSession,
  seedSwarmConfig,
  seedFullEnvironment,
  cleanupTestData,
};
