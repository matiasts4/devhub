'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

async function invokeVoice(cmd, args) {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'not-in-browser' };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke(cmd, args);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || 'voice invoke failed') };
  }
}

// ponytail: TTS calls setup_python_environment and emits using-dev-voice-venv — not a mic block
const INFO_VOICE_STATUSES = new Set(['using-dev-voice-venv', 'deps-ready', 'requirements-missing']);

const PREPARING_STATUSES = new Set([
  'preparing-venv',
  'preparing-deps',
  'installing-torch-cpu',
  'engine-starting',
]);

function shouldEnterPreparingPhase(prevPhase, status) {
  if (!PREPARING_STATUSES.has(status) && !status.includes('Configuring Python')) return false;
  // Don't downgrade ready → preparing for informational setup pings (e.g. after TTS).
  if (prevPhase === 'ready' && status !== 'engine-starting') return false;
  return true;
}

function normalizeVoicePhase(status, recording, prevPhase = 'idle') {
  if (recording) return 'listening';
  if (!status) return 'idle';
  if (status === 'loading_model') return 'loading_model';
  if (status === 'listening') return 'listening';
  if (status === 'ready' || status === 'deps-ready') return 'ready';
  if (status === 'stopped') return 'ready';
  if (INFO_VOICE_STATUSES.has(status)) return prevPhase === 'idle' ? 'idle' : prevPhase;
  if (shouldEnterPreparingPhase(prevPhase, status)) return 'preparing';
  return 'idle';
}

// ponytail: kept for tests / future status mapping helpers
export { normalizeVoicePhase, PREPARING_STATUSES, INFO_VOICE_STATUSES, shouldEnterPreparingPhase };

/**
 * Push-to-talk voice capture for Zed overlay.
 * STT sidecar emits cumulative session text — we replace display text, not merge deltas.
 */
