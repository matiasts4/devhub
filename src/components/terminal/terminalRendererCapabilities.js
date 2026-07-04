// VTE (vte-experimental) is disabled for normal use (no selectable option,
// no loading of native VTE paths). The entry and supporting functions are
// kept so the code remains in the tree and can be re-enabled by flipping
// LEGACY_VTE_ENABLED in terminalRendererPreferences if needed in the future.
// Note: the legacy 'vte-experimental' entry was removed from the active list
// to enforce xterm-webgl as the sole renderer. Supporting code for VTE
// (nativeVteBridge, resolveNativeVteCapability, etc.) is untouched.
import { shouldAvoidWebglOnThisRuntime } from './terminalRendererPreferences';

export const TERMINAL_RENDERER_MODES = ['xterm', 'xterm-webgl', 'canvas'];

export const TERMINAL_WEBGL_FALLBACK_REASONS = Object.freeze({
  WEBGL_UNSUPPORTED_IN_WEBVIEW: 'webgl-unsupported-in-webview',
  WEBGL_CONTEXT_CREATION_FAILED: 'webgl-context-creation-failed',
  WEBGL_TEXTURE_ALLOC_FAILED: 'webgl-texture-alloc-failed',
  WEBGL_SHADER_COMPILE_FAILED: 'webgl-shader-compile-failed',
  WEBGL_CONTEXT_LOST: 'webgl-context-lost',
  WEBGL_ADDON_IMPORT_FAILED: 'webgl-addon-import-failed',
  WEBGL_ADDON_REGISTER_FAILED: 'webgl-addon-register-failed',
  WEBGL_RENDER_FAILED: 'webgl-render-failed',
});

export const WEBGL_FALLBACK_WARNING_TEXT = 'Renderer fallback: xterm DOM (WebGL unavailable)';

const TERMINAL_RENDERER_LABELS = {
  xterm: 'xterm (DOM fallback)',
  'xterm-webgl': 'xterm + WebGL',
  canvas: 'Canvas (pizarra web view)',
};

function normalizeRendererMode(mode) {
  if (mode === 'ghostty-experimental') return 'xterm';
  if (mode === 'vte-experimental') return 'xterm-webgl';
  return TERMINAL_RENDERER_MODES.includes(mode) ? mode : 'xterm';
}

export function normalizeTerminalRendererPlatform(platform) {
  const value = String(platform || '').toLowerCase();
  if (value.includes('linux')) return 'linux';
  if (value.includes('darwin') || value.includes('mac')) return 'darwin';
  if (value.includes('win')) return 'win32';
  return 'unknown';
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

  // xterm-webgl is the *only* active renderer. Readiness is optimistic;
  // TerminalTTY does the real try/catch loadAddon and falls back to plain xterm.
  if (normalizedMode === 'xterm-webgl') {
    return {
      mode: 'xterm-webgl',
      label: TERMINAL_RENDERER_LABELS['xterm-webgl'],
      ready: true,
      reason: null,
    };
  }

  // canvas is not an active standalone renderer; it is used by pizarra.
  return {
    mode: normalizedMode,
    label: TERMINAL_RENDERER_LABELS[normalizedMode] || normalizedMode,
    ready: false,
    reason: 'unsupported-platform',
  };
}

export function getTerminalRendererRuntimeCapabilities({ webglProbe = null } = {}) {
  return TERMINAL_RENDERER_MODES.reduce((accumulator, mode) => {
    if (mode === 'xterm-webgl') {
      const webglCapability = resolveWebglCapability({ webglProbe });
      accumulator[mode] = {
        mode,
        label: TERMINAL_RENDERER_LABELS[mode],
        ready: webglCapability.ready,
        reason: webglCapability.reason,
      };
      return accumulator;
    }

    accumulator[mode] = getTerminalRendererCapability(mode);
    return accumulator;
  }, {});
}

