/**
 * terminal-renderer-xterm-webgl capability contract.
 *
 * Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-xterm-webgl/spec.md
 *
 * - XW-01: getTerminalRendererCapability('xterm-webgl') returns the 4-key descriptor
 * - XW-02: TERMINAL_WEBGL_FALLBACK_REASONS is a frozen 5-value enum
 * - XW-03: getTerminalRendererOptionLabel('xterm-webgl') is stable and distinct
 * - XW-05 (constant half): WEBGL_FALLBACK_WARNING_TEXT is the exact substring
 *   the runtime emits in the panel body on addon failure.
 */

const {
  getTerminalRendererCapability,
  getTerminalRendererOptionLabel,
  TERMINAL_WEBGL_FALLBACK_REASONS,
  WEBGL_FALLBACK_WARNING_TEXT,
} = require('../terminal/terminalRendererCapabilities');

describe('terminalRendererCapabilities.xterm-webgl', () => {
  test('getTerminalRendererCapability("xterm-webgl") returns the 4-key descriptor with mode + label + ready + reason (XW-01 SCEN-1)', () => {
    const capability = getTerminalRendererCapability('xterm-webgl');

    expect(capability).toEqual(
      expect.objectContaining({
        mode: 'xterm-webgl',
        label: expect.any(String),
        ready: expect.any(Boolean),
        reason: expect.anything(),
      })
    );
    expect(Object.keys(capability).sort()).toEqual(
      expect.arrayContaining(['label', 'mode', 'ready', 'reason'])
    );
  });

  test('TERMINAL_WEBGL_FALLBACK_REASONS is a frozen 5-value enum covering the documented WebGL failure shapes (XW-02 SCEN-1)', () => {
    expect(TERMINAL_WEBGL_FALLBACK_REASONS).toBeDefined();
    expect(Object.isFrozen(TERMINAL_WEBGL_FALLBACK_REASONS)).toBe(true);

    expect(TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW).toBe(
      'webgl-unsupported-in-webview'
    );
    expect(TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED).toBe(
      'webgl-context-creation-failed'
    );
    expect(TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST).toBe('webgl-context-lost');
    expect(TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED).toBe(
      'webgl-addon-import-failed'
    );
    expect(TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED).toBe(
      'webgl-addon-register-failed'
    );
  });

  test('getTerminalRendererOptionLabel("xterm-webgl") is stable, non-empty, and distinct from xterm/vte-experimental (XW-03 SCEN-1)', () => {
    const firstCall = getTerminalRendererOptionLabel('xterm-webgl');
    const secondCall = getTerminalRendererOptionLabel('xterm-webgl');

    expect(typeof firstCall).toBe('string');
    expect(firstCall.length).toBeGreaterThan(0);
    expect(firstCall).toBe(secondCall);
    expect(firstCall).not.toBe(getTerminalRendererOptionLabel('xterm'));
    expect(firstCall).not.toBe(getTerminalRendererOptionLabel('vte-experimental'));
  });

  test('WEBGL_FALLBACK_WARNING_TEXT is the exact substring the TerminalTTY runtime renders in the panel body (XW-05 constant half)', () => {
    expect(WEBGL_FALLBACK_WARNING_TEXT).toBe('Renderer fallback: xterm DOM (WebGL unavailable)');
  });
});
