const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockUsePathname = jest.fn(() => '/settings/appearance');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('next/link', () => {
  const React = require('react');
  return ({ children, ...props }) => React.createElement('a', props, children);
});

jest.mock(
  'react-router-dom',
  () => ({
    useOutletContext: () => ({ project: { id: 'p1', name: 'E-commerce V2' } }),
    useNavigate: () => jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  'sonner',
  () => ({
    toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() }),
  }),
  { virtual: true }
);

jest.mock('../../../../components/MetricCard', () => {
  const React = require('react');
  return function MetricCard() {
    return React.createElement('div', { 'data-testid': 'metric-card' });
  };
});

jest.mock('../../../../components/HistorialCommits', () => {
  const React = require('react');
  return function HistorialCommits() {
    return React.createElement('div', { 'data-testid': 'historial-commits' });
  };
});

jest.mock('../../../../components/UltimasInteracciones', () => {
  const React = require('react');
  return function UltimasInteracciones() {
    return React.createElement('div', { 'data-testid': 'ultimas-interacciones' });
  };
});

jest.mock('../../../../components/AgentActivityFeed', () => {
  const React = require('react');
  return function AgentActivityFeed() {
    return React.createElement('div', { 'data-testid': 'agent-activity-feed' });
  };
});

jest.mock('../../../../components/UsageChart', () => {
  const React = require('react');
  return function UsageChart() {
    return React.createElement('div', { 'data-testid': 'usage-chart' });
  };
});

const SettingsLayout = require('../../../../app/settings/layout').default;
const Dashboard = require('../../../../views/Dashboard').default;
const Proyectos = require('../../../../views/Proyectos').default;

jest.mock('@/lib/db/localClient', () => {
  const chain = () => {
    const value = { data: [], error: null };
    const fn = () => chain();
    fn.eq = () => chain();
    fn.neq = () => chain();
    fn.lt = () => chain();
    fn.gt = () => chain();
    fn.in = () => chain();
    fn.order = () => chain();
    fn.single = () => Promise.resolve(value);
    fn.then = (resolve) => Promise.resolve(value).then(resolve);
    Object.assign(fn, value);
    return fn;
  };
  return {
    createClient: () => ({
      from: () => ({
        select: () => chain(),
        update: () => chain(),
        insert: () => chain(),
        upsert: () => chain(),
        delete: () => chain(),
      }),
    }),
  };
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/settings/appearance',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  await flushEffects();
  return { container, root };
}

describe('Settings layout — UiShell migration', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockUsePathname.mockReturnValue('/settings/appearance');
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders UiHeader with the per-route title and a ui-header testid', async () => {
    rendered = await renderIntoDom(
      React.createElement(
        SettingsLayout,
        null,
        React.createElement('div', { 'data-testid': 'child-content' }, 'content')
      )
    );

    expect(rendered.container.querySelector('[data-testid="child-content"]')).toBeTruthy();
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();

    // The header exposes a <h1> title derived from the active pathname.
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(/appearance/i);
  });

  test('derives a different title for the Account subroute', async () => {
    mockUsePathname.mockReturnValue('/settings/account');
    rendered = await renderIntoDom(
      React.createElement(
        SettingsLayout,
        null,
        React.createElement('div', { 'data-testid': 'child-content' }, 'content')
      )
    );
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(/account/i);
  });
});

describe('Dashboard — UiShell migration', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, kpis: {} }) })
    );
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('renders UiHeader with data-testid="ui-header"', async () => {
    rendered = await renderIntoDom(React.createElement(Dashboard));
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
  });
});

describe('Proyectos — UiShell + hex sweep', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders UiHeader with data-testid="ui-header"', async () => {
    rendered = await renderIntoDom(React.createElement(Proyectos));
    const uiHeader = rendered.container.querySelector('[data-testid="ui-header"]');
    expect(uiHeader).toBeTruthy();
    const heading = uiHeader.querySelector('h1');
    expect(heading).toBeTruthy();
  });

  test('no banned hex literals in Proyectos.jsx', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../views/Proyectos.jsx'), 'utf8');
    const matches = src.match(/#[0-9a-fA-F]{6}/g) || [];
    const banned = ['#0B0F19', '#111827', '#79C0FF', '#388BFD', '#484F58'];
    for (const h of banned) {
      expect(matches).not.toContain(h);
    }
  });
});
