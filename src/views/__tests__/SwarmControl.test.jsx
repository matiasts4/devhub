const React = require('react');
const {
  installDom,
  renderIntoDom,
  cleanupMountedRoots,
  flushEffects,
  click,
} = require('@/test-support/domHarness');

const mockUseOutletContext = jest.fn();

jest.mock(
  'react-router-dom',
  () => ({
    useOutletContext: () => mockUseOutletContext(),
  }),
  { virtual: true }
);

const SwarmControl = require('../SwarmControl').default;
const {
  buildControlRoomInput,
} = require('@/lib/operations/__tests__/fixtures/controlRoomSnapshot');

const mountedRoots = [];

function buildExpandedInput() {
  const base = buildControlRoomInput();

  return {
    ...base,
    supervisor: {
      ...base.supervisor,
      active_agents: 2,
      agents: [
        ...base.supervisor.agents,
        {
          agent_id: 'worker-2',
          task_id: 'task-2',
          lease_expires_at: '2026-05-19T07:45:00.000Z',
          workspace_id: 'ws-2',
          run_id: 'run-2',
          supervisor_state: 'lease_active',
          evidence_ref: 'evidence://supervisor/task-2',
        },
      ],
      approvals: [
        ...base.supervisor.approvals,
        {
          task_id: 'task-2',
          workspace_id: 'ws-2',
          run_id: 'run-2',
          status: 'approved',
          reason_class: 'completed',
          evidence_ref: 'evidence://approval/task-2',
        },
      ],
    },
    workspaces: [
      ...base.workspaces,
      {
        id: 'ws-2',
        agent_id: 'worker-2',
        current_task_id: 'task-2',
        status: 'active',
        branch_name: 'feat/sw-5-1b',
        evidence_ref: 'evidence://workspace/ws-2',
      },
    ],
    runs: [
      ...base.runs,
      {
        run_id: 'run-2',
        workspace_id: 'ws-2',
        status: 'succeeded',
        evidence_ref: 'evidence://run/run-2',
      },
    ],
    artifacts: [
      ...base.artifacts,
      {
        artifact_id: 'artifact-2',
        run_id: 'run-2',
        kind: 'test.result',
        seq: 4,
        evidence_ref: 'evidence://artifact/artifact-2',
      },
    ],
  };
}

async function renderSwarmControl(props = {}) {
  return renderIntoDom(React.createElement(SwarmControl, props), mountedRoots);
}

function buildDegradedInput() {
  return buildControlRoomInput({
    supervisor: {
      supervisor_state: 'awaiting_approval',
      active_agents: 3,
      max_agents: 5,
      queue_depth: 4,
      authority: 'authoritative',
      freshness: 'stale',
      evidence_ref: 'evidence://supervisor/stale-header',
      agents: [
        {
          agent_id: 'worker-risky',
          task_id: 'task-risky',
          lease_expires_at: '2026-05-19T09:30:00.000Z',
          workspace_id: 'ws-risky',
          run_id: 'run-risky',
          supervisor_state: 'awaiting_approval',
          evidence_ref: 'evidence://supervisor/task-risky',
        },
      ],
      approvals: [
        {
          task_id: 'task-risky',
          workspace_id: 'ws-risky',
          run_id: 'run-risky',
          status: 'pending',
          reason_class: 'approval_required',
        },
      ],
      errors: [
        {
          code: 'missing-approval-evidence',
          message: 'Approval evidence missing',
          source: 'approval evidence',
        },
      ],
    },
    workspaces: [
      {
        id: 'ws-risky',
        agent_id: 'worker-risky',
        current_task_id: 'task-risky',
        status: 'paused',
        branch_name: 'feat/risky',
      },
    ],
    runs: [
      {
        run_id: 'run-risky',
        workspace_id: 'ws-risky',
        status: 'succeeded',
      },
    ],
    artifacts: [],
    diagnostics: {
      mcp: {
        status: 'degraded',
        authority: 'authoritative',
        freshness: 'degraded',
      },
      telegram: null,
      process: null,
      session_stream: null,
    },
    liveHints: {
      queue: { active_agents: 9, authority: 'cached' },
      agents: [{ agent_id: 'worker-risky', status: 'running', authority: 'cached' }],
    },
  });
}

