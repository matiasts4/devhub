const Database = require('better-sqlite3');

const mockPtyProcess = {
  pid: 424242,
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
};

const mockPtySpawn = jest.fn(() => mockPtyProcess);
const mockSaveSessions = jest.fn();
let mockDb;

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });
jest.mock('./sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: jest.fn(() => []),
}));
jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn() })) }), { virtual: true });
jest.mock('net', () => ({
  createServer: jest.fn(() => ({
    once: jest.fn(),
    listen: jest.fn(),
    address: jest.fn(() => ({ port: 4077 })),
    close: jest.fn((cb) => cb && cb()),
  })),
}));
jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 1 })),
}));
jest.mock('os', () => ({
  homedir: () => '/mock-home',
  platform: () => 'linux',
}));
jest.mock('../../lib/db/localDb.js', () => {
  const actual = jest.requireActual('../../lib/db/localDb.js');
  return {
    ...actual,
    getDb: () => mockDb,
  };
});

describe('ttyServer PTY identity integration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete globalThis.__DEVHUB_TTY_SESSIONS__;
    delete globalThis.__DEVHUB_TTY_SERVER__;

    const { ensureRuntimeSchema } = jest.requireActual('../../lib/db/localDb.js');
    mockDb = new Database(':memory:');
    mockDb.pragma('journal_mode = WAL');
    mockDb.pragma('foreign_keys = ON');
    ensureRuntimeSchema(mockDb);

    mockDb.exec("INSERT INTO projects (id, name) VALUES ('proj-pty-phase5', 'PTY Phase 5')");
    mockDb.exec(`INSERT INTO agent_workspaces (
      id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch,
      branch_name, status, observed_branch, observed_head
    ) VALUES (
      'ws-pty-phase5', 'proj-pty-phase5', 'agent-pty-phase5', '/repo', '${process.cwd()}', '${process.cwd()}', 'main',
      'agent/pty-phase5', 'active', 'agent/pty-phase5', 'head-pty-phase5'
    )`);
  });

  afterEach(() => {
    mockDb?.close();
    mockDb = null;
  });

  test('Phase 5.2: session activation populates PTY identity and session termination clears it', async () => {
    const { createSession, closeSession } = await import('./ttyServer.js');

    const before = mockDb.prepare("SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = 'ws-pty-phase5'").get();
    expect(before).toEqual({ pane_id: null, terminal_id: null, opencode_pid: null });

    createSession({ id: 'term-phase5-pty', cwd: process.cwd(), shell: '/bin/zsh' });

    const active = mockDb.prepare("SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = 'ws-pty-phase5'").get();
    expect(active).toEqual({
      pane_id: 'term-phase5-pty',
      terminal_id: 'term-phase5-pty',
      opencode_pid: 424242,
    });

    closeSession('term-phase5-pty');

    const cleared = mockDb.prepare("SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = 'ws-pty-phase5'").get();
    expect(cleared).toEqual({ pane_id: null, terminal_id: null, opencode_pid: null });
  });
});
