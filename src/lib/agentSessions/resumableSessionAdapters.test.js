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

  test('returns only durable providers by default', async () => {
    const { getResumableSessionAdapters } = await import('./resumableSessionAdapters.js');

    expect(getResumableSessionAdapters().map((adapter) => adapter.id)).toEqual(['opencode']);
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
});
