'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Send, Square, Sparkles } from 'lucide-react';
import { useZedChat } from '@/lib/asistente/useZedChat';
import { useZedOverlay } from '@/lib/asistente/useZedOverlay';
import { buildZedAmbientStatus } from '@/lib/asistente/buildZedAmbientStatus';
import {
  resolveZedAmbientPhase,
  shouldShowZedAura,
  ZED_AURA_TOOL_TYPE_EVENT,
  ZED_AURA_OUTCOME_EVENT,
} from '@/lib/asistente/zedOverlayEvents';
import { clampZedAuraIntensity } from '@/lib/asistente/zedAuraBudget';
import ZedActivityDrawer from './ZedActivityDrawer';

const STATUS_VISIBLE_MS = 4000;
const STATUS_EXIT_MS = 320;

const ACCENT_HEX = Object.freeze({
  terminal: '#4ad3c0',
  browser: '#9b6bff',
  file: '#f0b54a',
});

function ZedLoadingDots({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-current opacity-70"
          style={{
            animation: 'zed-dot-pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </span>
  );
}

function ZedAuraFrame({ phase, reducedMotion, toolType, outcomeFlash = null }) {
  const intensity = clampZedAuraIntensity(phase);
  const pulseClass =
    !reducedMotion && toolType && toolType !== 'null' ? `zed-aura-pulse-${toolType}` : '';
  const outcomeClass =
    outcomeFlash === 'success'
      ? 'zed-aura-outcome-success'
      : outcomeFlash === 'error'
        ? 'zed-aura-outcome-error'
        : '';

  const innerStyle = useMemo(
    () => ({
      '--accent-terminal': ACCENT_HEX.terminal,
      '--accent-browser': ACCENT_HEX.browser,
      '--accent-file': ACCENT_HEX.file,
      background: `
        radial-gradient(ellipse 48% 58% at 0% 52%, color-mix(in srgb, var(--accent-primary) 16%, transparent) 0%, transparent 74%),
        radial-gradient(ellipse 34% 42% at 100% 44%, color-mix(in srgb, var(--accent-primary) 9%, transparent) 0%, transparent 70%),
        radial-gradient(ellipse 72% 28% at 50% 100%, color-mix(in srgb, var(--accent-primary) 10%, transparent) 0%, transparent 72%)
      `,
    }),
    []
  );

  return (
    <motion.div
      data-testid="zed-ambient-aura"
      className="pointer-events-none fixed inset-0 z-[248]"
      initial={{ opacity: 0 }}
      animate={{ opacity: intensity }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden="true"
    >
      <div
        className={`zed-aura-root absolute inset-0 ${pulseClass} ${outcomeClass}`}
        data-tool={toolType || 'null'}
        style={innerStyle}
      />
    </motion.div>
  );
}

export default function ZedAmbientOverlay({
  sessionKey = 'devhub-zed-chat-default',
  getTerminalPanelCount = null,
  getWorkspaceTerminals = null,
}) {
  const prefersReducedMotion = useReducedMotion();
  const { isOpen, close, toggle } = useZedOverlay();
  const {
    input,
    setInput,
    isLoading,
    handleSend,
    handleStop,
    handleKeyDown,
    handlePaste,
    lastAssistantMessage,
    lastToolType,
    currentStep,
    activityExpanded,
    setActivityExpanded,
    pendingApproval,
    handleApproveCommand,
    handleRejectApproval,
    applySuggestion,
    quickSuggestions,
    messages,
    auditTrail,
  } = useZedChat({ sessionKey, getTerminalPanelCount, getWorkspaceTerminals });

  const [overlayToolType, setOverlayToolType] = useState(lastToolType);
  const [outcomeFlash, setOutcomeFlash] = useState(null);
  useEffect(() => {
    setOverlayToolType(lastToolType);
  }, [lastToolType]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (e) => {
      const next = e?.detail?.toolType;
      setOverlayToolType(next ?? null);
    };
    window.addEventListener(ZED_AURA_TOOL_TYPE_EVENT, handler);
    return () => window.removeEventListener(ZED_AURA_TOOL_TYPE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOutcome = (e) => {
      const outcome = e?.detail?.outcome;
      if (outcome !== 'success' && outcome !== 'error') return;
      setOutcomeFlash(outcome);
      window.setTimeout(() => setOutcomeFlash(null), 900);
    };
    window.addEventListener(ZED_AURA_OUTCOME_EVENT, onOutcome);
    return () => window.removeEventListener(ZED_AURA_OUTCOME_EVENT, onOutcome);
  }, []);

  const inputRef = useRef(null);
  const [statusLine, setStatusLine] = useState(null);
  const [statusExiting, setStatusExiting] = useState(false);
  const lastStatusTurnRef = useRef(null);
  const statusVisibleTimerRef = useRef(null);
  const statusExitTimerRef = useRef(null);

  const clearStatusTimers = useCallback(() => {
    if (statusVisibleTimerRef.current) {
      clearTimeout(statusVisibleTimerRef.current);
      statusVisibleTimerRef.current = null;
    }
    if (statusExitTimerRef.current) {
      clearTimeout(statusExitTimerRef.current);
      statusExitTimerRef.current = null;
    }
  }, []);

  const hideStatus = useCallback(() => {
    clearStatusTimers();
    setStatusExiting(false);
    setStatusLine(null);
  }, [clearStatusTimers]);

  const dismissStatus = useCallback(() => {
    setStatusExiting(true);
    statusExitTimerRef.current = setTimeout(() => {
      hideStatus();
    }, STATUS_EXIT_MS);
  }, [hideStatus]);

  const showStatus = useCallback(
    (line) => {
      clearStatusTimers();
      setStatusExiting(false);
      setStatusLine(line);
      statusVisibleTimerRef.current = setTimeout(dismissStatus, STATUS_VISIBLE_MS);
    },
    [clearStatusTimers, dismissStatus]
  );

  const phase = useMemo(
    () => resolveZedAmbientPhase(isLoading, isOpen, statusLine),
    [isLoading, isOpen, statusLine]
  );
  const showAura = shouldShowZedAura(phase);
  const showPill = isOpen || isLoading || Boolean(statusLine) || activityExpanded || Boolean(currentStep);
  const collapsed = !isOpen;

  const lastTurnTimestamp =
    lastAssistantMessage && typeof lastAssistantMessage.timestamp === 'string'
      ? lastAssistantMessage.timestamp
      : null;

  useEffect(() => {
    if (isLoading) {
      hideStatus();
      return;
    }
    if (!lastTurnTimestamp || lastTurnTimestamp === 'initial') return;
    if (lastTurnTimestamp === lastStatusTurnRef.current) return;

    const line = buildZedAmbientStatus(lastAssistantMessage);
    if (!line || line === DEFAULT_STATUS_SKIP) return;

    lastStatusTurnRef.current = lastTurnTimestamp;
    showStatus(line);
  }, [hideStatus, isLoading, lastAssistantMessage, lastTurnTimestamp, showStatus]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (!isOpen && !isLoading && !statusLine) return;
      e.preventDefault();
      if (isLoading) {
        handleStop();
        return;
      }
      close();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [close, handleStop, isLoading, isOpen, statusLine]);

  useEffect(() => () => clearStatusTimers(), [clearStatusTimers]);

  const submitAndCollapse = useCallback(() => {
    if (!input.trim() || isLoading) return;
    close();
    handleSend();
  }, [close, handleSend, input, isLoading]);

  const onInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isLoading) {
        close();
      }
      handleKeyDown(e);
    },
    [close, handleKeyDown, input, isLoading]
  );

  return (
    <>
      <AnimatePresence>
        {showAura ? (
          <ZedAuraFrame
            key="zed-aura"
            phase={phase}
            reducedMotion={prefersReducedMotion}
            toolType={overlayToolType}
            outcomeFlash={outcomeFlash}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showPill ? (
          <motion.div
            key="zed-pill"
            data-testid="zed-ambient-pill"
            role="region"
            aria-label="Zed asistente"
            className="fixed inset-x-0 bottom-6 z-[260] flex justify-center pointer-events-none"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.01 }
                : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <div
              className={[
                'pointer-events-auto w-[min(400px,calc(100vw-1.5rem))]',
                statusExiting ? 'zed-pill-exit' : '',
              ].join(' ')}
            >
              <ZedActivityDrawer
                expanded={activityExpanded}
                onToggle={() => setActivityExpanded((v) => !v)}
                messages={messages}
                currentStep={currentStep}
                pendingApproval={pendingApproval}
                auditTrail={auditTrail}
                onApprove={handleApproveCommand}
                onReject={handleRejectApproval}
                isLoading={isLoading}
              />
              <div
                className={[
                  'relative overflow-hidden rounded-xl border backdrop-blur-md',
                  'border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--border-subtle))]',
                  'bg-[color-mix(in_srgb,#0a1018_92%,transparent)]',
                  'shadow-[0_12px_40px_rgba(0,0,0,0.38)]',
                  'min-h-[36px]',
                  collapsed && !isLoading ? 'px-3 py-2' : 'px-3 py-2.5',
                ].join(' ')}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent-primary)_55%,transparent),transparent)]"
                  aria-hidden="true"
                />

                {isOpen ? (
                  <div className="flex items-end gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,var(--accent-primary),color-mix(in_srgb,var(--accent-primary)_45%,#0f2744))]">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onInputKeyDown}
                      onPaste={handlePaste}
                      placeholder="Pedile a Zed…"
                      rows={1}
                      className="max-h-[80px] min-h-[32px] flex-1 resize-none bg-transparent text-[12px] leading-snug outline-none"
                      style={{ color: 'var(--text-primary)' }}
                      disabled={isLoading}
                    />
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--danger,#ef4444)] text-white"
                        aria-label="Detener Zed"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={submitAndCollapse}
                        disabled={!input.trim()}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-primary)] text-white disabled:opacity-40"
                        aria-label="Enviar a Zed"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex h-[20px] items-center gap-2.5">
                    <div
                      className={[
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        isLoading
                          ? 'text-[var(--accent-primary)]'
                          : 'bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]',
                      ].join(' ')}
                    >
                      {isLoading ? <ZedLoadingDots /> : <Sparkles className="h-3 w-3" />}
                    </div>
                    <div
                      className="min-w-0 flex-1 truncate text-[11px] leading-none tracking-wide"
                      style={{ color: isLoading ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                      role="status"
                      aria-live="polite"
                    >
                    {isLoading ? (
                        <span className="uppercase">
                          {currentStep?.label || 'Zed…'}
                        </span>
                      ) : (
                        <span key={statusLine} className="zed-status-line block truncate">
                          {statusLine}
                        </span>
                      )}
                    </div>
                    {!isLoading && statusLine ? (
                      <button
                        type="button"
                        onClick={() => setActivityExpanded(true)}
                        className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--accent-primary)] opacity-80 transition-opacity hover:opacity-100"
                        aria-label="Ver actividad"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                )}

                {isOpen && !input.trim() && !isLoading ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                    {quickSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="rounded-full border border-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)] px-2 py-0.5 text-[9px] text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isOpen ? (
                  <p className="mt-1.5 pl-9 text-[9px] text-[var(--text-muted)]">
                    Enter · Esc · Ctrl+Shift+Z
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

const DEFAULT_STATUS_SKIP =
  'sos Zed, tu copiloto de terminales. para tareas del swarm o lanzar agentes, usá el Pod.';
