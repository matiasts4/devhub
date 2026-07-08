/**
 * ttyServer.test.js — TDD tests for session persistence in ttyServer
 * Tests: saveSessions called on create/close, loadSessions called on startup, debounce on output.
 */

const path = require('path');

// --- Mock node-pty ---
const mockPtyProcess = {
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
};
const mockPtySpawn = jest.fn(() => mockPtyProcess);

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });

// --- Mock sessionStore ---
const mockSaveSessions = jest.fn();
const mockLoadSessions = jest.fn(() => []);

jest.mock('./sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: mockLoadSessions,
  getSessionFilePath: () => '/mock-home/.devhub/terminal-sessions.json',
  STALE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  // classifySession: forward to actual implementation for restoreSessions branching
  classifySession: jest.requireActual('./sessionStore.js').classifySession,
}));

// --- Mock ws ---
const mockWssOn = jest.fn();
const mockWss = { on: mockWssOn };
const mockWebSocketServer = jest.fn(() => mockWss);

jest.mock('ws', () => ({ WebSocketServer: mockWebSocketServer }), { virtual: true });

// --- Mock net ---
jest.mock('net', () => ({
  createServer: jest.fn(() => ({
    once: jest.fn((event, cb) => {
      if (event === 'listening') {
        // Simulate async listen completing
        setTimeout(() => cb(), 0);
      }
    }),
    listen: jest.fn(),
    address: jest.fn(() => ({ port: 4077 })),
    close: jest.fn((cb) => cb && cb()),
  })),
}));

// --- Mock child_process ---
jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 1 })), // tmux not available
}));

// --- Mock os ---
jest.mock('os', () => ({
  homedir: () => '/mock-home',
  platform: () => 'linux',
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockLoadSessions.mockReturnValue([]);
  mockPtyProcess.onData.mockImplementation(() => {});
  mockPtyProcess.onExit.mockImplementation(() => {});
  globalThis.__DEVHUB_TTY_NODE_PTY__ = { spawn: mockPtySpawn };
  globalThis.__DEVHUB_TTY_WS__ = { WebSocketServer: mockWebSocketServer };
  // Reset global singletons
  delete globalThis.__DEVHUB_TTY_SERVER__;
  delete globalThis.__DEVHUB_TTY_SESSIONS__;
});

afterEach(() => {
  delete globalThis.__DEVHUB_TTY_NODE_PTY__;
  delete globalThis.__DEVHUB_TTY_WS__;
});

describe('ttyServer — restoreSessions', () => {
  it('calls loadSessions on startup and creates PTY sessions for restored entries', async () => {
    const freshTime = new Date().toISOString();
    mockLoadSessions.mockReturnValue([
      {
        id: 'restored-1',
        cwd: '/home/user/project',
        shell: '/bin/zsh',
        ptyPid: process.pid,
        title: null,
        createdAt: freshTime,
        lastSeenAt: freshTime,
        restored: true,
      },
      {
        id: 'restored-2',
        cwd: '/tmp',
        shell: '/bin/zsh',
        ptyPid: process.pid,
        title: null,
        createdAt: freshTime,
        lastSeenAt: freshTime,
        restored: true,
      },
    ]);

    const { restoreSessions } = await import('./ttyServer.js');
    restoreSessions();

    expect(mockLoadSessions).toHaveBeenCalled();
    // Sessions should exist in the global map
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions).toBeDefined();
    expect(sessions.size).toBe(2);
  });

  it('restored sessions retain PTY output in history and broadcast it to attached sockets', async () => {
    const freshTime = new Date().toISOString();
    mockLoadSessions.mockReturnValue([
      {
        id: 'restored-live',
        cwd: '/home/user/project',
        shell: '/bin/zsh',
        ptyPid: process.pid,
        title: null,
        createdAt: freshTime,
        lastSeenAt: freshTime,
        restored: true,
      },
    ]);

    const { restoreSessions } = await import('./ttyServer.js');
    restoreSessions();

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('restored-live');
    const socket = {
      OPEN: 1,
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
    };
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('restored prompt$ ');

    expect(session.history).toContain('restored prompt$ ');
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'restored prompt$ ' })
    );
  });

  it('does not crash when session file has no sessions', async () => {
    mockLoadSessions.mockReturnValue([]);

    const { restoreSessions } = await import('./ttyServer.js');
    expect(() => restoreSessions()).not.toThrow();

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    // Either no map or empty map
    const size = sessions ? sessions.size : 0;
    expect(size).toBe(0);
  });
});

