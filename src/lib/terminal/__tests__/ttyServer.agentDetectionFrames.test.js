/**
 * ttyServer.agentDetectionFrames.test.js — integration tests for the
 * agent-state frame schema (N4/N5), Antigravity output-based start
 * detection (W1), server-side exit cleanup (N7), and the typed-agent
 * child-exit reaper (W7).
 */

// --- Mock node-pty ---
const mockPtyProcess = {
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
  pid: 12345,
};
const mockPtySpawn = jest.fn(() => mockPtyProcess);

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });

// --- Mock sessionStore ---
const mockSaveSessions = jest.fn();
const mockLoadSessions = jest.fn(() => []);

jest.mock('../sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: mockLoadSessions,
  getSessionFilePath: () => '/mock-home/.devhub/terminal-sessions.json',
  STALE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  classifySession: jest.requireActual('../sessionStore.js').classifySession,
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

function createMockSocket() {
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, handler) => {
      socket[`__${event}`] = handler;
    }),
  };
  return socket;
}

let nowMs = 1_000_000;
let dateNowSpy;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockLoadSessions.mockReturnValue([]);
  mockPtyProcess.onData.mockImplementation(() => {});
  mockPtyProcess.onExit.mockImplementation(() => {});
  nowMs = 1_000_000;
  dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  globalThis.__DEVHUB_TTY_NODE_PTY__ = { spawn: mockPtySpawn };
  globalThis.__DEVHUB_TTY_WS__ = { WebSocketServer: mockWebSocketServer };
  delete globalThis.__DEVHUB_TTY_SERVER__;
  delete globalThis.__DEVHUB_TTY_SESSIONS__;
});

afterEach(() => {
  dateNowSpy.mockRestore();
  delete globalThis.__DEVHUB_TTY_NODE_PTY__;
  delete globalThis.__DEVHUB_TTY_WS__;
});

async function startServerAndConnect(url) {
  const { ensureTTYServer } = await import('../ttyServer.js');
  await ensureTTYServer();

  const connectionHandler = mockWssOn.mock.calls.find(
    ([eventName]) => eventName === 'connection'
  )?.[1];

  const socket = createMockSocket();
  connectionHandler(socket, { url });

  const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
  const sessionId = url.match(/[?&]id=([^&]+)/)?.[1];
  const session = sessions.get(sessionId);
  session.sockets.add(socket);

  return { socket, session, sessions };
}

function getMessagesOfType(socket, type) {
  return socket.send.mock.calls
    .map(([msg]) => {
      try {
        return JSON.parse(msg);
      } catch {
        return null;
      }
    })
    .filter((payload) => payload?.type === type);
}

function onDataHandler() {
  return mockPtyProcess.onData.mock.calls.at(-1)?.[0];
}

function onExitHandler() {
  return mockPtyProcess.onExit.mock.calls.at(-1)?.[0];
}

const AGY_IDLE_FOOTER =
  'Task completed successfully.\n\n? for shortcuts\naccept-edits · Gemini 3.5 Flash';

describe('ttyServer — agent-state frame schema (N4/N5)', () => {
  it('includes agentType in frames for typed agent launches', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=agy-frame&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'input', data: 'agy\r' }));

    expect(session.agentType).toBe('agy');
    expect(session.agentLaunchOrigin).toBe('typed');

    // The launch command itself must NOT publish a running frame — the Enter
    // that starts the agent is not a prompt submission to the agent.
    const launchFrames = getMessagesOfType(socket, 'agent-state');
    expect(launchFrames.length).toBe(0);

    // A subsequent Enter (real prompt submission) publishes an instant running frame.
    socket.__message(JSON.stringify({ type: 'input', data: 'do something\r' }));
    const frames = getMessagesOfType(socket, 'agent-state');
    expect(frames.length).toBeGreaterThanOrEqual(1);
    const runningFrame = frames.find((f) => f.agentTuiState === 'running');
    expect(runningFrame).toBeDefined();
    expect(runningFrame.agentType).toBe('agy');
    expect(typeof runningFrame.at).toBe('number');
  });

  it('omits optional fields instead of sending nulls', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=agy-frame-clean&cwd=%2Fhome%2Fuser'
    );
    // Launch the agent first (no frame expected)
    socket.__message(JSON.stringify({ type: 'input', data: 'agy\r' }));
    // Then submit a prompt to trigger a running frame
    socket.__message(JSON.stringify({ type: 'input', data: 'hello\r' }));
    const frames = getMessagesOfType(socket, 'agent-state');
    expect(frames.length).toBeGreaterThanOrEqual(1);
    for (const frame of frames) {
      expect(Object.values(frame)).not.toContain(null);
    }
  });
});

describe('ttyServer — Antigravity output-based start detection (W1)', () => {
  it('detects a pre-attached agy TUI from its idle footer', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=agy-pre-attach&cwd=%2Fhome%2Fuser'
    );

    expect(session.agentType).toBeFalsy();

    onDataHandler()(AGY_IDLE_FOOTER);

    expect(session.agentType).toBe('agy');
    expect(session.agentLaunchOrigin).toBe('output');
    expect(session.mode).toBe('tui');
    expect(session.tuiReady).toBe(true);

    // The published frame carries the detected agentType (N4).
    const frames = getMessagesOfType(socket, 'agent-state');
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames.at(-1).agentType).toBe('agy');
  });

  it('detects a pre-attached agy TUI from its working footer', async () => {
    const { session } = await startServerAndConnect(
      '/terminal?id=agy-pre-attach-work&cwd=%2Fhome%2Fuser'
    );

    onDataHandler()('Writing response...\n\nesc to cancel\naccept-edits · Gemini 3.5 Flash');

    expect(session.agentType).toBe('agy');
  });
});

