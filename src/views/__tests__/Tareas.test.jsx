const React = require('react');
const {
  installDom,
  renderIntoDom,
  cleanupMountedRoots,
  flushEffects,
  click,
} = require('@/test-support/domHarness');

const mockUseOutletContext = jest.fn();
const mockNavigate = jest.fn();

jest.mock(
  'react-router-dom',
  () => ({
    useOutletContext: () => mockUseOutletContext(),
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);

jest.mock('../../components/TaskComments', () => () => {
  const React = require('react');
  return React.createElement('div', null, 'Task comments');
});

jest.mock('../../components/PresenceAvatars', () => () => {
  const React = require('react');
  return React.createElement('div', null, 'Presence avatars');
});

jest.mock('react-select', () => {
  const React = require('react');
  return function MockReactSelect() {
    return React.createElement('div', { 'data-testid': 'mock-react-select' }, 'React Select');
  };
});

jest.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value = '', onChange = () => {} }) => {
    const React = require('react');
    return React.createElement('input', {
      'aria-label': 'Fecha límite',
      value,
      onChange,
    });
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/docopsPrompts', () => ({
  buildDocOpsTaskPrompt: jest.fn(() => 'prompt'),
  enforceDocOpsGateOnLaunchCommand: jest.fn((command) => command),
  shellQuotePrompt: jest.fn((value) => value),
}));

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy(
    {},
    {
      get: (_, key) => icon(String(key)),
    }
  );
});

const tasksFixture = [
  {
    id: 'task-1',
    title: 'Implementar shell brutalista',
    description: 'Migrar chrome del tablero de tareas',
    priority: 'high',
    status: 'pending',
    due_date: '2026-05-30T00:00:00.000Z',
    milestone_id: 'milestone-1',
    business_value: 8,
    user_id: 'user-1',
    assigned_to: 'user-1',
    created_at: '2026-05-27T09:00:00.000Z',
  },
  {
    id: 'task-2',
    title: 'Cerrar deuda visual del modal',
    description: 'Aplicar morfología brutalista al modal',
    priority: 'medium',
    status: 'completed',
    due_date: null,
    milestone_id: null,
    business_value: 5,
    user_id: 'user-1',
    assigned_to: null,
    created_at: '2026-05-26T09:00:00.000Z',
  },
];

const dependenciesFixture = [];

const milestonesFixture = [
  {
    id: 'milestone-1',
    title: 'Morphology pass',
    status: 'in_progress',
  },
];

