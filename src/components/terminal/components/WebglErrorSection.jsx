'use client';

import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react';
import {
  getTerminalRendererWebglFallbackCopy,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '../terminalRendererCapabilities';

const REASON_HINTS = Object.freeze({
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW]:
    'Habilitá la aceleración por hardware en tu entorno (Tauri / WebView) o cambiá a xterm (DOM).',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED]:
    'Otro proceso puede estar reteniendo el contexto. Reintentá o cambiá a xterm (DOM).',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_TEXTURE_ALLOC_FAILED]:
    'Suele pasar con SwiftShader o drivers virtualizados. Probá xterm (DOM) como fallback estable.',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_SHADER_COMPILE_FAILED]:
    'Tu driver de GPU está incompleto. Reintentá o cambiá a xterm (DOM).',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST]:
    'El contexto se perdió en esta sesión. Reintentá para recuperarlo o usá xterm (DOM).',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED]:
    'El módulo xterm-addon-webgl no se cargó. Verificá la instalación y reintentá.',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED]:
    'El addon WebGL no se pudo montar en este Terminal. Reintentá o cambiá a xterm (DOM).',
  [TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_RENDER_FAILED]:
    'El canvas WebGL quedó vacío tras montar. Reintentá o cambiá a xterm (DOM).',
});

function getReasonHint(reason) {
  if (reason && Object.prototype.hasOwnProperty.call(REASON_HINTS, reason)) {
    return REASON_HINTS[reason];
  }
  return 'Reintentá el probe o cambiá a xterm (DOM) como fallback estable.';
}

export default function WebglErrorSection({ id, reason, onSwitchToXterm, onRetry }) {
  const baseId = id ? `terminal-webgl-error-section-${id}` : 'terminal-webgl-error-section';
  const description = getTerminalRendererWebglFallbackCopy(reason);
  const hint = getReasonHint(reason);
  return (
    <div
      data-testid="terminal-webgl-error-section"
      id={baseId}
      className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <AlertTriangle className="w-10 h-10 text-amber-400" aria-hidden="true" />
      <div className="space-y-2 max-w-md">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          WebGL renderer unavailable
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
        <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-70">
          code: {reason || 'unknown'}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {onSwitchToXterm ? (
          <button
            type="button"
            data-testid="terminal-webgl-error-switch-xterm"
            onClick={onSwitchToXterm}
            className="px-3 py-1.5 rounded-md border text-xs font-mono flex items-center gap-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            Switch to xterm (DOM)
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            data-testid="terminal-webgl-error-retry"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md border text-xs font-mono flex items-center gap-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry probe
          </button>
        ) : null}
      </div>
    </div>
  );
}
