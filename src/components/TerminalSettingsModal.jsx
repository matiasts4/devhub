'use client';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * TerminalSettingsModal — opened when the gear icon on a suspended terminal panel is clicked.
 * Shows current session info (type, restore policy, cwd) and provides a "Continuar sesión"
 * CTA that dispatches devhub:manual-revive-requested to trigger manual session revival.
 *
 * @param {boolean} open - controls modal visibility
 * @param {function} onClose - called when the user dismisses the modal
 * @param {string} panelId - the terminal panel ID
 * @param {string} sessionId - the opencode session ID (from opencodeSessionId)
 * @param {string} sessionType - e.g. 'opencode-durable', 'pty-durable', 'shell-ephemeral'
 * @param {string} restorePolicy - e.g. 'auto', 'manual', 'off'
 * @param {string} cwd - current working directory
 */
export default function TerminalSettingsModal({
  open,
  onClose,
  panelId,
  sessionId,
  sessionType,
  restorePolicy,
  cwd,
}) {
  const handleContinue = () => {
    window.dispatchEvent(
      new CustomEvent('devhub:manual-revive-requested', {
        detail: { panelId, sessionId },
      })
    );
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de Terminal</DialogTitle>
            <DialogDescription>
              Sesión suspendida — revisá la configuración antes de continuar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-sm text-[var(--text-secondary)]">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Tipo de sesión
              </span>
              <span className="font-mono text-[var(--text-primary)]">
                {sessionType || 'Desconocido'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Política de restauración
              </span>
              <span className="font-mono text-[var(--text-primary)]">
                {restorePolicy || 'auto'}
              </span>
            </div>

            {cwd && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Directorio
                </span>
                <span className="font-mono text-[var(--text-primary)] truncate" title={cwd}>
                  {cwd}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--border-subtle)] bg-transparent text-sm text-[var(--text-secondary)] hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              data-testid="terminal-settings-continue-btn"
              onClick={handleContinue}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent-primary)] text-sm font-semibold text-[var(--accent-primary)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Continuar sesión
            </button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
