'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Send, Square, VolumeX } from 'lucide-react';
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
import ZedVoiceButton from './ZedVoiceButton';
import { useVoiceCapture } from '@/lib/voice/useVoiceCapture';
import { useVoiceTts } from '@/lib/voice/useVoiceTts';
import { isVoiceFeatureEnabled } from '@/lib/voice/voiceFeatureFlag';
import { useZedVoiceShortcut } from '@/lib/voice/useZedVoiceShortcut';
import { registerTerminalAvoidRect } from '@/components/terminal/nativeLayoutSync';

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

function ZedEqualizer({ className = '', bars = 4 }) {
  return (
    <span className={`zed-eq inline-flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="zed-eq-bar w-[2px] rounded-full bg-current"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

function ZedAuraFrame({
  phase,
  reducedMotion,
  toolType,
  outcomeFlash = null,
  speaking = false,
  listening = false,
  vuLevel = 0,
}) {
  const baseIntensity = clampZedAuraIntensity(phase);
  const intensity = speaking
    ? Math.max(baseIntensity, 0.42)
    : listening
      ? Math.max(baseIntensity, 0.34)
      : baseIntensity;

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

  const showSweep = !reducedMotion && (phase === 'executing' || speaking);

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
      {showSweep ? (
        <div
          className={`zed-aura-sweep absolute inset-0 ${speaking ? 'zed-aura-sweep-speaking' : 'zed-aura-sweep-processing'}`}
          aria-hidden="true"
        />
      ) : null}
      {speaking ? (
        <div
          data-testid="zed-aura-speaking"
          className={`zed-aura-speaking absolute inset-x-0 bottom-0 ${reducedMotion ? '' : 'zed-aura-speaking-animate'}`}
          style={{ '--zed-vu': Math.min(1, Math.max(0, vuLevel)) }}
          aria-hidden="true"
        />
      ) : null}
    </motion.div>
  );
}

const ZedAuraContainer = memo(function ZedAuraContainer({
  phase,
  reducedMotion,
  toolType,
  outcomeFlash,
  speaking,
  recording,
  vuLevel,
}) {
  if (!shouldShowZedAura(phase) && !speaking && !recording) return null;
  return (
    <AnimatePresence>
      <ZedAuraFrame
        key="zed-aura"
        phase={phase}
        reducedMotion={reducedMotion}
        toolType={toolType}
        outcomeFlash={outcomeFlash}
        speaking={speaking}
        listening={recording}
        vuLevel={vuLevel}
      />
    </AnimatePresence>
  );
});

const ZedPillComposer = memo(function ZedPillComposer({
  inputRef,
  input,
  composerValue,
  setInput,
  recording,
  voiceActive,
  isLoading,
  onInputKeyDown,
  onPaste,
  quickSuggestions,
  suggestionIndex,
  voiceEnabled,
  voiceButtonProps,
  speaking,
  onStopSpeaking,
  onStop,
  onSend,
}) {
  return (
    <div className="flex items-center gap-2" data-zed-voice-composer="1">
      <div
        className="zed-pill-avatar flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white bg-[linear-gradient(135deg,var(--accent-primary),color-mix(in_srgb,var(--accent-primary)_45%,#0f2744))]"
        data-zed-state={isLoading ? 'executing' : recording ? 'listening' : 'idle'}
      >
        {voiceActive ? (
          <ZedEqualizer className="text-white" />
        ) : (
          <span className="text-[10px] font-bold leading-none">Z</span>
        )}
      </div>
      <div className="relative flex flex-1 items-center">
        <textarea
          ref={inputRef}
          value={composerValue}
          onChange={(e) => {
            if (!recording) setInput(e.target.value);
          }}
          onKeyDown={onInputKeyDown}
          onPaste={onPaste}
          placeholder={voiceActive ? 'Escuchando…' : ''}
          rows={1}
          className="max-h-[140px] min-h-[28px] w-full resize-none bg-transparent py-1 text-[11px] leading-snug outline-none overflow-y-auto"
          style={{ color: 'var(--text-primary)' }}
          disabled={isLoading || recording}
        />
        {!input.trim() && !recording && !isLoading && !voiceActive ? (
          <AnimatePresence mode="wait">
            <motion.span
              key={suggestionIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="pointer-events-none absolute left-0 top-0 flex h-full items-center text-[11px] text-[var(--text-muted)]"
              aria-hidden="true"
            >
              Probá “{quickSuggestions[suggestionIndex]}”
            </motion.span>
          </AnimatePresence>
        ) : null}
      </div>
      {voiceEnabled ? <ZedVoiceButton {...voiceButtonProps} className="!h-7 !w-7" /> : null}
      {speaking && !isLoading ? (
        <button
          type="button"
          onClick={onStopSpeaking}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--warning,#f0b54a)] text-white"
          aria-label="Detener voz"
        >
          <VolumeX className="h-3 w-3" />
        </button>
      ) : null}
      {isLoading ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--danger,#ef4444)] text-white"
          aria-label="Detener Zed"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white disabled:opacity-40"
          aria-label="Enviar a Zed"
        >
          <Send className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});

const ZedCollapsedPill = memo(function ZedCollapsedPill({
  speaking,
  isLoading,
  currentStep,
  statusLine,
  streamingText,
  quickSuggestions,
  suggestionIndex,
  voiceEnabled,
  onVoiceToggle,
  onStopSpeaking,
  onOpen,
}) {
  const displayLine = streamingText || statusLine;
  return (
    <div
      className="flex h-[32px] w-full cursor-pointer items-center gap-2.5 px-3"
      role="button"
      tabIndex={0}
      aria-label="Abrir Zed"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span
        className={[
          'h-1.5 w-1.5 shrink-0 rounded-full',
          isLoading || speaking
            ? 'bg-[var(--accent-primary)]'
            : 'bg-[var(--accent-primary)] shadow-[0_0_6px_color-mix(in_srgb,var(--accent-primary)_80%,transparent)]',
        ].join(' ')}
        aria-hidden="true"
      />
      <span
        className="min-w-0 flex-1 truncate text-[11px] leading-none"
        style={{ color: 'var(--text-secondary)' }}
        role="status"
        aria-live="polite"
      >
        {speaking ? (
          <span className="uppercase tracking-wide">Hablando…</span>
        ) : isLoading ? (
          <span className="uppercase tracking-wide">{currentStep?.label || 'Zed…'}</span>
        ) : displayLine ? (
          <span key={displayLine} className="zed-status-line block truncate">
            {displayLine}
          </span>
        ) : (
          <AnimatePresence mode="wait">
            <motion.span
              key={suggestionIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="zed-status-line block truncate"
            >
              Probá “{quickSuggestions[suggestionIndex]}”
            </motion.span>
          </AnimatePresence>
        )}
      </span>
      {voiceEnabled && !isLoading ? (
        speaking ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStopSpeaking();
            }}
            aria-label="Detener voz"
            className="shrink-0 appearance-none border-none bg-transparent p-0 text-[10px] uppercase tracking-wide text-[var(--warning,#f0b54a)] transition-colors hover:text-[var(--accent-primary)]"
          >
            Detener
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVoiceToggle();
            }}
            aria-label="Hablar con Zed"
            className="shrink-0 appearance-none border-none bg-transparent p-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
          >
            Mic
          </button>
        )
      ) : null}
    </div>
  );
});

export default function ZedAmbientOverlay({
  sessionKey = 'devhub-zed-chat-default',
  getTerminalPanelCount = null,
  getWorkspaceTerminals = null,
}) {
  const prefersReducedMotion = useReducedMotion();
  const { isOpen, close, open, toggle } = useZedOverlay();
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
    quickSuggestions,
    messages,
    auditTrail,
    sendFromVoice,
    voiceSettings,
    metrics,
    agentStatus,
    streamingMessage,
    planState,
    planControls,
    pendingStepApproval,
  } = useZedChat({ sessionKey, getTerminalPanelCount, getWorkspaceTerminals });

  const voiceEnabled = isVoiceFeatureEnabled() && voiceSettings?.voiceEnabled;
  const { speak, speaking, stopSpeaking, ttsError, clearTtsError } = useVoiceTts({
    enabled: voiceSettings?.ttsEnabled,
  });

  const onFinalTranscript = useCallback(
    (text) => {
      if (!text.trim()) return;
      sendFromVoice(text);
    },
    [sendFromVoice]
  );

  const onPartialTranscript = useCallback(() => {
    /* live transcript rendered via liveTranscript from useVoiceCapture */
  }, []);

  const {
    recording,
    available,
    enginePhase,
    engineReady,
    statusText,
    errorText,
    liveTranscript,
    vuLevel,
    toggleRecording,
    startEngine,
  } = useVoiceCapture({
    onFinalTranscript,
    onPartial: onPartialTranscript,
  });

  const voiceActive = recording;
  const composerValue = recording ? liveTranscript : input;

  useEffect(() => {
    if (!voiceEnabled) return undefined;
    let cancelled = false;
    async function bootVoice() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (cancelled) return;
        await invoke('voice_set_enabled', { enabled: true });
        await invoke('voice_set_settings', {
          settings: {
            model: voiceSettings?.sttModel,
            backend: 'auto',
            language: 'es',
            microphone: voiceSettings?.selectedMicId || 'default',
          },
        });
        await startEngine();
      } catch {
        /* browser dev */
      }
    }
    bootVoice();
    return () => {
      cancelled = true;
    };
  }, [voiceEnabled, voiceSettings?.sttModel, voiceSettings?.selectedMicId, startEngine]);

  const handleVoiceToggle = useCallback(async () => {
    return toggleRecording();
  }, [toggleRecording]);

  const handleVoiceShortcut = useCallback(async () => {
    if (!voiceEnabled) return;
    if (!isOpen) open();
    await handleVoiceToggle();
  }, [voiceEnabled, isOpen, open, handleVoiceToggle]);

  useZedVoiceShortcut({ enabled: voiceEnabled && available, onToggle: handleVoiceShortcut });

  const [overlayToolType, setOverlayToolType] = useState(lastToolType);
  const [outcomeFlash, setOutcomeFlash] = useState(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  useEffect(() => {
    setOverlayToolType(lastToolType);
  }, [lastToolType]);

  useEffect(() => {
    if (quickSuggestions.length === 0) return undefined;
    const id = setInterval(() => {
      setSuggestionIndex((i) => (i + 1) % quickSuggestions.length);
    }, 4500);
    return () => clearInterval(id);
  }, [quickSuggestions.length]);

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
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${nextHeight}px`;
  }, [input]);

  const lastSpokenRef = useRef(null);
  const lastSpokenApprovalRef = useRef(null);
  const pillInnerRef = useRef(null);
  const preOpenActiveElementRef = useRef(null);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return messages[i];
    }
    return null;
  }, [messages]);

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

  const lastVoicedErrorRef = useRef('');
  useEffect(() => {
    if (!errorText && !ttsError) {
      lastVoicedErrorRef.current = '';
      return;
    }
    const voiceError = errorText || ttsError;
    if (voiceError === lastVoicedErrorRef.current) return;
    lastVoicedErrorRef.current = voiceError;
    showStatus(voiceError);
    if (ttsError && clearTtsError) clearTtsError();
  }, [errorText, ttsError, showStatus, clearTtsError]);

  const displayMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages),
    [messages, streamingMessage]
  );

  const displayAssistantMessage = useMemo(
    () => streamingMessage || lastAssistantMessage,
    [streamingMessage, lastAssistantMessage]
  );

  const streamingText = streamingMessage?.content || '';

  const phase = useMemo(
    () => resolveZedAmbientPhase(isLoading, isOpen, statusLine),
    [isLoading, isOpen, statusLine]
  );

  const { showAura, showPill, collapsed, pillState } = useMemo(() => {
    const _showAura = shouldShowZedAura(phase) || speaking || recording;
    const _showPill =
      isOpen ||
      isLoading ||
      speaking ||
      Boolean(statusLine) ||
      activityExpanded ||
      Boolean(currentStep);
    return {
      showAura: _showAura,
      showPill: _showPill,
      collapsed: !isOpen,
      pillState: isLoading ? 'executing' : speaking ? 'speaking' : recording ? 'listening' : 'idle',
    };
  }, [phase, speaking, recording, isOpen, isLoading, statusLine, activityExpanded, currentStep]);

  useEffect(() => {
    if (!showPill || typeof window === 'undefined') return undefined;
    const el = pillInnerRef.current;
    if (!el) return undefined;

    let unregister = () => {};
    let rafId = null;

    const register = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        unregister();
        unregister = registerTerminalAvoidRect(rect, 'zed-pill');
      }
    };

    register();

    if (typeof window.ResizeObserver !== 'function') {
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        unregister();
      };
    }

    const observer = new window.ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(register);
    });
    observer.observe(el);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      unregister();
    };
  }, [showPill]);

  const lastTurnTimestamp =
    displayAssistantMessage && typeof displayAssistantMessage.timestamp === 'string'
      ? displayAssistantMessage.timestamp
      : null;

  useEffect(() => {
    if (isLoading) {
      hideStatus();
      return;
    }
    if (!lastTurnTimestamp || lastTurnTimestamp === 'initial') return;
    if (lastTurnTimestamp === lastStatusTurnRef.current) return;

    const line = buildZedAmbientStatus(displayAssistantMessage);
    if (!line || line === DEFAULT_STATUS_SKIP) return;

    lastStatusTurnRef.current = lastTurnTimestamp;
    showStatus(line);
  }, [hideStatus, isLoading, displayAssistantMessage, lastTurnTimestamp, showStatus]);

  useEffect(() => {
    if (isLoading || !voiceSettings?.ttsEnabled) return;
    if (!displayAssistantMessage?.content || displayAssistantMessage.timestamp === 'initial')
      return;
    if (displayAssistantMessage.partial) return;
    if (lastSpokenRef.current === displayAssistantMessage.timestamp) return;
    lastSpokenRef.current = displayAssistantMessage.timestamp;
    speak(displayAssistantMessage.content);
  }, [isLoading, displayAssistantMessage, speak, voiceSettings?.ttsEnabled]);

  useEffect(() => {
    if (!voiceSettings?.ttsEnabled || !pendingApproval?.preview) return;
    if (pendingApproval.kind !== 'local_intent') return;
    if (lastUserMessage?.source !== 'voice') return;
    const key = `${pendingApproval.message}::${pendingApproval.preview}`;
    if (lastSpokenApprovalRef.current === key) return;
    lastSpokenApprovalRef.current = key;
    speak(pendingApproval.preview);
  }, [lastUserMessage, pendingApproval, speak, voiceSettings?.ttsEnabled]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (isOpen) {
      preOpenActiveElementRef.current = document.activeElement;
      const rafId = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(rafId);
    }
    const rafId = requestAnimationFrame(() => {
      const el = preOpenActiveElementRef.current;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
      preOpenActiveElementRef.current = null;
    });
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = async (e) => {
      if (e.key === 'Escape') {
        if (recording) {
          e.preventDefault();
          await handleVoiceToggle();
          return;
        }
        if (!isOpen && !isLoading && !statusLine) return;
        e.preventDefault();
        if (isLoading) {
          handleStop();
          return;
        }
        close();
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [close, handleStop, handleVoiceToggle, isLoading, isOpen, recording, statusLine]);

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

  const onOpenCollapsed = useCallback(() => open(), [open]);
  const onToggleActivity = useCallback(() => setActivityExpanded((v) => !v), []);

  const voiceButtonProps = useMemo(
    () => ({
      recording,
      enginePhase,
      available,
      engineReady,
      statusText,
      errorText,
      disabled: isLoading,
      onToggle: handleVoiceToggle,
    }),
    [
      recording,
      enginePhase,
      available,
      engineReady,
      statusText,
      errorText,
      isLoading,
      handleVoiceToggle,
    ]
  );

  return (
    <>
      <ZedAuraContainer
        phase={phase}
        reducedMotion={prefersReducedMotion}
        toolType={overlayToolType}
        outcomeFlash={outcomeFlash}
        speaking={speaking}
        recording={recording}
        vuLevel={vuLevel}
      />

      <AnimatePresence>
        {showPill ? (
          <motion.div
            key="zed-pill"
            data-testid="zed-ambient-pill"
            role="region"
            aria-label="Zed asistente"
            aria-busy={isLoading}
            className="fixed inset-x-0 bottom-6 z-[260] flex justify-center pointer-events-none"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 360, damping: 30, mass: 0.7 }
            }
          >
            <div
              ref={pillInnerRef}
              className={[
                'pointer-events-auto w-auto min-w-[360px] max-w-[min(640px,calc(100vw-2rem))]',
                statusExiting ? 'zed-pill-exit' : '',
              ].join(' ')}
            >
              <ZedActivityDrawer
                expanded={activityExpanded}
                onToggle={onToggleActivity}
                messages={displayMessages}
                currentStep={currentStep}
                pendingApproval={pendingApproval}
                auditTrail={auditTrail}
                onApprove={handleApproveCommand}
                onReject={handleRejectApproval}
                isLoading={isLoading}
                metrics={metrics}
                agentStatus={agentStatus}
                planState={planState}
                planControls={planControls}
                pendingStepApproval={pendingStepApproval}
              />
              <div
                data-zed-state={pillState}
                className={[
                  'zed-pill-surface relative overflow-hidden rounded-[22px] border backdrop-blur-md',
                  'border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--border-subtle))]',
                  'bg-[color-mix(in_srgb,#0a1018_92%,transparent)]',
                  'shadow-[0_12px_40px_rgba(0,0,0,0.38)]',
                  'min-h-[32px]',
                  collapsed && !isLoading ? 'px-3 py-1.5' : 'px-3 py-2',
                ].join(' ')}
              >
                <div
                  className={[
                    'zed-pill-topline pointer-events-none absolute inset-x-0 top-0 h-px',
                    pillState !== 'idle' && !prefersReducedMotion ? 'zed-pill-topline-active' : '',
                  ].join(' ')}
                  aria-hidden="true"
                />

                {isOpen ? (
                  <ZedPillComposer
                    inputRef={inputRef}
                    input={input}
                    composerValue={composerValue}
                    setInput={setInput}
                    recording={recording}
                    voiceActive={voiceActive}
                    isLoading={isLoading}
                    onInputKeyDown={onInputKeyDown}
                    onPaste={handlePaste}
                    quickSuggestions={quickSuggestions}
                    suggestionIndex={suggestionIndex}
                    voiceEnabled={voiceEnabled}
                    voiceButtonProps={voiceButtonProps}
                    speaking={speaking}
                    onStopSpeaking={stopSpeaking}
                    onStop={handleStop}
                    onSend={submitAndCollapse}
                  />
                ) : (
                  <ZedCollapsedPill
                    speaking={speaking}
                    isLoading={isLoading}
                    currentStep={currentStep}
                    statusLine={statusLine}
                    streamingText={streamingText}
                    quickSuggestions={quickSuggestions}
                    suggestionIndex={suggestionIndex}
                    voiceEnabled={voiceEnabled}
                    onVoiceToggle={handleVoiceToggle}
                    onStopSpeaking={stopSpeaking}
                    onOpen={onOpenCollapsed}
                  />
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {streamingText}
      </span>
    </>
  );
}

const DEFAULT_STATUS_SKIP =
  'sos Zed, tu copiloto de terminales. para tareas del swarm o lanzar agentes, usá el Pod.';
