import { test, expect } from '@playwright/test';

const PROJECT_ID = 'project-reboot-restore';
const TERMINAL_STATE_KEY = `devhub_terminal_state:${PROJECT_ID}`;
const RESTORE_MANIFEST_KEY = `devhub_restore_manifest:${PROJECT_ID}`;
const RESTORE_PREFS_KEY = 'devhub_terminal_restore_prefs';
const TERMINAL_ROUTE = `/#/project/${PROJECT_ID}/terminales`;

function buildProjectRecord() {
  return {
    id: PROJECT_ID,
    name: 'Reboot Restore QA',
    status: 'active',
    progress: 10,
    local_path: '/tmp/devhub-reboot-project',
    color: '#58A6FF',
  };
}

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

async function mockProjectsQuery(page) {
  await page.route('**/api/db/query*', async (route) => {
    const url = new URL(route.request().url());
    const table = url.searchParams.get('table');
    if (table === 'projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([buildProjectRecord()]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/db/mutate*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function primeTerminalRestore(
  page,
  {
    terminalState,
    agentRuns = null,
    restorePrefs = { opencode: 'auto', generic: 'auto', swarm: 'auto' },
  } = {}
) {
  await page.addInitScript(
    ({ terminalKey, state, runs, prefs, prefsKey }) => {
      localStorage.setItem(terminalKey, JSON.stringify(state));
      if (runs) {
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      }
      localStorage.setItem(prefsKey, JSON.stringify(prefs));
      window.__devhubRelaunchEvents = [];
      window.addEventListener('devhub:relaunch-panel', (event) => {
        window.__devhubRelaunchEvents.push(event.detail);
      });
    },
    {
      terminalKey: TERMINAL_STATE_KEY,
      state: terminalState,
      runs: agentRuns,
      prefs: restorePrefs,
      prefsKey: RESTORE_PREFS_KEY,
    }
  );
}

test.describe('terminal session restore post reboot', () => {
  test.beforeEach(async ({ page }) => {
    await mockProjectsQuery(page);
  });

  test('restores persisted OpenCode session command after reboot-style reload', async ({ page }) => {
    await primeTerminalRestore(page, {
      terminalState: createTerminalState('opencode --session oc-reboot-1'),
    });

    await page.goto(TERMINAL_ROUTE);
    await page.waitForLoadState('domcontentloaded');

    const restoredState = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '{}');
    }, TERMINAL_STATE_KEY);

    expect(restoredState.workspaces?.[0]?.columns?.[0]?.panels?.[0]?.initialCommand).toBe(
      'opencode --session oc-reboot-1'
    );
  });

  test('does not advertise Hermes as reboot-safe resumable history by default', async ({ page }) => {
    await primeTerminalRestore(page, {
      terminalState: createTerminalState('hermes'),
    });

    await page.goto(TERMINAL_ROUTE);
    await page.waitForLoadState('domcontentloaded');

    const restoredState = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '{}');
    }, TERMINAL_STATE_KEY);

    expect(restoredState.workspaces?.[0]?.columns?.[0]?.panels?.[0]?.initialCommand).toBe('hermes');
    expect(JSON.stringify(restoredState)).not.toContain('--session hermes');
    expect(JSON.stringify(restoredState)).not.toContain('resumeCommand');
  });

  test('flush on shutdown normalizes bare opencode using agent run session id', async ({ page }) => {
    await primeTerminalRestore(page, {
      terminalState: createTerminalState('opencode'),
      agentRuns: {
        'task-reboot': {
          panelId: 'p1',
          opencodeSessionId: 'oc-flush-on-close',
          restorePolicy: 'auto',
          launchedAt: Date.now(),
        },
      },
    });

    await page.goto(TERMINAL_ROUTE);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('devhub:flush-terminal-persistence'));
    });

    const flushed = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '{}');
    }, TERMINAL_STATE_KEY);

    expect(flushed.workspaces?.[0]?.columns?.[0]?.panels?.[0]?.initialCommand).toBe(
      'opencode --session oc-flush-on-close'
    );

    const manifest = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '{}');
    }, RESTORE_MANIFEST_KEY);

    expect(manifest.terminalSessions?.[0]?.opencodeSessionId).toBe('oc-flush-on-close');
  });

  test('auto policy triggers startup restore relaunch after cold runtime', async ({ page }) => {
    await page.route('**/api/swarm/runtime-diagnostics*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ terminals: [], processes: [], anomalies: { quotaBlocked: false } }),
      });
    });

    await primeTerminalRestore(page, {
      terminalState: createTerminalState('opencode --session oc-startup-e2e'),
      agentRuns: {
        'task-startup': {
          panelId: 'p1',
          opencodeSessionId: 'oc-startup-e2e',
          restorePolicy: 'auto',
          launchedAt: Date.now(),
        },
      },
    });

    await page.goto(TERMINAL_ROUTE);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const relaunchEvents = await page.evaluate(() => window.__devhubRelaunchEvents || []);

    expect(relaunchEvents.length).toBeGreaterThanOrEqual(1);
    expect(relaunchEvents.some((event) => event?.command?.includes('oc-startup-e2e'))).toBe(true);
  });

  test('manual policy does not auto-relaunch on startup', async ({ page }) => {
    await page.route('**/api/swarm/runtime-diagnostics*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ terminals: [], processes: [], anomalies: {} }),
      });
    });

    await primeTerminalRestore(page, {
      terminalState: createTerminalState('opencode --session oc-manual-e2e'),
      agentRuns: {
        'task-manual': {
          panelId: 'p1',
          opencodeSessionId: 'oc-manual-e2e',
          restorePolicy: 'manual',
          launchedAt: Date.now(),
        },
      },
      restorePrefs: { opencode: 'auto', generic: 'auto', swarm: 'auto' },
    });

    await page.goto(TERMINAL_ROUTE);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const relaunchEvents = await page.evaluate(() => window.__devhubRelaunchEvents || []);
    expect(relaunchEvents.some((event) => event?.command?.includes('oc-manual-e2e'))).toBe(false);
  });
});