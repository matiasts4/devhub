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

async function changeField(element, value) {
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flushEffects();
}

async function toggleCheckbox(element, checked = true) {
  if (element.checked !== checked) {
    element.click();
  }
  await flushEffects();
}

async function submitForm(element) {
  element.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushEffects();
}

function buildDirectorApprovalInput(overrides = {}) {
  const base = buildControlRoomInput();
  return {
    ...base,
    supervisor: {
      ...base.supervisor,
      supervisor_state: 'awaiting_approval',
      approvals: [
        {
          checkpoint_key: 'checkpoint-1',
          task_id: 'task-1',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          status: 'pending',
          reason_class: 'approval_required',
          linked_supervisor_state: 'awaiting_approval',
          linked_supervisor_outcome: 'wait',
          authority: 'authoritative',
          freshness: 'current',
          evidence_ref: 'evidence://approval/checkpoint-1',
          decision_note: null,
          decided_at: null,
        },
      ],
    },
    ...overrides,
  };
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

function buildDirectorQueueInput() {
  return buildControlRoomInput({
    director_queue: {
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-1',
          title: 'Checkpoint workspace principal',
          status: 'pending',
          position: 1,
          priority: 'critical',
          blocked_reason: null,
        },
        {
          id: 'task-2',
          title: 'Validar regresión del panel',
          status: 'pending',
          position: 2,
          priority: 'high',
          blocked_reason: null,
        },
        {
          id: 'task-3',
          title: 'Espera aprobación de QA',
          status: 'blocked',
          position: 3,
          priority: 'high',
          blocked_reason: 'approval_required',
          checkpoint_gate: {
            status: 'blocked',
            code: 'missing-git-checkpoint',
            message: 'Falta comentario [git:checkpoint] para este handoff.',
            remediation:
              'Agregá [git:checkpoint] con commit=<sha|none>, docs=[...], checks=[...] y worktree=<clean|dirty-excluded>.',
          },
        },
        {
          id: 'task-4',
          title: 'Reconciliar evidencia durable',
          status: 'pending',
          position: 4,
          priority: 'medium',
          blocked_reason: null,
          checkpoint_gate: {
            status: 'accepted',
            code: 'checkpoint-accepted',
            checkpoint: {
              commit: 'abc1234',
              worktree: 'clean',
            },
          },
        },
        {
          id: 'task-5',
          title: 'Cerrar checkpoint local',
          status: 'pending',
          position: 5,
          priority: 'medium',
          blocked_reason: null,
        },
        {
          id: 'task-6',
          title: 'No debería entrar en el panel acotado',
          status: 'pending',
          position: 6,
          priority: 'low',
          blocked_reason: null,
        },
      ],
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
  });
}

function buildPreviewInput(overrides = {}) {
  const base = buildControlRoomInput();

  return {
    ...base,
    mission_control: {
      ...base.mission_control,
      participants: [
        {
          participant_id: 'participant-1',
          agent_id: 'agent-director',
          role_in_mission: 'director',
          status: 'active',
          joined_at: '2026-05-19T11:00:00.000Z',
        },
        {
          participant_id: 'participant-2',
          agent_id: 'agent-worker-2',
          role_in_mission: 'reviewer',
          status: 'active',
          joined_at: '2026-05-19T11:00:03.000Z',
        },
        {
          participant_id: 'participant-3',
          agent_id: 'agent-worker-1',
          role_in_mission: 'executor',
          status: 'active',
          joined_at: '2026-05-19T11:00:05.000Z',
        },
      ],
      recent_messages: [
        {
          message_id: 'message-1',
          sender_agent_id: 'agent-director',
          message_kind: 'handoff',
          body_summary: 'Tomá la ejecución del workspace principal',
          created_at: '2026-05-19T11:01:00.000Z',
        },
      ],
      latest_message: {
        message_id: 'message-1',
        sender_agent_id: 'agent-director',
        message_kind: 'handoff',
        body_summary: 'Tomá la ejecución del workspace principal',
        created_at: '2026-05-19T11:01:00.000Z',
      },
      snapshot_at: '2026-05-19T11:01:40.000Z',
      watermark: 'mission-watermark-1',
      ...overrides,
    },
  };
}

