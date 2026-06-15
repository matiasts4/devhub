import { test, expect } from '@playwright/test';

const PROJECT_ID = 'cursor-morphology-project';

function buildProjectRecord() {
  return {
    id: PROJECT_ID,
    name: 'Cursor Morphology QA Project',
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

// PR-2: default morphology sets --chrome-radius-panel: 0 (R6 amendment).
// All other tokens remain at their pre-cursor values.
const MORPHOLOGY_BASELINES = {
  default: {
    '--chrome-radius-panel': '0',
    '--chrome-radius-control': '999px',
    '--chrome-border-width': '1px',
    '--chrome-press-offset': '0px',
  },
  'brutalist-stage': {
    '--chrome-radius-panel': '0',
    '--chrome-radius-control': '0',
    '--chrome-border-width': '2px',
    '--chrome-press-offset': '1px',
  },
  aura: {
    '--chrome-radius-panel': '1.25rem',
    '--chrome-radius-control': '1rem',
    '--chrome-border-width': '1px',
    '--chrome-press-offset': '0px',
  },
  switchyard: {
    '--chrome-radius-panel': '18px',
    '--chrome-radius-control': '12px',
    '--chrome-border-width': '1px',
    '--chrome-press-offset': '0px',
  },
};

const CURSOR_BASELINE = {
  '--chrome-radius-panel': '18px',
  '--chrome-radius-control': '8px',
  '--chrome-border-width': '1px',
  '--chrome-press-offset': '0px',
};

async function getResolvedChromeTokens(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const computed = window.getComputedStyle(html);
    return {
      '--chrome-radius-panel': computed.getPropertyValue('--chrome-radius-panel').trim(),
      '--chrome-radius-control': computed.getPropertyValue('--chrome-radius-control').trim(),
      '--chrome-border-width': computed.getPropertyValue('--chrome-border-width').trim(),
      '--chrome-press-offset': computed.getPropertyValue('--chrome-press-offset').trim(),
      'data-morphology': html.getAttribute('data-morphology'),
    };
  });
}

async function waitForAjustesPageReady(page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="ajustes-morphology-option-default"]')).toBeVisible({
    timeout: 10000,
  });
}

async function selectMorphology(page, morphologyId) {
  const option = page.locator(`[data-testid="ajustes-morphology-option-${morphologyId}"]`);
  await option.scrollIntoViewIfNeeded();
  await option.click();
  await page.waitForTimeout(150);
}

test.describe.configure({ mode: 'serial' });

test.describe('ajustes morphology smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('devhub:morphology', 'default');
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

  test('canonical /ajustes route is reachable and renders the morphology selector', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/ajustes`);
    await waitForAjustesPageReady(page);

    await expect(page.locator('html')).toHaveAttribute('data-morphology', 'default');
    await expect(
      page.locator('[data-testid="ajustes-morphology-option-default"]')
    ).toBeVisible();
    await expect(page.locator('[data-testid="ajustes-morphology-option-cursor"]')).toBeVisible();
  });

  test('legacy /settings/appearance route no longer matches', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/settings/appearance`);
    // The App-Router settings/* block is removed; nothing matches.
    // The HashRouter will render a blank root + no morphology selector.
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="ajustes-morphology-option-default"]')).toHaveCount(0);
  });

  test('existing morphologies keep their baseline token values', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/ajustes`);
    await waitForAjustesPageReady(page);

    for (const [morphologyId, expected] of Object.entries(MORPHOLOGY_BASELINES)) {
      await selectMorphology(page, morphologyId);
      const tokens = await getResolvedChromeTokens(page);

      expect(tokens['data-morphology'], `data-morphology should update to ${morphologyId}`).toBe(
        morphologyId
      );
      expect(
        tokens['--chrome-radius-panel'],
        `${morphologyId} --chrome-radius-panel should match baseline`
      ).toBe(expected['--chrome-radius-panel']);
      expect(
        tokens['--chrome-radius-control'],
        `${morphologyId} --chrome-radius-control should match baseline`
      ).toBe(expected['--chrome-radius-control']);
      expect(
        tokens['--chrome-border-width'],
        `${morphologyId} --chrome-border-width should match baseline`
      ).toBe(expected['--chrome-border-width']);
      expect(
        tokens['--chrome-press-offset'],
        `${morphologyId} --chrome-press-offset should match baseline`
      ).toBe(expected['--chrome-press-offset']);
    }
  });

  test('cursor morphology applies and resolves its token values', async ({ page }) => {
    await page.goto(`/#/project/${PROJECT_ID}/ajustes`);
    await waitForAjustesPageReady(page);

    await selectMorphology(page, 'cursor');
    const tokens = await getResolvedChromeTokens(page);

    expect(tokens['data-morphology']).toBe('cursor');
    expect(tokens['--chrome-radius-panel']).toBe(CURSOR_BASELINE['--chrome-radius-panel']);
    expect(tokens['--chrome-radius-control']).toBe(CURSOR_BASELINE['--chrome-radius-control']);
    expect(tokens['--chrome-border-width']).toBe(CURSOR_BASELINE['--chrome-border-width']);
    expect(tokens['--chrome-press-offset']).toBe(CURSOR_BASELINE['--chrome-press-offset']);
  });
});
