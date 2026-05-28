import { test, expect } from '@playwright/test';

const PROJECT_ID = 'project-1';

function buildProjectRecord() {
  return {
    id: PROJECT_ID,
    name: 'DevHub QA Project',
    status: 'active',
    progress: 42,
    local_path: '/workspace/devhub',
    color: '#58A6FF',
  };
}

async function mockWorkspaceQueries(page) {
  await page.route('**/api/db/query?*', async (route) => {
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
}

test.describe('workspace morphology smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('devhub:morphology', 'brutalist-stage');
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
                  panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
                },
              ],
            },
          ],
          activeWsId: 'ws1',
          activePanelIds: { ws1: 'p1' },
        })
      );
    });

    await mockWorkspaceQueries(page);
    await page.route('**/api/agenthub/operations/health**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ control_room_snapshot_input: { project: buildProjectRecord() } }),
      });
    });
  });

  test('keeps dashboard and swarm routes on brutalist-stage without route duplication', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/dashboard`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('html')).toHaveAttribute('data-morphology', 'brutalist-stage');
    await expect(page.getByText('Dashboard').first()).toBeVisible();

    await page.goto(`/#/project/${PROJECT_ID}/swarm`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('html')).toHaveAttribute('data-morphology', 'brutalist-stage');
    await expect(page.getByText('Swarm Control').first()).toBeVisible();
  });

  test('keeps terminal top-zone and floating safe zone under brutalist-stage morphology', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/terminales`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveAttribute('data-morphology', 'brutalist-stage');
    await expect(page.getByTestId('workspace-top-tab-bar')).toBeVisible();
    await expect(page.getByTestId('panel-safe-zone-p1')).toHaveAttribute(
      'data-native-safe-zone',
      'floating-chrome'
    );
    await expect(page.getByTestId('panel-chrome-overlay-p1')).toBeVisible();
  });
});
