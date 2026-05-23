'use strict';

const {
  createTempDb,
  cleanupDb,
  readDb,
  writeDb,
  seedBaseline,
  seedProject,
  seedTask,
  seedAgent,
  seedWorkspace,
  seedDependency,
} = require('../fixtures/seed-factory');

describe('seed-factory', () => {
  let dbPath;

  beforeEach(() => {
    dbPath = createTempDb();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  describe('createTempDb', () => {
    it('returns a path in os.tmpdir() with .db extension', () => {
      expect(dbPath).toMatch(/\.db$/);
      expect(dbPath).toMatch(/devhub-test-/);
    });
  });

  describe('cleanupDb', () => {
    it('removes .db, .db-wal, .db-shm files', () => {
      // Create the files
      const fs = require('fs');
      fs.writeFileSync(dbPath, 'test');
      fs.writeFileSync(`${dbPath}-wal`, 'test');
      fs.writeFileSync(`${dbPath}-shm`, 'test');

      cleanupDb(dbPath);

      expect(fs.existsSync(dbPath)).toBe(false);
      expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
      expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
    });

    it('does not throw if files do not exist', () => {
      expect(() => cleanupDb(dbPath)).not.toThrow();
    });
  });

  describe('seedBaseline', () => {
    it('creates expected baseline data', () => {
      seedBaseline(dbPath);

      const projects = readDb(dbPath, 'SELECT * FROM projects ORDER BY id');
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('Project Alpha');
      expect(projects[1].name).toBe('Project Beta');

      const tasks = readDb(dbPath, 'SELECT * FROM tasks ORDER BY id');
      expect(tasks).toHaveLength(5);

      const agents = readDb(dbPath, 'SELECT * FROM agent_registry ORDER BY agent_id');
      expect(agents).toHaveLength(2);
      expect(agents[0].agent_id).toBe('agent-1');
      expect(agents[1].agent_id).toBe('agent-2');

      const milestones = readDb(dbPath, 'SELECT * FROM milestones');
      expect(milestones).toHaveLength(1);
      expect(milestones[0].title).toBe('Milestone 1');
    });

    it('detects schema drift on missing columns', () => {
      // Create a DB with a broken schema directly (bypass openDb which creates full schema)
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY)');
      db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT)');
      db.close();

      expect(() => seedBaseline(dbPath)).toThrow(/Schema drift/);
    });
  });

  describe('individual seeders', () => {
    it('seedProject inserts a project', () => {
      seedProject(dbPath, 'p1', 'Test Project', 'active');
      const rows = readDb(dbPath, 'SELECT * FROM projects WHERE id = ?', ['p1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Test Project');
    });

    it('seedTask inserts a task', () => {
      seedProject(dbPath, 'p1', 'Test');
      seedTask(dbPath, 't1', 'p1', 'My Task', 'pending', 'high', 10);
      const rows = readDb(dbPath, 'SELECT * FROM tasks WHERE id = ?', ['t1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].priority).toBe('high');
      expect(rows[0].business_value).toBe(10);
    });

    it('seedAgent inserts an agent', () => {
      seedAgent(dbPath, 'my-agent', 'p1', 'working');
      const rows = readDb(dbPath, 'SELECT * FROM agent_registry WHERE agent_id = ?', ['my-agent']);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('working');
    });

    it('seedWorkspace inserts a workspace', () => {
      seedWorkspace(dbPath, 'ws-1', 'p1', 'agent-1', 'active');
      const rows = readDb(dbPath, 'SELECT * FROM agent_workspaces WHERE id = ?', ['ws-1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('active');
    });

    it('seedDependency inserts a dependency', () => {
      seedProject(dbPath, 'p1', 'Test');
      seedTask(dbPath, 't1', 'p1', 'Task 1');
      seedTask(dbPath, 't2', 'p1', 'Task 2');
      seedDependency(dbPath, 'dep-1', 't2', 't1');
      const rows = readDb(dbPath, 'SELECT * FROM task_dependencies WHERE id = ?', ['dep-1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].depends_on).toBe('t1');
    });
  });
});
