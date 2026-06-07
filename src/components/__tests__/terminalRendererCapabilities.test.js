const {
  getTerminalRendererCapability,
  getTerminalRendererFallbackCopy,
  getTerminalRendererRuntimeCapabilities,
  resolveRendererSelection,
  TERMINAL_RENDERER_MODES,
} = require('../terminal/terminalRendererCapabilities');

describe('terminalRendererCapabilities', () => {
  test('keeps xterm permanently ready as the baseline capability', () => {
    // VTE is disabled (LEGACY_VTE_ENABLED=false). The array reflects only active renderers.
    // The full legacy list and all VTE functions remain in the source for future re-enable.
    expect(TERMINAL_RENDERER_MODES).toEqual(['xterm', 'xterm-webgl', 'canvas']);
    expect(getTerminalRendererCapability('xterm')).toEqual(
      expect.objectContaining({
        mode: 'xterm',
        ready: true,
        reason: null,
      })
    );
  });

  test('marks GTK VTE as selectable but not ready until runtime proves itself', () => {
    expect(getTerminalRendererCapability('vte-experimental')).toEqual(
      expect.objectContaining({
        mode: 'vte-experimental',
        ready: false,
        reason: 'not-ready',
      })
    );
  });

  test('falls back deterministically to xterm while preserving the requested renderer', () => {
    expect(resolveRendererSelection({ requestedMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        didFallback: true,
        fallbackReason: 'not-ready',
      })
    );
  });

  test('does not fall back when GTK VTE capability is explicitly ready', () => {
    expect(
      resolveRendererSelection({
        requestedMode: 'vte-experimental',
        capabilities: {
          xterm: getTerminalRendererCapability('xterm'),
          'vte-experimental': {
            mode: 'vte-experimental',
            label: 'GTK VTE',
            ready: true,
            reason: null,
          },
        },
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'vte-experimental',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('returns recoverable copy that tells the user xterm is the live fallback', () => {
    const copy = getTerminalRendererFallbackCopy(
      resolveRendererSelection({ requestedMode: 'vte-experimental' })
    );

    expect(copy).toContain('GTK VTE');
    expect(copy).toContain('xterm');
    expect(copy).toContain('todavía no está listo');
  });

  test('maps legacy ghostty requests to xterm for compatibility', () => {
    expect(resolveRendererSelection({ requestedMode: 'ghostty-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm',
        effectiveMode: 'xterm',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('marks GTK VTE ready only after Linux + Tauri + successful runtime probe', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: true, reason: null },
    });

    expect(capabilities['vte-experimental']).toEqual(
      expect.objectContaining({
        mode: 'vte-experimental',
        ready: true,
        reason: null,
      })
    );
    expect(
      resolveRendererSelection({
        requestedMode: 'vte-experimental',
        capabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'vte-experimental',
        didFallback: false,
      })
    );
  });

  test('maps unsupported platform and missing Tauri to deterministic VTE fallback reasons', () => {
    expect(
      getTerminalRendererRuntimeCapabilities({
        platform: 'darwin',
        tauriAvailable: true,
      })['vte-experimental']
    ).toEqual(
      expect.objectContaining({
        ready: false,
        reason: 'unsupported-platform',
      })
    );

    expect(
      getTerminalRendererRuntimeCapabilities({
        platform: 'linux',
        tauriAvailable: false,
      })['vte-experimental']
    ).toEqual(
      expect.objectContaining({
        ready: false,
        reason: 'tauri-unavailable',
      })
    );
  });

  test('preserves requested VTE intent while surfacing probe-failed and open-failed fallback reasons', () => {
    const probeFailedCapabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: false, reason: 'probe-failed' },
    });

    expect(
      resolveRendererSelection({
        requestedMode: 'vte-experimental',
        capabilities: probeFailedCapabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        fallbackReason: 'probe-failed',
      })
    );

    const openFailedCapabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: true, reason: null },
      nativeVteOpenFailure: 'open-failed',
    });

    expect(
      resolveRendererSelection({
        requestedMode: 'vte-experimental',
        capabilities: openFailedCapabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        fallbackReason: 'open-failed',
      })
    );
  });

  test('surfaces specific probe diagnostics without losing requested VTE intent', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: false, reason: 'probe-missing-webview-handle' },
    });

    const selection = resolveRendererSelection({
      requestedMode: 'vte-experimental',
      capabilities,
    });

    expect(selection).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        fallbackReason: 'probe-missing-webview-handle',
      })
    );

    expect(getTerminalRendererFallbackCopy(selection)).toContain('WebView nativo de Tauri');
  });

  test('treats panel-not-active as a stable registry fallback reason without losing requested renderer intent', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: true, reason: null },
      nativeVteOpenFailure: 'panel-not-active',
    });

    expect(
      resolveRendererSelection({
        requestedMode: 'vte-experimental',
        capabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        fallbackReason: 'panel-not-active',
      })
    );

    const copy = getTerminalRendererFallbackCopy(
      resolveRendererSelection({ requestedMode: 'vte-experimental', capabilities })
    );

    expect(copy).toContain('paneles vecinos');
    expect(copy).toContain('lease nativo');
  });

  test('does not expose legacy Ghostty capability even when Linux GTK VTE runtime is ready', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
      nativeVteProbe: { ready: true, reason: null },
    });

    expect(capabilities['ghostty-experimental']).toBeUndefined();
    expect(
      resolveRendererSelection({ requestedMode: 'ghostty-experimental', capabilities })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm',
        effectiveMode: 'xterm',
        fallbackReason: null,
      })
    );
  });

  test('static xterm-webgl capability reports ready:true (TRS-DELTA-S1)', () => {
    expect(getTerminalRendererCapability('xterm-webgl')).toEqual(
      expect.objectContaining({
        mode: 'xterm-webgl',
        ready: true,
        reason: null,
      })
    );
  });

  test('static resolver does not demote xterm-webgl to xterm (TRS-DELTA-S2)', () => {
    expect(resolveRendererSelection({ requestedMode: 'xterm-webgl' })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('static xterm-webgl does not break vte-experimental opt-in (TRS-DELTA-S3)', () => {
    // Re-affirm the term-02 contract: vte-experimental still falls back to xterm
    // deterministically when the static capability map is the only signal.
    expect(resolveRendererSelection({ requestedMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        didFallback: true,
        fallbackReason: 'not-ready',
      })
    );
  });
});
