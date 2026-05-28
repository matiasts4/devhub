const React = require('react');
const {
  installDom,
  renderIntoDom,
  cleanupMountedRoots,
  flushEffects,
} = require('@/test-support/domHarness');

const mockUseOutletContext = jest.fn();
const mockNavigate = jest.fn();
const mockFrom = jest.fn();

jest.mock(
  'react-router-dom',
  () => ({
    useOutletContext: () => mockUseOutletContext(),
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);

jest.mock('@/lib/db/localClient', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

const ProjectDashboard = require('../ProjectDashboard').default;

const mountedRoots = [];

function setDashboardRows({ tasks = [], milestones = [] } = {}) {
  mockFrom.mockImplementation((table) => {
    if (table === 'tasks') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: tasks })),
        })),
      };
    }

    if (table === 'milestones') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ data: milestones })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

async function renderDashboard({ tasks = [], milestones = [] } = {}) {
  setDashboardRows({ tasks, milestones });

  mockUseOutletContext.mockReturnValue({
    project: {
      id: 'project-1',
      name: 'DevHub',
      color: '#58A6FF',
      created_at: '2026-05-01T00:00:00.000Z',
    },
  });

  const view = await renderIntoDom(React.createElement(ProjectDashboard), mountedRoots);
  await flushEffects();
  await flushEffects();

  return view;
}

function expectHeadingInsideChromePanel(container, label) {
  const heading = Array.from(container.querySelectorAll('h3')).find(
    (element) => element.textContent === label
  );

  expect(heading).toBeTruthy();
  expect(heading.closest('[data-chrome-surface="panel"]')).not.toBeNull();
}

describe('ProjectDashboard morphology chrome', () => {
  let dom;

  beforeEach(() => {
    dom = installDom('https://devhub.test/project/1/dashboard');
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  test('renders summary, milestone, prediction, and task chrome through shared panel and pill primitives', async () => {
    const view = await renderDashboard({
      tasks: [
        {
          id: 'task-1',
          title: 'Tokenize shared shells',
          status: 'completed',
          priority: 'high',
          due_date: '2026-05-31T00:00:00.000Z',
          created_at: '2026-05-02T00:00:00.000Z',
        },
        {
          id: 'task-2',
          title: 'Restyle dashboard chrome',
          status: 'in_progress',
          priority: 'critical',
          due_date: '2026-06-02T00:00:00.000Z',
          created_at: '2026-05-05T00:00:00.000Z',
        },
      ],
      milestones: [
        {
          id: 'ms-1',
          title: 'Brutalist preview parity',
          description: 'Push the dashboard closer to the stage preview.',
          status: 'in_progress',
          due_date: '2026-06-05T00:00:00.000Z',
        },
      ],
    });

    expectHeadingInsideChromePanel(view.container, 'Resumen del Proyecto');
    expectHeadingInsideChromePanel(view.container, 'Próximo Hito');
    expectHeadingInsideChromePanel(view.container, 'Fecha Estimada de Entrega');
    expectHeadingInsideChromePanel(view.container, 'Próximas Tareas');

    expect(view.container.querySelectorAll('[data-chrome-surface="panel"]').length).toBeGreaterThanOrEqual(
      7
    );

    const aiPill = Array.from(view.container.querySelectorAll('[data-chrome-surface="pill"]')).find(
      (element) => element.textContent.includes('IA')
    );
    const priorityPill = Array.from(
      view.container.querySelectorAll('[data-chrome-surface="pill"]')
    ).find((element) => element.textContent.includes('critical'));

    expect(aiPill).toBeTruthy();
    expect(priorityPill).toBeTruthy();
  });

  test('keeps empty-state milestone and prediction paths inside the same shared chrome surfaces', async () => {
    const view = await renderDashboard({
      tasks: [
        {
          id: 'task-3',
          title: 'Future dashboard pass',
          status: 'pending',
          priority: 'medium',
          due_date: null,
          created_at: '2026-05-20T00:00:00.000Z',
        },
      ],
      milestones: [
        {
          id: 'ms-2',
          title: 'Done',
          status: 'completed',
          due_date: '2026-05-10T00:00:00.000Z',
        },
      ],
    });

    expect(view.container.textContent).toContain('¡Todos los hitos completados!');
    expect(view.container.textContent).toContain(
      'No hay suficientes datos de tareas completadas para calcular una predicción precisa.'
    );
    expect(view.container.textContent).toContain('No hay tareas con fecha límite próximas.');

    expectHeadingInsideChromePanel(view.container, 'Próximo Hito');
    expectHeadingInsideChromePanel(view.container, 'Fecha Estimada de Entrega');
    expectHeadingInsideChromePanel(view.container, 'Próximas Tareas');
  });
});
