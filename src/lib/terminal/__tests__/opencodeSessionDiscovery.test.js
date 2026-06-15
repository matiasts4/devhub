import { enrichOpenCodeRestoreContext } from '../opencodeSessionDiscovery';

describe('opencodeSessionDiscovery', () => {
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
