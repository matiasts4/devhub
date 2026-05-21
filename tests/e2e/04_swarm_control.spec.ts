import { test, expect } from '@playwright/test';

const QA_RUN_ID = process.env.QA_RUN_ID || 'qa-local';
const SCENARIO_ID = process.env.SCENARIO_ID || 'approval-closure';
const ENABLE_RECOVERY_ASSERTIONS = process.env.ENABLE_RECOVERY_ASSERTIONS === '1';
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

    if (table === 'tasks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
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

async function gotoSwarmControl(page) {
  await page.goto(`/#/project/${PROJECT_ID}/swarm`);
  await page.waitForURL(new RegExp(`#/project/${PROJECT_ID}/swarm$`));
  await page.waitForLoadState('networkidle');
}

function buildScenarioSnapshot(scenarioId: string, qaRunId: string) {
  const baseSnapshot = {
    control_room_snapshot_input: {
      supervisor: {
        supervisor_state: 'awaiting_approval',
        approvals: [
          {
            checkpoint_key: `${scenarioId}-checkpoint`,
            task_id: `${scenarioId}-task`,
            workspace_id: `${scenarioId}-workspace`,
            run_id: `${scenarioId}-run`,
            status: 'pending',
            reason_class: 'approval_required',
            linked_supervisor_state: 'awaiting_approval',
            linked_supervisor_outcome: 'wait',
            evidence_ref: `evidence://approval/${scenarioId}-checkpoint#${qaRunId}`,
          },
        ],
      },
      evidence_timeline: [
        {
          item_id: `${scenarioId}-approval`,
          kind: 'approval_checkpoint',
          occurred_at: '2026-05-21T10:59:00.000Z',
          summary: `${scenarioId} approval checkpoint`,
          linked_ids: {
            task_id: `${scenarioId}-task`,
            workspace_id: `${scenarioId}-workspace`,
            run_id: `${scenarioId}-run`,
            approval_checkpoint_key: `${scenarioId}-checkpoint`,
          },
          evidence_ref: `evidence://approval/${scenarioId}-checkpoint#${qaRunId}`,
        },
        {
          item_id: `${scenarioId}-run`,
          kind: 'run',
          occurred_at: '2026-05-21T10:59:10.000Z',
          summary: `${scenarioId} run active`,
          linked_ids: {
            task_id: `${scenarioId}-task`,
            workspace_id: `${scenarioId}-workspace`,
            run_id: `${scenarioId}-run`,
          },
          evidence_ref: `evidence://run/${scenarioId}-run#${qaRunId}`,
        },
        {
          item_id: `${scenarioId}-workspace`,
          kind: 'artifact',
          occurred_at: '2026-05-21T10:59:20.000Z',
          summary: `${scenarioId} workspace ready`,
          linked_ids: {
            task_id: `${scenarioId}-task`,
            workspace_id: `${scenarioId}-workspace`,
            run_id: `${scenarioId}-run`,
          },
          evidence_ref: `evidence://workspace/${scenarioId}-workspace#${qaRunId}`,
        },
      ],
      mission_control: {
        mission: {
          mission_id: `${scenarioId}-mission`,
          task_id: `${scenarioId}-task`,
          workspace_id: `${scenarioId}-workspace`,
          run_id: `${scenarioId}-run`,
          title: `${scenarioId} mission`,
          status: 'active',
        },
        participants: [
          {
            participant_id: 'participant-director',
            agent_id: 'agent-director',
            role_in_mission: 'director',
            status: 'active',
          },
          {
            participant_id: 'participant-executor',
            agent_id: 'agent-executor',
            role_in_mission: 'executor',
            status: 'active',
          },
        ],
        recent_messages: [
          {
            message_id: `${scenarioId}-message`,
            body_summary: `QA run ${qaRunId} for ${scenarioId}`,
            created_at: '2026-05-21T10:59:30.000Z',
            evidence_ref: `evidence://mission-message/${scenarioId}-message#${qaRunId}`,
          },
        ],
        latest_message: {
          message_id: `${scenarioId}-message`,
          body_summary: `QA run ${qaRunId} for ${scenarioId}`,
          created_at: '2026-05-21T10:59:30.000Z',
          evidence_ref: `evidence://mission-message/${scenarioId}-message#${qaRunId}`,
        },
        pending_deliveries: [],
        presence: { active: [], stale: [], offline: [] },
        snapshot_at: '2026-05-21T10:59:30.000Z',
        watermark: `${scenarioId}-${qaRunId}`,
      },
    },
  };

  if (scenarioId === 'recovery' && ENABLE_RECOVERY_ASSERTIONS) {
    baseSnapshot.control_room_snapshot_input.evidence_timeline.push({
      item_id: `${scenarioId}-recovery`,
      kind: 'artifact',
      occurred_at: '2026-05-21T10:59:40.000Z',
      summary: `${scenarioId} recovery checkpoint`,
      linked_ids: {
        task_id: `${scenarioId}-task`,
        workspace_id: `${scenarioId}-workspace`,
        run_id: `${scenarioId}-run`,
      },
      evidence_ref: `evidence://recovery/${scenarioId}-workspace#${qaRunId}`,
    });
  }

  return baseSnapshot;
}

test.describe('SwarmControl desktop QA scenarios', () => {
  test.beforeEach(async ({ page }) => {
    const snapshot = buildScenarioSnapshot(SCENARIO_ID, QA_RUN_ID);

    await mockWorkspaceQueries(page);

    await page.route('**/api/agenthub/operations/health**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      });
    });
  });

  test('approval->closure checkpoints stay deterministic across QA_RUN_ID and scenario_id', async ({
    page,
  }) => {
    await gotoSwarmControl(page);

    const approvalRow = page.getByText(`${SCENARIO_ID}-task`).first();
    await expect(approvalRow).toBeVisible();
    await expect(page.getByText('DevHub QA Project').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspace Control Room' })).toBeVisible();
    await expect(page.getByText('Swarm activo').first()).toBeVisible();
    await expect(page.getByText('Continuar desde cola durable').first()).toBeVisible();
    await expect(
      page
        .getByText(new RegExp(`evidence://approval/${SCENARIO_ID}-checkpoint#${QA_RUN_ID}`))
        .first()
    ).toBeVisible();
    await expect(page.getByText(`QA run ${QA_RUN_ID} for ${SCENARIO_ID}`).first()).toBeVisible();
    await expect(page.getByText(`${SCENARIO_ID}-run`).first()).toBeVisible();
    await expect(page.getByText(`${SCENARIO_ID}-workspace`).first()).toBeVisible();
  });

  test('recovery checkpoint stays soft-gated until deterministic assertions are enabled', async ({
    page,
  }) => {
    test.skip(SCENARIO_ID !== 'recovery', 'Recovery assertions only apply to recovery scenario');

    await gotoSwarmControl(page);

    const recoveryEvidence = page.getByText(/evidence:\/\/recovery\//);
    if (ENABLE_RECOVERY_ASSERTIONS) {
      await expect(recoveryEvidence).toBeVisible();
    } else {
      await expect(recoveryEvidence).toHaveCount(0);
    }
  });
});
