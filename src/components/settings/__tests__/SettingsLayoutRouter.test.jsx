const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

let mockLocation = { pathname: '/project/proj-42/settings/appearance' };
let mockParams = { projectId: 'proj-42' };

jest.mock('react-router-dom', () => {
  const ReactLocal = require('react');
  return {
    __setLocation: (pathname) => {
      mockLocation = { pathname };
    },
    __setParams: (params) => {
      mockParams = params;
    },
    Link: ({ to, children, style, className, 'aria-current': ariaCurrent }) =>
      ReactLocal.createElement(
        'a',
        {
          href: to,
          'data-testid': `link-${to.replace(/\//g, '-')}`,
          style,
          className,
          'aria-current': ariaCurrent,
        },
        children
      ),
    Outlet: () =>
      ReactLocal.createElement('div', { 'data-testid': 'settings-outlet' }, 'Page Content'),
    useLocation: () => mockLocation,
    useParams: () => mockParams,
    Navigate: ({ to }) =>
      ReactLocal.createElement(
        'div',
        { 'data-testid': 'navigate', 'data-to': to },
        `Redirect to ${to}`
      ),
  };
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
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

function linkFor(container, path) {
  return container.querySelector(
    `[data-testid="link--project-${mockParams.projectId}-settings-${path.replace(/\//g, '-')}"]`
  );
}

describe('SettingsLayoutRouter', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    const routerMock = require('react-router-dom');
    routerMock.__setLocation('/project/proj-42/settings/appearance');
    routerMock.__setParams({ projectId: 'proj-42' });
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
    delete global.Event;
    delete global.MouseEvent;
    delete global.localStorage;
    jest.resetModules();
    dom.window.close();
  });

  test('renders project-scoped settings nav links and an outlet', async () => {
    const SettingsLayoutRouter = require('../SettingsLayoutRouter').default;

    rendered = await renderComponent(SettingsLayoutRouter);

    expect(linkFor(rendered.container, 'appearance')).toBeTruthy();
    expect(linkFor(rendered.container, 'account')).toBeTruthy();
    expect(linkFor(rendered.container, 'llm-providers')).toBeTruthy();
    expect(rendered.container.querySelector('[data-testid="settings-outlet"]')).toBeTruthy();

    expect(linkFor(rendered.container, 'appearance').getAttribute('href')).toBe(
      '/project/proj-42/settings/appearance'
    );
    expect(linkFor(rendered.container, 'account').getAttribute('href')).toBe(
      '/project/proj-42/settings/account'
    );
  });

  test('marks Appearance as current at /settings/appearance', async () => {
    const SettingsLayoutRouter = require('../SettingsLayoutRouter').default;

    rendered = await renderComponent(SettingsLayoutRouter);

    const appearanceLink = linkFor(rendered.container, 'appearance');
    expect(appearanceLink).toBeTruthy();
    expect(appearanceLink.getAttribute('aria-current')).toBe('page');
    expect(linkFor(rendered.container, 'account').getAttribute('aria-current')).toBeNull();
  });

  test('marks Account as current at /settings/account', async () => {
    const routerMock = require('react-router-dom');
    routerMock.__setLocation('/project/proj-42/settings/account');
    jest.resetModules();

    const SettingsLayoutRouter = require('../SettingsLayoutRouter').default;
    rendered = await renderComponent(SettingsLayoutRouter);

    const accountLink = linkFor(rendered.container, 'account');
    expect(accountLink).toBeTruthy();
    expect(accountLink.getAttribute('aria-current')).toBe('page');
    expect(linkFor(rendered.container, 'appearance').getAttribute('aria-current')).toBeNull();
  });

  test('marks only LLM Providers as current at /settings/llm-providers', async () => {
    const routerMock = require('react-router-dom');
    routerMock.__setLocation('/project/proj-42/settings/llm-providers');
    jest.resetModules();

    const SettingsLayoutRouter = require('../SettingsLayoutRouter').default;
    rendered = await renderComponent(SettingsLayoutRouter);

    expect(linkFor(rendered.container, 'llm-providers').getAttribute('aria-current')).toBe('page');
    expect(linkFor(rendered.container, 'appearance').getAttribute('aria-current')).toBeNull();
    expect(linkFor(rendered.container, 'account').getAttribute('aria-current')).toBeNull();
  });

  test('uses the route projectId in every settings link', async () => {
    const routerMock = require('react-router-dom');
    routerMock.__setParams({ projectId: 'other-proj' });

    const SettingsLayoutRouter = require('../SettingsLayoutRouter').default;
    rendered = await renderComponent(SettingsLayoutRouter);

    const llmLink = linkFor(rendered.container, 'llm-providers');
    expect(llmLink).toBeTruthy();
    expect(llmLink.getAttribute('href')).toBe('/project/other-proj/settings/llm-providers');
  });
});