describe('ttyServer — server-side exit cleanup (N7)', () => {
  it('emits a final agent-state idle frame (reason exit) before the exit frame', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=agy-exit&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'input', data: 'agy\r' }));
    expect(session.agentType).toBe('agy');

    socket.send.mockClear();
    onExitHandler()({ exitCode: 0, signal: null });

    const agentFrames = getMessagesOfType(socket, 'agent-state');
    expect(agentFrames).toHaveLength(1);
    expect(agentFrames[0]).toMatchObject({
      agentTuiState: 'idle',
      agentType: 'agy',
      reason: 'exit',
    });

    // Ordering: final agent-state frame arrives BEFORE the exit frame.
    const sentTypes = socket.send.mock.calls.map(([msg]) => JSON.parse(msg).type);
    const agentIdx = sentTypes.indexOf('agent-state');
    const exitIdx = sentTypes.indexOf('exit');
    expect(agentIdx).toBeGreaterThanOrEqual(0);
    expect(exitIdx).toBeGreaterThan(agentIdx);
  });

  it('does not emit an agent-state frame for plain shell sessions', async () => {
    const { socket } = await startServerAndConnect('/terminal?id=shell-exit&cwd=%2Fhome%2Fuser');

    socket.send.mockClear();
    onExitHandler()({ exitCode: 0, signal: null });

    expect(getMessagesOfType(socket, 'agent-state')).toHaveLength(0);
    expect(getMessagesOfType(socket, 'exit')).toHaveLength(1);
  });
});

describe('ttyServer — typed-agent child-exit reaper (W7)', () => {
  it('reaps the agent session after the shell prompt returns (quiet window)', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=agy-reap&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'input', data: 'agy\r' }));
    expect(session.agentType).toBe('agy');

    // Agent is alive: footer chrome in fresh output keeps the session alive.
    nowMs += 1000;
    onDataHandler()(AGY_IDLE_FOOTER);
    expect(session.agentType).toBe('agy');

    // Agent exits: bash returns its prompt. First prompt line — no reap yet.
    nowMs += 4000;
    socket.send.mockClear();
    onDataHandler()('PS C:\\Users\\PC> ');
    expect(session.agentType).toBe('agy');
    // A state transition may legitimately publish here (running→idle); the
    // reaper itself must NOT fire on a single prompt line.
    expect(
      getMessagesOfType(socket, 'agent-state').filter((f) => f.reason === 'agent-exit')
    ).toHaveLength(0);

    // Second prompt line after the quiet window — reaper fires.
    nowMs += 4000;
    onDataHandler()('dir output\nPS C:\\Users\\PC> ');

    const reapFrames = getMessagesOfType(socket, 'agent-state');
    expect(reapFrames.length).toBeGreaterThanOrEqual(1);
    const reapFrame = reapFrames.find((f) => f.reason === 'agent-exit');
    expect(reapFrame).toBeDefined();
    expect(reapFrame).toMatchObject({
      agentTuiState: 'idle',
      agentType: 'agy',
      reason: 'agent-exit',
    });

    // Session identity is cleared.
    expect(session.agentType).toBeNull();
    expect(session.mode).toBe('shell');
    expect(session.agentLaunchOrigin).toBeNull();

    // Subsequent Enters in bash no longer fire spurious agent-state frames.
    socket.send.mockClear();
    socket.__message(JSON.stringify({ type: 'input', data: 'ls\r' }));
    expect(getMessagesOfType(socket, 'agent-state')).toHaveLength(0);
  });

  it('resets the reaper when agent chrome reappears (no mid-session kill)', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=agy-reap-reset&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'input', data: 'agy\r' }));

    nowMs += 4000;
    onDataHandler()('PS C:\\Users\\PC> '); // prompt line #1
    nowMs += 1000;
    onDataHandler()('esc to cancel\naccept-edits · Gemini 3.5 Flash'); // chrome back
    nowMs += 1000;
    onDataHandler()('PS C:\\Users\\PC> '); // would be line #2 if not reset
    nowMs += 4000;

    expect(session.agentType).toBe('agy');
    expect(session._typedAgentReaper?.promptLines ?? 0).toBeLessThan(2);
  });

  it('never reaps sessions launched via initialCommand / output detection', async () => {
    const { session } = await startServerAndConnect(
      '/terminal?id=agy-reap-output&cwd=%2Fhome%2Fuser'
    );

    // Output-detected (tmux/pre-attach) agy session.
    onDataHandler()(AGY_IDLE_FOOTER);
    expect(session.agentType).toBe('agy');
    expect(session.agentLaunchOrigin).toBe('output');

    nowMs += 5000;
    onDataHandler()('PS C:\\Users\\PC> ');
    nowMs += 5000;
    onDataHandler()('PS C:\\Users\\PC> ');

    // Output-origin sessions are excluded from the reaper.
    expect(session.agentType).toBe('agy');
  });
});
