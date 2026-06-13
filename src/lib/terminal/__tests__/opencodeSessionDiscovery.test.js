import {
  buildOpenCodeCatalogIndex,
  enrichOpenCodeRestoreContext,
  resolvePanelOpenCodeSessionFromCatalog,
} from '../opencodeSessionDiscovery';

describe('opencodeSessionDiscovery', () => {
  test('resolvePanelOpenCodeSessionFromCatalog prefers activePanelId binding', () => {
    const catalogIndex = buildOpenCodeCatalogIndex([
      {
        sessionId: 'oc-active',
        cwd: '/workspace/devhub',
        activePanelId: 'p-1',
      },
      {
        sessionId: 'oc-other',
        cwd: '/workspace/devhub',
      },
    ]);

    const resolved = resolvePanelOpenCodeSessionFromCatalog({
      panel: { id: 'p-1', cwd: '/workspace/devhub', initialCommand: 'opencode' },
      catalogIndex,
      claimedSessionIds: new Set(),
    });

    expect(resolved).toEqual({
      sessionId: 'oc-active',
      source: 'catalog-active-panel',
    });
  });

  test('resolvePanelOpenCodeSessionFromCatalog uses unique cwd match when panel id is unknown', () => {
    const catalogIndex = buildOpenCodeCatalogIndex([
      {
        sessionId: 'oc-only',
        cwd: '/workspace/devhub',
      },
    ]);

    const resolved = resolvePanelOpenCodeSessionFromCatalog({
      panel: { id: 'p-9', cwd: '/workspace/devhub', initialCommand: 'opencode' },
      catalogIndex,
      claimedSessionIds: new Set(),
    });

    expect(resolved).toEqual({
      sessionId: 'oc-only',
      source: 'catalog-cwd-unique',
    });
  });

  test('resolvePanelOpenCodeSessionFromCatalog skips ambiguous cwd matches', () => {
    const catalogIndex = buildOpenCodeCatalogIndex([
      { sessionId: 'oc-a', cwd: '/workspace/devhub' },
      { sessionId: 'oc-b', cwd: '/workspace/devhub' },
    ]);

    const resolved = resolvePanelOpenCodeSessionFromCatalog({
      panel: { id: 'p-9', cwd: '/workspace/devhub', initialCommand: 'opencode' },
      catalogIndex,
      claimedSessionIds: new Set(),
    });

    expect(resolved).toBeNull();
  });

  test('enrichOpenCodeRestoreContext upgrades plain opencode panels for startup restore', () => {
    const enriched = enrichOpenCodeRestoreContext({
      workspaces: [
        {
          id: 'ws-1',
          columns: [
            {
              id: 'c-1',
              panels: [{ id: 'p-1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
          ],
        },
      ],
      agentRunsByPanel: {},
      catalogSessions: [
        {
          sessionId: 'oc-discovered',
          cwd: '/workspace/devhub',
          activePanelId: 'p-1',
          title: 'Feature work',
        },
      ],
    });

    expect(enriched.discoveries).toEqual([
      expect.objectContaining({
        panelId: 'p-1',
        sessionId: 'oc-discovered',
        source: 'catalog-active-panel',
      }),
    ]);
    expect(enriched.workspaces[0].columns[0].panels[0].initialCommand).toBe(
      'opencode --session oc-discovered'
    );
    expect(enriched.agentRunsByPanel['p-1'].opencodeSessionId).toBe('oc-discovered');
  });
});