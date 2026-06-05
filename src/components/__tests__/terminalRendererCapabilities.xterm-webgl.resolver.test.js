/**
 * terminal-renderer-xterm-webgl resolver contract.
 *
 * Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-xterm-webgl/spec.md
 *
 * - XW-06-SCEN-1: ready xterm-webgl capability returns effectiveMode='xterm-webgl', didFallback=false
 * - XW-06-SCEN-2: unready xterm-webgl capability returns effectiveMode='xterm', didFallback=true, fallbackReason=<enum>
 * - Runtime cap map includes the 'xterm-webgl' key
 */

const {
  getTerminalRendererRuntimeCapabilities,
  resolveRendererSelection,
} = require('../terminal/terminalRendererCapabilities');
const { TERMINAL_WEBGL_FALLBACK_REASONS } = require('../terminal/terminalRendererCapabilities');

describe('terminalRendererCapabilities.xterm-webgl.resolver', () => {
  test('resolveRendererSelection routes xterm-webgl to itself when the capability is ready (XW-06 SCEN-1)', () => {
    const capabilities = {
      xterm: {
        mode: 'xterm',
        label: 'xterm (DOM fallback)',
        ready: true,
        reason: null,
      },
      'xterm-webgl': {
        mode: 'xterm-webgl',
        label: 'xterm + WebGL',
        ready: true,
        reason: null,
      },
    };

    expect(resolveRendererSelection({ requestedMode: 'xterm-webgl', capabilities })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('resolveRendererSelection falls back to xterm when xterm-webgl capability is unready (XW-06 SCEN-2)', () => {
    const capabilities = {
      xterm: {
        mode: 'xterm',
        label: 'xterm (DOM fallback)',
        ready: true,
        reason: null,
      },
      'xterm-webgl': {
        mode: 'xterm-webgl',
        label: 'xterm + WebGL',
        ready: false,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED,
      },
    };

    expect(resolveRendererSelection({ requestedMode: 'xterm-webgl', capabilities })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm',
        didFallback: true,
        fallbackReason: 'webgl-addon-register-failed',
      })
    );
  });

  test('getTerminalRendererRuntimeCapabilities includes an xterm-webgl key in the output map (XW-06 runtime map assertion)', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: true, reason: null },
    });

    expect(capabilities['xterm-webgl']).toBeDefined();
    expect(capabilities['xterm-webgl'].mode).toBe('xterm-webgl');
    expect(capabilities['xterm-webgl'].label).toBe('xterm + WebGL');
    expect(capabilities['xterm-webgl'].ready).toBe(true);
    expect(capabilities['xterm-webgl'].reason).toBeNull();
  });
});
