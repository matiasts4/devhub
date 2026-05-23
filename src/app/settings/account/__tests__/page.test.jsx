const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockDb = {
  from: jest.fn(() => mockDb),
  select: jest.fn(() => mockDb),
  single: jest.fn(() =>
    Promise.resolve({
      data: { id: 'local-user', full_name: 'Test User', email: 'test@devhub.test' },
    })
  ),
  upsert: jest.fn(() => Promise.resolve({ error: null })),
};

jest.mock('@/lib/db/localClient', () => ({
  createClient: jest.fn(() => mockDb),
}));

const AccountPage = require('../page').default;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/settings/account',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;

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

describe('Settings account page canonical surface', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
  });

  test('renders UiHeader with Account title', async () => {
    rendered = await renderIntoDom(React.createElement(AccountPage));
    expect(rendered.container.textContent).toContain('Account');
  });

  test('renders legacy ProfileSection with user profile data', async () => {
    rendered = await renderIntoDom(React.createElement(AccountPage));
    expect(rendered.container.textContent).toContain('Perfil de Usuario');
    expect(rendered.container.textContent).toContain('Test User');
  });

  test('creates db client and passes it to ProfileSection', async () => {
    rendered = await renderIntoDom(React.createElement(AccountPage));
    await flushEffects();
    expect(mockDb.from).toHaveBeenCalledWith('profiles');
  });
});
