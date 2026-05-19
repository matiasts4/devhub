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

jest.mock('@/lib/theme/themes', () => ({
  THEMES: {
    DEEP_SEA: 'deep-sea',
    NORD: 'nord',
    DRACULA: 'dracula',
    LIGHT: 'light',
  },
  THEME_OPTIONS: [
    { id: 'deep-sea', label: 'Deep Sea', description: 'desc' },
    { id: 'nord', label: 'Nord', description: 'desc' },
  ],
  getStoredTheme: jest.fn(() => 'deep-sea'),
  setTheme: jest.fn((value) => value),
  getStoredZoom: jest.fn(() => 1),
  setZoom: jest.fn((value) => value),
}));

const AppearancePage = require('../page').default;

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

describe('Settings appearance page terminal renderer', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
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

  test('shows terminal renderer preference in Settings with GTK VTE and xterm options only', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const select = rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]');
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value);

    expect(rendered.container.textContent).toContain('Terminal renderer');
    expect(options).toEqual(['vte-experimental', 'xterm']);
    expect(select.value).toBe('vte-experimental');
  });

  test('persists the renderer preference from Settings and migrates legacy Ghostty to xterm', async () => {
    window.localStorage.setItem('devhub_terminal_renderer_default_mode', 'ghostty-experimental');

    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const select = rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]');
    expect(select.value).toBe('xterm');

    flushSync(() => {
      select.value = 'vte-experimental';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(window.localStorage.getItem('devhub_terminal_renderer_default_mode')).toBe('vte-experimental');
  });
});
