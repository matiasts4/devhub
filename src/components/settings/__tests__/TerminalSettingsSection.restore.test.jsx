const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@/components/terminal/terminalRendererPreferences', () => ({
  readTerminalRendererDefaultModeSetting: () => 'xterm-webgl',
  writeTerminalRendererDefaultModeSetting: jest.fn(),
  getStoredTerminalAutoCopy: () => true,
  setStoredTerminalAutoCopy: jest.fn(),
}));
jest.mock('@/components/terminal/terminalTypographyPreferences', () => ({
  applyTerminalTypographyToDocument: jest.fn(),
  findPresetByValue: () => null,
  getStoredTerminalTypography: () => ({
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 400,
    fontWeightBold: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
  }),
  resetTerminalTypography: jest.fn(),
  resolveTerminalTypography: jest.fn(),
  setTerminalTypography: jest.fn(),
  TERMINAL_FONT_FAMILY_PRESETS: [],
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
    swarm: 'auto',
    generic: 'auto',
    restoreOnReboot: true,
  })),
  writeTerminalRestorePreferences: jest.fn(),
}));
jest.mock('@/lib/theme/themes', () => ({
  getStoredTerminalAccentBarVisible: () => true,
  getStoredTerminalHeaderStyle: () => 'minimal',
  getStoredZoom: () => 1,
  getTerminalHeaderStyleOptions: () => [],
  setStoredTerminalAccentBarVisible: jest.fn(),
  setTerminalHeaderStyle: jest.fn(),
  setZoom: jest.fn(),
}));

describe('TerminalSettingsSection restore policies', () => {
  let dom;
  let root;
  let container;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://devhub.test',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
    container = document.getElementById('root');
    root = createRoot(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    dom.window.close();
  });

  test('shows restore selects when includeRestorePolicies is true', () => {
    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: true }));
    });
    expect(document.querySelector('[data-testid="restore-policy-opencode"]')).toBeTruthy();
  });

  test('hides restore selects when includeRestorePolicies is false', () => {
    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: false }));
    });
    expect(document.querySelector('[data-testid="restore-policy-opencode"]')).toBeFalsy();
    expect(
      document.querySelector('[data-testid="settings-terminal-renderer-select"]')
    ).toBeTruthy();
  });

  test('renders all 7 provider kinds with labels', () => {
    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: true }));
    });
    const expectedLabels = {
      opencode: 'OpenCode',
      kimi: 'Kimi Code',
      grok: 'Grok',
      codex: 'Codex',
      qoder: 'Qoder',
      swarm: 'Swarm',
      generic: 'Shell genérico',
    };
    for (const [kind, label] of Object.entries(expectedLabels)) {
      expect(document.querySelector(`[data-testid="restore-policy-${kind}"]`)).toBeTruthy();
      expect(document.body.textContent).toContain(label);
    }
  });

  test('master toggle renders checked by default and disables selects when switched off', () => {
    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    const { writeTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: true }));
    });

    const toggle = document.querySelector('[data-testid="restore-on-reboot-toggle-settings"]');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(
      document.querySelector('[data-testid="restore-on-reboot-off-hint-settings"]')
    ).toBeFalsy();

    flushSync(() => {
      toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(writeTerminalRestorePreferences).toHaveBeenCalledWith(expect.anything(), {
      restoreOnReboot: false,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(
      document.querySelector('[data-testid="restore-on-reboot-off-hint-settings"]')
    ).toBeTruthy();
    const list = document.querySelector('[data-testid="restore-policy-list-settings"]');
    expect(list.getAttribute('data-disabled')).toBe('true');
    expect(document.querySelector('[data-testid="restore-policy-kimi"]').disabled).toBe(true);
  });

  test('changing a provider kind persists only that kind', () => {
    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    const { writeTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: true }));
    });

    const select = document.querySelector('[data-testid="restore-policy-kimi"]');
    expect(select.value).toBe('auto');
    flushSync(() => {
      select.value = 'manual';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(writeTerminalRestorePreferences).toHaveBeenCalledWith(expect.anything(), {
      kimi: 'manual',
    });
    expect(select.value).toBe('manual');
  });

  test('legacy 3-key prefs render all kinds with defaults and the master switch on', () => {
    const { readTerminalRestorePreferences } = require('@/lib/terminal/restorePreferences');
    readTerminalRestorePreferences.mockImplementationOnce(() => ({
      opencode: 'manual',
      generic: 'off',
      swarm: 'auto',
    }));

    const TerminalSettingsSection = require('../TerminalSettingsSection').default;
    flushSync(() => {
      root.render(React.createElement(TerminalSettingsSection, { includeRestorePolicies: true }));
    });

    ['opencode', 'kimi', 'grok', 'codex', 'qoder', 'swarm', 'generic'].forEach((kind) => {
      expect(document.querySelector(`[data-testid="restore-policy-${kind}"]`)).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="restore-policy-opencode"]').value).toBe('manual');
    expect(document.querySelector('[data-testid="restore-policy-kimi"]').value).toBe('auto');
    expect(
      document
        .querySelector('[data-testid="restore-on-reboot-toggle-settings"]')
        .getAttribute('aria-checked')
    ).toBe('true');
  });
});