function createMockDb() {
  return {
    from: jest.fn((table) => {
      if (table === 'tasks') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: tasksFixture })),
            })),
          })),
          update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { id: 'task-new' }, error: null })),
            })),
          })),
        };
      }

      if (table === 'task_dependencies') {
        return {
          select: jest.fn(() => Promise.resolve({ data: dependenciesFixture })),
          delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
          insert: jest.fn(() => Promise.resolve({ error: null })),
        };
      }

      if (table === 'milestones') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: milestonesFixture })),
          })),
        };
      }

      return {
        select: jest.fn(() => Promise.resolve({ data: [] })),
      };
    }),
    channel: jest.fn(() => {
      const channel = {
        on: jest.fn(() => channel),
        subscribe: jest.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: jest.fn(),
  };
}

const mockDb = createMockDb();

jest.mock('@/lib/db/localClient', () => ({
  createClient: () => mockDb,
}));

const mountedRoots = [];

const {
  default: Tareas,
  getTaskModalShellStyle,
  getToolbarToggleRailStyle,
  getFilterPillChromeStyle,
  getTaskCardChromeStyle,
  getMoveMenuChromeStyle,
  getQueueHeroStyle,
  getQueueRowStyle,
  getKanbanDetailPillStyle,
} = require('../Tareas');

async function flushAsyncWork(cycles = 3) {
  for (let index = 0; index < cycles; index += 1) {
    await flushEffects();
  }
}

describe('Tareas brutalist morphology chrome', () => {
  let dom;

  beforeEach(() => {
    dom = installDom('https://devhub.test/project/project-1/tareas');
    mockUseOutletContext.mockReturnValue({
      project: { id: 'project-1', name: 'DevHub', color: '#58A6FF' },
      user: { id: 'user-1' },
    });
    mockDb.from.mockClear();
    mockDb.channel.mockClear();
    mockDb.removeChannel.mockClear();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  test('routes remaining modal, toolbar, card, queue, menu, and detail chrome through shared morphology tokens', () => {
    const modalStyle = getTaskModalShellStyle();
    const toolbarStyle = getToolbarToggleRailStyle();
    const activeFilterStyle = getFilterPillChromeStyle({ active: true, accent: '#58A6FF' });
    const idleFilterStyle = getFilterPillChromeStyle({ active: false, accent: '#3FB950' });
    const taskCardStyle = getTaskCardChromeStyle({ blocked: false, accent: '#FFA657' });
    const moveMenuStyle = getMoveMenuChromeStyle();
    const queueHeroStyle = getQueueHeroStyle();
    const queueRowStyle = getQueueRowStyle({ accent: '#58A6FF' });
    const detailPillStyle = getKanbanDetailPillStyle({ accent: '#58A6FF' });

    expect(modalStyle.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(modalStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(toolbarStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(activeFilterStyle.background).toContain('#58A6FF');
    expect(idleFilterStyle.background).toContain('var(--chrome-control-fill)');
    expect(taskCardStyle.boxShadow).toContain('var(--chrome-shadow-panel)');
    expect(taskCardStyle.borderColor).toContain('var(--chrome-border-color)');
    expect(moveMenuStyle.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(queueHeroStyle.boxShadow).toContain('var(--chrome-shadow-panel)');
    expect(queueRowStyle.borderColor).toContain('var(--chrome-border-color)');
    expect(detailPillStyle.borderWidth).toBe('var(--chrome-border-width)');

    const serialized = JSON.stringify({
      modalStyle,
      toolbarStyle,
      activeFilterStyle,
      idleFilterStyle,
      taskCardStyle,
      moveMenuStyle,
      queueHeroStyle,
      queueRowStyle,
      detailPillStyle,
    });

    expect(serialized).not.toContain('#0d1117');
    expect(serialized).not.toContain('#161b26');
  });

  test('keeps modal and agent queue behavior stable while applying brutalist chrome to live surfaces', async () => {
    const view = await renderIntoDom(React.createElement(Tareas), mountedRoots);
    await flushAsyncWork();

    const filterBar = view.container.querySelector('[data-testid="tareas-filter-bar"]');
    const taskCard = view.container.querySelector('[data-testid="task-card-task-1"]');
    const moveMenu = view.container.querySelector('[data-testid="task-move-menu-task-1"]');

    expect(filterBar).not.toBeNull();
    expect(filterBar.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
    expect(taskCard).not.toBeNull();
    expect(taskCard.textContent).toContain('Implementar shell brutalista');
    expect(taskCard.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
    expect(moveMenu).not.toBeNull();
    expect(moveMenu.getAttribute('style')).toContain('var(--chrome-shadow-panel)');

    await click(taskCard);

    const modalShell = view.container.querySelector('[data-testid="task-modal-shell"]');
    expect(modalShell).not.toBeNull();
    expect(modalShell.textContent).toContain('Editar Tarea');
    expect(modalShell.getAttribute('style')).toContain('var(--chrome-shadow-panel)');

    const agentViewButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Cola Agente')
    );
    expect(agentViewButton).not.toBeNull();

    await click(agentViewButton);

    const queueHero = view.container.querySelector('[data-testid="agent-queue-hero"]');
    const queueRow = view.container.querySelector('[data-testid="agent-queue-row-task-1"]');

    expect(queueHero).not.toBeNull();
    expect(queueHero.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
    expect(queueRow).not.toBeNull();
    expect(queueRow.textContent).toContain('Implementar shell brutalista');
    expect(queueRow.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
  });
});
