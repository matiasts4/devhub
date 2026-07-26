import { expect, test } from '@playwright/test';

type MatrixScenario = {
  id: string;
  title: string;
  runtimeStatus: 'healthy' | 'degraded' | 'stale';
  runtimeFreshness: 'current' | 'degraded' | 'stale';
  evidenceRefs: string[];
  metrics: {
    reattachable_terminals: number;
    orphaned_processes: number;
    stale_registry_agents: number;
    quota_blocked: boolean;
    total_terminals: number;
    total_processes: number;
    total_registry_agents: number;
  };
};

const scenarios: MatrixScenario[] = [
  {
    id: 'simple-reopen',
    title: 'Simple reopen with active runtime',
    runtimeStatus: 'healthy',
    runtimeFreshness: 'current',
    evidenceRefs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
    metrics: {
      reattachable_terminals: 0,
      orphaned_processes: 0,
      stale_registry_agents: 0,
      quota_blocked: false,
      total_terminals: 1,
      total_processes: 1,
      total_registry_agents: 1,
    },
  },
  {
    id: 'five-panel-swarm',
    title: 'Five panel swarm reopen with stable runtime',
    runtimeStatus: 'healthy',
    runtimeFreshness: 'current',
    evidenceRefs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
    metrics: {
      reattachable_terminals: 0,
      orphaned_processes: 0,
      stale_registry_agents: 0,
      quota_blocked: false,
      total_terminals: 5,
      total_processes: 5,
      total_registry_agents: 5,
    },
  },
  {
    id: 'reattach-no-sockets',
    title: 'Reattach path when sockets are missing',
    runtimeStatus: 'degraded',
    runtimeFreshness: 'current',
    evidenceRefs: [
      'log://terminal-debug.log:data/logs/terminal-debug.log',
      'crashdump://ws-abrupt-close.json:data/logs/crash-dumps/ws-abrupt-close.json',
    ],
    metrics: {
      reattachable_terminals: 2,
      orphaned_processes: 0,
      stale_registry_agents: 0,
      quota_blocked: false,
      total_terminals: 3,
      total_processes: 3,
      total_registry_agents: 3,
    },
  },
  {
    id: 'quota-blocked',
    title: 'Quota-blocked runtime recovery path',
    runtimeStatus: 'degraded',
    runtimeFreshness: 'degraded',
    evidenceRefs: [
      'log://opencode.log:data/logs/opencode.log',
      'log://browser.log:data/logs/browser.log',
    ],
    metrics: {
      reattachable_terminals: 0,
      orphaned_processes: 0,
      stale_registry_agents: 1,
      quota_blocked: true,
      total_terminals: 2,
      total_processes: 2,
      total_registry_agents: 2,
    },
  },
  {
    id: 'registry-stale-process-live',
    title: 'Live process while registry is stale',
    runtimeStatus: 'degraded',
    runtimeFreshness: 'current',
    evidenceRefs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
    metrics: {
      reattachable_terminals: 0,
      orphaned_processes: 1,
      stale_registry_agents: 1,
      quota_blocked: false,
      total_terminals: 2,
      total_processes: 2,
      total_registry_agents: 1,
    },
  },
  {
    id: 'vte-hidden-restore',
    title: 'VTE hidden then restored through runtime diagnostics',
    runtimeStatus: 'degraded',
    runtimeFreshness: 'degraded',
    evidenceRefs: [
      'log://terminal-debug.log:data/logs/terminal-debug.log',
      'crashdump://vte-hidden-restore.json:data/logs/crash-dumps/vte-hidden-restore.json',
    ],
    metrics: {
      reattachable_terminals: 1,
      orphaned_processes: 0,
      stale_registry_agents: 0,
      quota_blocked: false,
      total_terminals: 2,
      total_processes: 2,
      total_registry_agents: 2,
    },
  },
  {
    id: 'worker-kill-reclassify',
    title: 'Worker killed and reclassified by runtime diagnostics',
    runtimeStatus: 'degraded',
    runtimeFreshness: 'current',
    evidenceRefs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
    metrics: {
      reattachable_terminals: 0,
      orphaned_processes: 1,
      stale_registry_agents: 0,
      quota_blocked: false,
      total_terminals: 3,
      total_processes: 2,
      total_registry_agents: 3,
    },
  },
];

function buildControlRoomSnapshotInput(scenario: MatrixScenario) {
  return {
    project: { id: 'project-1', name: 'DevHub' },
    supervisor: {
      supervisor_state: 'lease_active',
      active_agents: 1,
      max_agents: 5,
      queue_depth: 1,
      authority: 'authoritative',
      freshness: 'current',
      evidence_ref: 'evidence://supervisor/header',
      agents: [],
      approvals: [],
      errors: [],
    },
    diagnostics: {
      mcp: {
        status: 'healthy',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://mcp/status',
      },
      process: {
        status: 'healthy',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://process/status',
      },
      session_stream: {
        status: 'healthy',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://session/stream',
      },
      runtime: {
        status: scenario.runtimeStatus,
        authority: 'authoritative',
        freshness: scenario.runtimeFreshness,
        evidence_refs: scenario.evidenceRefs,
        metrics: scenario.metrics,
      },
    },
    workspaces: [],
    runs: [],
    artifacts: [],
    mission_control: null,
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
    evidence_timeline: [],
  };
}

test.describe('swarm runtime restore matrix harness', () => {
  for (const scenario of scenarios) {
    test(`scenario: ${scenario.id}`, async ({ page }, testInfo) => {
      const snapshot = buildControlRoomSnapshotInput(scenario);

      await page.addInitScript((payload) => {
        window.localStorage.setItem(
          'devhub_swarm_control_snapshot:project-1',
          JSON.stringify(payload)
        );
      }, snapshot);

      await page.goto('/swarm');
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByLabel('Overlay diagnóstico')).toBeVisible();
      await expect(page.getByText('Runtime', { exact: true })).toBeVisible();

      for (const evidence of scenario.evidenceRefs) {
        const label = evidence.startsWith('crashdump://') ? 'Crash:' : 'Log:';
        await expect(page.getByText(label, { exact: false })).toBeVisible();
      }

      await expect(
        page.getByText(`Reattachables: ${scenario.metrics.reattachable_terminals}`, {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        page.getByText(`Orphaned: ${scenario.metrics.orphaned_processes}`, {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        page.getByText(`Stale registry: ${scenario.metrics.stale_registry_agents}`, {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        page.getByText(`Quota: ${scenario.metrics.quota_blocked ? 'blocked' : 'ok'}`, {
          exact: false,
        })
      ).toBeVisible();

      await testInfo.attach(`matrix-${scenario.id}.json`, {
        body: Buffer.from(
          JSON.stringify(
            {
              scenario,
              snapshot,
              observedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          'utf8'
        ),
        contentType: 'application/json',
      });
    });
  }
});