describe('ttyServer — session create', () => {
  it('calls saveSessions after creating a new session via createSession()', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'term-new', cwd: '/home/user', shell: '/bin/zsh' });

    expect(mockSaveSessions).toHaveBeenCalled();
    // The sessions map should be passed
    const [calledMap] = mockSaveSessions.mock.calls[0];
    expect(calledMap).toBeInstanceOf(Map);
    expect(calledMap.has('term-new')).toBe(true);
  });

  it('detects opencode --session in spawn command and marks session opencode-durable', async () => {
    const { createSession } = await import('./ttyServer.js');
    const { getOpencodeSession, resetOpencodeSessionRegistryForTests } =
      await import('./opencodeSessionRegistry.js');

    resetOpencodeSessionRegistryForTests();

    createSession({
      id: 'term-opencode',
      cwd: '/home/user',
      shell: '/bin/zsh',
      initialCommand: 'opencode --session ses_spawn_1',
    });

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('term-opencode');

    expect(session.opencodeSessionId).toBe('ses_spawn_1');
    expect(session.sessionType).toBe('opencode-durable');
    expect(session.skipBackendRestore).toBe(true);
    expect(session.durableRestore).toBe(true);
    expect(session.initialCommand).toBe('opencode --session ses_spawn_1');
    expect(getOpencodeSession('term-opencode')?.opencodeSessionId).toBe('ses_spawn_1');
  });

  it('falls back to a safe cwd when the requested cwd does not exist', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({
      id: 'term-safe-fallback',
      cwd: '/definitely/missing/devhub',
      shell: '/bin/zsh',
    });

    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall[2]?.cwd).toBe(process.cwd());
    expect(spawnCall[2]?.env?.DEVHUB_PROJECT_DIR).toBe(process.cwd());

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.get('term-safe-fallback')?.cwd).toBe(process.cwd());
  });

  it('strips npm prefix env vars from spawned shell sessions to avoid nvm startup noise', async () => {
    const { createSession } = await import('./ttyServer.js');
    const previousLowerPrefix = process.env.npm_config_prefix;
    const previousUpperPrefix = process.env.NPM_CONFIG_PREFIX;

    process.env.npm_config_prefix = '/home/user/.npm-global';
    process.env.NPM_CONFIG_PREFIX = '/home/user/.npm-global-upper';

    try {
      createSession({ id: 'term-sanitized-env', cwd: process.cwd(), shell: '/bin/zsh' });

      const spawnCall = mockPtySpawn.mock.calls[0];
      const spawnEnv = spawnCall[2]?.env;
      expect(spawnEnv?.npm_config_prefix).toBeUndefined();
      expect(spawnEnv?.NPM_CONFIG_PREFIX).toBeUndefined();
      expect(spawnEnv?.DEVHUB_PROJECT_DIR).toBe(process.cwd());
    } finally {
      if (previousLowerPrefix === undefined) {
        delete process.env.npm_config_prefix;
      } else {
        process.env.npm_config_prefix = previousLowerPrefix;
      }

      if (previousUpperPrefix === undefined) {
        delete process.env.NPM_CONFIG_PREFIX;
      } else {
        process.env.NPM_CONFIG_PREFIX = previousUpperPrefix;
      }
    }
  });

  it('passes zsh --no-use args for direct shell sessions to skip nvm auto-use warnings', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'term-zsh-no-use', cwd: process.cwd(), shell: '/bin/zsh' });

    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall[0]).toBe('/bin/zsh');
    expect(spawnCall[1]).toEqual(['-lic', 'exec zsh -i', 'devhub-shell', '--no-use']);
  });

  it('auto-generates an id when createSession is called without one (POST /api/terminal/session contract)', async () => {
    const { createSession } = await import('./ttyServer.js');

    // No `id` argument — this is exactly what src/app/api/terminal/session/route.js does.
    const session = createSession({ cwd: process.cwd(), shell: '/bin/zsh' });

    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe('string');
    expect(session.id).toMatch(/^term-\d+-[a-z0-9]+$/);

    // Session must be registered so list_terminals can find it.
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.has(session.id)).toBe(true);
  });

  it('uses role-based tmux session naming for swarm agents', async () => {
    const fs = require('fs');
    const validSwarmCwd = path.join(process.cwd(), '.devhub', 'worktrees', 'launch-123', 'coder');

    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p.includes('.devhub/worktrees')) return true;
      return false;
    });
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((p) => {
      if (p.includes('.devhub/worktrees')) {
        return { isDirectory: () => true };
      }
      throw new Error('Directory not found');
    });

    try {
      const { createSession } = await import('./ttyServer.js');

      const session = createSession({
        id: 'term-swarm-agent',
        cwd: validSwarmCwd,
        shell: '/bin/zsh',
        swarmContext: {
          isSwarmRole: true,
          roleKey: 'coder',
          launchId: 'launch-123',
        },
      });

      expect(session.swarmRole).toEqual({ roleKey: 'coder' });
      expect(session.swarmId).toBe('launch-123');

      const spawnCall = mockPtySpawn.mock.calls[0];
      expect(spawnCall[2]?.env?.DEVHUB_TMUX_SESSION).toBe('devhub-swarm-launch-123-coder');
    } finally {
      existsSpy.mockRestore();
      statSpy.mockRestore();
    }
  });
});