function buildIdleLaunchpadInput(overrides = {}) {
  const base = buildControlRoomInput();

  return {
    ...base,
    supervisor: {
      ...base.supervisor,
      supervisor_state: 'idle',
      active_agents: 0,
      queue_depth: 0,
      approvals: [],
      agents: [],
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
    ...overrides,
  };
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
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('renders header, agents, workspaces, runs, approvals, and diagnostics from snapshot slices only', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const text = view.container.textContent;

    expect(text).toContain('Swarm / Control Room');
    expect(text).toContain('DevHub');
    expect(text).toContain('Supervisor lease activo');
    expect(text).toContain('1/5 activos');
    expect(text).not.toContain('9/5 activos');

    expect(text).toContain('Kernel de misión');
    expect(text).toContain('Misión activa');
    expect(text).toContain('Misión Director');
    expect(text).toContain('Participantes');
    expect(text).toContain('agent-director');
    expect(text).toContain('Mensajes recientes');
    expect(text).toContain('Tomá la ejecución del workspace principal');
    expect(text).toContain('traspaso');
    expect(text).toContain('Entregas pendientes');
    expect(text).toContain('reintento pendiente');
    expect(text).toContain('Presencia TTL');
    expect(text).toContain('Activa');
    expect(text).toContain('Vencida');
    expect(text).toContain('Fuera de línea');
    expect(text).not.toContain('Estadoactive');
    expect(text).not.toContain('retry pending');
    expect(text).not.toContain('Stale');
    expect(text).not.toContain('Offline');

    expect(text).toContain('Agentes y asignaciones');
    expect(text).toContain(
      'Tareas reclamadas, ventanas de lease, enlaces a workspace y autoridad durable.'
    );
    expect(text).toContain('worker-1');
    expect(text).toContain('task-1');
    expect(text).toContain('esperando aprobación');
    expect(text).not.toContain('Tasks reclamadas');

    expect(text).toContain('Workspaces');
    expect(text).toContain('ws-1');
    expect(text).toContain('feat/sw-5-1a');

    expect(text).toContain('Ejecuciones y artefactos');
    expect(text).toContain('Resultado más reciente del run y línea de evidencia asociada.');
    expect(text).toContain('run-1');
    expect(text).toContain('qa.result');

    expect(text).toContain('Aprobaciones y errores');
    expect(text).toContain(
      'Aprobaciones pendientes y faltantes explícitos de evidencia. Las decisiones del Director se revalidan contra el estado durable antes de mutar.'
    );
    expect(text).toContain('aprobación requerida');
    expect(text).toContain('falta evidencia de workspace');

    expect(text).toContain('Overlay diagnóstico');
    expect(text).toContain('Telegram');
    expect(text).toContain('ok');
    expect(text).toContain('MCP');
    expect(text).toContain('vencido');
    expect(text).not.toContain('Diagnostic overlay');
    expect(view.container.querySelector('[aria-label="Overlay diagnóstico"]')).not.toBeNull();
  });

  test('keeps canonical header counts while local layout and overlay state change only presentation', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildExpandedInput() });
    const stackButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Pila')
    );
    const overlayButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Colapsar')
    );

    expect(view.container.textContent).toContain('2/5 activos');
    expect(
      view.container.querySelector('[aria-label="Agentes y asignaciones"]')?.textContent
    ).toContain('worker-1');
    expect(
      view.container.querySelector('[aria-label="Agentes y asignaciones"]')?.textContent
    ).toContain('worker-2');

    await click(stackButton);
    await click(overlayButton);

    expect(view.container.textContent).toContain('2/5 activos');
    expect(stackButton?.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).not.toContain('Telegram no disponible');
    expect(
      view.container.querySelector('[aria-label="Agentes y asignaciones"]')?.textContent
    ).toContain('worker-1');
    expect(
      view.container.querySelector('[aria-label="Agentes y asignaciones"]')?.textContent
    ).toContain('worker-2');
  });

  test('renders director mission context in the header before local controls without adding operational verbs', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const header = view.container.querySelector('[aria-label="Control Room Header"]');
    const fullText = view.container.textContent || '';
    const buttonLabels = Array.from(view.container.querySelectorAll('button'))
      .map((button) => button.textContent?.trim().toLowerCase())
      .filter(Boolean);

    expect(header?.textContent).toContain('Contexto de misión');
    expect(header?.textContent).toContain('Misión Director');
    expect(header?.textContent).toContain('2 participantes');
    expect(header?.textContent).toContain('1 entrega pendiente');
    expect(header?.textContent).toContain('Tomá la ejecución del workspace principal');
    expect(fullText.indexOf('Contexto de misión')).toBeGreaterThan(-1);
    expect(fullText.indexOf('Contexto de misión')).toBeLessThan(
      fullText.indexOf('Filtrar registros')
    );
    expect(fullText.indexOf('Contexto de misión')).toBeLessThan(fullText.indexOf('Grilla'));
    expect(buttonLabels).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /start|stop|restart|attach|dispatch|browser|gtk|vte|iniciar|detener|reiniciar|adjuntar|despachar/
        ),
      ])
    );
  });

  test('renders the active swarm tower as the first primary surface ahead of queue, mission, and filters', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const primarySurface = view.container.querySelector(
      '[aria-label="Superficie primaria de swarm"]'
    );
    const fullText = view.container.textContent || '';

    expect(primarySurface).not.toBeNull();
    expect(primarySurface?.textContent).toContain('Swarm activo');
    expect(primarySurface?.textContent).toContain('Continuar desde cola durable');
    expect(primarySurface?.textContent).toContain('1 agente activo');
    expect(fullText.indexOf('Swarm activo')).toBeLessThan(fullText.indexOf('Cola del director'));
    expect(fullText.indexOf('Swarm activo')).toBeLessThan(fullText.indexOf('Kernel de misión'));
    expect(fullText.indexOf('Swarm activo')).toBeLessThan(fullText.indexOf('Filtrar registros'));
    expect(fullText.indexOf('Cola del director')).toBeLessThan(
      fullText.indexOf('Kernel de misión')
    );
  });

  test('renders an idle launchpad first with recommended templates before swarm types and bounded prep copy', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildIdleLaunchpadInput() });
    const primarySurface = view.container.querySelector(
      '[aria-label="Superficie primaria de swarm"]'
    );
    const launchpadPanel = view.container.querySelector('[aria-label="Plantillas de launchpad"]');
    const swarmTypesPanel = view.container.querySelector('[aria-label="Tipos de swarm"]');
    const fullText = view.container.textContent || '';

    expect(primarySurface).not.toBeNull();
    expect(primarySurface?.textContent).toContain('Lanzá un swarm nuevo');
    expect(primarySurface?.textContent).toContain('Elegir plantilla recomendada');
    expect(launchpadPanel?.textContent).toContain('Arranque limpio guiado');
    expect(launchpadPanel?.textContent).toContain('Plantilla recomendada');
    expect(swarmTypesPanel?.textContent).toContain('Delivery swarm');
    expect(swarmTypesPanel?.textContent).toContain('checkpoint-safe');
    expect(swarmTypesPanel?.textContent).not.toContain('builder');
    expect(fullText.indexOf('Lanzá un swarm nuevo')).toBeLessThan(
      fullText.indexOf('Plantillas de launchpad')
    );
    expect(fullText.indexOf('Plantillas de launchpad')).toBeLessThan(
      fullText.indexOf('Tipos de swarm')
    );
    expect(fullText.indexOf('Lanzá un swarm nuevo')).toBeLessThan(
      fullText.indexOf('Filtrar registros')
    );
  });

  test('launches through the durable route and dispatches runtime requests after the wizard completes', async () => {
    const launchEvents = [];
    const handleLaunchEvent = (event) => launchEvents.push(event.detail);
    window.addEventListener('devhub:run-agent', handleLaunchEvent);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: buildIdleLaunchpadInput(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: buildControlRoomInput({
            supervisor: {
              ...buildControlRoomInput().supervisor,
              supervisor_state: 'lease_active',
              active_agents: 3,
              queue_depth: 0,
            },
            mission_control: {
              ...buildPreviewInput().mission_control,
              mission: {
                ...buildPreviewInput().mission_control.mission,
                title: 'Lanzar Arranque limpio guiado',
                status: 'active',
              },
            },
          }),
          launch_result: {
            launchId: 'launch-1',
            launchLabel: 'Lanzar Arranque limpio guiado',
            summaryLines: [
              'Template team · Delivery',
              'Arranque limpio guiado · Delivery swarm',
              'Launchpad Scout Team · GPT-5.4 mini',
            ],
            runtime_requests: [
              {
                taskId: 'launch-1-director',
                selectedAgent: 'codex',
                command:
                  '/home/matias/.nvm/versions/node/v24.14.0/bin/codex exec --sandbox workspace-write "Director launch"',
                launchOrigin: 'swarm-control-launch',
                promptSummary: 'Director · Arranque limpio guiado',
                taskTitle: 'Lanzar Arranque limpio guiado · Director',
              },
              {
                taskId: 'launch-1-builder',
                selectedAgent: 'opencode',
                command:
                  '/home/matias/.opencode/bin/opencode --agent sdd-orchestrator --prompt "Builder launch"',
                launchOrigin: 'swarm-control-launch',
                promptSummary: 'Builder · Arranque limpio guiado',
                taskTitle: 'Lanzar Arranque limpio guiado · Builder',
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: buildControlRoomInput({
            supervisor: {
              ...buildControlRoomInput().supervisor,
              supervisor_state: 'lease_active',
              active_agents: 3,
              queue_depth: 0,
            },
            mission_control: {
              ...buildPreviewInput().mission_control,
              mission: {
                ...buildPreviewInput().mission_control.mission,
                title: 'Lanzar Arranque limpio guiado',
                status: 'active',
              },
            },
          }),
        }),
      });

    const view = await renderSwarmControl();
    const wizardTrigger = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Abrir wizard')
    );

    expect(wizardTrigger).not.toBeNull();
    await click(wizardTrigger);

    expect(document.body.textContent).toContain('Launch wizard');
    expect(document.body.textContent).toContain('Template team');
    expect(document.body.textContent).toContain('Team');
    expect(document.body.textContent).toContain('Configure');
    expect(document.body.textContent).toContain('Launch');

    const nextButtons = () =>
      Array.from(document.body.querySelectorAll('button')).filter((button) =>
        button.textContent?.includes('Siguiente')
      );

    await click(nextButtons()[0]);
    expect(document.body.textContent).toContain('Path operativo');
    expect(document.body.textContent).toContain('Mission');

    await click(nextButtons()[0]);
    expect(document.body.textContent).toContain('Summary');
    expect(document.body.textContent).toContain('Payload local');
    expect(document.body.textContent).toContain('Topology preview');

    const launchButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Lanzar swarm local')
    );
    expect(launchButton).not.toBeNull();

    await click(launchButton);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/agenthub/operations/health',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const launchPayload = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(launchPayload).toEqual(
      expect.objectContaining({
        action: 'launch_swarm_local',
        project_id: 'project-1',
        draft: expect.objectContaining({
          templateId: 'clean-slate',
          workspacePath: '/workspace/devhub',
        }),
      })
    );
    expect(view.container.textContent).toContain('Launch snapshot durable');
    expect(view.container.textContent).toContain('Lanzar Arranque limpio guiado');
    expect(view.container.textContent).toContain('Swarm activo');
    expect(view.container.textContent).not.toContain('Lanzá un swarm nuevo');
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      '/api/agenthub/operations/health?project_id=project-1',
      { cache: 'no-store' }
    );
    expect(launchEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 'launch-1-director', selectedAgent: 'codex' }),
        expect.objectContaining({ taskId: 'launch-1-builder', selectedAgent: 'opencode' }),
      ])
    );

    window.removeEventListener('devhub:run-agent', handleLaunchEvent);
  });

  test('lets swarm type cards open the wizard in custom mode and keeps topology preview visible', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildIdleLaunchpadInput() });
    const configureButtons = Array.from(view.container.querySelectorAll('button')).filter(
      (button) => button.textContent?.includes('Configurar')
    );

    expect(configureButtons.length).toBeGreaterThan(0);
    await click(configureButtons[1]);

    expect(document.body.textContent).toContain('Custom team');
    expect(document.body.textContent).toContain('Topology preview');
    expect(document.body.textContent).toContain('Director → Recovery Ops → Evidence → QA');
  });

  test('lets the operator pick a program per role inside the launch wizard and reflects it in the summary', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildIdleLaunchpadInput() });
    const wizardTrigger = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Abrir wizard')
    );

    expect(wizardTrigger).not.toBeNull();
    await click(wizardTrigger);

    const nextButtons = () =>
      Array.from(document.body.querySelectorAll('button')).filter((button) =>
        button.textContent?.includes('Siguiente')
      );

    await click(nextButtons()[0]);

    const directorProgram = document.body.querySelector(
      'select[aria-label="Programa para Director"]'
    );
    const coderProgram = document.body.querySelector('select[aria-label="Programa para Coder"]');

    expect(directorProgram).not.toBeNull();
    expect(coderProgram).not.toBeNull();

    await changeField(directorProgram, 'codex');
    await changeField(coderProgram, 'hermes');
    await click(nextButtons()[0]);

    expect(document.body.textContent).toContain('Programas por rol');
    expect(document.body.textContent).toContain('Director · Codex');
    expect(document.body.textContent).toContain('Coder · Hermes');
    expect(document.body.textContent).toContain('Auditor · OpenCode');
  });

  test('keeps secondary control-room panels below the primary surface in active mode', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const fullText = view.container.textContent || '';

    expect(fullText).toContain('Aprobaciones y errores');
    expect(fullText).toContain('Timeline de evidencia');
    expect(fullText).toContain('Agentes y asignaciones');
    expect(fullText.indexOf('Continuar desde cola durable')).toBeLessThan(
      fullText.indexOf('Filtrar registros')
    );
    expect(fullText.indexOf('Filtrar registros')).toBeLessThan(
      fullText.indexOf('Aprobaciones y errores')
    );
    expect(fullText.indexOf('Aprobaciones y errores')).toBeLessThan(
      fullText.indexOf('Kernel de misión')
    );
    expect(fullText).toContain('Timeline de evidencia');
  });

  test('renders ordered director queue rows inside a bounded read-only panel', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const panel = view.container.querySelector('[aria-label="Cola del director"]');
    const text = panel?.textContent || '';
    const handoffButton = Array.from(panel?.querySelectorAll('button') || []).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    expect(panel).not.toBeNull();
    expect(text).toContain('Cola del director');
    expect(text).toContain('Solo lectura');
    expect(text).toContain('Mostrando 5 de 6 tareas durables');
    expect(text.indexOf('1Checkpoint workspace principal')).toBeLessThan(
      text.indexOf('2Validar regresión del panel')
    );
    expect(text.indexOf('2Validar regresión del panel')).toBeLessThan(
      text.indexOf('3Espera aprobación de QA')
    );
    expect(text).toContain('5Cerrar checkpoint local');
    expect(text).not.toContain('No debería entrar en el panel acotado');
    expect(handoffButton).not.toBeNull();
    expect(handoffButton.disabled).toBe(false);
  });

  test('renders a read-only evidence timeline panel from the current normalized snapshot only', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const panel = view.container.querySelector('[aria-label="Timeline de evidencia"]');
    const text = panel?.textContent || '';

    expect(panel).not.toBeNull();
    expect(text).toContain('Timeline de evidencia');
    expect(text).toContain('Solo lectura');
    expect(text).toContain('Narrativa ordenada desde verdad durable ya normalizada.');
    expect(text).toContain('QA artifact captured');
    expect(text).toContain('Tomá la ejecución del workspace principal');
    expect(text).not.toContain('Tomar siguiente durable');
    expect(panel?.querySelector('button')).toBeNull();
    expect(panel?.querySelector('form')).toBeNull();
  });

  test('renders evidence timeline rows in deterministic normalized order and ignores unlinked session truth', async () => {
    const input = buildControlRoomInput({
      evidence_timeline: [
        {
          item_id: 'message-1',
          kind: 'mission_message',
          occurred_at: '2026-05-19T11:01:00.000Z',
          authority: 'authoritative',
          freshness: 'current',
          summary: 'Tomá la ejecución del workspace principal',
          linked_ids: {
            mission_id: 'mission-1',
            task_id: 'task-1',
            workspace_id: 'ws-1',
            run_id: 'run-1',
          },
          evidence_ref: 'evidence://mission-message/message-1',
        },
        {
          item_id: 'artifact-1',
          kind: 'artifact',
          occurred_at: '2026-05-19T11:01:40.000Z',
          authority: 'authoritative',
          freshness: 'current',
          summary: 'QA artifact captured',
          linked_ids: {
            mission_id: 'mission-1',
            task_id: 'task-1',
            workspace_id: 'ws-1',
            run_id: 'run-1',
            artifact_id: 'artifact-1',
          },
          evidence_ref: 'evidence://artifact/artifact-1',
        },
        {
          item_id: 'approval-task-1',
          kind: 'approval_checkpoint',
          occurred_at: '2026-05-19T11:01:40.000Z',
          authority: 'authoritative',
          freshness: 'current',
          summary: 'Approval required for task-1',
          linked_ids: {
            mission_id: 'mission-1',
            task_id: 'task-1',
            workspace_id: 'ws-1',
            run_id: 'run-1',
            approval_checkpoint_key: 'task-1:run-1',
          },
          evidence_ref: 'evidence://approval/task-1',
        },
        {
          item_id: 'session-trace-1',
          kind: 'session_trace',
          occurred_at: '2026-05-19T11:02:10.000Z',
          authority: 'cached',
          freshness: 'current',
          summary: 'Unlinked session trace should stay secondary only',
          linked_ids: {},
          evidence_ref: 'session://trace/1',
        },
      ],
    });
    const view = await renderSwarmControl({ snapshotInput: input });
    const panel = view.container.querySelector('[aria-label="Timeline de evidencia"]');
    const cards = Array.from(panel?.querySelectorAll('article') || []);

    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain('Approval required for task-1');
    expect(cards[1]?.textContent).toContain('QA artifact captured');
    expect(cards[2]?.textContent).toContain('Tomá la ejecución del workspace principal');
    expect(panel?.textContent).not.toContain('Unlinked session trace should stay secondary only');
  });

  test('renders durable empty state for evidence timeline without mutation prompts', async () => {
    const view = await renderSwarmControl({
      snapshotInput: buildControlRoomInput({
        evidence_timeline: [],
      }),
    });
    const panel = view.container.querySelector('[aria-label="Timeline de evidencia"]');
    const text = panel?.textContent || '';

    expect(text).toContain('Timeline de evidencia');
    expect(text).toContain('Sin eventos durables en este snapshot.');
    expect(panel?.querySelectorAll('article')).toHaveLength(0);
    expect(text).not.toContain('approval_required');
    expect(panel?.querySelector('button')).toBeNull();
  });

  test('labels linked secondary session evidence without promoting it to primary truth', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const panel = view.container.querySelector('[aria-label="Timeline de evidencia"]');
    const artifactCard = Array.from(panel?.querySelectorAll('article') || []).find((article) =>
      article.textContent?.includes('QA artifact captured')
    );
    const text = artifactCard?.textContent || '';

    expect(text).toContain('QA artifact captured');
    expect(text).toContain('Secondary session evidence');
    expect(text).toContain('secondary');
    expect(text).toContain('Terminal showed QA completion locally');
  });

  test('renders missing linked evidence explicitly in the evidence timeline panel', async () => {
    const view = await renderSwarmControl({
      snapshotInput: buildControlRoomInput({
        evidence_timeline: [
          {
            item_id: 'artifact-missing-link',
            kind: 'artifact',
            occurred_at: '2026-05-19T11:03:00.000Z',
            authority: 'authoritative',
            freshness: 'degraded',
            summary: 'Artifact durable sin row enlazada',
            linked_ids: {
              mission_id: 'mission-1',
              task_id: 'task-1',
              workspace_id: 'ws-1',
              run_id: 'run-1',
            },
            missing_source: 'artifact evidence',
          },
        ],
      }),
    });
    const panel = view.container.querySelector('[aria-label="Timeline de evidencia"]');
    const text = panel?.textContent || '';

    expect(text).toContain('Artifact durable sin row enlazada');
    expect(text).toContain('Fuente faltante: evidencia de artefacto');
    expect(text).toContain('Sin evidencia');
  });

  test('renders blocked queue badges and checkpoint-before-next-claim copy with bounded handoff control', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const panel = view.container.querySelector('[aria-label="Cola del director"]');
    const text = panel?.textContent || '';
    const handoffButton = Array.from(panel?.querySelectorAll('button') || []).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    expect(text).toContain('Bloqueada');
    expect(text).toContain('approval_required');
    expect(text).toContain('Hacé checkpoint local de la tarea actual antes del próximo claim.');
    expect(text).toContain('El refresh del servidor sigue siendo la única verdad.');
    expect(text).toContain('missing-git-checkpoint');
    expect(text).toContain('Agregá [git:checkpoint]');
    expect(handoffButton).not.toBeNull();
    expect(panel.querySelector('form')).toBeNull();
  });

  test('renders checkpoint remediation from projected snapshot errors', async () => {
    const view = await renderSwarmControl({
      snapshotInput: buildControlRoomInput({
        supervisor: {
          ...buildControlRoomInput().supervisor,
          errors: [
            {
              code: 'missing-git-checkpoint',
              message: 'Falta comentario [git:checkpoint] para este handoff.',
              source: 'checkpoint_gate',
              remediation:
                'Agregá [git:checkpoint] con commit=<sha|none>, docs=[...], checks=[...] y worktree=<clean|dirty-excluded>.',
            },
          ],
        },
      }),
    });
    const panel = view.container.querySelector('[aria-label="Aprobaciones y errores"]');
    const text = panel?.textContent || '';

    expect(text).toContain('checkpoint gate');
    expect(text).toContain('Agregá [git:checkpoint]');
  });

  test('renders accepted checkpoint summaries as read-only operator context', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const panel = view.container.querySelector('[aria-label="Cola del director"]');
    const text = panel?.textContent || '';

    expect(text).toContain('checkpoint-accepted');
    expect(text).toContain('abc1234');
    expect(text).toContain('clean');
  });

  test('renders durable empty queue state in the director queue panel', async () => {
    const view = await renderSwarmControl({
      snapshotInput: buildControlRoomInput({
        director_queue: {
          authority: 'authoritative',
          freshness: 'degraded',
          items: [],
        },
      }),
    });
    const panel = view.container.querySelector('[aria-label="Cola del director"]');
    const text = panel?.textContent || '';

    expect(text).toContain('Cola del director');
    expect(text).toContain('canónica');
    expect(text).toContain('degradado');
    expect(text).toContain('Sin tareas durables listas o bloqueadas en este snapshot.');
    expect(panel.querySelectorAll('article')).toHaveLength(0);
  });

  test('disables the handoff button when recipient resolution is unsafe', async () => {
    global.fetch = jest.fn();
    const view = await renderSwarmControl({
      snapshotInput: buildControlRoomInput({
        mission_control: {
          mission: {
            mission_id: 'mission-1',
            title: 'Misión Director',
            status: 'active',
          },
          participants: [
            {
              participant_id: 'participant-1',
              agent_id: 'agent-director',
              role_in_mission: 'director',
              status: 'active',
            },
            {
              participant_id: 'participant-2',
              agent_id: 'agent-worker-1',
              role_in_mission: 'executor',
              status: 'active',
            },
            {
              participant_id: 'participant-3',
              agent_id: 'agent-worker-2',
              role_in_mission: 'executor',
              status: 'active',
            },
          ],
          latest_message: null,
          pending_deliveries: [],
          presence: { active: [], stale: [], offline: [] },
        },
        director_queue: {
          authority: 'authoritative',
          freshness: 'current',
          items: [
            {
              id: 'task-1',
              title: 'Checkpoint workspace principal',
              status: 'pending',
              position: 1,
              priority: 'critical',
              blocked_reason: null,
            },
          ],
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
      }),
    });
    const handoffButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    expect(handoffButton).not.toBeNull();
    expect(handoffButton.disabled).toBe(true);
    expect(view.container.textContent).toContain(
      'Resolución insegura de destinatario: exactamente un executor activo.'
    );

    await click(handoffButton);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('submits durable handoff and renders the refreshed durable result card', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          director_queue: {
            authority: 'authoritative',
            freshness: 'current',
            items: [
              {
                id: 'task-2',
                title: 'Validar regresión del panel',
                status: 'pending',
                position: 1,
                priority: 'high',
                blocked_reason: null,
              },
            ],
            handoff: {
              status: 'claimed',
              recipient_agent_id: 'agent-worker-1',
              message: 'Tarea asignada al agente.',
              task: {
                id: 'task-1',
                title: 'Checkpoint workspace principal',
                status: 'in_progress',
                priority: 'critical',
              },
              workspace: {
                workspace_id: 'ws-1',
                status: 'active',
                branch_name: 'feat/sw-8-5a',
              },
              run: {
                run_id: 'run-1',
                status: 'running',
              },
              artifact: {
                artifact_id: 'artifact-1',
                kind: 'decision.note',
              },
              supervisor: {
                supervisor_state: 'dispatch_pending',
              },
            },
          },
        },
      }),
    });
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const handoffButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    await click(handoffButton);

    expect(global.fetch).toHaveBeenCalledWith('/api/agenthub/operations/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'claim_director_next_task',
        project_id: 'project-1',
      }),
    });
    expect(view.container.textContent).toContain('Resultado durable del handoff');
    expect(view.container.textContent).toContain('Tarea asignada al agente.');
    expect(view.container.textContent).toContain('Checkpoint workspace principal');
    expect(view.container.textContent).toContain('ws-1');
    expect(view.container.textContent).toContain('run-1');
    expect(view.container.textContent).toContain('dispatch pending');
  });

  test.each([
    ['blocked', 'Todas las tareas pendientes están bloqueadas.'],
    ['empty', 'Sin tareas pendientes'],
  ])('renders %s handoff refresh message from durable route payload', async (_status, message) => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          director_queue: {
            authority: 'authoritative',
            freshness: 'current',
            items: [],
            handoff: {
              status: _status,
              recipient_agent_id: 'agent-worker-1',
              message,
              task: null,
              workspace: null,
              run: null,
              artifact: null,
              supervisor: null,
            },
          },
        },
      }),
    });
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const handoffButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    await click(handoffButton);

    expect(view.container.textContent).toContain(message);
  });

  test('renders route error message after a failed handoff refresh', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'No se pudo reclamar el siguiente task durable.' }),
    });
    const view = await renderSwarmControl({ snapshotInput: buildDirectorQueueInput() });
    const handoffButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Tomar siguiente durable')
    );

    await click(handoffButton);

    expect(view.container.textContent).toContain('No se pudo reclamar el siguiente task durable.');
    expect(handoffButton.disabled).toBe(false);
  });

  test('keeps secondary panels visible when mission snapshot is empty', async () => {
    const input = buildControlRoomInput({ mission_control: null });
    const view = await renderSwarmControl({ snapshotInput: input });
    const fullText = view.container.textContent || '';

    expect(fullText).toContain('Swarm activo');
    expect(fullText.indexOf('Swarm activo')).toBeLessThan(fullText.indexOf('Filtrar registros'));
    expect(fullText.indexOf('Filtrar registros')).toBeLessThan(
      fullText.indexOf('Kernel de misión')
    );
    expect(fullText).toContain('No hay misión activa');
    expect(fullText).toContain('Sin mensajes recientes en este snapshot.');
    expect(fullText).toContain('Sin entregas pendientes en este snapshot.');
    expect(fullText).toContain('Sin presencia TTL en este snapshot.');
    expect(
      view.container.querySelector('[aria-label="Agentes y asignaciones"]')?.textContent
    ).toContain('worker-1');
    expect(view.container.querySelector('[aria-label="Workspaces"]')?.textContent).toContain(
      'ws-1'
    );
    expect(
      view.container.querySelector('[aria-label="Ejecuciones y artefactos"]')?.textContent
    ).toContain('run-1');
    expect(
      view.container.querySelector('[aria-label="Aprobaciones y errores"]')?.textContent
    ).toContain('aprobación requerida');
  });

  test('renders stale, degraded, unavailable, and approval-pending messaging from the snapshot', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildDegradedInput() });
    const text = view.container.textContent;

    expect(text).toContain('3/5 activos');
    expect(text).toContain('4 en cola');
    expect(text).not.toContain('9/5 activos');
    expect(text).toContain('vencido');
    expect(text).toContain('evidence://supervisor/stale-header');
    expect(text).toContain('Fuente faltante: evidencia de aprobación');
    expect(text).toContain('Resultado riesgoso pendiente de aprobación');
    expect(text).toContain('Resultado no aplicado hasta que exista evidencia de aprobación');
    expect(text).toContain('Fuente faltante: snapshot de Telegram');
    expect(text).toContain('MCP');
    expect(text).toContain('degradado');
    expect(text).toContain('Actividad en vivo: en ejecución');
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
    expect(text).toContain('esperando aprobación');
    expect(text).toContain('Actividad en vivo: inactivo');
  });

  test('renders empty mission kernel states cleanly when no mission snapshot exists', async () => {
    const input = buildControlRoomInput({ mission_control: null });

    const view = await renderSwarmControl({ snapshotInput: input });
    const text = view.container.textContent;

    expect(text).toContain('Kernel de misión');
    expect(text).toContain('No hay misión activa');
    expect(text).toContain('Sin participantes durables en este snapshot.');
    expect(text).toContain('Sin mensajes recientes en este snapshot.');
    expect(text).toContain('Sin entregas pendientes en este snapshot.');
    expect(text).toContain('Sin presencia TTL en este snapshot.');
  });

  test('renders a local composer for active mission participants only', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });

    expect(view.container.textContent).toContain('Composer local');
    expect(view.container.textContent).toContain('Destinatarios');
    expect(view.container.textContent).toContain('Mensaje breve');
    expect(view.container.textContent).toContain('agent-worker-1');
    expect(view.container.textContent).not.toContain('agent-directorSeleccionar');
    expect(
      view.container.querySelector('textarea[aria-label="Mensaje breve para la misión"]')
    ).not.toBeNull();
  });

  test('renders empty and ready briefing preview states and updates them when recipient selection changes', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildPreviewInput() });
    const worker1 = view.container.querySelector('input[type="checkbox"][value="agent-worker-1"]');
    const worker2 = view.container.querySelector('input[type="checkbox"][value="agent-worker-2"]');

    expect(view.container.textContent).toContain('Vista previa para dirección');
    expect(view.container.textContent).toContain(
      'Seleccioná al menos un destinatario activo para generar la vista previa.'
    );

    await toggleCheckbox(worker1, true);

    expect(view.container.textContent).toContain('Mission: Misión Director');
    expect(view.container.textContent).toContain('Recipients: agent-worker-1');
    expect(view.container.textContent).toContain(
      'Latest message: Tomá la ejecución del workspace principal'
    );

    await toggleCheckbox(worker2, true);

    expect(view.container.textContent).toContain('Recipients: agent-worker-2, agent-worker-1');

    await toggleCheckbox(worker1, false);

    expect(view.container.textContent).toContain('Recipients: agent-worker-2');
    expect(view.container.textContent).not.toContain('Recipients: agent-worker-2, agent-worker-1');
  });

  test('renders unavailable briefing preview when the local selection becomes ineligible after snapshot refresh', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildPreviewInput() });
    const worker2 = view.container.querySelector('input[type="checkbox"][value="agent-worker-2"]');

    await toggleCheckbox(worker2, true);
    expect(view.container.textContent).toContain('Recipients: agent-worker-2');

    await view.rerender(
      React.createElement(SwarmControl, {
        snapshotInput: buildPreviewInput({
          participants: [
            {
              participant_id: 'participant-1',
              agent_id: 'agent-director',
              role_in_mission: 'director',
              status: 'active',
              joined_at: '2026-05-19T11:00:00.000Z',
            },
            {
              participant_id: 'participant-2',
              agent_id: 'agent-worker-2',
              role_in_mission: 'reviewer',
              status: 'paused',
              joined_at: '2026-05-19T11:00:03.000Z',
            },
            {
              participant_id: 'participant-3',
              agent_id: 'agent-worker-1',
              role_in_mission: 'executor',
              status: 'active',
              joined_at: '2026-05-19T11:00:05.000Z',
            },
          ],
        }),
      })
    );

    expect(view.container.textContent).toContain('Vista previa para dirección');
    expect(view.container.textContent).toContain(
      'La selección actual no tiene destinatarios elegibles en este snapshot.'
    );
  });

  test('keeps submit payload limited to the legacy contract even when preview data is visible', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          mission_control: buildPreviewInput().mission_control,
        },
      }),
    });

    const view = await renderSwarmControl({ snapshotInput: buildPreviewInput() });
    const worker1 = view.container.querySelector('input[type="checkbox"][value="agent-worker-1"]');
    const worker2 = view.container.querySelector('input[type="checkbox"][value="agent-worker-2"]');
    const textarea = view.container.querySelector(
      'textarea[aria-label="Mensaje breve para la misión"]'
    );
    const submitButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Guardar mensaje local')
    );
    const form = submitButton?.closest('form');

    await toggleCheckbox(worker1, true);
    await toggleCheckbox(worker2, true);
    await changeField(textarea, 'Necesito update del workspace hoy');

    expect(view.container.textContent).toContain('Recipients: agent-worker-2, agent-worker-1');

    await submitForm(form);

    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);

    expect(payload).toEqual({
      action: 'create_local_mission_message',
      recipient_agent_ids: ['agent-worker-2', 'agent-worker-1'],
      body_summary: 'Necesito update del workspace hoy',
    });
    expect(payload.previewText).toBeUndefined();
    expect(payload.lines).toBeUndefined();
    expect(payload.state).toBeUndefined();
  });

  test('persists a local mission message and reflects it in the current control room snapshot', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          mission_control: {
            mission: {
              mission_id: 'mission-1',
              title: 'Misión Director',
              status: 'active',
            },
            participants: [
              {
                participant_id: 'participant-1',
                agent_id: 'agent-director',
                role_in_mission: 'director',
                status: 'active',
              },
              {
                participant_id: 'participant-2',
                agent_id: 'agent-worker-1',
                role_in_mission: 'executor',
                status: 'active',
              },
            ],
            latest_message: {
              message_id: 'message-2',
              sender_agent_id: 'agent-director',
              message_kind: 'directive',
              body_summary: 'Necesito update del workspace hoy',
              created_at: '2026-05-19T12:30:00.000Z',
            },
            pending_deliveries: [
              {
                delivery_id: 'delivery-2',
                recipient_agent_id: 'agent-worker-1',
                channel: 'local_snapshot',
                status: 'pending',
                last_attempt_at: '2026-05-19T12:30:00.000Z',
              },
            ],
            presence: {
              active: [],
              stale: [],
              offline: [],
            },
          },
        },
      }),
    });

    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const recipient = view.container.querySelector(
      'input[type="checkbox"][value="agent-worker-1"]'
    );
    const textarea = view.container.querySelector(
      'textarea[aria-label="Mensaje breve para la misión"]'
    );
    const submitButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Guardar mensaje local')
    );
    const form = submitButton?.closest('form');

    await toggleCheckbox(recipient, true);
    await changeField(textarea, 'Necesito update del workspace hoy');
    await submitForm(form);

    expect(global.fetch).toHaveBeenCalledWith('/api/agenthub/operations/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_local_mission_message',
        recipient_agent_ids: ['agent-worker-1'],
        body_summary: 'Necesito update del workspace hoy',
      }),
    });
    expect(view.container.textContent).toContain('Necesito update del workspace hoy');
    expect(view.container.textContent).toContain('snapshot local');
    expect(view.container.textContent).toContain('pendiente');
  });

  test('requests the health snapshot with the outlet project_id when loading from the route', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: buildControlRoomInput({
          project: { id: 'project-1', name: 'DevHub route' },
        }),
      }),
    });

    await renderSwarmControl();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agenthub/operations/health?project_id=project-1',
      { cache: 'no-store' }
    );
  });

  test('submits approve decision, disables controls while pending, hydrates response, and revalidates via GET', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: buildDirectorApprovalInput(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: {
            ...buildDirectorApprovalInput(),
            supervisor: {
              supervisor_state: 'dispatch_pending',
              approvals: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: {
            ...buildDirectorApprovalInput(),
            supervisor: {
              supervisor_state: 'dispatch_pending',
              approvals: [],
            },
          },
        }),
      });

    const view = await renderSwarmControl();
    const approveButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Aprobar')
    );

    expect(approveButton).not.toBeNull();
    await click(approveButton);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/agenthub/director-approval',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      '/api/agenthub/operations/health?project_id=project-1',
      { cache: 'no-store' }
    );
    expect(view.container.textContent).not.toContain('checkpoint-1');
  });

  test('submits reject decision and renders conflict error while keeping controls enabled after failure', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          control_room_snapshot_input: buildDirectorApprovalInput(),
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'La linkage durable cambió: workspace_id ya no coincide.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ control_room_snapshot_input: buildDirectorApprovalInput() }),
      });

    const view = await renderSwarmControl();
    const rejectButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Rechazar')
    );

    expect(rejectButton).not.toBeNull();
    await click(rejectButton);

    expect(view.container.textContent).toContain(
      'La linkage durable cambió: workspace_id ya no coincide.'
    );
    expect(rejectButton.disabled).toBe(false);
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      '/api/agenthub/operations/health?project_id=project-1',
      { cache: 'no-store' }
    );
  });
});
