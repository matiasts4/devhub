'use client';

import { motion, AnimatePresence } from 'framer-motion';
import ZedActionCard from './ZedActionCard';
import ZedAuditTrace from './ZedAuditTrace';
import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';

/**
 * Expandable activity timeline for Zed (Phase 5.1).
 */
export default function ZedActivityDrawer({
  expanded,
  onToggle,
  messages = [],
  currentStep = null,
  pendingApproval = null,
  auditTrail = [],
  onApprove,
  onReject,
  isLoading = false,
}) {
  const assistantTurns = messages.filter((m) => m.role === 'assistant' && m !== messages[0]);

  return (
    <AnimatePresence>
      {expanded ? (
        <motion.div
          key="zed-activity-drawer"
          data-testid="zed-activity-drawer"
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 6, height: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto mb-2 w-[min(400px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--accent-primary)_20%,var(--border-subtle))] bg-[color-mix(in_srgb,#0a1018_94%,transparent)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--border-subtle)_80%,transparent)] px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Actividad de Zed
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="text-[10px] uppercase tracking-wide text-[var(--accent-primary)] opacity-80 hover:opacity-100"
              aria-label="Cerrar actividad"
            >
              Cerrar
            </button>
          </div>

          <div
            className="max-h-[min(280px,40vh)] space-y-2 overflow-y-auto px-3 py-2"
            role="log"
            aria-live="polite"
          >
            <ZedAuditTrace entries={auditTrail} />

            {currentStep ? (
              <div
                data-testid="zed-current-step"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)]"
              >
                <span className="zed-loading-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                {currentStep.label || currentStep.tool}
              </div>
            ) : null}

            {pendingApproval ? (
              <div
                data-testid="zed-approval-card"
                data-approval-kind={pendingApproval.kind || 'command'}
                className="rounded-lg border border-[color-mix(in_srgb,var(--warning,#f0b54a)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning,#f0b54a)_8%,transparent)] p-2.5"
              >
                {pendingApproval.kind === 'close_terminal' ? (
                  <p className="mb-2 text-[11px] text-[var(--text-secondary)]">
                    {pendingApproval.command ||
                      (pendingApproval.displayName
                        ? `¿Cerrar la terminal ${pendingApproval.displayName} (${pendingApproval.terminalId})?`
                        : `¿Cerrar la terminal ${pendingApproval.terminalId}?`)}
                  </p>
                ) : pendingApproval.kind === 'local_intent' ? (
                  <p className="mb-2 text-[11px] text-[var(--text-secondary)]">
                    {pendingApproval.preview || '¿Confirmás esta acción local?'}
                  </p>
                ) : (
                  <p className="mb-2 text-[11px] text-[var(--text-secondary)]">
                    Confirmar comando:{' '}
                    <code className="text-[10px] text-[var(--text-primary)]">
                      {pendingApproval.command || pendingApproval.input?.input}
                    </code>
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={isLoading}
                    className="rounded-md bg-[var(--accent-primary)] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                  >
                    {pendingApproval.kind === 'close_terminal'
                      ? 'Cerrar'
                      : pendingApproval.kind === 'local_intent'
                        ? 'Ejecutar'
                        : 'Aprobar'}
                  </button>
                  <button
                    type="button"
                    onClick={onReject}
                    className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {[...assistantTurns].reverse().map((msg, idx) => (
              <div key={msg.timestamp || idx} className="space-y-1.5">
                {typeof msg.content === 'string' && msg.content && msg.content !== 'initial' ? (
                  <p className="text-[11px] leading-snug text-[var(--text-primary)]">
                    {msg.content}
                  </p>
                ) : null}
                {Array.isArray(msg.tool_results)
                  ? msg.tool_results.map((entry, i) => (
                      <ZedActionCard
                        key={`${msg.timestamp}-${i}`}
                        entry={entry}
                        onFocusTerminal={(parsed) => {
                          if (typeof window === 'undefined') return;
                          window.dispatchEvent(
                            new CustomEvent('devhub:terminal-focus', {
                              detail: { panelId: parsed?.terminalId || parsed?.session_id },
                            })
                          );
                        }}
                        onOpenUrl={(parsed) => {
                          if (parsed?.url) dispatchZedOpenUrl({ url: parsed.url, focus: true });
                        }}
                      />
                    ))
                  : null}
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