describe('ttyServer — session close', () => {
  it('calls saveSessions after closing a session via closeSession()', async () => {
    const { createSession, closeSession } = await import('./ttyServer.js');

    createSession({ id: 'term-close', cwd: '/home/user', shell: '/bin/zsh' });
    mockSaveSessions.mockClear();

    closeSession('term-close');

    expect(mockSaveSessions).toHaveBeenCalled();
    const [calledMap] = mockSaveSessions.mock.calls[0];
    expect(calledMap.has('term-close')).toBe(false);
  });
});

describe('ttyServer — PTY lifecycle helpers', () => {
  it('returns live runtime evidence for an existing PTY session', async () => {
    const { createSession, readPtyRuntime } = await import('./ttyServer.js');

    createSession({ id: 'pty-live', cwd: process.cwd(), shell: '/bin/zsh' });

    expect(readPtyRuntime({ terminalId: 'pty-live' })).toEqual({
      provider: 'pty',
      availability: 'live',
      handle_ref: 'pty-live',
      evidence: {
        terminalId: 'pty-live',
        cwd: process.cwd(),
        restored: false,
        opencodeSessionId: null,
      },
    });
  });

  it('openPtyLifecycle creates a PTY runtime when no live handle exists', async () => {
    const { openPtyLifecycle } = await import('./ttyServer.js');

    const result = openPtyLifecycle({
      binding: { workspace_id: 'ws-123', run_id: 'run-456' },
      runtimeHint: { terminalId: 'pty-open' },
    });

    expect(mockPtySpawn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_created',
      runtime: {
        provider: 'pty',
        availability: 'live',
        handle_ref: 'pty-open',
        evidence: {
          terminalId: 'pty-open',
          cwd: process.env.HOME || process.cwd(),
          restored: false,
          opencodeSessionId: null,
        },
      },
    });
  });

  it('attachPtyLifecycle degrades when runtime handle is missing and never spawns', async () => {
    const { attachPtyLifecycle } = await import('./ttyServer.js');

    const result = attachPtyLifecycle({
      runtimeHint: { terminalId: 'pty-missing' },
    });

    expect(mockPtySpawn).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'degraded',
      reason: 'runtime_handle_missing',
      runtime: {
        provider: 'pty',
        availability: 'missing',
        handle_ref: null,
        evidence: {
          terminalId: 'pty-missing',
        },
      },
    });
  });

  it('reuses an existing live PTY handle for both open and attach without respawning', async () => {
    const { createSession, openPtyLifecycle, attachPtyLifecycle } = await import('./ttyServer.js');

    createSession({ id: 'pty-existing', cwd: process.cwd(), shell: '/bin/zsh' });
    mockPtySpawn.mockClear();

    const openResult = openPtyLifecycle({
      binding: { workspace_id: 'ws-123', run_id: 'run-456' },
      runtimeHint: { terminalId: 'pty-existing' },
    });
    const attachResult = attachPtyLifecycle({
      runtimeHint: { terminalId: 'pty-existing' },
    });

    expect(mockPtySpawn).not.toHaveBeenCalled();
    expect(openResult).toEqual({
      outcome: 'ok',
      reason: 'runtime_handle_live',
      runtime: {
        provider: 'pty',
        availability: 'live',
        handle_ref: 'pty-existing',
        evidence: {
          terminalId: 'pty-existing',
          cwd: process.cwd(),
          restored: false,
          opencodeSessionId: null,
        },
      },
    });
    expect(attachResult).toEqual(openResult);
  });
});

