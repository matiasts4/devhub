const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  bindAgentSession,
  findNewCodexSession,
  findNewKimiSession,
} = require('../agentSessionBinder');

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-binder-test-'));
}

function rmTmpHome(home) {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function writeKimiState(home, { workdirSlug, sessionId, workDir, createdAt, updatedAt }) {
  const dir = path.join(home, '.kimi-code', 'sessions', workdirSlug, `session_${sessionId}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({
      createdAt,
      updatedAt: updatedAt || createdAt,
      title: 'fixture',
      workDir,
    })
  );
}

function writeCodexRollout(home, { sessionId, cwd, timestamp }) {
  const dir = path.join(home, '.codex', 'sessions', '2026', '07', '26');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `rollout-2026-07-26T10-00-00-${sessionId}.jsonl`);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({
      type: 'session_meta',
      payload: { id: sessionId, timestamp, cwd },
    })}\n`
  );
  return filePath;
}

const PANEL_CWD = path.join(os.tmpdir(), 'binder-panel-cwd');
const NOW = Date.now();

describe('findNewKimiSession', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    rmTmpHome(home);
  });

  test('returns unique session created after spawnedAt with matching cwd', () => {
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-new-1',
      workDir: PANEL_CWD,
      createdAt: new Date(NOW + 1000).toISOString(),
    });

    const result = findNewKimiSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe('kimi-new-1');
  });

  test('ignores sessions created before spawnedAt (clock skew tolerated)', () => {
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-old-1',
      workDir: PANEL_CWD,
      createdAt: new Date(NOW - 60 * 1000).toISOString(),
    });
    // Within the 5s skew window the session still counts as new.
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-skew-1',
      workDir: PANEL_CWD,
      createdAt: new Date(NOW - 2000).toISOString(),
    });

    const result = findNewKimiSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe('kimi-skew-1');
  });

  test('ignores sessions from a different cwd', () => {
    writeKimiState(home, {
      workdirSlug: 'wd_other_def',
      sessionId: 'kimi-other-1',
      workDir: path.join(os.tmpdir(), 'some-where-else'),
      createdAt: new Date(NOW + 1000).toISOString(),
    });

    const result = findNewKimiSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('none');
    expect(result.sessionId).toBeNull();
  });

  test('reports ambiguous when multiple new sessions match', () => {
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-a',
      workDir: PANEL_CWD,
      createdAt: new Date(NOW + 1000).toISOString(),
    });
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-b',
      workDir: PANEL_CWD,
      createdAt: new Date(NOW + 2000).toISOString(),
    });

    const result = findNewKimiSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('ambiguous');
    expect(result.sessionId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  test('returns none for missing store or missing cwd', () => {
    expect(findNewKimiSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW }).status).toBe(
      'none'
    );
    expect(findNewKimiSession({ homeDir: home, cwd: null, spawnedAt: NOW }).status).toBe('none');
  });
});

describe('findNewCodexSession', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    rmTmpHome(home);
  });

  test('returns unique rollout session created after spawnedAt with matching cwd', () => {
    const sessionId = '123e4567-e89b-42d3-a456-426614174000';
    writeCodexRollout(home, {
      sessionId,
      cwd: PANEL_CWD,
      timestamp: new Date(NOW + 1000).toISOString(),
    });

    const result = findNewCodexSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe(sessionId);
  });

  test('tolerates empty store and unparseable files', () => {
    const dir = path.join(home, '.codex', 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rollout-broken.jsonl'), 'not json\n');

    const result = findNewCodexSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('none');
  });

  test('reports ambiguous for two new rollouts in the same cwd', () => {
    writeCodexRollout(home, {
      sessionId: '123e4567-e89b-42d3-a456-426614174001',
      cwd: PANEL_CWD,
      timestamp: new Date(NOW + 1000).toISOString(),
    });
    writeCodexRollout(home, {
      sessionId: '123e4567-e89b-42d3-a456-426614174002',
      cwd: PANEL_CWD,
      timestamp: new Date(NOW + 2000).toISOString(),
    });

    const result = findNewCodexSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('ambiguous');
  });
});

describe('bindAgentSession', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    rmTmpHome(home);
  });

  test('calls onBound once when a unique session appears while polling', async () => {
    const spawnedAt = Date.now();
    const onBound = jest.fn();

    const cancel = bindAgentSession({
      sessionId: 'term-1',
      agentType: 'kimi',
      cwd: PANEL_CWD,
      spawnedAt,
      onBound,
      homeDir: home,
      intervalMs: 10,
      timeoutMs: 2000,
    });

    setTimeout(() => {
      writeKimiState(home, {
        workdirSlug: 'wd_panel_abc',
        sessionId: 'kimi-bound-1',
        workDir: PANEL_CWD,
        createdAt: new Date().toISOString(),
      });
    }, 30);

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onBound).toHaveBeenCalledTimes(1);
    expect(onBound).toHaveBeenCalledWith('kimi-bound-1');
    cancel();
  });

  test('does not bind when the match is ambiguous', async () => {
    const spawnedAt = Date.now();
    const onBound = jest.fn();

    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-x',
      workDir: PANEL_CWD,
      createdAt: new Date(spawnedAt + 500).toISOString(),
    });
    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-y',
      workDir: PANEL_CWD,
      createdAt: new Date(spawnedAt + 900).toISOString(),
    });

    const cancel = bindAgentSession({
      sessionId: 'term-2',
      agentType: 'kimi',
      cwd: PANEL_CWD,
      spawnedAt,
      onBound,
      homeDir: home,
      intervalMs: 10,
      timeoutMs: 200,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onBound).not.toHaveBeenCalled();
    cancel();
  });

  test('stops silently after the timeout with no candidate', async () => {
    const onBound = jest.fn();
    const cancel = bindAgentSession({
      sessionId: 'term-3',
      agentType: 'codex',
      cwd: PANEL_CWD,
      spawnedAt: Date.now(),
      onBound,
      homeDir: home,
      intervalMs: 10,
      timeoutMs: 60,
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(onBound).not.toHaveBeenCalled();
    cancel();
  });

  test('cancel stops polling — sessions created afterwards are ignored', async () => {
    const spawnedAt = Date.now();
    const onBound = jest.fn();

    const cancel = bindAgentSession({
      sessionId: 'term-4',
      agentType: 'kimi',
      cwd: PANEL_CWD,
      spawnedAt,
      onBound,
      homeDir: home,
      intervalMs: 10,
      timeoutMs: 2000,
    });
    cancel();
    cancel(); // idempotent

    writeKimiState(home, {
      workdirSlug: 'wd_panel_abc',
      sessionId: 'kimi-late',
      workDir: PANEL_CWD,
      createdAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(onBound).not.toHaveBeenCalled();
  });

  test('returns a noop cancel for unsupported providers or bad args', () => {
    expect(() =>
      bindAgentSession({ agentType: 'grok', cwd: PANEL_CWD, spawnedAt: 1, onBound: () => {} })()
    ).not.toThrow();
    expect(() => bindAgentSession(null)()).not.toThrow();
    expect(() =>
      bindAgentSession({ agentType: 'kimi', cwd: null, spawnedAt: 1, onBound: () => {} })()
    ).not.toThrow();
  });
});
