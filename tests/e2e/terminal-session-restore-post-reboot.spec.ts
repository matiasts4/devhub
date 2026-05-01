import { test, expect } from '@playwright/test';

function createTerminalState(command = 'opencode --session oc-reboot-1') {
  return {
    workspaces: [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [
          {
            id: 'c1',
            panels: [
              {
                id: 'p1',
                cwd: '/tmp/devhub-reboot-project',
                initialCommand: command,
              },
            ],
          },
        ],
      },
    ],
    activeWsId: 'ws1',
    activePanelIds: { ws1: 'p1' },
  };
}

test.describe('terminal session restore post reboot', () => {
  test('restores persisted OpenCode session command after reboot-style reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'devhub_terminal_state',
        JSON.stringify({
          workspaces: [
            {
              id: 'ws1',
              name: 'Workspace 1',
              columns: [
                {
                  id: 'c1',
                  panels: [
                    {
                      id: 'p1',
                      cwd: '/tmp/devhub-reboot-project',
                      initialCommand: 'opencode --session oc-reboot-1',
                    },
                  ],
                },
              ],
            },
          ],
          activeWsId: 'ws1',
          activePanelIds: { ws1: 'p1' },
        })
      );
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('devhub_terminal_state') || '{}'));

    expect(restoredState.workspaces?.[0]?.columns?.[0]?.panels?.[0]?.initialCommand).toBe(
      'opencode --session oc-reboot-1'
    );
  });

  test('does not advertise Hermes as reboot-safe resumable history by default', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('devhub_terminal_state', JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/tmp/devhub-reboot-project',
                    initialCommand: 'hermes',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      }));
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('devhub_terminal_state') || '{}'));

    expect(restoredState.workspaces?.[0]?.columns?.[0]?.panels?.[0]?.initialCommand).toBe('hermes');
    expect(JSON.stringify(restoredState)).not.toContain('--session hermes');
    expect(JSON.stringify(restoredState)).not.toContain('resumeCommand');
  });
});
