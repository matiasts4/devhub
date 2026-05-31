'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  panelStyle,
  panelHeaderStripStyle,
  btnSecondaryStyle,
  pillStyle,
} from '@/chrome/morphology';
import {
  RESTORE_POLICY,
  readTerminalRestorePreferences,
  writeTerminalRestorePreferences,
} from '@/lib/terminal/restorePreferences';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

/**
 * TerminalRestoreSettingsModal — opened from the top-bar gear button in the terminal workspace.
 * Allows configuring restore policies for OpenCode, Generic, and Swarm terminal sessions.
 * Uses z-[10000] and createPortal to appear above native terminal surfaces.
 *
 * @param {boolean} open - controls modal visibility
 * @param {function} onClose - called when the user dismisses the modal
 */
export default function TerminalRestoreSettingsModal({ open, onClose }) {
  const [restorePrefs, setRestorePrefs] = useState({
    opencode: RESTORE_POLICY.AUTO,
    generic: RESTORE_POLICY.AUTO,
    swarm: RESTORE_POLICY.AUTO,
  });

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      const saved = readTerminalRestorePreferences(window.localStorage);
      setRestorePrefs(saved);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handlePolicyChange = (sessionType) => (nextPolicy) => {
    setRestorePrefs((prev) => ({ ...prev, [sessionType]: nextPolicy }));
    if (typeof window !== 'undefined') {
      writeTerminalRestorePreferences(window.localStorage, { [sessionType]: nextPolicy });
    }
  };

  const SESSION_TYPES = [
    { key: 'opencode', label: 'OpenCode', icon: '◆' },
    { key: 'generic', label: 'Shell Genérico', icon: '$' },
    { key: 'swarm', label: 'Swarm', icon: '◇' },
  ];

  const POLICY_OPTIONS = [
    { value: RESTORE_POLICY.AUTO, label: 'Automático' },
    { value: RESTORE_POLICY.MANUAL, label: 'Manual' },
    { value: RESTORE_POLICY.OFF, label: 'Desactivado' },
  ];

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de restauración de terminales"
      style={{ background: 'var(--chrome-overlay, rgba(0,0,0,0.6))' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
        style={panelStyle({ emphasized: true })}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={panelHeaderStripStyle()}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1"
                style={pillStyle({ tone: 'accent' })}
              >
                ⚙ Configuración
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Restauración de Terminales</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Elegí cómo se restauran las terminales al iniciar DevHub.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="text-sm"
            style={btnSecondaryStyle()}
          >
            Cerrar
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {SESSION_TYPES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label
                  htmlFor={`restore-policy-${key}`}
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {label}
                </label>
                <Select value={restorePrefs[key]} onValueChange={handlePolicyChange(key)}>
                  <SelectTrigger
                    id={`restore-policy-${key}`}
                    data-testid={`restore-policy-modal-${key}`}
                    className="h-9 w-[160px] rounded-xl border px-3 text-sm"
                    style={{
                      background: 'var(--chrome-control-fill)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <SelectValue placeholder="Seleccionar política" />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[10001] rounded-xl border !bg-[var(--surface-elevated)]"
                    style={{
                      backgroundColor: 'var(--surface-elevated) !important',
                    }}
                  >
                    {POLICY_OPTIONS.map(({ value, label: optionLabel }) => (
                      <SelectItem
                        key={value}
                        value={value}
                        className="text-sm"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'var(--surface-elevated)',
                        }}
                      >
                        {optionLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Info panel */}
          <div
            className="mt-5 space-y-2 rounded-lg border p-4 text-xs"
            style={panelStyle({ emphasized: false })}
          >
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Políticas de restauración:
            </p>
            <div className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex items-center"
                  style={pillStyle({ tone: 'success' })}
                >
                  Auto
                </span>
                <span>Restaura la terminal automáticamente al iniciar.</span>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex items-center"
                  style={pillStyle({ tone: 'warning' })}
                >
                  Manual
                </span>
                <span>Panel suspendido hasta que hagas clic en continuar.</span>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex items-center"
                  style={pillStyle({ tone: 'danger' })}
                >
                  Off
                </span>
                <span>Ignora esta terminal al inicio.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 border-t px-6 py-4"
          style={panelHeaderStripStyle()}
        >
          <button type="button" onClick={onClose} style={btnSecondaryStyle()}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
