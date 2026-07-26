const { createResumableSession } = require('@/test-support/resumableSessionFixtures');

describe('resumableSessionAdapters', () => {
  test('normalizes OpenCode sessions into the shared resumable-session shape', async () => {
    const { normalizeOpenCodeSession } = await import('./resumableSessionAdapters.js');

    expect(
      normalizeOpenCodeSession({
        id: 'oc-123',
        title: 'Daily sync',
        directory: '/workspace/devhub',
        updated: '2026-04-30T15:00:00.000Z',
        isActive: true,
        activePanelId: 'panel-7',
      })
    ).toEqual({
      provider: 'opencode',
      sessionId: 'oc-123',
      title: 'Daily sync',
      cwd: '/workspace/devhub',
      updatedAt: '2026-04-30T15:00:00.000Z',
      isActive: true,
      activePanelId: 'panel-7',
      resumeCommand: 'opencode --session oc-123',
      durable: true,
    });
  });

  test('builds provider-qualified dedupe keys', async () => {
    const { createResumableSessionKey } = await import('./resumableSessionAdapters.js');

    expect(createResumableSessionKey({ provider: 'opencode', sessionId: 'oc-123' })).toBe(
      'opencode:oc-123'
    );
    expect(createResumableSessionKey({ provider: 'opencode', sessionId: 'oc-9' })).toBe(
      'opencode:oc-9'
    );
  });

  test('returns all durable providers by default', async () => {
    const { getResumableSessionAdapters } = await import('./resumableSessionAdapters.js');

    expect(getResumableSessionAdapters().map((adapter) => adapter.id)).toEqual([
      'opencode',
      'kimi',
      'grok',
      'codex',
      'qoder',
    ]);
  });

  test('dedupes merged resumable sessions by provider+session and keeps newest entries first', async () => {
    const { mergeResumableCatalogResults } = await import('./resumableSessionAdapters.js');

    const merged = mergeResumableCatalogResults([
      {
        provider: 'opencode',
        status: 'success',
        sessions: [
          createResumableSession({
            sessionId: 'oc-1',
            title: 'Older',
            updatedAt: '2026-04-29T10:00:00.000Z',
          }),
          createResumableSession({
            sessionId: 'oc-2',
            title: 'Newest',
            updatedAt: '2026-04-30T10:00:00.000Z',
            isActive: true,
            activePanelId: 'panel-2',
          }),
        ],
      },
      {
        provider: 'opencode',
        status: 'success',
        sessions: [
          createResumableSession({
            sessionId: 'oc-1',
            title: 'Duplicate older',
            updatedAt: '2026-04-28T10:00:00.000Z',
          }),
        ],
      },
    ]);

    expect(merged).toEqual({
      status: 'success',
      sessions: [
        createResumableSession({
          sessionId: 'oc-2',
          title: 'Newest',
          updatedAt: '2026-04-30T10:00:00.000Z',
          isActive: true,
          activePanelId: 'panel-2',
        }),
        createResumableSession({
          sessionId: 'oc-1',
          title: 'Older',
          updatedAt: '2026-04-29T10:00:00.000Z',
        }),
      ],
      error: null,
    });
  });

  test('marks kimi and grok adapters as durable with exact resume commands', async () => {
    const { kimiResumableSessionAdapter, grokResumableSessionAdapter } =
      await import('./resumableSessionAdapters.js');

    expect(kimiResumableSessionAdapter.supportsDurableResume()).toBe(true);
    expect(kimiResumableSessionAdapter.buildResumeCommand({ sessionId: 'abc-123' })).toBe(
      'kimi --session abc-123'
    );

    expect(grokResumableSessionAdapter.supportsDurableResume()).toBe(true);
    expect(grokResumableSessionAdapter.buildResumeCommand({ sessionId: 'abc-123' })).toBe(
      'grok --resume abc-123'
    );
  });

  test('builds per-provider resume and continue commands', async () => {
    const {
      openCodeResumableSessionAdapter,
      kimiResumableSessionAdapter,
      grokResumableSessionAdapter,
      codexResumableSessionAdapter,
      qoderResumableSessionAdapter,
    } = await import('./resumableSessionAdapters.js');

    const session = { sessionId: 's-1' };
    expect(openCodeResumableSessionAdapter.buildResumeCommand(session)).toBe(
      'opencode --session s-1'
    );
    expect(codexResumableSessionAdapter.buildResumeCommand(session)).toBe('codex resume s-1');
    expect(qoderResumableSessionAdapter.buildResumeCommand(session)).toBe('qodercli --resume s-1');

    expect(openCodeResumableSessionAdapter.buildContinueCommand()).toBeNull();
    expect(kimiResumableSessionAdapter.buildContinueCommand()).toBe('kimi --continue');
    expect(grokResumableSessionAdapter.buildContinueCommand()).toBe('grok --continue');
    expect(codexResumableSessionAdapter.buildContinueCommand()).toBe('codex resume --last');
    expect(qoderResumableSessionAdapter.buildContinueCommand()).toBe('qodercli --continue');
  });

  test('keeps claude as the only non-durable placeholder adapter', async () => {
    const { getPlaceholderResumableSessionAdapters } =
      await import('./resumableSessionAdapters.js');

    const placeholders = getPlaceholderResumableSessionAdapters();
    expect(placeholders.map((adapter) => adapter.id)).toEqual(['claude']);
    expect(placeholders[0].supportsDurableResume()).toBe(false);
    expect(placeholders[0].buildResumeCommand()).toBeNull();
    expect(placeholders[0].buildContinueCommand()).toBeNull();
    await expect(placeholders[0].listSessions()).resolves.toEqual({
      provider: 'claude',
      status: 'empty',
      sessions: [],
      error: null,
    });
  });

  test('normalizeProviderSession maps route-style and normalized payloads', async () => {
    const { normalizeProviderSession } = await import('./resumableSessionAdapters.js');

    expect(
      normalizeProviderSession('grok', {
        id: 'g-1',
        title: 'Grok chat',
        directory: 'D:\\devhub',
        updated: '2026-06-28T00:45:02.231Z',
      })
    ).toEqual({
      provider: 'grok',
      sessionId: 'g-1',
      title: 'Grok chat',
      cwd: 'D:\\devhub',
      updatedAt: '2026-06-28T00:45:02.231Z',
      isActive: false,
      activePanelId: null,
      resumeCommand: 'grok --resume g-1',
      durable: true,
    });

    expect(
      normalizeProviderSession('kimi', {
        sessionId: 'k-1',
        title: 'Kimi chat',
        cwd: 'D:/devhub',
        updatedAt: '2026-07-25T10:00:00.000Z',
        resumeCommand: 'kimi --session k-1',
      })
    ).toMatchObject({
      provider: 'kimi',
      sessionId: 'k-1',
      resumeCommand: 'kimi --session k-1',
      durable: true,
    });

    expect(normalizeProviderSession('kimi', { title: 'no id' })).toBeNull();
  });

  test('kimi adapter listSessions fetches its route and normalizes the envelope', async () => {
    const { kimiResumableSessionAdapter } = await import('./resumableSessionAdapters.js');

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'kimi',
        status: 'success',
        sessions: [
          {
            sessionId: 'k-1',
            title: 'Kimi chat',
            cwd: 'D:/devhub',
            updatedAt: '2026-07-25T10:00:00.000Z',
            resumeCommand: 'kimi --session k-1',
          },
        ],
      }),
    });

    const result = await kimiResumableSessionAdapter.listSessions({
      cwd: 'D:/devhub',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/kimi/sessions?cwd=D%3A%2Fdevhub', {
      cache: 'no-store',
    });
    expect(result).toEqual({
      provider: 'kimi',
      status: 'success',
      sessions: [
        {
          provider: 'kimi',
          sessionId: 'k-1',
          title: 'Kimi chat',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-25T10:00:00.000Z',
          isActive: false,
          activePanelId: null,
          resumeCommand: 'kimi --session k-1',
          durable: true,
        },
      ],
      error: null,
    });
  });

  test('grok adapter listSessions maps non-ok responses to an error result', async () => {
    const { grokResumableSessionAdapter } = await import('./resumableSessionAdapters.js');

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { code: 'timeout', message: 'grok session listing timed out.', retryable: true },
      }),
    });

    const result = await grokResumableSessionAdapter.listSessions({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/api/grok/sessions', { cache: 'no-store' });
    expect(result).toEqual({
      provider: 'grok',
      status: 'error',
      sessions: [],
      error: { code: 'timeout', message: 'grok session listing timed out.', retryable: true },
    });
  });

  test('dedupes across adapters by provider-qualified keys, keeping same-id providers distinct', async () => {
    const { mergeResumableCatalogResults } = await import('./resumableSessionAdapters.js');
    const { createProviderResumableSession } = require('@/test-support/resumableSessionFixtures');

    const merged = mergeResumableCatalogResults([
      {
        provider: 'opencode',
        status: 'success',
        sessions: [
          createProviderResumableSession('opencode', {
            sessionId: 'shared-id',
            updatedAt: '2026-04-30T10:00:00.000Z',
          }),
        ],
      },
      {
        provider: 'kimi',
        status: 'success',
        sessions: [
          createProviderResumableSession('kimi', {
            sessionId: 'shared-id',
            updatedAt: '2026-04-29T10:00:00.000Z',
          }),
        ],
      },
      {
        provider: 'kimi',
        status: 'success',
        sessions: [
          createProviderResumableSession('kimi', {
            sessionId: 'shared-id',
            title: 'Stale duplicate',
            updatedAt: '2026-04-28T10:00:00.000Z',
          }),
        ],
      },
    ]);

    expect(merged.status).toBe('success');
    expect(merged.sessions.map((session) => `${session.provider}:${session.sessionId}`)).toEqual([
      'opencode:shared-id',
      'kimi:shared-id',
    ]);
  });
});
