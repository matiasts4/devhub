/**
 * @jest-environment jsdom
 */

const {
  isTerminalKeepaliveEnabled,
  resolveTerminalKeepaliveEnabled,
  shouldMountWorkspaceTerminal,
  KEEPALIVE_KILL_SWITCH_KEY,
} = require('../terminalKeepalivePolicy');

const WEBKIT_GTK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0';

const storageNull = { getItem: () => null };
const storageOff = {
  getItem: (k) => (k === KEEPALIVE_KILL_SWITCH_KEY ? 'off' : null),
};

describe('terminalKeepalivePolicy', () => {
  afterEach(() => {
    window.localStorage.removeItem(KEEPALIVE_KILL_SWITCH_KEY);
  });

  test('defaults to enabled on a regular desktop platform', () => {
    expect(resolveTerminalKeepaliveEnabled({ platformUa: WINDOWS_UA, storage: storageNull })).toBe(
      true
    );
  });

  test('kill-switch disables keep-alive', () => {
    expect(resolveTerminalKeepaliveEnabled({ platformUa: WINDOWS_UA, storage: storageOff })).toBe(
      false
    );
  });

  test('Linux WebKitGTK defaults to disabled', () => {
    expect(
      resolveTerminalKeepaliveEnabled({ platformUa: WEBKIT_GTK_UA, storage: storageNull })
    ).toBe(false);
    // Kill-switch stays off there too.
    expect(
      resolveTerminalKeepaliveEnabled({ platformUa: WEBKIT_GTK_UA, storage: storageOff })
    ).toBe(false);
  });

  test('isTerminalKeepaliveEnabled reads the global localStorage kill-switch', () => {
    window.localStorage.setItem(KEEPALIVE_KILL_SWITCH_KEY, 'off');
    expect(isTerminalKeepaliveEnabled()).toBe(false);
  });

  test('shouldMountWorkspaceTerminal keeps non-v2 panels always mounted', () => {
    expect(
      shouldMountWorkspaceTerminal({
        isEngineV2: false,
        isWorkspaceShellVisible: false,
        isVisibleInLayout: false,
        keepaliveEnabled: false,
      })
    ).toBe(true);
  });

  test('shouldMountWorkspaceTerminal v2 + keepalive on survives a hidden shell', () => {
    expect(
      shouldMountWorkspaceTerminal({
        isEngineV2: true,
        isWorkspaceShellVisible: false,
        isVisibleInLayout: false,
        keepaliveEnabled: true,
      })
    ).toBe(true);
  });

  test('shouldMountWorkspaceTerminal v2 + keepalive off matches the graveyard behavior', () => {
    // Visible shell or visible in layout keeps the panel mounted.
    expect(
      shouldMountWorkspaceTerminal({
        isEngineV2: true,
        isWorkspaceShellVisible: true,
        isVisibleInLayout: false,
        keepaliveEnabled: false,
      })
    ).toBe(true);
    expect(
      shouldMountWorkspaceTerminal({
        isEngineV2: true,
        isWorkspaceShellVisible: false,
        isVisibleInLayout: true,
        keepaliveEnabled: false,
      })
    ).toBe(true);
    // Hidden shell + parked panel unmounts into the graveyard.
    expect(
      shouldMountWorkspaceTerminal({
        isEngineV2: true,
        isWorkspaceShellVisible: false,
        isVisibleInLayout: false,
        keepaliveEnabled: false,
      })
    ).toBe(false);
  });
});
