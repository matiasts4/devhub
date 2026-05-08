const React = require('react');
const { JSDOM } = require('jsdom');

let createRoot;
let flushSync;

let mockTasks = [];

const mockCreateClient = jest.fn(() => ({
  from: () => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    neq() {
      return this;
    },
    not() {
      return this;
    },
    lte() {
      return this;
    },
    order() {
      return Promise.resolve({ data: mockTasks });
    },
  }),
}));

jest.mock('@/lib/db/localClient', () => ({
  createClient: (...args) => mockCreateClient(...args),
}));

jest.mock(
  'react-router-dom',
  () => {
    const React = require('react');
    return {
      Link: ({ to, children, ...props }) =>
        React.createElement('a', { href: to, ...props }, children),
    };
  },
  { virtual: true }
);

const NotificationCenter = require('../../src/components/NotificationCenter').default;
const MCPStatusPanel = require('../../src/components/chat/MCPStatusPanel').default;
const HealthCenter = require('../../src/components/HealthCenter').default;
const { persistOperationalEvent } = require('../../src/lib/operations/events');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;

  return dom;
}

const mountedRoots = [];

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  flushSync(() => {
    root.render(element);
  });
  await flushEffects();

  return { container, root };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

describe('operational feedback component behavior', () => {
  let dom;
  const originalFetch = global.fetch;

  beforeEach(() => {
    dom = installDom();
    ({ createRoot } = require('react-dom/client'));
    ({ flushSync } = require('react-dom'));
    mockTasks = [];
    mockCreateClient.mockClear();
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: null, sources: [] }),
    });
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      try {
        flushSync(() => {
          root.unmount();
        });
      } catch {}
      container.remove();
    }

    global.fetch = originalFetch;
    dom.window.close();
    jest.clearAllMocks();
  });

  test('keeps deadlines separate while refreshing one deduped operational alert in-app', async () => {
    const dueSoon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockTasks = [{ id: 'task-1', title: 'Urgent deadline', due_date: dueSoon, status: 'pending' }];

    persistOperationalEvent({
      id: 'evt-old',
      dedupe_key: 'agenthub:subagent.failed:session-1',
      occurred_at: '2026-04-10T17:00:00.000Z',
      title: 'Older failure',
      status: 'fallback',
      metadata: { project_id: 'project-1' },
    });

    const view = await renderIntoDom(
      React.createElement(NotificationCenter, { projectId: 'project-1' })
    );
    const bell = view.container.querySelector('[data-testid="notification-bell"]');

    await click(bell);
    expect(view.container.textContent).toContain('Urgent deadline');
    expect(view.container.textContent).toContain('Older failure');

    persistOperationalEvent(
      {
        id: 'evt-new',
        dedupe_key: 'agenthub:subagent.failed:session-1',
        occurred_at: '2026-04-10T17:05:00.000Z',
        title: 'Newest failure',
        status: 'fallback',
        metadata: { project_id: 'project-1' },
      },
      { dispatch: true }
    );

    await flushEffects();

    const badge = bell.lastElementChild;
    expect(badge.textContent).toBe('2');
    expect(view.container.textContent).toContain('Deadlines < 24h');
    expect(view.container.textContent).toContain('Alertas operacionales');
    expect(view.container.textContent).toContain('Urgent deadline');
    expect(view.container.textContent).toContain('Newest failure');
    expect(view.container.textContent).not.toContain('Older failure');
  });

  test('renders the health center fallback empty state in the primary operational surface', async () => {
    const view = await renderIntoDom(React.createElement(HealthCenter, { sources: [] }));

    expect(view.container.textContent).toContain('Estado operacional');
    expect(view.container.textContent).toContain('0 fuentes canónicas');
    expect(view.container.textContent).toContain('Sin datos operacionales disponibles.');
  });

  test('reveals MCP status reason and tool details through real expand interaction', async () => {
    const view = await renderIntoDom(
      React.createElement(MCPStatusPanel, {
        collapsed: false,
        servers: [
          {
            name: 'filesystem',
            status: 'connected',
            authority: 'inferred',
            freshness_ms: 600000,
            status_reason: 'OpenCode does not expose live MCP telemetry.',
            tools: [{ name: 'read_file', description: 'Read files' }],
          },
        ],
      })
    );

    expect(view.container.textContent).toContain('Inferido');
    expect(view.container.textContent).toContain('10m');
    expect(view.container.textContent).toContain('OpenCode does not expose live MCP telemetry.');

    const serverButtons = view.container.querySelectorAll('button');
    await click(serverButtons[2]);

    expect(view.container.textContent).toContain('read_file');
    expect(view.container.textContent).toContain('Read files');
  });
});
