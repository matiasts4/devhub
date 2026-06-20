// PR-1: terminal-renderer-default TRD-4 + TRD-5 — terminal sub-controls
// (renderer, typography, header style, accent bar, restore policies, zoom)
// MUST render in Ajustes Apariencia tab when
// `localStorage['devhub:terminal-settings-in-ajustes'] === 'true'`.
//
// This test asserts the flag-ON path. Each sub-control is identified by
// the data-testid attributes the spec defines.
//
// Test layer: component (jsdom + react testing library-style direct DOM).
// We render Ajustes with the flag set, navigate to Apariencia, and assert
// every expected data-testid is in the DOM.

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

jest.mock('sileo', () => ({
  sileo: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    promise: jest.fn((promise) => promise),
    dismiss: jest.fn(),
    clear: jest.fn(),
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
  const icon = (name) => (props) =>
    React.createElement('svg', { ...props, 'data-icon': name });
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
  THEMES: { DEEP_SEA: 'deep-sea', LIGHT: 'light' },
  MORPHOLOGIES: { DEFAULT: 'default', BRUTALIST_STAGE: 'brutalist-stage' },
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
  // TRD-5 terminal sub-control surface (rendered when flag is on)
  getStoredZoom: jest.fn(() => 1),
  setZoom: jest.fn((z) => z),
  TERMINAL_HEADER_STYLES: {
    DRAGON: 'dragon',
    MINIMAL: 'minimal',
    GRADIENT: 'gradient',
    PLAIN: 'plain',
  },
  getStoredTerminalHeaderStyle: jest.fn(() => 'dragon'),
  setTerminalHeaderStyle: jest.fn((v) => v),
  getTerminalHeaderStyleOptions: jest.fn(() => [
    { id: 'dragon', label: 'Dragon', description: 'gradient + accent bar' },
    { id: 'minimal', label: 'Minimal', description: 'flat solid' },
    { id: 'gradient', label: 'Gradient', description: 'gradient only' },
    { id: 'plain', label: 'Plain', description: 'flat solid, no decoration' },
  ]),
  getStoredTerminalAccentBarVisible: jest.fn(() => true),
  setStoredTerminalAccentBarVisible: jest.fn((v) => v),
}));

jest.mock('@/components/terminal/terminalRendererPreferences', () => ({
  readTerminalRendererDefaultModeSetting: jest.fn(() => 'xterm-webgl'),
  writeTerminalRendererDefaultModeSetting: jest.fn(),
}));

jest.mock('@/components/terminal/terminalTypographyPreferences', () => {
  const typography = {
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    fontWeight: 400,
    fontWeightBold: 700,
    lineHeight: 1.4,
    letterSpacing: 0,
  };
  return {
    TERMINAL_FONT_FAMILY_PRESETS: [
      { id: 'kali', label: 'Kali Linux', value: 'monospace' },
      { id: 'jetbrains', label: 'JetBrains Mono', value: 'JetBrains Mono' },
    ],
    findPresetByValue: jest.fn((v) => ({ id: 'jetbrains', value: 'JetBrains Mono' })),
    resolveTerminalTypography: jest.fn(() => typography),
    getStoredTerminalTypography: jest.fn(() => typography),
    setTerminalTypography: jest.fn((_ls, partial) => ({ ...typography, ...partial })),
    resetTerminalTypography: jest.fn(() => typography),
    applyTerminalTypographyToDocument: jest.fn(),
  };
});

jest.mock('@/lib/terminal/restorePreferences', () => ({
  RESTORE_POLICY: { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' },
  readTerminalRestorePreferences: jest.fn(() => ({
    opencode: 'auto',
    generic: 'auto',
    swarm: 'auto',
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));

const Ajustes = require('../Ajustes').default;

function installDom({ flagOn = false } = {}) {
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

  if (flagOn) {
    window.localStorage.setItem('devhub:terminal-settings-in-ajustes', 'true');
  } else {
    window.localStorage.removeItem('devhub:terminal-settings-in-ajustes');
  }

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

async function goToApariencia(container) {
  const tab = findButton(container, (b) => /apariencia|appearance/i.test(b.textContent || ''));
  expect(tab).toBeTruthy();
  flushSync(() => {
    tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

describe('Ajustes Apariencia — terminal sub-section (flag ON, TRD-5)', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom({ flagOn: true });
    rendered = null;
    mockUseOutletContext.mockReturnValue({
      project: { id: 'project-1', name: 'DevHub', color: '#58A6FF', status: 'active' },
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

  test('renders all six terminal sub-controls under Apariencia when flag is true', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));
    await goToApariencia(rendered.container);

    // 1. Renderer mode (TRD-4)
    expect(
      rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]')
    ).toBeTruthy();

    // 2. Typography (TRD-5)
    // family select exists somewhere on the page
    const fontSelects = rendered.container.querySelectorAll('select');
    expect(fontSelects.length).toBeGreaterThan(0);

    // 3. Header style cards
    expect(
      rendered.container.querySelector('[data-testid="terminal-header-style-dragon"]')
    ).toBeTruthy();
    expect(
      rendered.container.querySelector('[data-testid="terminal-header-style-plain"]')
    ).toBeTruthy();

    // 4. Accent bar toggle
    expect(
      rendered.container.querySelector('[data-testid="terminal-accent-bar-toggle"]')
    ).toBeTruthy();

    // 5. Restore policies (opencode / generic / swarm)
    expect(
      rendered.container.querySelector('[data-testid="restore-policy-opencode"]')
    ).toBeTruthy();
    expect(
      rendered.container.querySelector('[data-testid="restore-policy-generic"]')
    ).toBeTruthy();
    expect(
      rendered.container.querySelector('[data-testid="restore-policy-swarm"]')
    ).toBeTruthy();

    // 6. Zoom (+/-) controls — buttons keyed by aria-label or data-testid
    // We accept any two buttons whose text is "+" and "-" inside the
    // zoom container.
    const zoomContainer = rendered.container.querySelector('[data-testid="settings-zoom"]');
    expect(zoomContainer).toBeTruthy();
    const zoomButtons = zoomContainer ? zoomContainer.querySelectorAll('button') : [];
    expect(zoomButtons.length).toBeGreaterThanOrEqual(3); // −, +, reset
  });
});
