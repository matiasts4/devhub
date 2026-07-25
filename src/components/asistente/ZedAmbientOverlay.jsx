'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Send, Square, Volume2, VolumeX } from 'lucide-react';
import ZedActivityDrawer from './ZedActivityDrawer';
import ZedVoiceButton from './ZedVoiceButton';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { getTransition } from '@/components/ui/system/motion-tokens';
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
import {
  readZedOverlaySettings,
  ZED_OVERLAY_SETTINGS_EVENT,
  ZED_AURA_INTENSITY_SCALE,
  ZED_AURA_SPEED_SCALE,
  ZED_DRAWER_WIDTH_PX,
} from '@/lib/asistente/zedOverlaySettings';
import { useVoiceCapture } from '@/lib/voice/useVoiceCapture';
import { useVoiceTts } from '@/lib/voice/useVoiceTts';
import { isVoiceFeatureEnabled } from '@/lib/voice/voiceFeatureFlag';
import { useZedVoiceShortcut } from '@/lib/voice/useZedVoiceShortcut';
import { buildVoiceEngineConfig } from '@/lib/voice/resolveVoiceEngineConfig';

const STATUS_VISIBLE_MS = 4000;
const STATUS_EXIT_MS = 320;
const TERMINAL_SPEECH_TOOLS = new Set(['summarize_terminal', 'review_terminal_output']);

