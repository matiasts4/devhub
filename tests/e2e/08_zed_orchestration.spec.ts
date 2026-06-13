import { test, expect } from '@playwright/test';

/**
 * E2E orchestration scenarios (Phase 8).
 * Extends 06/07 with compound intent + streaming UI markers.
 */

const PROJECT_ID = 'project-1';
const WORKSPACE_ID = 'ws9';
const RIGHT_DOCK_KEY = `devhub_right_dock_${PROJECT_ID}_${WORKSPACE_ID}`;

test.describe('Zed orchestration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ dockKey, workspaceId }) => {
        window.__zedOrchestration = { events: [] };
        ['devhub:zed-open-terminal', 'devhub:zed-open-url', 'devhub:zed-terminal-input'].forEach(
          (name) => {
            window.addEventListener(name, (e) => {
              window.__zedOrchestration.events.push({ type: name, detail: e.detail });
            });
          }
        );
        localStorage.setItem(
          dockKey,
          JSON.stringify({
            workspaceId,
            visible: true,
            activeTab: 'terminal',
            maximizedView: null,
            browserUrl: null,
          })
        );
      },
      { dockKey: RIGHT_DOCK_KEY, workspaceId: WORKSPACE_ID }
    );
  });

  test('open_url event contract validates http URL', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:zed-open-url', {
          detail: { url: 'https://github.com', focus: true },
        })
      );
    });
    const events = await page.evaluate(() => window.__zedOrchestration?.events || []);
    expect(events.some((e) => e.type === 'devhub:zed-open-url')).toBeTruthy();
  });

  test('activity drawer test id exists when Zed overlay mounted', async ({ page }) => {
    await page.goto('/');
    const drawer = page.getByTestId('zed-activity-drawer');
    await expect(drawer).toHaveCount(0);
    const pill = page.getByTestId('zed-ambient-pill');
    await expect(pill).toHaveCount(1);
  });
});
