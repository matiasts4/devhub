// PR-1: terminal sub-section is gated behind
// `localStorage['devhub:terminal-settings-in-ajustes'] === 'true'`.
// When the flag is absent/missing/false, the terminal sub-section MUST
// NOT render — Apariencia stays visually identical to today.
//
// This test renders Ajustes with the flag OFF (default) and asserts the
// six sub-control testids are absent from the DOM.

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

jest.mock('@/components/settings/LLMProviderSettings', () => {
  const mockReact = require('react');
  return () => mockReact.createElement('div', null, 'LLM Settings');
});

jest.mock('react-select', () => () => null);
jest.mock('@/components/ui/date-picker', () => ({ DatePicker: () => null }));

jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name) => (props) => React.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
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
  MOTION_MODES: {
    REDUCED: 'reduced',
    NORMAL: 'normal',
    AMPLIFIED: 'amplified',
  },
  getStoredTheme: jest.fn(() => 'deep-sea'),
  getStoredMorphology: jest.fn(() => 'default'),
  getStoredAccent: jest.fn(() => 'theme'),
  getStoredMotionMode: jest.fn(() => 'normal'),
  setTheme: jest.fn((v) => v),
  setMorphology: jest.fn((v) => v),
  setAccent: jest.fn((v) => v),
  setMotionMode: jest.fn((v) => v),
  // Terminal helpers are exported but should not be exercised when flag is off.
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
    { id: 'dragon', label: 'Dragon', description: 'd' },
    { id: 'plain', label: 'Plain', description: 'p' },
  ]),
  getStoredTerminalAccentBarVisible: jest.fn(() => true),
  setStoredTerminalAccentBarVisible: jest.fn((v) => v),
  getStoredAppearance: jest.fn(() => ({
    fontFamily: 'system-ui',
    fontScale: 1,
    density: 'default',
    zoom: 1,
  })),
  restoreAppearanceSnapshot: jest.fn(),
}));

jest.mock('@/components/terminal/terminalRendererPreferences', () => ({
  readTerminalRendererDefaultModeSetting: jest.fn(() => 'xterm-webgl'),
  writeTerminalRendererDefaultModeSetting: jest.fn(),
  getStoredTerminalAutoCopy: jest.fn(() => true),
  setStoredTerminalAutoCopy: jest.fn(),
}));

jest.mock('@/components/terminal/terminalTypographyPreferences', () => ({
  TERMINAL_FONT_FAMILY_PRESETS: [],
  findPresetByValue: jest.fn(() => null),
  resolveTerminalTypography: jest.fn(() => ({
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    fontWeight: 400,
    fontWeightBold: 700,
    lineHeight: 1.4,
    letterSpacing: 0,
  })),
  getStoredTerminalTypography: jest.fn(() => ({
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    fontWeight: 400,
    fontWeightBold: 700,
    lineHeight: 1.4,
    letterSpacing: 0,
  })),
  setTerminalTypography: jest.fn(),
  resetTerminalTypography: jest.fn(),
  applyTerminalTypographyToDocument: jest.fn(),
}));

jest.mock('@/lib/terminal/restorePreferences', () => ({
  RESTORE_POLICY: { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' },
  TERMINAL_RESTORE_KINDS: ['opencode', 'kimi', 'grok', 'codex', 'qoder', 'swarm', 'generic'],
  readTerminalRestorePreferences: jest.fn(() => ({
    opencode: 'auto',
    kimi: 'auto',
    grok: 'auto',
    codex: 'auto',
    qoder: 'auto',
    generic: 'auto',
    swarm: 'auto',
    restoreOnReboot: true,
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));

const Ajustes = require('../Ajustes').default;

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

  // No flag set
  window.localStorage.removeItem('devhub:terminal-settings-in-ajustes');
  return dom;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
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

describe('Ajustes Apariencia — terminal sub-section (flag OFF, default)', () => {
  let dom;
  let rendered;

  beforeEach(() => {
    dom = installDom();
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

  test('no terminal sub-section renders when flag is absent', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));
    await goToApariencia(rendered.container);

    // None of the 6 sub-control testids should be present.
    expect(
      rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]')
    ).toBeNull();
    expect(
      rendered.container.querySelector('[data-testid="terminal-header-style-dragon"]')
    ).toBeNull();
    expect(
      rendered.container.querySelector('[data-testid="terminal-accent-bar-toggle"]')
    ).toBeNull();
    expect(rendered.container.querySelector('[data-testid="restore-policy-opencode"]')).toBeNull();
    expect(rendered.container.querySelector('[data-testid="settings-zoom"]')).toBeNull();
  });
});
