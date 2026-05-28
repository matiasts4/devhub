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
  },
  THEME_OPTIONS: [
    { id: 'deep-sea', label: 'Deep Sea', description: 'desc', accent: '#58A6FF' },
    { id: 'light', label: 'Light', description: 'desc', accent: '#0969DA' },
  ],
  MORPHOLOGY_OPTIONS: [
    { id: 'default', label: 'Default', description: 'base chrome' },
    { id: 'brutalist-stage', label: 'Brutalist Stage', description: 'brutalist chrome' },
  ],
  getStoredTheme: jest.fn(() => 'deep-sea'),
  getStoredMorphology: jest.fn(() => 'default'),
  getStoredAccent: jest.fn(() => 'theme'),
  setTheme: jest.fn((value) => value),
  setMorphology: jest.fn((value) => value),
  setAccent: jest.fn((value) => value),
}));

const themeModule = require('@/lib/theme/themes');
const ajustesModule = require('../Ajustes');
const Ajustes = ajustesModule.default;

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
    Promise.resolve({ ok: true, json: async () => ({ max_concurrent_swarms: 5, swarm_enabled: true }) })
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

describe('Ajustes appearance tab', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
    rendered = null;
    mockUseOutletContext.mockReturnValue({
      project: {
        id: 'project-1',
        name: 'DevHub',
        color: '#58A6FF',
        status: 'active',
      },
      user: { id: 'user-1' },
    });
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

  test('renders morphology options inside the legacy Ajustes appearance tab', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apariencia')
    );

    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(rendered.container.textContent).toContain('Morphology');
    expect(rendered.container.textContent).toContain('Brutalist Stage');
    expect(rendered.container.textContent).toContain('Default');
  });

  test('changing morphology in Ajustes does not call setTheme', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apariencia')
    );

    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const morphologyButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Brutalist Stage')
    );

    flushSync(() => {
      morphologyButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setMorphology).toHaveBeenCalledWith('brutalist-stage');
    expect(themeModule.setTheme).not.toHaveBeenCalledWith('brutalist-stage');
  });

  test('changing accent in Ajustes does not call setTheme', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apariencia')
    );

    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const accentButton = rendered.container.querySelector('[data-testid="ajustes-accent-option-amber"]');
    expect(accentButton).toBeTruthy();

    flushSync(() => {
      accentButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setAccent).toHaveBeenCalledWith('amber');
    expect(themeModule.setTheme).not.toHaveBeenCalledWith('amber');
  });

  test('routes Ajustes appearance chrome through shared morphology surfaces instead of legacy card shells', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apariencia')
    );

    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const appearanceShell = rendered.container.querySelector('[data-testid="ajustes-appearance-shell"]');
    const morphologyCard = rendered.container.querySelector(
      '[data-testid="ajustes-morphology-option-default"]'
    );

    expect(appearanceShell).toBeTruthy();
    const appearanceShellStyle = ajustesModule.getSettingsShellStyle({ emphasized: true });

    expect(appearanceShell.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
    expect(appearanceShellStyle.background).toContain('var(--chrome-panel-fill)');
    expect(appearanceShellStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(appearanceShellStyle.background).not.toContain('var(--surface-card)');

    expect(morphologyCard).toBeTruthy();
    expect(morphologyCard.getAttribute('style')).toContain('var(--chrome-shadow-panel)');

    const activeMorphologyStyle = ajustesModule.getSettingsShellStyle({ emphasized: true });
    expect(activeMorphologyStyle.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(activeMorphologyStyle.borderWidth).toBe('var(--chrome-border-width)');
  });
});
