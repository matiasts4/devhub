const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('@/components/terminal/terminalRendererPreferences', () => ({
  readTerminalRendererDefaultModeSetting: () => 'xterm-webgl',
  writeTerminalRendererDefaultModeSetting: jest.fn(),
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
  readTerminalRestorePreferences: () => ({ opencode: 'auto', generic: 'auto', swarm: 'auto' }),
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
});
