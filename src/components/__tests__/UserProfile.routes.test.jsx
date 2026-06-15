const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ projectId: 'proj-42' }),
}));

jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
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

async function renderComponent(Component) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(React.createElement(Component)));
  await flushEffects();
  return { container, root };
}

function findByText(container, text) {
  const elements = Array.from(container.querySelectorAll('*'));
  return elements.find((el) => el.textContent === text) || null;
}

describe('UserProfile — account settings navigation', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockNavigate.mockClear();
    const { useAuth } = require('@/lib/auth/AuthContext');
    useAuth.mockReturnValue({
      user: { email: 'dev@example.com' },
      workspaces: [{ id: 'ws-1', name: 'Local' }],
      activeWorkspaceId: 'ws-1',
      setActiveWorkspaceId: jest.fn(),
      signOut: jest.fn(),
    });
  });

  afterEach(async () => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    // Remove any portal content left in body
    document.body.innerHTML = '';
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

  test('navigates to the project-scoped account settings page', async () => {
    const UserProfile = require('../UserProfile').default;

    rendered = await renderComponent(UserProfile);

    // Open the profile dropdown
    const trigger = rendered.container.querySelector('[aria-label="User profile menu"]');
    expect(trigger).toBeTruthy();
    trigger.click();
    await flushEffects();

    const accountButton = findByText(document.body, 'Ajustes de Cuenta');
    expect(accountButton).toBeTruthy();
    accountButton.click();
    await flushEffects();

    expect(mockNavigate).toHaveBeenCalledWith('/project/proj-42/ajustes');
  });
});
