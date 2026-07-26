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
import { detectAgentTypeFromCommand, resolveAgentTuiLabel } from '@/lib/terminal/agentTuiMetadata';
import {
  buildProviderResumeCommand,
  extractProviderSessionIdFromCommand,
  mapAgentTypeToRestoreKind,
} from '@/lib/terminal/restorePolicyResolver';

/**
 * TerminalSettingsModal — opened when the gear icon on a suspended terminal panel is clicked.
 * Shows current session info (provider, type, restore policy, cwd) and provides a "Continuar
 * sesión" CTA that dispatches devhub:manual-revive-requested to trigger manual session revival.
 *
 * The provider label is resolved from the panel's launch command (initialCommand) when the
 * caller can supply it, falling back to the legacy sessionType hint ('opencode-durable').
 * When a provider session id is known, the modal surfaces the exact provider resume command
 * that will run on revive; the workspace event bridge builds and applies that command.
 *
 * @param {boolean} open - controls modal visibility
 * @param {function} onClose - called when the user dismisses the modal
 * @param {string} panelId - the terminal panel ID
 * @param {string} sessionId - the provider session ID when known (falls back to panelId)
 * @param {string} sessionType - e.g. 'opencode-durable', 'pty-durable', 'shell-ephemeral'
 * @param {string} restorePolicy - e.g. 'auto', 'manual', 'off'
 * @param {string} cwd - current working directory
 * @param {string} [initialCommand] - panel launch command, used to detect the agent provider
 */
export default function TerminalSettingsModal({
  open,
  onClose,
  panelId,
  sessionId,
  sessionType,
  restorePolicy,
  cwd,
  initialCommand,
}) {
  const agentType =
    detectAgentTypeFromCommand(initialCommand) ||
    (typeof sessionType === 'string' && sessionType.startsWith('opencode') ? 'opencode' : null);
  const providerKind = mapAgentTypeToRestoreKind(agentType);
  const providerLabel = agentType ? resolveAgentTuiLabel(agentType) : null;

  // Prefer the provider session id embedded in the launch command over the
  // caller hint (the bridge passes panelId when it could not extract one).
  const extractedSessionId = providerKind
    ? extractProviderSessionIdFromCommand(providerKind, initialCommand)
    : null;
  const effectiveSessionId = extractedSessionId || sessionId || null;
  const resumeCommand =
    providerKind && effectiveSessionId && effectiveSessionId !== panelId
      ? buildProviderResumeCommand(providerKind, effectiveSessionId)
      : null;

  const handleContinue = () => {
    window.dispatchEvent(
      new CustomEvent('devhub:manual-revive-requested', {
        detail: { panelId, sessionId: effectiveSessionId },
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
            {providerLabel && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Proveedor
                </span>
                <span
                  className="font-mono text-[var(--text-primary)]"
                  data-testid="terminal-settings-provider-label"
                >
                  {providerLabel}
                </span>
              </div>
            )}

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

            {resumeCommand && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Se reanudará con
                </span>
                <code
                  className="font-mono text-xs text-[var(--text-primary)] truncate"
                  title={resumeCommand}
                  data-testid="terminal-settings-resume-command"
                >
                  {resumeCommand}
                </code>
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
