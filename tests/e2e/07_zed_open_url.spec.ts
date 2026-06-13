/**
 * E2E coverage for the Zed → open_url → in-app browser navigation.
 *
 * T-WSR-zed-003 (slice 3, BBP-001/002/004): browserTool.execute now
 * dispatches `devhub:zed-open-url` via the dispatchZedOpenUrl helper
 * alongside the existing xdg-open fallback. WorkspaceBrowserPane
 * registers a useEffect listener that is idempotent on (url, label).
 *
 * Mirrors the structure of 06_zed_open_terminal.spec.ts. Uses
 * `addInitScript` to record dispatched events on `window.__lastZedOpenUrlEvent`.
 * No Tauri runtime — chromium only — the WorkspaceBrowserPane listener
 * path is exercised in the no-Tauri branch.
 */

import { test, expect } from '@playwright/test';

const PROJECT_ID = 'project-1';
// Same workspace id pattern as 06 — 'ws9' forces the right-dock read
// effect to load our seeded state (default 'ws1' is skipped).
const WORKSPACE_ID = 'ws9';
const RIGHT_DOCK_KEY = `devhub_right_dock_${PROJECT_ID}_${WORKSPACE_ID}`;

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

async function primeRightDock(page) {
  await page.addInitScript(
    ({ dockKey, workspaceId }) => {
      window.__lastZedOpenUrlEvent = null;
      window.__zedOpenUrlEventCount = 0;
      window.addEventListener('devhub:zed-open-url', (e) => {
        window.__zedOpenUrlEventCount += 1;
        window.__lastZedOpenUrlEvent = { detail: e.detail, type: e.type };
      });
      localStorage.setItem(dockKey, JSON.stringify({ visible: true, activeTab: 'browser' }));
    },
    { dockKey: RIGHT_DOCK_KEY, workspaceId: WORKSPACE_ID }
  );
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

async function mockAssistantChatWithOpenUrl(page, url, label) {
  await page.route('**/api/assistant/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `Opening ${url}`,
        tool_results: [{ tool: 'open_url', result: { url, label } }],
      }),
    });
  });
}

test.describe('Zed open_url event dispatch (T-WSR-zed-003)', () => {
  test('T-WSR-zed-003: dispatches devhub:zed-open-url after open_url tool result', async ({
    page,
  }) => {
    await primeRightDock(page);
    await mockProjectsQuery(page);
    await mockAssistantChatWithOpenUrl(page, 'https://github.com/foo/bar', 'repo');

    await page.goto(`/#/project/${PROJECT_ID}/terminales`);
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.locator('textarea[placeholder="Escribile a Zed..."]');
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill('abre https://github.com/foo/bar');
    await textarea.press('Enter');

    // ToolResult renders the tool name once the assistant message lands.
    await expect(page.getByText('open_url').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    const captured = await page.evaluate(() => window.__lastZedOpenUrlEvent);
    expect(captured).not.toBeNull();
    expect(captured.type).toBe('devhub:zed-open-url');
    expect(captured.detail.url).toBe('https://github.com/foo/bar');
  });
});
