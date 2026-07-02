'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { getTransition } from '@/components/ui/system/motion-tokens';
import ZedActionCard from './ZedActionCard';
import ZedAuditTrace from './ZedAuditTrace';
import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';

const MAX_VISIBLE_ACTIVITY_MESSAGES = 50;

/**
 * Expandable activity timeline for Zed (Phase 5.1).
 */
function formatMs(value) {
  const n = Number(value) || 0;
  return `${n}ms`;
}

function StatusPill({ status }) {
  const colors = {
    idle: 'bg-[color-mix(in_srgb,var(--text-muted)_18%,transparent)] text-[var(--text-muted)]',
    working:
      'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]',
    delegating:
      'bg-[color-mix(in_srgb,var(--warning,#f0b54a)_18%,transparent)] text-[var(--warning,#f0b54a)]',
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${colors[status] || colors.idle}`}
    >
      {status}
    </span>
  );
}

const ZedActivityMessage = memo(function ZedActivityMessage({ msg, onFocusTerminal, onOpenUrl }) {
  return (
    <div key={msg.timestamp} className="space-y-1.5">
      {typeof msg.content === 'string' && msg.content && msg.content !== 'initial' ? (
        <p
          className={`text-[11px] leading-snug ${msg.partial ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
        >
          {msg.content}
          {msg.partial ? <span className="ml-0.5 inline-block animate-pulse">▌</span> : null}
        </p>
      ) : null}
      {Array.isArray(msg.tool_results)
        ? msg.tool_results.map((entry, i) => (
            <ZedActionCard
              key={`${msg.timestamp}-${i}`}
              entry={entry}
              onFocusTerminal={onFocusTerminal}
              onOpenUrl={onOpenUrl}
            />
          ))
        : null}
    </div>
  );
});

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
  metrics = null,
  agentStatus = null,
  planState = null,
  planControls = null,
  pendingStepApproval = null,
}) {
  const motionMode = useMotionMode();
  const isReduced = motionMode === 'reduced';
  const isAmplified = motionMode === 'amplified';
  const [showAll, setShowAll] = useState(false);

  const assistantTurns = useMemo(
    () => messages.filter((m) => m.role === 'assistant' && m !== messages[0]),
    [messages]
  );

  const visibleTurns = showAll
    ? assistantTurns
    : assistantTurns.slice(-MAX_VISIBLE_ACTIVITY_MESSAGES);
  const hiddenCount = assistantTurns.length - visibleTurns.length;

  const handleFocusTerminal = useCallback((parsed) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('devhub:terminal-focus', {
        detail: { panelId: parsed?.terminalId || parsed?.session_id },
      })
    );
  }, []);

  const handleOpenUrl = useCallback((parsed) => {
    if (parsed?.url) dispatchZedOpenUrl({ url: parsed.url, focus: true });
  }, []);

  return (
    <AnimatePresence>
      {expanded ? (
        <motion.div
          key="zed-activity-drawer"
          data-testid="zed-activity-drawer"
          initial={isReduced ? { opacity: 0 } : { opacity: 0, y: isAmplified ? 14 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={isReduced ? { opacity: 0 } : { opacity: 0, y: isAmplified ? 10 : 6 }}
          transition={getTransition('open', motionMode)}
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
            className="max-h-[min(320px,50vh)] space-y-2 overflow-y-auto px-3 py-2"
            role="log"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {(metrics || agentStatus) && (
              <div className="space-y-1.5 rounded-lg border border-[color-mix(in_srgb,var(--border-subtle)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_3%,transparent)] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Zed
                  </span>
                  {agentStatus ? <StatusPill status={agentStatus.status} /> : null}
                </div>
                {metrics ? (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div className="rounded bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] px-1 py-1">
                      <div className="text-[10px] text-[var(--text-muted)]">Fast-path</div>
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {metrics.fastPath.hitRate}%
                      </div>
                    </div>
                    <div className="rounded bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] px-1 py-1">
                      <div className="text-[10px] text-[var(--text-muted)]">Media</div>
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {formatMs(metrics.roundTrip.avgMs)}
                      </div>
                    </div>
                    <div className="rounded bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] px-1 py-1">
                      <div className="text-[10px] text-[var(--text-muted)]">P95</div>
                      <div className="text-[11px] font-medium text-[var(--text-primary)]">
                        {formatMs(metrics.roundTrip.p95Ms)}
                      </div>
                    </div>
                  </div>
                ) : null}
                {agentStatus?.currentTaskId ? (
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Tarea activa:{' '}
                    <code className="text-[var(--text-primary)]">{agentStatus.currentTaskId}</code>
                  </p>
                ) : null}
              </div>
            )}

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

            {pendingStepApproval ? (
              <div
                data-testid="zed-plan-step-approval"
                className="rounded-lg border border-[color-mix(in_srgb,var(--warning,#f0b54a)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning,#f0b54a)_8%,transparent)] p-2.5"
              >
                <p className="mb-2 text-[11px] text-[var(--text-secondary)]">
                  Confirmar paso del plan:{' '}
                  <code className="text-[10px] text-[var(--text-primary)]">
                    {pendingStepApproval.tool}
                  </code>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={isLoading}
                    className="rounded-md bg-[var(--accent-primary)] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                  >
                    Ejecutar
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

            {planState && planControls ? (
              <div
                data-testid="zed-plan-controls"
                className="flex items-center justify-between rounded-lg border border-[color-mix(in_srgb,var(--border-subtle)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_3%,transparent)] p-2"
              >
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Plan: {planState}
                </span>
                <div className="flex gap-1.5">
                  {planState === 'running' ? (
                    <button
                      type="button"
                      onClick={planControls.pause}
                      className="rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Pausar
                    </button>
                  ) : planState === 'paused' ? (
                    <button
                      type="button"
                      onClick={planControls.resume}
                      className="rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Reanudar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={planControls.abort}
                    className="rounded border border-[color-mix(in_srgb,var(--danger,#ef4444)_40%,transparent)] px-2 py-0.5 text-[10px] text-[var(--danger,#ef4444)]"
                  >
                    Abortar
                  </button>
                </div>
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

            {[...visibleTurns].reverse().map((msg) => (
              <ZedActivityMessage
                key={msg.timestamp || msg.id}
                msg={msg}
                onFocusTerminal={handleFocusTerminal}
                onOpenUrl={handleOpenUrl}
              />
            ))}

            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full rounded-md border border-[var(--border-subtle)] py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Mostrar {hiddenCount} mensajes anteriores
              </button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
