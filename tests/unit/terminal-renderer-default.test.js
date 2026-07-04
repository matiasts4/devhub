/**
 * Default renderer mode contract for `terminal-renderer-default-xterm-webgl`.
 *
 * Verifies the global default constant flipped to `xterm-webgl` (TRD-1).
 * Specs: openspec/changes/terminal-renderer-default-xterm-webgl/specs/terminal-renderer-default/spec.md
 */

const path = require('path');

const {
  createDefaultTerminalRendererPreferences,
  readTerminalRendererDefaultModeSetting,
  TERMINAL_RENDERER_DEFAULT_MODE,
} = require(path.resolve(__dirname, '../../src/components/terminal/terminalRendererPreferences'));

describe('terminal-renderer-default — global default constant', () => {
  test('TERMINAL_RENDERER_DEFAULT_MODE is xterm-webgl (TRD-1)', () => {
    expect(TERMINAL_RENDERER_DEFAULT_MODE).toBe('xterm-webgl');
  });

  test('createDefaultTerminalRendererPreferences seeds xterm-webgl as default', () => {
    const prefs = createDefaultTerminalRendererPreferences();
    expect(prefs.defaultMode).toBe('xterm-webgl');
  });

  test('readTerminalRendererDefaultModeSetting returns xterm-webgl with empty storage', () => {
    const storage = { getItem: () => null };
    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('xterm-webgl');
  });

  test('stored vte-experimental default is normalized to xterm-webgl (VTE removed)', () => {
    const storage = {
      getItem: (key) =>
        key === 'devhub_terminal_renderer_default_mode' ? 'vte-experimental' : null,
    };
    expect(readTerminalRendererDefaultModeSetting(storage)).toBe('xterm-webgl');
  });
});