export function buildAutomaticSpeechText(message) {
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (!content) return '';
  const isTerminalReply = message?.tool_results?.some((entry) =>
    TERMINAL_SPEECH_TOOLS.has(entry?.tool)
  );
  if (!isTerminalReply) return content;

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 3) return content;
  return [lines[0], ...lines.slice(-2)]
    .map((line) => (/[.!?:]$/.test(line) ? line : `${line}.`))
    .join(' ');
}

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
  motionMode,
  toolType,
  outcomeFlash = null,
  speaking = false,
  listening = false,
  vuLevel = 0,
  intensityScale = 1,
  speedScale = 1,
}) {
  const baseIntensity = clampZedAuraIntensity(phase);
  const intensity = Math.min(
    1,
    (speaking
      ? Math.max(baseIntensity, 0.42)
      : listening
        ? Math.max(baseIntensity, 0.34)
        : baseIntensity) * intensityScale
  );

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
      style={{ '--zed-aura-speed': speedScale }}
      initial={{ opacity: 0 }}
      animate={{ opacity: intensity }}
      exit={{ opacity: 0 }}
      transition={getTransition('fade', motionMode)}
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
  motionMode,
  toolType,
  outcomeFlash,
  speaking,
  recording,
  vuLevel,
  enabled = true,
  intensityScale = 1,
  speedScale = 1,
}) {
  if (!enabled) return null;
  if (!shouldShowZedAura(phase) && !speaking && !recording) return null;
  return (
    <AnimatePresence>
      <ZedAuraFrame
        key="zed-aura"
        phase={phase}
        reducedMotion={reducedMotion}
        motionMode={motionMode}
        toolType={toolType}
        outcomeFlash={outcomeFlash}
        speaking={speaking}
        listening={recording}
        vuLevel={vuLevel}
        intensityScale={intensityScale}
        speedScale={speedScale}
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
  ttsEnabled,
  hasSpeakableResponse,
  onVoiceToggle,
  onReplayResponse,
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
      {!isLoading ? (
        <div className="flex shrink-0 items-center gap-2">
          {ttsEnabled && speaking ? (
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
          ) : ttsEnabled && hasSpeakableResponse ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReplayResponse();
              }}
              aria-label="Escuchar última respuesta"
              className="inline-flex shrink-0 items-center gap-1 appearance-none border-none bg-transparent p-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
            >
              <Volume2 className="h-3 w-3" />
              Escuchar
            </button>
          ) : null}
          {voiceEnabled && !speaking ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default function ZedAmbientOverlay({
  sessionKey = 'devhub-zed-chat-default',
  getTerminalPanelCount = null,
  getWorkspaceTerminals = null,
  getWorkspaceWindows = null,
  /** False while Terminales is soft-mounted off-route — keep Zed closed until the user opens it. */
  managerVisible = true,
}) {
  const motionMode = useMotionMode();
  const isReduced = motionMode === 'reduced';
  const isAmplified = motionMode === 'amplified';
  const {
    isOpen = false,
    close = () => {},
    open = () => {},
    toggle = () => {},
  } = useZedOverlay() || {};

  // Soft-mount keeps this tree alive off /terminales. Never leave the composer open
  // across route hide/show — only an explicit user open while visible should expand it.
  // Re-run when isOpen flips too so Ctrl+Shift+Z while warm-mounted off-route cannot stick.
  useEffect(() => {
    if (!managerVisible) close();
  }, [managerVisible, isOpen, close]);
  const zedChat =
    useZedChat({ sessionKey, getTerminalPanelCount, getWorkspaceTerminals, getWorkspaceWindows }) ||
    {};
  const {
    input = '',
    setInput = () => {},
    isLoading = false,
    handleSend = () => {},
    handleStop = () => {},
    handleKeyDown = () => {},
    handlePaste = () => {},
    lastAssistantMessage = null,
    lastToolType = null,
    currentStep = null,
    activityExpanded = false,
    setActivityExpanded = () => {},
    pendingApproval = null,
    handleApproveCommand = () => {},
    handleRejectApproval = () => {},
    quickSuggestions = [],
    messages = [],
    restoredFromStorage = false,
    auditTrail = [],
    sendFromVoice = () => {},
    voiceSettings = null,
    metrics = null,
    agentStatus = null,
    streamingMessage = null,
    planState = null,
    planControls = null,
    pendingStepApproval = null,
  } = zedChat;

  const voiceFeatureEnabled = isVoiceFeatureEnabled();
  const voiceEnabled = voiceFeatureEnabled && voiceSettings?.voiceEnabled;
  const ttsEnabled = voiceFeatureEnabled && voiceSettings?.ttsEnabled;
  const {
    speak = () => {},
    speaking = false,
    stopSpeaking = () => {},
    ttsError = '',
    clearTtsError = () => {},
  } = useVoiceTts({
    enabled: ttsEnabled,
    voice: voiceSettings?.ttsVoice,
    rate: voiceSettings?.ttsRate,
    systemVoiceURI: voiceSettings?.ttsSystemVoiceURI || '',
  }) || {};

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
    recording = false,
    available = false,
    enginePhase = 'idle',
    engineReady = false,
    statusText = '',
    errorText = '',
    liveTranscript = '',
    vuLevel = 0,
    toggleRecording = () => {},
    startEngine = () => {},
  } = useVoiceCapture({
    onFinalTranscript,
    onPartial: onPartialTranscript,
  }) || {};

  const voiceActive = recording;
  const composerValue = recording ? liveTranscript : input;

  // Lazy voice boot — never probe mic / start STT just because Terminales mounted.
  const ensureVoiceReady = useCallback(async () => {
    if (!voiceEnabled) return { ok: false };
    try {
      const { invokeDesktop, isElectronDesktop, detectDesktopRuntime } =
        await import('@/lib/desktop/desktopBridge');
      const settings = await buildVoiceEngineConfig(voiceSettings);

      if (isElectronDesktop()) {
        await invokeDesktop(
          'voice_set_enabled',
          { enabled: true },
          { tauriWrapRequest: false, failureShape: { ok: false } }
        );
        await invokeDesktop(
          'voice_set_settings',
          { settings },
          { tauriWrapRequest: false, failureShape: { ok: false } }
        );
        return startEngine();
      }

      if (detectDesktopRuntime() === 'tauri') {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('voice_set_enabled', { enabled: true });
        await invoke('voice_set_settings', { settings });
        return startEngine();
      }

      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, [
    voiceEnabled,
    voiceSettings?.sttModel,
    voiceSettings?.sttBackend,
    voiceSettings?.selectedMicId,
    voiceSettings?.ttsVoice,
    voiceSettings?.ttsRate,
    voiceSettings?.ttsSystemVoiceURI,
    startEngine,
  ]);

  const handleVoiceToggle = useCallback(async () => {
    await ensureVoiceReady();
    return toggleRecording();
  }, [ensureVoiceReady, toggleRecording]);

  const handleVoiceShortcut = useCallback(async () => {
    if (!voiceEnabled || !managerVisible) return;
    if (!isOpen) open();
    await handleVoiceToggle();
  }, [voiceEnabled, managerVisible, isOpen, open, handleVoiceToggle]);

  useZedVoiceShortcut({ enabled: voiceEnabled && available, onToggle: handleVoiceShortcut });

  const [overlaySettings, setOverlaySettings] = useState(() => readZedOverlaySettings());
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onSettingsChange = () => setOverlaySettings(readZedOverlaySettings());
    window.addEventListener(ZED_OVERLAY_SETTINGS_EVENT, onSettingsChange);
    window.addEventListener('storage', onSettingsChange);
    return () => {
      window.removeEventListener(ZED_OVERLAY_SETTINGS_EVENT, onSettingsChange);
      window.removeEventListener('storage', onSettingsChange);
    };
  }, []);
  const auraIntensityScale = ZED_AURA_INTENSITY_SCALE[overlaySettings.auraIntensity] ?? 1;
  const auraSpeedScale = ZED_AURA_SPEED_SCALE[overlaySettings.auraSpeed] ?? 1;
  const drawerWidthPx = ZED_DRAWER_WIDTH_PX[overlaySettings.drawerWidth] ?? 400;

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
      if (lastVoicedErrorRef.current) hideStatus();
      lastVoicedErrorRef.current = '';
      return;
    }
    // Mic probe failures must not resurface the ambient pill while Zed is idle.
    // (TTS errors are rarer on mount and still useful on the collapsed pill.)
    if (errorText && !ttsError && !isOpen && !recording) {
      hideStatus();
      lastVoicedErrorRef.current = '';
      return;
    }
    const voiceError = errorText || ttsError;
    if (voiceError === lastVoicedErrorRef.current) return;
    lastVoicedErrorRef.current = voiceError;
    if (ttsError) {
      clearStatusTimers();
      setStatusExiting(false);
      setStatusLine(voiceError);
      return;
    }
    showStatus(voiceError);
  }, [clearStatusTimers, errorText, hideStatus, isOpen, recording, showStatus, ttsError]);

  const displayMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages),
    [messages, streamingMessage]
  );

  const displayAssistantMessage = useMemo(
    () => streamingMessage || lastAssistantMessage,
    [streamingMessage, lastAssistantMessage]
  );

  const streamingText = streamingMessage?.content || '';
  const hasSpeakableResponse = Boolean(
    displayAssistantMessage?.content &&
    displayAssistantMessage.timestamp !== 'initial' &&
    !displayAssistantMessage.partial
  );

  const replayLastResponse = useCallback(() => {
    if (!hasSpeakableResponse) return;
    speak(displayAssistantMessage.content, { full: true });
  }, [displayAssistantMessage, hasSpeakableResponse, speak]);

  const speakActivityMessage = useCallback(
    (message) => {
      if (!message?.content) return;
      speak(message.content, { full: true });
    },
    [speak]
  );

  const phase = useMemo(
    () => resolveZedAmbientPhase(isLoading, isOpen, statusLine),
    [isLoading, isOpen, statusLine]
  );

  const {
    showAura: _showAura,
    showPill,
    collapsed,
    pillState,
  } = useMemo(() => {
    const _showAura = managerVisible && (shouldShowZedAura(phase) || speaking || recording);
    // Do not resurface the pill on Ctrl+R or app start —
    // only show for an explicit open or active execution/status while Terminales is visible.
    const _showPill =
      managerVisible &&
      (isOpen || isLoading || (speaking && isOpen) || Boolean(statusLine) || Boolean(currentStep));
    return {
      showAura: _showAura,
      showPill: _showPill,
      collapsed: !isOpen,
      pillState: isLoading ? 'executing' : speaking ? 'speaking' : recording ? 'listening' : 'idle',
    };
  }, [managerVisible, phase, speaking, recording, isOpen, isLoading, statusLine, currentStep]);

  const lastTurnTimestamp =
    displayAssistantMessage && typeof displayAssistantMessage.timestamp === 'string'
      ? displayAssistantMessage.timestamp
      : null;

  // Cold boot from sessionStorage: treat restored assistant turns as seen on mount so
  // status/TTS do not resurface the pill or auto-speak old messages after launch / Ctrl+R.
  useLayoutEffect(() => {
    if (!restoredFromStorage) return;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const ts = messages[i]?.timestamp;
      if (messages[i]?.role === 'assistant' && typeof ts === 'string' && ts !== 'initial') {
        lastStatusTurnRef.current = ts;
        lastSpokenRef.current = ts;
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, [restoredFromStorage]);

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
    if (isLoading || !ttsEnabled) return;
    if (!displayAssistantMessage?.content || displayAssistantMessage.timestamp === 'initial')
      return;
    if (displayAssistantMessage.partial) return;
    if (lastSpokenRef.current === displayAssistantMessage.timestamp) return;
    lastSpokenRef.current = displayAssistantMessage.timestamp;
    speak(buildAutomaticSpeechText(displayAssistantMessage));
  }, [isLoading, displayAssistantMessage, speak, ttsEnabled]);

  useEffect(() => {
    if (!ttsEnabled || !pendingApproval?.preview) return;
    if (pendingApproval.kind !== 'local_intent') return;
    if (lastUserMessage?.source !== 'voice') return;
    const key = `${pendingApproval.message}::${pendingApproval.preview}`;
    if (lastSpokenApprovalRef.current === key) return;
    lastSpokenApprovalRef.current = key;
    speak(pendingApproval.preview);
  }, [lastUserMessage, pendingApproval, speak, ttsEnabled]);

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

  const onOpenCollapsed = useCallback(() => {
    if (!managerVisible) return;
    open();
  }, [managerVisible, open]);
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
        reducedMotion={isReduced}
        motionMode={motionMode}
        toolType={overlayToolType}
        outcomeFlash={outcomeFlash}
        speaking={speaking}
        recording={recording}
        vuLevel={vuLevel}
        enabled={overlaySettings.auraEnabled}
        intensityScale={auraIntensityScale}
        speedScale={auraSpeedScale}
      />

      <AnimatePresence>
        {showPill ? (
          <motion.div
            key="zed-pill"
            data-testid="zed-ambient-pill"
            role="region"
            aria-label="Zed asistente"
            aria-busy={isLoading}
            aria-modal={isOpen ? 'true' : undefined}
            data-devhub-modal={isOpen ? 'soft' : undefined}
            data-zed-overlay="true"
            className="fixed inset-x-0 bottom-6 z-[260] flex justify-center pointer-events-none"
            initial={
              isReduced
                ? { opacity: 0 }
                : { opacity: 0, y: isAmplified ? 20 : 14, scale: isAmplified ? 0.85 : 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              isReduced
                ? { opacity: 0 }
                : { opacity: 0, y: isAmplified ? 14 : 8, scale: isAmplified ? 0.9 : 0.97 }
            }
            transition={getTransition('toggle', motionMode)}
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
                widthPx={drawerWidthPx}
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
                ttsEnabled={ttsEnabled}
                speaking={speaking}
                onSpeakMessage={speakActivityMessage}
                onStopSpeaking={stopSpeaking}
                voiceError={ttsError}
                onClearVoiceError={clearTtsError}
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
                    pillState !== 'idle' && !isReduced ? 'zed-pill-topline-active' : '',
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
                    ttsEnabled={ttsEnabled}
                    hasSpeakableResponse={hasSpeakableResponse}
                    onVoiceToggle={handleVoiceToggle}
                    onReplayResponse={replayLastResponse}
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
