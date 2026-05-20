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
  element.checked = checked;
  element.dispatchEvent(new window.Event('click', { bubbles: true }));
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flushEffects();
}

async function submitForm(element) {
  element.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flushEffects();
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
      'Aprobaciones pendientes y faltantes explícitos de evidencia. Sin controles de mutación.'
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

  test('renders the mission panel before local controls and keeps mission-first ordering across stack mode', async () => {
    const view = await renderSwarmControl({ snapshotInput: buildControlRoomInput() });
    const missionPanel = view.container.querySelector('[aria-label="Kernel de misión"]');
    const stackButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Pila')
    );
    const fullTextBeforeToggle = view.container.textContent || '';
    const missionTextBeforeToggle = missionPanel?.textContent || '';

    expect(fullTextBeforeToggle.indexOf('Kernel de misión')).toBeLessThan(
      fullTextBeforeToggle.indexOf('Filtrar registros')
    );
    expect(missionTextBeforeToggle.indexOf('Misión activa')).toBeLessThan(
      missionTextBeforeToggle.indexOf('Mensajes recientes')
    );
    expect(missionTextBeforeToggle.indexOf('Mensajes recientes')).toBeLessThan(
      missionTextBeforeToggle.indexOf('Entregas pendientes')
    );
    expect(missionTextBeforeToggle.indexOf('Entregas pendientes')).toBeLessThan(
      missionTextBeforeToggle.indexOf('Presencia TTL')
    );
    expect(missionTextBeforeToggle.indexOf('Presencia TTL')).toBeLessThan(
      missionTextBeforeToggle.indexOf('Participantes')
    );

    await click(stackButton);

    const fullTextAfterToggle = view.container.textContent || '';
    const missionTextAfterToggle =
      view.container.querySelector('[aria-label="Kernel de misión"]')?.textContent || '';

    expect(stackButton?.getAttribute('aria-pressed')).toBe('true');
    expect(fullTextAfterToggle.indexOf('Kernel de misión')).toBeLessThan(
      fullTextAfterToggle.indexOf('Filtrar registros')
    );
    expect(missionTextAfterToggle.indexOf('Misión activa')).toBeLessThan(
      missionTextAfterToggle.indexOf('Mensajes recientes')
    );
    expect(missionTextAfterToggle.indexOf('Mensajes recientes')).toBeLessThan(
      missionTextAfterToggle.indexOf('Entregas pendientes')
    );
    expect(missionTextAfterToggle.indexOf('Entregas pendientes')).toBeLessThan(
      missionTextAfterToggle.indexOf('Presencia TTL')
    );
  });

  test('keeps secondary panels visible when mission snapshot is empty', async () => {
    const input = buildControlRoomInput({ mission_control: null });
    const view = await renderSwarmControl({ snapshotInput: input });
    const fullText = view.container.textContent || '';

    expect(fullText.indexOf('Kernel de misión')).toBeLessThan(
      fullText.indexOf('Filtrar registros')
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
});
