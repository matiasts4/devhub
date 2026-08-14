const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  bindAgentSession,
  findNewCodexSession,
  findNewGrokSession,
  findNewKimiSession,
  findNewQoderSession,
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

function writeQoderState(home, { projectSlug, sessionId, workspaceDirectories, createdAt }) {
  const dir = path.join(home, '.qoder', 'projects', projectSlug, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({
      sessionId,
      createdAt,
      updatedAt: createdAt,
      workspaceDirectories,
    })
  );
}

function writeGrokSummary(home, { cwdSlug, sessionId, cwd, createdAt }) {
  const dir = path.join(home, '.grok', 'sessions', cwdSlug, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'summary.json'),
    JSON.stringify({
      info: { id: sessionId, cwd },
      session_summary: 'fixture',
      created_at: createdAt,
      updated_at: createdAt,
    })
  );
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
    expect(result.sessionId).toBe('session_kimi-new-1');
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
    expect(result.sessionId).toBe('session_kimi-skew-1');
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

describe('findNewQoderSession', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    rmTmpHome(home);
  });

  test('returns unique when exactly one new session matches the panel cwd', () => {
    const sessionId = '385a91e2-3772-4fce-9125-51f2063c785c';
    writeQoderState(home, {
      projectSlug: 'D--devhub',
      sessionId,
      workspaceDirectories: [PANEL_CWD],
      createdAt: new Date(NOW).toISOString(),
    });
    const result = findNewQoderSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe(sessionId);
  });

  test('matches when the panel cwd is any of the workspaceDirectories', () => {
    const sessionId = '7bcc9939-51f4-4dec-8179-357bcd3cd80b';
    writeQoderState(home, {
      projectSlug: 'd-devhub',
      sessionId,
      workspaceDirectories: [path.join(os.tmpdir(), 'otro'), PANEL_CWD],
      createdAt: new Date(NOW).toISOString(),
    });
    expect(findNewQoderSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW }).sessionId).toBe(
      sessionId
    );
  });

  test('skips sessions from other cwds, stale ones, and falls back to the dir name', () => {
    writeQoderState(home, {
      projectSlug: 'C--other',
      sessionId: 'aaaaaaaa-0000-4000-8000-000000000001',
      workspaceDirectories: [path.join(os.tmpdir(), 'elsewhere')],
      createdAt: new Date(NOW).toISOString(),
    });
    writeQoderState(home, {
      projectSlug: 'D--devhub',
      sessionId: 'bbbbbbbb-0000-4000-8000-000000000002',
      workspaceDirectories: [PANEL_CWD],
      createdAt: new Date(NOW - 60000).toISOString(), // older than skew window
    });
    // No sessionId field → dir name is the id.
    const dirId = 'cccccccc-0000-4000-8000-000000000003';
    const dir = path.join(home, '.qoder', 'projects', 'D--devhub', dirId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ createdAt: new Date(NOW).toISOString(), workspaceDirectories: [PANEL_CWD] })
    );

    const result = findNewQoderSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe(dirId);
  });

  test('none when the store is missing or cwd is null', () => {
    expect(findNewQoderSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW }).status).toBe(
      'none'
    );
    expect(findNewQoderSession({ homeDir: home, cwd: null, spawnedAt: NOW }).status).toBe('none');
  });
});

describe('findNewGrokSession', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    rmTmpHome(home);
  });

  test('returns unique when exactly one new session matches the panel cwd', () => {
    const sessionId = '8259b57c-2efb-4cfb-8768-993c43b17f05';
    writeGrokSummary(home, {
      cwdSlug: encodeURIComponent(PANEL_CWD),
      sessionId,
      cwd: PANEL_CWD,
      createdAt: new Date(NOW).toISOString(),
    });
    const result = findNewGrokSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW });
    expect(result.status).toBe('unique');
    expect(result.sessionId).toBe(sessionId);
  });

  test('skips sessions without a recorded cwd (never steals a conversation)', () => {
    const sessionId = 'fc06adad-9daf-462c-8a05-82a5e7325805';
    const dir = path.join(home, '.grok', 'sessions', 'misc', sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({ info: { id: sessionId }, created_at: new Date(NOW).toISOString() })
    );
    expect(findNewGrokSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW }).status).toBe(
      'none'
    );
  });

  test('skips stale sessions and other cwds', () => {
    writeGrokSummary(home, {
      cwdSlug: 'a',
      sessionId: 'dddddddd-0000-4000-8000-000000000004',
      cwd: PANEL_CWD,
      createdAt: new Date(NOW - 60000).toISOString(),
    });
    writeGrokSummary(home, {
      cwdSlug: 'b',
      sessionId: 'eeeeeeee-0000-4000-8000-000000000005',
      cwd: path.join(os.tmpdir(), 'elsewhere'),
      createdAt: new Date(NOW).toISOString(),
    });
    expect(findNewGrokSession({ homeDir: home, cwd: PANEL_CWD, spawnedAt: NOW }).status).toBe(
      'none'
    );
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
    expect(onBound).toHaveBeenCalledWith('session_kimi-bound-1');
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

  test('calls onBound once for a typed qodercli launch (no id in command)', async () => {
    const spawnedAt = Date.now();
    const sessionId = '385a91e2-3772-4fce-9125-51f2063c785c';
    const onBound = jest.fn();

    const cancel = bindAgentSession({
      sessionId: 'term-q1',
      agentType: 'qodercli',
      cwd: PANEL_CWD,
      spawnedAt,
      onBound,
      homeDir: home,
      intervalMs: 10,
      timeoutMs: 2000,
    });

    setTimeout(() => {
      writeQoderState(home, {
        projectSlug: 'D--devhub',
        sessionId,
        workspaceDirectories: [PANEL_CWD],
        createdAt: new Date().toISOString(),
      });
    }, 30);

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onBound).toHaveBeenCalledTimes(1);
    expect(onBound).toHaveBeenCalledWith(sessionId);
    cancel();
  });

  test('returns a noop cancel for unsupported providers or bad args', () => {
    expect(() =>
      bindAgentSession({ agentType: 'claude', cwd: PANEL_CWD, spawnedAt: 1, onBound: () => {} })()
    ).not.toThrow();
    expect(() => bindAgentSession(null)()).not.toThrow();
    expect(() =>
      bindAgentSession({ agentType: 'kimi', cwd: null, spawnedAt: 1, onBound: () => {} })()
    ).not.toThrow();
  });
});