describe('SwarmControl control room composition', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    mockUseOutletContext.mockReturnValue({
      project: { id: 'project-1', name: 'DevHub', local_path: '/workspace/devhub' },
    });
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  test('renders header, agents, workspaces, runs, approvals, and diagnostics from snapshot slices only', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const text = view.container.textContent;

    expect(text).toContain('Workspace Control Room');
    expect(text).toContain('DevHub');
    expect(text).toContain('1/5 agents active');
    expect(text).not.toContain('9/5 agents active');

    expect(text).toContain('Agents & claims');
    expect(text).toContain('worker-1');
    expect(text).toContain('task-1');
    expect(text).toContain('awaiting approval');

    expect(text).toContain('Workspaces');
    expect(text).toContain('ws-1');
    expect(text).toContain('feat/sw-5-1a');

    expect(text).toContain('Runs & artifacts');
    expect(text).toContain('run-1');
    expect(text).toContain('qa.result');

    expect(text).toContain('Approvals & errors');
    expect(text).toContain('approval required');
    expect(text).toContain('Workspace evidence gap');

    expect(text).toContain('Diagnostic overlay');
    expect(text).toContain('Telegram');
    expect(text).toContain('healthy');
    expect(text).toContain('MCP');
    expect(text).toContain('stale');
  });

  test('keeps canonical header counts while local layout and overlay state change only presentation', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildExpandedInput() });
    const stackButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Stack')
    );
    const overlayButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Collapse')
    );

    expect(view.container.textContent).toContain('2/5 agents active');
    expect(view.container.querySelector('[aria-label="Agents & claims"]')?.textContent).toContain(
      'worker-1'
    );
    expect(view.container.querySelector('[aria-label="Agents & claims"]')?.textContent).toContain(
      'worker-2'
    );

    await click(stackButton);
    await click(overlayButton);

    expect(view.container.textContent).toContain('2/5 agents active');
    expect(stackButton?.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).not.toContain('Telegram unavailable');
    expect(view.container.querySelector('[aria-label="Agents & claims"]')?.textContent).toContain(
      'worker-1'
    );
    expect(view.container.querySelector('[aria-label="Agents & claims"]')?.textContent).toContain(
      'worker-2'
    );
  });

  test('renders stale, degraded, unavailable, and approval-pending messaging from the snapshot', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildDegradedInput() });
    const text = view.container.textContent;

    expect(text).toContain('3/5 agents active');
    expect(text).toContain('4 queued');
    expect(text).not.toContain('9/5 agents active');
    expect(text).toContain('stale');
    expect(text).toContain('evidence://supervisor/stale-header');
    expect(text).toContain('Missing source: approval evidence');
    expect(text).toContain('Risky outcome pending approval');
    expect(text).toContain('Outcome unapplied until approval evidence exists');
    expect(text).toContain('Missing source: telegram snapshot');
    expect(text).toContain('MCP');
    expect(text).toContain('degraded');
    expect(text).toContain('Live activity: running');
  });

  test('uses the canonical header label from the composed snapshot instead of the outlet project name', async () => {
    const snapshotInput = buildControlRoomInput({
      project: { id: 'project-1', name: 'Canonical Control Room' },
    });

    const view = await renderSwarmControl({ snapshotInput });
    const header = view.container.querySelector('[aria-label="Control Room Header"]');

    expect(header?.textContent).toContain('Canonical Control Room');
    expect(header?.textContent).not.toContain('DevHub');
  });

  test('regression: component displays supervisor state and authoritative status over conflicting live activity hints', async () => {
    const input = buildControlRoomInput();
    input.supervisor.agents[0].supervisor_state = 'awaiting_approval';
    input.liveHints = {
      agents: [
        {
          agent_id: 'worker-1',
          status: 'idle',
          authority: 'cached',
        },
      ],
    };

    const view = await renderSwarmControl({ snapshotInput: input });
    const text = view.container.textContent;

    expect(text).toContain('worker-1');
    expect(text).toContain('awaiting approval');
    expect(text).toContain('Live activity: idle');
  });
});
