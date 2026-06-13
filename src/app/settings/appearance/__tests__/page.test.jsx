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
  ACCENT_OPTIONS: [
    { id: 'theme', label: 'Theme sync', description: 'desc', primary: null },
    { id: 'amber', label: 'Signal Amber', description: 'desc', primary: '#E3B341' },
  ],
  THEMES: {
    DEEP_SEA: 'deep-sea',
    NORD: 'nord',
    DRACULA: 'dracula',
    LIGHT: 'light',
  },
  MORPHOLOGIES: {
    DEFAULT: 'default',
    BRUTALIST_STAGE: 'brutalist-stage',
    SWITCHYARD: 'switchyard',
  },
  PALETTES: {
    MINERAL: 'mineral',
    COBALT: 'cobalt',
    ALLOY: 'alloy',
  },
  PALETTE_OPTIONS: [
    {
      id: 'mineral',
      label: 'Mineral Teal',
      description: 'Cold-mineral dark with teal accent.',
      primary: '#63d0c2',
    },
    {
      id: 'cobalt',
      label: 'Cobalt Relay',
      description: 'Blue accent, navy-dark surface.',
      primary: '#7a93ff',
    },
    {
      id: 'alloy',
      label: 'Alloy Sand',
      description: 'Bronze accent, warm dark surface.',
      primary: '#d4a16a',
    },
  ],
  THEME_OPTIONS: [
    { id: 'deep-sea', label: 'Deep Sea', description: 'desc' },
    { id: 'nord', label: 'Nord', description: 'desc' },
  ],
  MORPHOLOGY_OPTIONS: [
    { id: 'default', label: 'Default', description: 'base chrome' },
    { id: 'brutalist-stage', label: 'Brutalist Stage', description: 'brutalist chrome' },
    { id: 'switchyard', label: 'Switchyard', description: 'Metallic dark with palette axis.' },
  ],
  getStoredTheme: jest.fn(() => 'deep-sea'),
  getStoredMorphology: jest.fn(() => 'default'),
  getStoredAccent: jest.fn(() => 'theme'),
  getStoredPalette: jest.fn(() => 'mineral'),
  setTheme: jest.fn((value) => value),
  setMorphology: jest.fn((value) => value),
  setAccent: jest.fn((value) => value),
  setPalette: jest.fn((value) => value),
  getStoredZoom: jest.fn(() => 1),
  setZoom: jest.fn((value) => value),
}));

