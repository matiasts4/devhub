export const TERMINAL_RENDERER_MODES = ['vte-experimental', 'xterm'];

export const TERMINAL_VTE_FALLBACK_REASONS = Object.freeze({
  NOT_READY: 'not-ready',
  OPEN_FAILED: 'open-failed',
  PANEL_NOT_ACTIVE: 'panel-not-active',
  PROBE_FAILED: 'probe-failed',
  PROBE_MISSING_MAIN_WINDOW: 'probe-missing-main-window',
  PROBE_MISSING_DEFAULT_VBOX: 'probe-missing-default-vbox',
  PROBE_MISSING_WEBVIEW_HANDLE: 'probe-missing-webview-handle',
  PROBE_MISSING_HOST_PRIMITIVES: 'probe-missing-host-primitives',
  TAURI_UNAVAILABLE: 'tauri-unavailable',
  UNSUPPORTED_PLATFORM: 'unsupported-platform',
});

const TERMINAL_RENDERER_LABELS = {
  xterm: 'xterm',
  'vte-experimental': 'GTK VTE',
};

function normalizeRendererMode(mode) {
  if (mode === 'ghostty-experimental') return 'xterm';
  return TERMINAL_RENDERER_MODES.includes(mode) ? mode : 'xterm';
}

export function normalizeTerminalRendererPlatform(platform) {
  const value = String(platform || '').toLowerCase();
  if (value.includes('linux')) return 'linux';
  if (value.includes('darwin') || value.includes('mac')) return 'darwin';
  if (value.includes('win')) return 'win32';
  return 'unknown';
}

function resolveNativeVteCapability({ platform, tauriAvailable, nativeVteProbe, nativeVteOpenFailure }) {
  if (platform !== 'linux') {
    return {
      ready: false,
      reason: TERMINAL_VTE_FALLBACK_REASONS.UNSUPPORTED_PLATFORM,
    };
  }

  if (!tauriAvailable) {
    return {
      ready: false,
      reason: TERMINAL_VTE_FALLBACK_REASONS.TAURI_UNAVAILABLE,
    };
  }

  if (nativeVteOpenFailure) {
    return {
      ready: false,
      reason: nativeVteOpenFailure,
    };
  }

  if (nativeVteProbe?.ready) {
    return {
      ready: true,
      reason: null,
    };
  }

  if (nativeVteProbe) {
    return {
      ready: false,
      reason: nativeVteProbe.reason || TERMINAL_VTE_FALLBACK_REASONS.PROBE_FAILED,
    };
  }

  return {
    ready: false,
    reason: TERMINAL_VTE_FALLBACK_REASONS.NOT_READY,
  };
}

export function getTerminalRendererCapability(mode) {
  const normalizedMode = normalizeRendererMode(mode);

  if (normalizedMode === 'xterm') {
    return {
      mode: 'xterm',
      label: TERMINAL_RENDERER_LABELS.xterm,
      ready: true,
      reason: null,
    };
  }

  return {
    mode: normalizedMode,
    label: TERMINAL_RENDERER_LABELS[normalizedMode],
    // TERM-02 exposes native candidates as selectable intent only — readiness stays false
    // until a real TERM-03/04 runtime proves itself in-process.
    ready: false,
    reason: TERMINAL_VTE_FALLBACK_REASONS.NOT_READY,
  };
}

export function getTerminalRendererRuntimeCapabilities({
  platform,
  tauriAvailable = false,
  nativeVteProbe = null,
  nativeVteOpenFailure = null,
} = {}) {
  const normalizedPlatform = normalizeTerminalRendererPlatform(platform);

  return TERMINAL_RENDERER_MODES.reduce((accumulator, mode) => {
    if (mode === 'vte-experimental') {
      const nativeCapability = resolveNativeVteCapability({
        platform: normalizedPlatform,
        tauriAvailable,
        nativeVteProbe,
        nativeVteOpenFailure,
      });

      accumulator[mode] = {
        mode,
        label: TERMINAL_RENDERER_LABELS[mode],
        ready: nativeCapability.ready,
        reason: nativeCapability.reason,
      };
      return accumulator;
    }

    accumulator[mode] = getTerminalRendererCapability(mode);
    return accumulator;
  }, {});
}

export function getTerminalRendererCapabilities() {
  return TERMINAL_RENDERER_MODES.reduce((accumulator, mode) => {
    accumulator[mode] = getTerminalRendererCapability(mode);
    return accumulator;
  }, {});
}

export function resolveRendererSelection({ requestedMode, capabilities } = {}) {
  const normalizedMode = normalizeRendererMode(requestedMode);
  const resolvedCapabilities = capabilities || getTerminalRendererCapabilities();
  const capability = resolvedCapabilities[normalizedMode] || getTerminalRendererCapability(normalizedMode);

  if (capability.ready) {
    return {
      requestedMode: normalizedMode,
      effectiveMode: normalizedMode,
      didFallback: false,
      fallbackReason: null,
      capability,
    };
  }

  return {
    requestedMode: normalizedMode,
    effectiveMode: 'xterm',
    didFallback: normalizedMode !== 'xterm',
    fallbackReason: normalizedMode === 'xterm' ? null : capability.reason || 'not-ready',
    capability,
  };
}

export function getTerminalRendererFallbackCopy(selection) {
  if (!selection?.didFallback) return '';

  const label = selection.capability?.label || TERMINAL_RENDERER_LABELS[selection.requestedMode] || 'Este renderer';
  const reason = selection.fallbackReason || selection.capability?.reason;

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.UNSUPPORTED_PLATFORM) {
    return `${label} requiere Linux para esta prueba. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.TAURI_UNAVAILABLE) {
    return `${label} necesita el runtime desktop de Tauri para esta prueba. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.OPEN_FAILED) {
    return `${label} no pudo adjuntarse en esta ventana. DevHub volvió a xterm sin perder la sesión actual.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PANEL_NOT_ACTIVE) {
    return `${label} rechazó una orden de foco para este panel. DevHub mantuvo xterm vivo sin bajar los paneles vecinos mientras recupera el lease nativo.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PROBE_FAILED) {
    return `${label} no pasó la verificación nativa inicial. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PROBE_MISSING_MAIN_WINDOW) {
    return `${label} no encontró la ventana principal de Tauri para la verificación nativa. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PROBE_MISSING_DEFAULT_VBOX) {
    return `${label} no encontró el contenedor GTK principal para adjuntarse en esta ventana. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PROBE_MISSING_WEBVIEW_HANDLE) {
    return `${label} no pudo resolver el WebView nativo de Tauri para esta verificación. DevHub sigue usando xterm como fallback estable.`;
  }

  if (reason === TERMINAL_VTE_FALLBACK_REASONS.PROBE_MISSING_HOST_PRIMITIVES) {
    return `${label} todavía no encontró los primitivos GTK necesarios para el host nativo en esta ventana. DevHub sigue usando xterm como fallback estable.`;
  }

  return `${label} todavía no está listo en TERM-02. DevHub sigue usando xterm como fallback estable.`;
}

export function getTerminalRendererOptionLabel(mode) {
  return TERMINAL_RENDERER_LABELS[normalizeRendererMode(mode)];
}