describe('ttyServer — DEVHUB_MCP_CMD uses dynamic project-root path', () => {
  it('resolves devhub-mcp/server.js relative to this file, not a hardcoded home path', async () => {
    const { createSession } = await import('./ttyServer.js');
    createSession({ id: 'mcp-path-test', cwd: '/some/cwd', shell: '/bin/zsh' });

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions).toBeDefined();
    const session = sessions.get('mcp-path-test');
    // The env var must exist and point to a node invocation
    expect(session).toBeDefined();
    // We verify that the spawned PTY env was set; since we mock pty.spawn,
    // check the call arg that contains the env
    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall).toBeDefined();
    const spawnEnv = spawnCall[2]?.env;
    expect(spawnEnv?.DEVHUB_MCP_CMD).toBeDefined();
    const expectedCommand = `node ${path.resolve(process.cwd(), 'devhub-mcp', 'server.js')}`;
    expect(spawnEnv.DEVHUB_MCP_CMD).toBe(expectedCommand);
    expect(spawnEnv.DEVHUB_MCP_CMD).toContain(path.join('devhub-mcp', 'server.js'));
  });
});

describe('ttyServer — getTTYSessionsSnapshot includes cwd and restored', () => {
  it('includes cwd and restored in snapshot entries', async () => {
    const { createSession, getTTYSessionsSnapshot } = await import('./ttyServer.js');
    const existingCwd = process.cwd();

    createSession({ id: 'snap-1', cwd: existingCwd, shell: '/bin/zsh', restored: true });

    const snapshot = getTTYSessionsSnapshot();
    const entry = snapshot.find((s) => s.terminalId === 'snap-1');

    expect(entry).toBeDefined();
    expect(entry.cwd).toBe(existingCwd);
    expect(entry.restored).toBe(true);
  });
});

describe('ttyServer — TERM-01 diagnostics helpers', () => {
  it('builds focused resize diagnostics for session recovery debugging', async () => {
    const { buildTTYSessionDiagnosticSnapshot } = await import('./ttyServer.js');

    const snapshot = buildTTYSessionDiagnosticSnapshot(
      {
        id: 'term-01',
        mode: 'tui',
        historyEnabled: false,
        sockets: new Set([{}, {}]),
        cwd: '/workspace/devhub',
        opencodeSessionId: 'ses_123',
      },
      { reason: 'client-resize', cols: 132, rows: 40 }
    );

    expect(snapshot).toEqual({
      terminalId: 'term-01',
      mode: 'tui',
      historyEnabled: false,
      socketCount: 2,
      cwd: '/workspace/devhub',
      cols: 132,
      rows: 40,
      opencodeSessionId: 'ses_123',
      hermesSessionId: null,
      reason: 'client-resize',
    });
  });

  it('suppresses duplicate diagnostics but keeps meaningful state changes', async () => {
    const { buildTTYSessionDiagnosticSnapshot, shouldLogTTYSessionDiagnostic } =
      await import('./ttyServer.js');

    const previous = buildTTYSessionDiagnosticSnapshot(
      {
        id: 'term-01',
        mode: 'shell',
        historyEnabled: true,
        sockets: new Set([{}]),
        cwd: '/workspace/devhub',
      },
      { reason: 'client-resize', cols: 120, rows: 32 }
    );
    const duplicate = buildTTYSessionDiagnosticSnapshot(
      {
        id: 'term-01',
        mode: 'shell',
        historyEnabled: true,
        sockets: new Set([{}]),
        cwd: '/workspace/devhub',
      },
      { reason: 'client-resize', cols: 120, rows: 32 }
    );
    const changed = buildTTYSessionDiagnosticSnapshot(
      {
        id: 'term-01',
        mode: 'tui',
        historyEnabled: false,
        sockets: new Set([{}]),
        cwd: '/workspace/devhub',
      },
      { reason: 'tui-reattach', cols: 120, rows: 40 }
    );

    expect(shouldLogTTYSessionDiagnostic(previous, duplicate)).toBe(false);
    expect(shouldLogTTYSessionDiagnostic(previous, changed)).toBe(true);
  });
});

