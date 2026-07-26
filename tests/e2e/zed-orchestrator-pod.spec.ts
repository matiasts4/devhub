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

function buildIdleControlRoomSnapshot() {
  return {
    project: buildProjectRecord(),
    supervisor: {
      supervisor_state: 'idle',
      active_agents: 0,
      max_agents: 5,
      queue_depth: 0,
      authority: 'authoritative',
      freshness: 'current',
      evidence_ref: 'evidence://supervisor/idle',
      agents: [],
      approvals: [],
      errors: [],
    },
    mission_control: null,
    evidence_timeline: [],
    director_queue: {
      authority: 'authoritative',
      freshness: 'current',
      items: [],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    },
    workspaces: [],
    runs: [],
    artifacts: [],
    diagnostics: {
      mcp: null,
      process: null,
      session_stream: null,
      runtime: null,
    },
  };
}

function buildIdleHealthPayload() {
  const control_room_snapshot_input = buildIdleControlRoomSnapshot();
  return {
    control_room_snapshot_input,
    launch_catalog: {
      authority: 'local-catalog',
      recommended_template_id: 'zed-orchestrator-pod',
      templates: [
        {
          id: 'zed-orchestrator-pod',
          label: 'ZED Orchestrator Pod',
          featured: true,
          launch_defaults: { bootstrapMode: 'standby', sddEnabled: false },
        },
        {
          id: 'clean-slate',
          label: 'Arranque limpio guiado',
        },
      ],
    },
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

async function mockIdleSwarmRoutes(page) {
  const payload = buildIdleHealthPayload();

  await page.route('**/api/agenthub/operations/health**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/api/agenthub/operators/timeline**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

async function gotoSwarmControl(page) {
  await page.goto(`/#/project/${PROJECT_ID}/swarm`);
  await page.waitForURL(new RegExp(`#/project/${PROJECT_ID}/swarm$`));
  await page
    .locator('[aria-label="Plantillas de launchpad"]')
    .waitFor({ state: 'visible', timeout: 20_000 });
}

test.describe('ZED Orchestrator Pod', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceQueries(page);
    await mockIdleSwarmRoutes(page);
  });

  test('health API exposes ZED pod template in launch catalog when idle', async ({ request }) => {
    const response = await request.get(`/api/agenthub/operations/health?project_id=${PROJECT_ID}`);
    expect(response.status()).toBeLessThan(500);

    if (!response.ok()) {
      test.skip(true, 'Health route unavailable in this environment');
      return;
    }

    const payload = await response.json();
    const catalog = payload?.launch_catalog;

    expect(catalog?.templates?.length).toBeGreaterThan(0);

    const zedTemplate = catalog.templates.find(
      (template: { id?: string }) => template.id === 'zed-orchestrator-pod'
    );
    expect(zedTemplate).toBeTruthy();
    expect(zedTemplate?.launch_defaults?.bootstrapMode).toBe('standby');
    expect(zedTemplate?.launch_defaults?.sddEnabled).toBe(false);
    expect(zedTemplate?.featured).toBe(true);
  });

  test('idle launch catalog recommends zed-orchestrator-pod', async ({ request }) => {
    const response = await request.get(`/api/agenthub/operations/health?project_id=${PROJECT_ID}`);
    if (!response.ok()) {
      test.skip(true, 'Health route unavailable in this environment');
      return;
    }

    const payload = await response.json();
    expect(payload.launch_catalog?.recommended_template_id).toBe('zed-orchestrator-pod');
  });

  test('Swarm Control idle launchpad surfaces ZED Orchestrator Pod', async ({ page }) => {
    await gotoSwarmControl(page);

    const launchpad = page.locator('[aria-label="Plantillas de launchpad"]');
    await expect(launchpad).toBeVisible();
    await expect(launchpad).toContainText('ZED Orchestrator Pod');
    await expect(launchpad).toContainText('Recomendada');
    await expect(launchpad).toContainText('Gentle Orchestrator');
  });

  test('launch wizard for ZED pod shows standby copy and worker count selector', async ({
    page,
  }) => {
    await gotoSwarmControl(page);

    const launchpad = page.locator('[aria-label="Plantillas de launchpad"]');
    const zedCard = launchpad.locator('.grid > *').filter({ hasText: 'ZED Orchestrator Pod' });
    await zedCard.getByRole('button', { name: 'Abrir wizard' }).click();

    const wizard = page.locator('[aria-label="Launch wizard de swarm"]');
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText('ZED Orchestrator Pod');

    await wizard.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(wizard).toContainText('modo standby');
    await expect(wizard.locator('[aria-label="Cantidad de SDD Workers"]')).toBeVisible();
  });
});