export function useVoiceCapture({ onFinalTranscript, onPartial } = {}) {
  const [recording, setRecording] = useState(false);
  const [tauriAvailable, setTauriAvailable] = useState(false);
  const [enginePhase, setEnginePhase] = useState('idle');
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [vuLevel, setVuLevel] = useState(0);
  const [micPermission, setMicPermission] = useState('prompt');
  const [audioDevices, setAudioDevices] = useState([]);
  const unlistenRef = useRef([]);
  const bootingRef = useRef(false);
  const wasRecordingRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const pendingSendRef = useRef(false);
  const sendTimerRef = useRef(null);

  const engineReady = enginePhase === 'ready' || enginePhase === 'listening';

  const cancelPendingSend = useCallback(() => {
    pendingSendRef.current = false;
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
  }, []);

  const resetTranscript = useCallback(() => {
    lastTranscriptRef.current = '';
    setLiveTranscript('');
  }, []);

  const flushVoiceSend = useCallback(() => {
    if (!pendingSendRef.current) return;
    cancelPendingSend();
    const finalText = lastTranscriptRef.current.trim();
    if (finalText && onFinalTranscript) onFinalTranscript(finalText);
    resetTranscript();
  }, [cancelPendingSend, onFinalTranscript, resetTranscript]);

  useEffect(() => {
    wasRecordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;

        const unTranscription = await listen('transcription-update', (event) => {
          const payload = event.payload || {};
          const text = typeof payload.text === 'string' ? payload.text.trim() : '';
          if (!text) return;

          setLiveTranscript(text);
          lastTranscriptRef.current = text;
          if (onPartial) onPartial(text);
        });

        const unError = await listen('voice-error', (event) => {
          const msg = typeof event.payload === 'string' ? event.payload : 'Error de voz';
          setErrorText(msg);
          setEnginePhase('error');
        });

        const unStatus = await listen('voice-status', (event) => {
          const status = typeof event.payload === 'string' ? event.payload : '';
          setStatusText(status);
          if (status === 'loading_model') {
            setEnginePhase('loading_model');
          } else if (status === 'listening') {
            setEnginePhase('listening');
          } else if (status === 'ready' || status === 'deps-ready') {
            setEnginePhase('ready');
            setErrorText('');
          } else if (status === 'stopped') {
            flushVoiceSend();
            setEnginePhase((prev) => (wasRecordingRef.current ? 'listening' : 'ready'));
          } else if (INFO_VOICE_STATUSES.has(status)) {
            /* status line only — STT already ready */
          } else if (PREPARING_STATUSES.has(status) || status.includes('Configuring Python')) {
            setEnginePhase((prev) =>
              shouldEnterPreparingPhase(prev, status) ? 'preparing' : prev
            );
          }
        });

        const unRecording = await listen('recording-state', (event) => {
          const nextRecording = Boolean(event.payload);
          const wasRecording = wasRecordingRef.current;
          setRecording(nextRecording);
          setEnginePhase(nextRecording ? 'listening' : 'ready');

          if (nextRecording && !wasRecording) {
            cancelPendingSend();
            resetTranscript();
          }

          if (wasRecording && !nextRecording) {
            pendingSendRef.current = true;
            // ponytail: fallback if python never emits stopped (2s ceiling)
            sendTimerRef.current = setTimeout(() => flushVoiceSend(), 2000);
          }

          wasRecordingRef.current = nextRecording;
        });

        const unVu = await listen('vu-update', (event) => {
          const level = Number(event.payload?.level ?? event.payload?.rms ?? 0);
          if (!Number.isNaN(level)) setVuLevel(Math.min(1, Math.max(0, level)));
        });

        unlistenRef.current = [unTranscription, unError, unStatus, unRecording, unVu];
        setTauriAvailable(true);
      } catch {
        setTauriAvailable(false);
      }
    }

    async function checkMicAccess() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
      try {
        const perm = await navigator.permissions?.query({ name: 'microphone' });
        const state = perm?.state || 'prompt';
        setMicPermission(state);
        if (state === 'denied') {
          setErrorText('Permiso de micrófono denegado. Verificá los permisos del sistema.');
          setEnginePhase('error');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
        setErrorText('');
      } catch (err) {
        setMicPermission('denied');
        setErrorText('No se pudo acceder al micrófono. Verificá permisos y dispositivos.');
        setEnginePhase('error');
      }
    }

    function handleDeviceChange() {
      checkMicAccess();
    }

    setup();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      checkMicAccess();
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      cancelled = true;
      for (const fn of unlistenRef.current) {
        if (typeof fn === 'function') fn();
      }
      unlistenRef.current = [];
      cancelPendingSend();
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [cancelPendingSend, flushVoiceSend, onFinalTranscript, onPartial, resetTranscript]);

  const startEngine = useCallback(async () => {
    if (!tauriAvailable || bootingRef.current) return { ok: false };
    bootingRef.current = true;
    setEnginePhase('preparing');
    setErrorText('');
    const result = await invokeVoice('voice_start_engine');
    bootingRef.current = false;
    if (!result.ok) {
      setErrorText(result.error);
      setEnginePhase('error');
      return result;
    }
    return result;
  }, [tauriAvailable]);

  const toggleRecording = useCallback(async () => {
    if (!tauriAvailable) {
      return { ok: false, error: 'Voz solo disponible en la app Tauri' };
    }

    if (enginePhase === 'loading_model') {
      return { ok: false, error: 'Cargando modelo de voz, espera un momento…' };
    }
    if (enginePhase === 'preparing') {
      return { ok: false, error: 'Preparando micrófono, espera a que termine…' };
    }

    cancelPendingSend();
    resetTranscript();
    await invokeVoice('voice_stop_speak');
    const result = await invokeVoice('voice_toggle_recording');
    if (!result.ok) {
      setErrorText(result.error);
      setEnginePhase('error');
      return result;
    }
    if (typeof result.data === 'boolean') {
      setRecording(result.data);
      setEnginePhase(result.data ? 'listening' : 'ready');
      if (result.data) resetTranscript();
    }
    return result;
  }, [cancelPendingSend, enginePhase, resetTranscript, tauriAvailable]);

  return {
    recording,
    available: tauriAvailable,
    engineReady,
    enginePhase,
    statusText,
    errorText,
    liveTranscript,
    vuLevel,
    micPermission,
    audioDevices,
    toggleRecording,
    startEngine,
  };
}