describe('ttyServer — shell history hygiene', () => {
  function createMockSocket() {
    return {
      OPEN: 1,
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };
  }

  it('preserves normal shell output in history and broadcast', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'shell-clean', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('shell-clean');
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ls\r\nfile-a\r\n');

    expect(session.history).toBe('prompt$ ls\r\nfile-a\r\n');
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'prompt$ ls\r\nfile-a\r\n' })
    );
  });

  it('filters terminal response noise from tui-mode broadcast', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'tui-noise', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('tui-noise');
    session.mode = 'tui';
    session.historyEnabled = false;
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ');
    onDataHandler('\u001b[?1;2c\u001b[>0;276;0c');
    onDataHandler('opencode ready\r\n');

    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: 'output', data: 'prompt$ ' })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: 'output', data: 'opencode ready\r\n' })
    );
    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it('getSessionOutput falls back to scrollbackStore when history is disabled (agent TUI)', async () => {
    const { createSession, getSessionOutput } = await import('./ttyServer.js');

    createSession({ id: 'tui-capture', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('tui-capture');
    session.mode = 'tui';
    session.historyEnabled = false;
    session.history = '';

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('opencode ready\r\n');

    expect(session.history).toBe('');
    expect(getSessionOutput('tui-capture')).toBe('opencode ready\r\n');
  });

  it('drops pure terminal response noise from websocket input before pty.write', async () => {
    const { ensureTTYServer } = await import('./ttyServer.js');

    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];

    const socket = createMockSocket();
    socket.on = jest.fn((event, handler) => {
      socket[`__${event}`] = handler;
    });

    connectionHandler(socket, { url: '/terminal?id=input-filter&cwd=%2Fhome%2Fuser' });

    mockPtyProcess.write.mockClear();
    socket.__message(JSON.stringify({ type: 'input', data: '\u001b[?1;2c\u001b[>0;276;0c' }));

    expect(mockPtyProcess.write).not.toHaveBeenCalled();

    socket.__message(JSON.stringify({ type: 'input', data: '\u001b[Il' }));
    expect(mockPtyProcess.write).toHaveBeenCalledTimes(1);
    expect(mockPtyProcess.write).toHaveBeenCalledWith('l');
  });

  it('filters terminal response noise from shell-mode broadcast and history', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'shell-noise', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('shell-noise');
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ');
    onDataHandler('\u001b[?1;2c');
    onDataHandler('\u001b[>0;276;0c');
    onDataHandler('\u001b[12;34R');
    onDataHandler('echo ok\r\nok\r\n');

    expect(session.history).toBe('prompt$ echo ok\r\nok\r\n');
    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: 'output', data: 'prompt$ ' })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: 'output', data: 'echo ok\r\nok\r\n' })
    );
    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it('filters recurring nvm startup warnings from shell-mode broadcast and history', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'shell-nvm-warning', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('shell-nvm-warning');
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler(
      'Your user’s .npmrc file (${HOME}/.npmrc)\n' +
        'has a `globalconfig` and/or a `prefix` setting, which are incompatible with nvm.\n' +
        'Run `nvm use --delete-prefix v24.14.0 --silent` to unset it.\n'
    );
    onDataHandler(
      'nvm is not compatible with the "npm_config_prefix" environment variable: currently set to "/home/user/.npm-global"\n' +
        'Run `unset npm_config_prefix` to unset it.\n'
    );
    onDataHandler('prompt$ pwd\r\n/home/user\r\n');

    expect(session.history).toBe('prompt$ pwd\r\n/home/user\r\n');
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'prompt$ pwd\r\n/home/user\r\n' })
    );
  });

  it('does not replay stored terminal response noise on existing shell-session reconnect', async () => {
    const { ensureTTYServer } = await import('./ttyServer.js');

    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];
    expect(connectionHandler).toBeInstanceOf(Function);

    const firstSocket = createMockSocket();
    firstSocket.on = jest.fn((event, handler) => {
      firstSocket[`__${event}`] = handler;
    });

    connectionHandler(firstSocket, { url: '/terminal?id=replay-shell&cwd=%2Fhome%2Fuser' });

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ');
    onDataHandler('\u001b[?1;2c');
    onDataHandler('pwd\r\n/home/user\r\n');

    firstSocket.send.mockClear();

    const reconnectSocket = createMockSocket();
    reconnectSocket.on = jest.fn((event, handler) => {
      reconnectSocket[`__${event}`] = handler;
    });

    connectionHandler(reconnectSocket, { url: '/terminal?id=replay-shell&cwd=%2Fhome%2Fuser' });

    expect(reconnectSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'prompt$ pwd\r\n/home/user\r\n' })
    );
    expect(reconnectSocket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: expect.stringContaining('[?1;2c') })
    );
  });

  it('falls back to a safe cwd for fresh websocket sessions with an invalid requested cwd', async () => {
    const { ensureTTYServer } = await import('./ttyServer.js');

    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];
    expect(connectionHandler).toBeInstanceOf(Function);

    const socket = createMockSocket();
    socket.on = jest.fn((event, handler) => {
      socket[`__${event}`] = handler;
    });

    connectionHandler(socket, {
      url: '/terminal?id=invalid-cwd&cwd=%2Fdefinitely%2Fmissing%2Fdevhub',
    });

    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall[2]?.cwd).toBe(process.cwd());

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.get('invalid-cwd')?.cwd).toBe(process.cwd());
  });
});