function resolveWebglCapability({ webglProbe } = {}) {
  if (webglProbe && typeof webglProbe === 'object') {
    if (webglProbe.ready) {
      return { ready: true, reason: null };
    }
    if (
      webglProbe.reason &&
      Object.values(TERMINAL_WEBGL_FALLBACK_REASONS).includes(webglProbe.reason)
    ) {
      return { ready: false, reason: webglProbe.reason };
    }
    return { ready: false, reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED };
  }
  // No explicit probe provided — JSDOM / default behaviour: the addon import
  // and registration are validated at runtime; we optimistically report ready.
  // TerminalTTY wraps the loadAddon call in try/catch and surfaces a
  // warning line + silent DOM fallback if registration actually throws.
  return { ready: true, reason: null };
}

/**
 * Real WebGL capability probe: creates an off-screen <canvas> and asks the
 * browser for a webgl2 context. Safe to call in any browser (the canvas
 * is created and immediately discarded). Returns a frozen descriptor
 * matching the shape expected by resolveWebglCapability.
 *
 * JSDOM has no canvas impl — this returns ready: false with the
 * WEBGL_UNSUPPORTED_IN_WEBVIEW reason. Real WebViews return ready: true
 * when WebGL2 is available, or ready: false with the matching enum when
 * not (WebKitGTK on Linux without GPU acceleration, for example).
 */
export function probeWebglSupport() {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    return Object.freeze({
      ready: false,
      reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
    });
  }
  let canvas;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return Object.freeze({
      ready: false,
      reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
    });
  }
  let context = null;
  try {
    context = canvas.getContext('webgl2') || canvas.getContext('webgl');
  } catch {
    context = null;
  }
  if (!context) {
    return Object.freeze({
      ready: false,
      reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED,
    });
  }

  // Stronger probe: xterm-addon-webgl's renderer path needs more than
  // just a context handle. It allocates a 1x1 RGBA texture in the
  // constructor, compiles a vertex+fragment shader for the glyph atlas,
  // and runs a clear+draw on every refresh. WebKitGTK (and other
  // software-renderer or restricted WebGL builds) often report a valid
  // context but fail silently on texture/shader operations. Run the
  // same minimal subset here so the resolver reflects what the addon
  // will actually be able to do.
  try {
    const tex = context.createTexture();
    if (!tex) {
      contextlose(context);
      return Object.freeze({
        ready: false,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_TEXTURE_ALLOC_FAILED,
      });
    }
    context.bindTexture(context.TEXTURE_2D, tex);
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      1,
      1,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const allocErr = context.getError();
    if (allocErr !== context.NO_ERROR) {
      contextlose(context);
      return Object.freeze({
        ready: false,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_TEXTURE_ALLOC_FAILED,
        glError: allocErr,
      });
    }

    const vs = context.createShader(context.VERTEX_SHADER);
    const fs = context.createShader(context.FRAGMENT_SHADER);
    if (!vs || !fs) {
      contextlose(context);
      return Object.freeze({
        ready: false,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_SHADER_COMPILE_FAILED,
      });
    }
    context.shaderSource(vs, 'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}');
    context.shaderSource(fs, 'precision mediump float;void main(){gl_FragColor=vec4(1,0,0,1);}');
    context.compileShader(vs);
    context.compileShader(fs);
    const vsOk = context.getShaderParameter(vs, context.COMPILE_STATUS);
    const fsOk = context.getShaderParameter(fs, context.COMPILE_STATUS);
    context.deleteShader(vs);
    context.deleteShader(fs);
    if (!vsOk || !fsOk) {
      contextlose(context);
      return Object.freeze({
        ready: false,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_SHADER_COMPILE_FAILED,
      });
    }

    context.deleteTexture(tex);
    contextlose(context);
  } catch {
    contextlose(context);
    return Object.freeze({
      ready: false,
      reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED,
    });
  }

  return Object.freeze({ ready: true, reason: null });
}

// best-effort: release the WebGL context so we don't leak a backing store.
// getContext() returns the SAME context for repeated calls on the same
// canvas, so this is idempotent.
function contextlose(context) {
  try {
    const loseExt = context.getExtension('WEBGL_lose_context');
    if (loseExt) loseExt.loseContext();
  } catch {
    // ignore
  }
}

