const {
  getTerminalRendererCapability,
  getTerminalRendererFallbackCopy,
  getTerminalRendererRuntimeCapabilities,
  resolveOperationalRendererMode,
  resolveRendererSelection,
  resolveVisibleTerminalPanelCountForRenderer,
  TERMINAL_RENDERER_MODES,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  TERMINAL_OPERATIONAL_CANVAS_MODE,
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

  test('maps legacy vte-experimental mode to the xterm-webgl capability', () => {
    expect(getTerminalRendererCapability('vte-experimental')).toEqual(
      expect.objectContaining({
        mode: 'xterm-webgl',
        ready: true,
        reason: null,
      })
    );
  });

  test('resolveRendererSelection maps legacy vte-experimental to xterm-webgl', () => {
    expect(resolveRendererSelection({ requestedMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('does not fall back when xterm-webgl capability is explicitly ready', () => {
    expect(
      resolveRendererSelection({
        requestedMode: 'xterm-webgl',
        capabilities: {
          xterm: getTerminalRendererCapability('xterm'),
          'xterm-webgl': {
            mode: 'xterm-webgl',
            label: 'xterm + WebGL',
            ready: true,
            reason: null,
          },
        },
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('returns recoverable copy for a WebGL unsupported runtime', () => {
    const capabilities = {
      xterm: getTerminalRendererCapability('xterm'),
      'xterm-webgl': {
        mode: 'xterm-webgl',
        label: 'xterm + WebGL',
        ready: false,
        reason: 'webgl-unsupported-in-webview',
      },
    };
    const copy = getTerminalRendererFallbackCopy(
      resolveRendererSelection({ requestedMode: 'xterm-webgl', capabilities })
    );

    expect(copy).toContain('xterm + WebGL');
    expect(copy).toContain('xterm');
  });

  test('xterm-webgl stays ready when runtime capabilities are built', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      platform: 'linux',
      tauriAvailable: true,
    });

    expect(capabilities['xterm-webgl']).toEqual(
      expect.objectContaining({
        mode: 'xterm-webgl',
        ready: true,
        reason: null,
      })
    );
    expect(
      resolveRendererSelection({
        requestedMode: 'xterm-webgl',
        capabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
      })
    );
  });

  test('getTerminalRendererRuntimeCapabilities surfaces a failing WebGL probe', () => {
    const capabilities = getTerminalRendererRuntimeCapabilities({
      webglProbe: { ready: false, reason: 'webgl-context-creation-failed' },
    });

    expect(capabilities['xterm-webgl']).toEqual(
      expect.objectContaining({
        mode: 'xterm-webgl',
        ready: false,
        reason: 'webgl-context-creation-failed',
      })
    );

    expect(
      resolveRendererSelection({
        requestedMode: 'xterm-webgl',
        capabilities,
      })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm',
        didFallback: true,
        fallbackReason: 'webgl-context-creation-failed',
      })
    );
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

  test('legacy vte-experimental resolves to xterm-webgl (TRS-DELTA-S3)', () => {
    expect(resolveRendererSelection({ requestedMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        fallbackReason: null,
      })
    );
  });

  test('resolveOperationalRendererMode keeps WebGL for a single visible panel', () => {
    expect(TERMINAL_SPLIT_WEBGL_PANEL_LIMIT).toBe(1);
    expect(
      resolveOperationalRendererMode({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
      })
    ).toBe('xterm-webgl');
  });

  test('resolveVisibleTerminalPanelCountForRenderer treats files/browser siblings as a GPU slot', () => {
    expect(
      resolveVisibleTerminalPanelCountForRenderer({
        totalTerminalPanelCount: 1,
        totalPanelCount: 2,
      })
    ).toBe(2);
    expect(
      resolveVisibleTerminalPanelCountForRenderer({
        totalTerminalPanelCount: 1,
        totalPanelCount: 1,
      })
    ).toBe(1);
    expect(
      resolveVisibleTerminalPanelCountForRenderer({
        focusedPanelId: 'p1',
        totalTerminalPanelCount: 1,
        totalPanelCount: 2,
      })
    ).toBe(1);
  });

  test('resolveOperationalRendererMode routes visible splits to canvas for every panel', () => {
    expect(TERMINAL_OPERATIONAL_CANVAS_MODE).toBe('xterm-canvas');
    expect(
      resolveOperationalRendererMode({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        visibleTerminalPanelCount: 3,
      })
    ).toBe('xterm-canvas');
  });

  test('resolveOperationalRendererMode keeps canvas for multi-panel splits when WebGL probe demotes', () => {
    expect(
      resolveOperationalRendererMode({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm',
        visibleTerminalPanelCount: 5,
      })
    ).toBe('xterm-canvas');
  });

  test('resolveOperationalRendererMode routes Tauri Linux splits to canvas and single panel to DOM xterm', () => {
    const previous = global.window;
    global.window = {
      __TAURI_INTERNALS__: {},
      navigator: { platform: 'Linux x86_64', userAgent: 'Linux' },
    };
    try {
      expect(
        resolveOperationalRendererMode({
          requestedMode: 'xterm-webgl',
          effectiveMode: 'xterm-webgl',
          visibleTerminalPanelCount: 3,
        })
      ).toBe('xterm-canvas');
      expect(
        resolveOperationalRendererMode({
          requestedMode: 'xterm-webgl',
          effectiveMode: 'xterm',
          visibleTerminalPanelCount: 1,
        })
      ).toBe('xterm');
    } finally {
      global.window = previous;
    }
  });
});
