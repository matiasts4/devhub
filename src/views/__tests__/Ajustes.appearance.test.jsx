const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

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

jest.mock('@tauri-apps/plugin-dialog', () => ({
  open: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/db/localClient', () => ({
  createClient: () => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null })),
        eq: jest.fn(() => ({
          order: jest.fn(() => Promise.resolve({ data: [] })),
        })),
      })),
      update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
      delete: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
    })),
  }),
}));

jest.mock('@/components/settings/LLMProviderSettings', () => () => {
  const React = require('react');
  return React.createElement('div', null, 'LLM Settings');
});

jest.mock('react-select', () => () => null);
jest.mock('@/components/ui/date-picker', () => ({ DatePicker: () => null }));

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

jest.mock('@/lib/theme/themes', () => ({
  ACCENT_OPTIONS: [
    { id: 'theme', label: 'Theme sync', description: 'desc', primary: null },
    { id: 'amber', label: 'Signal Amber', description: 'desc', primary: '#E3B341' },
  ],
  THEMES: {
    DEEP_SEA: 'deep-sea',
    LIGHT: 'light',
  },
  MORPHOLOGIES: {
    DEFAULT: 'default',
    BRUTALIST_STAGE: 'brutalist-stage',
    CURSOR: 'cursor',
  },
  THEME_OPTIONS: [
    { id: 'deep-sea', label: 'Deep Sea', description: 'desc', accent: '#58A6FF' },
    { id: 'light', label: 'Light', description: 'desc', accent: '#0969DA' },
  ],
  MORPHOLOGY_OPTIONS: [
    { id: 'default', label: 'Default', description: 'base chrome' },
    { id: 'brutalist-stage', label: 'Brutalist Stage', description: 'brutalist chrome' },
    { id: 'cursor', label: 'Cursor', description: 'Warm amber Cursor-style chrome.' },
  ],
  getStoredTheme: jest.fn(() => 'deep-sea'),
  getStoredMorphology: jest.fn(() => 'default'),
  getStoredAccent: jest.fn(() => 'theme'),
  setTheme: jest.fn((value) => value),
  setMorphology: jest.fn((value) => value),
  setAccent: jest.fn((value) => value),
}));

const Ajustes = require('../Ajustes').default;
const themeModule = require('@/lib/theme/themes');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/ajustes',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.localStorage = dom.window.localStorage;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ max_concurrent_swarms: 5, swarm_enabled: true }),
    })
  );

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

function findButton(container, predicate) {
  return Array.from(container.querySelectorAll('button')).find(predicate);
}

describe('Ajustes appearance tab — interactive controls', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockUseOutletContext.mockReturnValue({
      project: { id: 'project-1', name: 'DevHub', color: '#58A6FF', status: 'active' },
      user: { id: 'user-1' },
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.fetch;
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders interactive accent and morphology controls', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    // The default tab is "project" — switch to the appearance tab first
    const appearanceTab = findButton(rendered.container, (button) =>
      /apariencia|appearance/i.test(button.textContent || '')
    );
    expect(appearanceTab).toBeTruthy();
    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(
      rendered.container.querySelector('[data-testid="ajustes-appearance-shell"]')
    ).toBeTruthy();
    expect(
      rendered.container.querySelector('[data-testid="ajustes-appearance-deprecation-banner"]')
    ).toBeNull();
    expect(
      rendered.container.querySelector('[data-testid="ajustes-accent-option-amber"]')
    ).toBeTruthy();
    expect(
      rendered.container.querySelector('[data-testid="ajustes-morphology-option-default"]')
    ).toBeTruthy();
  });

  test('renders the cursor morphology option and applies it when selected', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = findButton(rendered.container, (button) =>
      /apariencia|appearance/i.test(button.textContent || '')
    );
    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const cursorButton = rendered.container.querySelector(
      '[data-testid="ajustes-morphology-option-cursor"]'
    );

    expect(cursorButton).toBeTruthy();
    expect(cursorButton.textContent).toContain('Cursor');

    flushSync(() => {
      cursorButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setMorphology).toHaveBeenCalledWith('cursor');
  });
});