export function getTerminalRendererCapabilities() {
  return TERMINAL_RENDERER_MODES.reduce((accumulator, mode) => {
    accumulator[mode] = getTerminalRendererCapability(mode);
    return accumulator;
  }, {});
}

/**
 * WebGL tolerates one live context; splits use Canvas 2D (xterm-addon-canvas) so
 * every visible sibling stays on a seamless bitmap renderer without DOM seams.
 */
export const TERMINAL_SPLIT_WEBGL_PANEL_LIMIT = 1;
export const TERMINAL_OPERATIONAL_CANVAS_MODE = 'xterm-canvas';

export function resolveOperationalRendererMode({
  requestedMode,
  effectiveMode,
  visibleTerminalPanelCount = 1,
} = {}) {
  const requested = normalizeRendererMode(requestedMode || 'xterm');
  const effective = normalizeRendererMode(effectiveMode || requested);
  const panelCount = Math.max(1, Number(visibleTerminalPanelCount) || 1);

  // Packaged Tauri/Linux WebKitGTK: single panel uses safe DOM xterm; splits use canvas.
  if (shouldAvoidWebglOnThisRuntime()) {
    if (panelCount > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT) {
      return TERMINAL_OPERATIONAL_CANVAS_MODE;
    }
    if (effective === 'xterm-webgl' || requested === 'xterm-webgl') {
      return 'xterm';
    }
    return effective;
  }

  // Multi-panel splits (swarm grid, focus collapse, etc.) stay on canvas whenever
  // the user asked for the GPU path — even if the WebGL probe demoted effectiveMode.
  if (panelCount > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT) {
    if (requested === 'xterm-webgl' || effective === 'xterm-webgl') {
      return TERMINAL_OPERATIONAL_CANVAS_MODE;
    }
  }

  if (effective !== 'xterm-webgl') return effective;
  if (panelCount <= TERMINAL_SPLIT_WEBGL_PANEL_LIMIT) return 'xterm-webgl';
  return TERMINAL_OPERATIONAL_CANVAS_MODE;
}

export function resolveRendererSelection({ requestedMode, capabilities } = {}) {
  const normalizedMode = normalizeRendererMode(requestedMode);
  const resolvedCapabilities = capabilities || getTerminalRendererCapabilities();
  const capability =
    resolvedCapabilities[normalizedMode] || getTerminalRendererCapability(normalizedMode);

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

  const label =
    selection.capability?.label ||
    TERMINAL_RENDERER_LABELS[selection.requestedMode] ||
    'Este renderer';

  return `${label} todavía no está listo. DevHub sigue usando xterm como fallback estable.`;
}

export function getTerminalRendererWebglFallbackCopy(reason) {
  const label = TERMINAL_RENDERER_LABELS['xterm-webgl'];
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW) {
    return `${label} requiere un WebView con WebGL habilitado. DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED) {
    return `${label} no pudo crear el contexto WebGL en este WebView. DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_TEXTURE_ALLOC_FAILED) {
    return `${label} no pudo alocar texturas WebGL en este WebView (suele pasar con SwiftShader o drivers restringidos). DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_SHADER_COMPILE_FAILED) {
    return `${label} no pudo compilar sus shaders WebGL en este WebView (driver incompleto). DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST) {
    return `${label} perdió el contexto WebGL en esta sesión. DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED) {
    return `${label} no pudo importar el módulo xterm-addon-webgl. DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED) {
    return `${label} no pudo registrar el addon WebGL en este Terminal. DevHub sigue usando xterm como fallback estable.`;
  }
  if (reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_RENDER_FAILED) {
    return `${label} cargó pero el canvas quedó vacío tras montar (WebGL no renderiza en este WebView). DevHub sigue usando xterm como fallback estable.`;
  }
  return `${label} todavía no está disponible. DevHub sigue usando xterm como fallback estable.`;
}

export function getTerminalRendererOptionLabel(mode) {
  return TERMINAL_RENDERER_LABELS[normalizeRendererMode(mode)];
}
