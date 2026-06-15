const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

let mockLocation = { pathname: '/project/proj-42/dashboard' };
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const ReactLocal = require('react');
  return {
    __setLocation: (pathname) => {
      mockLocation = { pathname };
    },
    Link: ({
      to,
      children,
      style,
      className,
      'aria-current': ariaCurrent,
      'data-testid': testId,
    }) =>
      ReactLocal.createElement(
        'a',
        { href: to, 'data-testid': testId, style, className, 'aria-current': ariaCurrent },
        children
      ),
    useLocation: () => mockLocation,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: 'proj-42' }),
  };
});

jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/db/localClient', () => ({
  createClient: jest.fn(),
}));

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.SVGElement = dom.window.SVGElement;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.localStorage = dom.window.localStorage;
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderComponent(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(React.createElement(Component, props)));
  await flushEffects();
  return { container, root };
}

function buildMockDb() {
  const channel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  };
  return {
    channel: jest.fn().mockReturnValue(channel),
    removeChannel: jest.fn(),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }),
  };
}

describe('WorkspaceSidebar — settings route link', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockNavigate.mockClear();
    const { useAuth } = require('@/lib/auth/AuthContext');
    useAuth.mockReturnValue({ user: null });
    const { createClient } = require('@/lib/db/localClient');
    createClient.mockReturnValue(buildMockDb());
    const routerMock = require('react-router-dom');
    routerMock.__setLocation('/project/proj-42/dashboard');
  });

  afterEach(async () => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Element;
    delete global.SVGElement;
    delete global.Event;
    delete global.MouseEvent;
    delete global.localStorage;
    jest.clearAllMocks();
    dom.window.close();
  });

  const mockProject = {
    id: 'proj-42',
    name: 'Test Project',
    color: '#58A6FF',
    status: 'active',
    progress: 42,
    features: [],
    planning_status: 'completed',
  };

  test('points the Ajustes nav link to the canonical /ajustes route', async () => {
    const WorkspaceSidebar = require('../WorkspaceSidebar').default;

    rendered = await renderComponent(WorkspaceSidebar, {
      project: mockProject,
      collapsed: false,
      onToggleCollapse: jest.fn(),
    });

    const ajustesLink = rendered.container.querySelector('[data-testid="ws-nav-ajustes"]');
    expect(ajustesLink).toBeTruthy();
    expect(ajustesLink.getAttribute('href')).toBe('/project/proj-42/ajustes');
  });

  test('marks the Ajustes link active when the /ajustes route is current', async () => {
    const routerMock = require('react-router-dom');
    routerMock.__setLocation('/project/proj-42/ajustes');

    const WorkspaceSidebar = require('../WorkspaceSidebar').default;
    rendered = await renderComponent(WorkspaceSidebar, {
      project: mockProject,
      collapsed: false,
      onToggleCollapse: jest.fn(),
    });

    const ajustesLink = rendered.container.querySelector('[data-testid="ws-nav-ajustes"]');
    const dashboardLink = rendered.container.querySelector('[data-testid="ws-nav-dashboard"]');

    expect(ajustesLink).toBeTruthy();
    expect(ajustesLink.getAttribute('aria-current')).toBe('page');
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink.getAttribute('aria-current')).toBeNull();
  });
});