jest.mock('@/lib/terminal/restorePreferences', () => ({
  RESTORE_POLICY: { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' },
  RESTORE_PREFERENCES_STORAGE_KEY: 'devhub_terminal_restore_prefs',
  readTerminalRestorePreferences: jest.fn(() => ({
    opencode: 'auto',
    generic: 'auto',
    swarm: 'auto',
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));

const appearancePageModule = require('../page');
const AppearancePage = appearancePageModule.default;
const themeModule = require('@/lib/theme/themes');

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

  test('shows terminal renderer preference in Settings with xterm-webgl, vte-experimental, and xterm options; xterm-webgl is pre-selected', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const select = rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]');
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value);

    expect(rendered.container.textContent).toContain('Terminal renderer');
    expect(options).toEqual(['xterm-webgl', 'vte-experimental', 'xterm']);
    expect(select.value).toBe('xterm-webgl');
  });

  test('persists the renderer preference from Settings and migrates legacy Ghostty to xterm', async () => {
    window.localStorage.setItem('devhub_terminal_renderer_default_mode', 'ghostty-experimental');

    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const select = rendered.container.querySelector('[data-testid="settings-terminal-renderer-select"]');
    expect(select.value).toBe('xterm');

    flushSync(() => {
      select.value = 'xterm-webgl';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(window.localStorage.getItem('devhub_terminal_renderer_default_mode')).toBe(
      'xterm-webgl'
    );
  });

  test('shows morphology controls independent from theme selection', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    expect(rendered.container.textContent).toContain('Morphology');
    expect(rendered.container.textContent).toContain('Brutalist Stage');
    expect(rendered.container.textContent).toContain('Default');
  });

  test('shows independent accent controls and persists accent changes without calling setTheme', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    expect(rendered.container.textContent).toContain('Accent signal');
    expect(rendered.container.textContent).toContain('Theme sync');
    expect(rendered.container.textContent).toContain('Signal Amber');

    const accentButton = rendered.container.querySelector(
      '[data-testid="appearance-accent-option-amber"]'
    );
    expect(accentButton).toBeTruthy();

    flushSync(() => {
      accentButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setAccent).toHaveBeenCalledWith('amber');
    expect(themeModule.setTheme).not.toHaveBeenCalled();
  });

  test('routes settings section chrome through morphology tokens instead of hardcoded surface shells', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const themeShell = rendered.container.querySelector('[data-testid="appearance-theme-shell"]');
    const morphologyCard = rendered.container.querySelector(
      '[data-testid="appearance-morphology-option-default"]'
    );

    expect(themeShell).toBeTruthy();
    const themeShellStyle = appearancePageModule.getAppearanceSectionStyle();

    expect(themeShell.getAttribute('style')).toContain('var(--chrome-shadow-panel)');
    expect(themeShellStyle.background).toContain('var(--chrome-panel-fill)');
    expect(themeShellStyle.borderColor).toBe('var(--chrome-border-color)');
    expect(themeShellStyle.background).not.toContain('var(--surface-card)');

    expect(morphologyCard).toBeTruthy();
    expect(morphologyCard.getAttribute('style')).toContain('var(--chrome-shadow-panel)');

    const activeMorphologyStyle = appearancePageModule.getAppearanceOptionStyle(true);
    expect(activeMorphologyStyle.background).toBe('var(--chrome-panel-fill-emphasis)');
    expect(activeMorphologyStyle.borderWidth).toBe('var(--chrome-border-width)');
  });

  test('changing morphology does not call setTheme', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const morphologyButton = Array.from(rendered.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Brutalist Stage')
    );

    expect(morphologyButton).toBeTruthy();

    flushSync(() => {
      morphologyButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(themeModule.setMorphology).toHaveBeenCalledWith('brutalist-stage');
    expect(themeModule.setTheme).not.toHaveBeenCalled();
  });
});

describe('Settings appearance page terminal restore preferences', () => {
  let dom;
  let rendered;
  let restorePreferencesModule;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    rendered = null;
    restorePreferencesModule = require('@/lib/terminal/restorePreferences');
    restorePreferencesModule.readTerminalRestorePreferences.mockReturnValue({
      opencode: 'auto',
      generic: 'auto',
      swarm: 'auto',
    });
    restorePreferencesModule.writeTerminalRestorePreferences.mockClear();
  });

  afterEach(() => {
    if (rendered?.root) {
      flushSync(() => rendered.root.unmount());
    }
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('shows all three session types with independent restore policy selectors', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    expect(rendered.container.textContent).toContain('Restauración de Terminales');
    expect(rendered.container.textContent).toContain('OpenCode');
    expect(rendered.container.textContent).toContain('Shell Genérico');
    expect(rendered.container.textContent).toContain('Swarm');
  });

  test('shows default auto policy when no saved preferences exist', async () => {
    restorePreferencesModule.readTerminalRestorePreferences.mockReturnValue({
      opencode: 'auto',
      generic: 'auto',
      swarm: 'auto',
    });

    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const opencodeSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-opencode"]'
    );
    const genericSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-generic"]'
    );
    const swarmSelect = rendered.container.querySelector('[data-testid="restore-policy-swarm"]');

    expect(opencodeSelect.value).toBe('auto');
    expect(genericSelect.value).toBe('auto');
    expect(swarmSelect.value).toBe('auto');
  });

  test('reads saved preferences from localStorage on mount', async () => {
    restorePreferencesModule.readTerminalRestorePreferences.mockReturnValue({
      opencode: 'manual',
      generic: 'off',
      swarm: 'auto',
    });

    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const opencodeSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-opencode"]'
    );
    const genericSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-generic"]'
    );
    const swarmSelect = rendered.container.querySelector('[data-testid="restore-policy-swarm"]');

    expect(opencodeSelect.value).toBe('manual');
    expect(genericSelect.value).toBe('off');
    expect(swarmSelect.value).toBe('auto');
  });

  test('changing a policy persists to localStorage via writeTerminalRestorePreferences', async () => {
    rendered = await renderIntoDom(React.createElement(AppearancePage));

    const opencodeSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-opencode"]'
    );

    flushSync(() => {
      opencodeSelect.value = 'manual';
      opencodeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(restorePreferencesModule.writeTerminalRestorePreferences).toHaveBeenCalledWith(
      window.localStorage,
      { opencode: 'manual' }
    );
  });

  test('all three session types have independent selectors that do not affect each other', async () => {
    restorePreferencesModule.readTerminalRestorePreferences.mockReturnValue({
      opencode: 'auto',
      generic: 'auto',
      swarm: 'auto',
    });

    rendered = await renderIntoDom(React.createElement(AppearancePage));

    // Change only OpenCode
    const opencodeSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-opencode"]'
    );
    flushSync(() => {
      opencodeSelect.value = 'manual';
      opencodeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(restorePreferencesModule.writeTerminalRestorePreferences).toHaveBeenLastCalledWith(
      window.localStorage,
      { opencode: 'manual' }
    );

    // Change only Shell Genérico
    restorePreferencesModule.writeTerminalRestorePreferences.mockClear();
    const genericSelect = rendered.container.querySelector(
      '[data-testid="restore-policy-generic"]'
    );
    flushSync(() => {
      genericSelect.value = 'off';
      genericSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(restorePreferencesModule.writeTerminalRestorePreferences).toHaveBeenLastCalledWith(
      window.localStorage,
      { generic: 'off' }
    );

    // Change only Swarm
    restorePreferencesModule.writeTerminalRestorePreferences.mockClear();
    const swarmSelect = rendered.container.querySelector('[data-testid="restore-policy-swarm"]');
    flushSync(() => {
      swarmSelect.value = 'manual';
      swarmSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(restorePreferencesModule.writeTerminalRestorePreferences).toHaveBeenLastCalledWith(
      window.localStorage,
      { swarm: 'manual' }
    );
  });
});
