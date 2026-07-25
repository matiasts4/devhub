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
    { id: 'theme', label: 'Theme sync', desc: 'desc', primary: null },
    { id: 'amber', label: 'Signal Amber', desc: 'desc', primary: '#E3B341' },
  ],
  THEMES: {
    DEEP_SEA: 'deep-sea',
    LIGHT: 'light',
    OPENCODE: 'opencode',
  },
  MORPHOLOGIES: {
    DEFAULT: 'default',
    BRUTALIST_STAGE: 'brutalist-stage',
    CURSOR: 'cursor',
    OPENCODE_DESKTOP: 'opencode-desktop',
  },
  MOTION_MODES: {
    REDUCED: 'reduced',
    NORMAL: 'normal',
    AMPLIFIED: 'amplified',
  },
  OPENCODE_DESKTOP_PRESET: {
    theme: 'opencode',
    morphology: 'opencode-desktop',
    density: 'compact',
  },
  THEME_OPTIONS: [
    { id: 'deep-sea', label: 'Deep Sea', desc: 'desc', accent: '#58A6FF' },
    { id: 'light', label: 'Light', desc: 'desc', accent: '#0969DA' },
    { id: 'opencode', label: 'OpenCode Desktop', desc: 'desc', accent: '#9dbefe' },
  ],
  MORPHOLOGY_OPTIONS: [
    { id: 'default', label: 'Default', desc: 'base chrome' },
    { id: 'brutalist-stage', label: 'Brutalist Stage', desc: 'brutalist chrome' },
    { id: 'cursor', label: 'Cursor', desc: 'Warm amber Cursor-style chrome.' },
    { id: 'opencode-desktop', label: 'OpenCode Desktop', desc: 'Quiet rounded chrome.' },
  ],
  getStoredTheme: jest.fn(() => 'deep-sea'),
  getStoredMorphology: jest.fn(() => 'default'),
  getStoredAccent: jest.fn(() => 'theme'),
  getStoredMotionMode: jest.fn(() => 'normal'),
  getStoredAppearance: jest.fn(() => ({
    fontFamily: 'Inter',
    fontScale: 1,
    density: 'comfortable',
    zoom: 1,
  })),
  setTheme: jest.fn((val) => val),
  setMorphology: jest.fn((val) => val),
  setAccent: jest.fn((val) => val),
  setMotionMode: jest.fn((val) => val),
  setDensity: jest.fn((val) => (val === 'compact' || val === 'comfortable' ? val : 'comfortable')),
  applyOpenCodeDesktopPreset: jest.fn(() => ({
    theme: 'deep-sea',
    morphology: 'default',
    appearance: {
      fontFamily: 'Inter',
      fontScale: 1,
      density: 'comfortable',
      zoom: 1,
    },
  })),
  restoreAppearanceSnapshot: jest.fn(),
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
  global.CustomEvent = dom.window.CustomEvent;
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
  test('renders the motion mode section and persists changes', async () => {
    rendered = await renderIntoDom(React.createElement(Ajustes));

    const appearanceTab = findButton(rendered.container, (button) =>
      /apariencia|appearance/i.test(button.textContent || '')
    );
    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const motionSection = rendered.container.querySelector(
      '[data-testid="ajustes-motion-mode-section"]'
    );
    expect(motionSection).toBeTruthy();

    const amplifiedButton = Array.from(motionSection.querySelectorAll('button')).find((b) =>
      /amplified/i.test(b.textContent || '')
    );
    expect(amplifiedButton).toBeTruthy();

    flushSync(() => {
      amplifiedButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setMotionMode).toHaveBeenCalledWith('amplified');
  });

  async function openAppearanceTab() {
    rendered = await renderIntoDom(React.createElement(Ajustes));
    const appearanceTab = findButton(rendered.container, (button) =>
      /apariencia|appearance/i.test(button.textContent || '')
    );
    flushSync(() => {
      appearanceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
  }

  test('renders OpenCode Desktop preset control and applies preset on click', async () => {
    await openAppearanceTab();

    const presetButton = rendered.container.querySelector(
      '[data-testid="ajustes-opencode-desktop-preset"]'
    );
    expect(presetButton).toBeTruthy();
    expect(presetButton.textContent).toMatch(/OpenCode Desktop/i);

    flushSync(() => {
      presetButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.applyOpenCodeDesktopPreset).toHaveBeenCalledTimes(1);
  });

  test('shows undo after preset and restores the captured snapshot', async () => {
    await openAppearanceTab();

    const presetButton = rendered.container.querySelector(
      '[data-testid="ajustes-opencode-desktop-preset"]'
    );
    flushSync(() => {
      presetButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const undoButton = rendered.container.querySelector(
      '[data-testid="ajustes-opencode-desktop-preset-undo"]'
    );
    expect(undoButton).toBeTruthy();

    flushSync(() => {
      undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.restoreAppearanceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'deep-sea',
        morphology: 'default',
        appearance: expect.objectContaining({ density: 'comfortable' }),
      })
    );
  });

  test('renders density control and switches compact | comfortable', async () => {
    await openAppearanceTab();

    const densitySection = rendered.container.querySelector(
      '[data-testid="ajustes-density-control"]'
    );
    expect(densitySection).toBeTruthy();

    const compactButton = rendered.container.querySelector(
      '[data-testid="ajustes-density-option-compact"]'
    );
    const comfortableButton = rendered.container.querySelector(
      '[data-testid="ajustes-density-option-comfortable"]'
    );
    expect(compactButton).toBeTruthy();
    expect(comfortableButton).toBeTruthy();

    flushSync(() => {
      compactButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(themeModule.setDensity).toHaveBeenCalledWith('compact');

    flushSync(() => {
      comfortableButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(themeModule.setDensity).toHaveBeenCalledWith('comfortable');
  });
});
