import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the Zed → open_terminal → consumer event bus.
 *
 * T-024 (3b0c873): ChatPanel.jsx useEffect now dispatches
 *   `devhub:zed-open-terminal` whenever an open_terminal tool result has
 *   a session_id. Previously the guard checked `parsed?.command` which
 *   is never present on the tool result, so the event never fired.
 *
 * T-025 (28229de): isValidZedOpenTerminalEvent helper accepts payloads
 *   where command is null. Covered by the unit test in
 *   `src/components/__tests__/zedOpenTerminalEvent.test.js`; the wire-up
 *   is exercised by the dispatch test below because the consumer would
 *   receive the same payload shape.
 */

const PROJECT_ID = 'project-1';
// Workspace id must match `^ws\d+$` to survive normalizeWorkspaceState.
// We use 'ws9' so it differs from the default 'ws1' dockWorkspaceId,
// which is what forces the read-side useEffect in TerminalWorkspacesManager
// to load our seeded right-dock state.
const WORKSPACE_ID = 'ws9';
const RIGHT_DOCK_KEY = `devhub_right_dock_${PROJECT_ID}_${WORKSPACE_ID}`;
const TERMINAL_STATE_KEY = `devhub_terminal_state:${PROJECT_ID}`;

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

async function primeRightDockAsZed(page) {
  // The right-dock layer only reads its persisted state when the active
  // workspace id differs from the initial `dockWorkspaceId` (default
  // 'ws1'). Seed a workspace id ('ws9') that differs from 'ws1' to force
  // the read-side useEffect to fire and pull our zed payload. The id
  // must match the regex `^ws\d+$` used by normalizeWorkspaceState or
  // it would get rewritten to 'ws1' before reaching the dock.
  await page.addInitScript(
    ({ dockKey, terminalKey, workspaceId }) => {
      window.__lastZedOpenTerminalEvent = null;
      window.addEventListener('devhub:zed-open-terminal', (e) => {
        window.__lastZedOpenTerminalEvent = { detail: e.detail, type: e.type };
      });
      localStorage.setItem(dockKey, JSON.stringify({ visible: true, activeTab: 'zed' }));
      localStorage.setItem(
        terminalKey,
        JSON.stringify({
          workspaces: [
            {
              id: workspaceId,
              name: 'Workspace 9',
              columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: '/tmp/devhub-zed-e2e' }] }],
            },
          ],
          activeWsId: workspaceId,
          activePanelIds: { [workspaceId]: 'p1' },
        })
      );
    },
    { dockKey: RIGHT_DOCK_KEY, terminalKey: TERMINAL_STATE_KEY, workspaceId: WORKSPACE_ID }
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
  // TWM's progress recalc effect updates tasks through /api/db/mutate.
  // Acknowledge so the page doesn't stall on the poll cycle.
  await page.route('**/api/db/mutate*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function mockAssistantChatWithOpenTerminal(page) {
  await page.route('**/api/assistant/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'He abierto una terminal para vos.',
        tool_results: [
          {
            tool: 'open_terminal',
            result: { session_id: 'term-test-123', port: 4099, wsPath: '/terminal' },
          },
        ],
      }),
    });
  });
}

test.describe('Zed open_terminal event dispatch (T-024 + T-025)', () => {
  test('T-024: ChatPanel dispatches devhub:zed-open-terminal after open_terminal tool result', async ({
    page,
  }) => {
    await primeRightDockAsZed(page);
    await mockProjectsQuery(page);
    await mockAssistantChatWithOpenTerminal(page);

    await page.goto(`/#/project/${PROJECT_ID}/terminales`);
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.locator('textarea[placeholder="Escribile a Zed..."]');
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill('Abrime una terminal, por favor');
    await textarea.press('Enter');

    // ToolResult renders the tool name once the assistant message lands.
    // Asserting on it guarantees the response was processed and the
    // post-response useEffect has had a chance to run.
    await expect(page.getByText('open_terminal').first()).toBeVisible({ timeout: 10_000 });

    const captured = await page.evaluate(() => window.__lastZedOpenTerminalEvent);
    expect(captured).not.toBeNull();
    expect(captured.type).toBe('devhub:zed-open-terminal');
    // T-024 fix: the event fires regardless of whether `command` is
    // present in the tool result. The producer derives it as
    // `parsed?.command || null` and `parsed?.cwd || null`.
    expect(captured.detail).toEqual({ command: null, cwd: null });
  });
});
