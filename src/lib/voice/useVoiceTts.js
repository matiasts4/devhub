'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rateToLengthScale } from './ttsVoiceCatalog';
import { resolveSpeechSynthesisVoice } from './systemSpeechVoices';

/**
 * Route voice invokes through desktopBridge on Electron; Tauri invoke otherwise.
 * Web: structured fail (caller may fall back to Web Speech).
 */
async function invokeVoice(cmd, args) {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'not-in-browser' };
  }

  try {
    const { invokeDesktop, isElectronDesktop, detectDesktopRuntime } =
      await import('@/lib/desktop/desktopBridge');

    if (isElectronDesktop()) {
      const result = await invokeDesktop(cmd, args || {}, {
        failureShape: { ok: false, reason: 'desktop-unavailable' },
        tauriWrapRequest: false,
      });
      // Deferred Piper / engine stubs: { ok: false, reason: 'voice-deferred-electron' }
      if (
        result == null ||
        result.ok === false ||
        result.reason === 'desktop-unavailable' ||
        result.reason === 'voice-deferred-electron' ||
        result.reason === 'not-implemented'
      ) {
        return {
          ok: false,
          error: String(result?.reason || result?.error || 'voice invoke failed'),
          data: result,
        };
      }
      return { ok: true, data: result?.data !== undefined ? result.data : result };
    }

    if (detectDesktopRuntime() === 'tauri') {
      const { invoke } = await import('@tauri-apps/api/core');
      const data = await invoke(cmd, args);
      return { ok: true, data };
    }

    return { ok: false, error: 'desktop-unavailable' };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || 'voice invoke failed') };
  }
}

// Emoji / pictographs / regional-indicator flags -- Piper's espeak-ng
// phonemizer either skips these silently or garbles them; strip up front.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

function stripMarkdownForSpeech(text) {
  const withoutCode = String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '');

  // Headers/bullets/rules read out their punctuation literally ("numeral",
  // "guion"...) if left in -- strip the markers per line before flattening.
  const perLine = withoutCode
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s{0,3}[-*+]\s+/, '')
        .replace(/^\s{0,3}\d+[.)]\s+/, '')
        .replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/, '')
        .trim()
    )
    .filter(Boolean)
    .join('. ');

  return perLine
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(EMOJI_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_TTS_CHARS = 600;
const MAX_MANUAL_TTS_CHARS = 2400;

function browserRate(rate) {
  if (rate === 'slow') return 0.85;
  if (rate === 'fast') return 1.15;
  return 1;
}

function browserLanguageFromVoiceId(voiceId) {
  const locale = String(voiceId || '')
    .split('-')[0]
    .replace('_', '-');
  return /^es(?:-|$)/i.test(locale) ? locale : 'es-ES';
}

function createBrowserUtterance(text, { voiceId, rate, systemVoiceURI } = {}) {
  if (typeof window === 'undefined') return null;
  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return null;

  const language = browserLanguageFromVoiceId(voiceId);
  const utterance = new Utterance(text);
  utterance.lang = language;
  utterance.rate = browserRate(rate);
  const selected = resolveSpeechSynthesisVoice(synth, {
    systemVoiceURI,
    fallbackLang: language,
  });
  if (selected) {
    utterance.voice = selected;
    if (selected.lang) utterance.lang = selected.lang;
  }
  return { synth, utterance };
}

/** Clip long replies at a sentence boundary instead of mid-word, so Zed
 * never trails off on a chopped syllable. */
function clipForSpeech(text, maxLen = MAX_TTS_CHARS) {
  if (text.length <= maxLen) return text;
  const windowText = text.slice(0, maxLen);
  const lastBoundary = Math.max(
    windowText.lastIndexOf('. '),
    windowText.lastIndexOf('! '),
    windowText.lastIndexOf('? ')
  );
  if (lastBoundary > maxLen * 0.4) {
    return windowText.slice(0, lastBoundary + 1).trim();
  }
  const lastSpace = windowText.lastIndexOf(' ');
  const safeCut = lastSpace > 0 ? windowText.slice(0, lastSpace) : windowText;
  return `${safeCut.trim()}…`;
}

/**
 * Speak Zed replies via Piper, with Web Speech as the Windows/WebView fallback.
 */
export function useVoiceTts({ enabled = true, voice, rate, systemVoiceURI = '' } = {}) {
  const [ttsError, setTtsError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const unlistenRef = useRef([]);
  const browserUtteranceRef = useRef(null);
  // Electron plays Piper's tts-chunk wav renderer-side (no paplay on Windows).
  const desktopAudioRef = useRef(null);
  // Last requested utterance, so an async Piper `tts-error` can still be
  // spoken by the OS voice instead of leaving the user in silence.
  const pendingSpeechRef = useRef(null);

  /** @returns {'started'|'unavailable'|'failed'} 'failed' means ttsError is already set. */
  const startBrowserSpeech = useCallback((text, options) => {
    const browserSpeech = createBrowserUtterance(text, options);
    if (!browserSpeech) return 'unavailable';

    const { synth, utterance } = browserSpeech;
    browserUtteranceRef.current = utterance;
    utterance.onend = () => {
      browserUtteranceRef.current = null;
      setSpeaking(false);
    };
    utterance.onerror = (event) => {
      browserUtteranceRef.current = null;
      setSpeaking(false);
      if (event?.error !== 'canceled' && event?.error !== 'interrupted') {
        setTtsError(`No se pudo reproducir la voz de Windows (${event?.error || 'error'})`);
      }
    };
    try {
      synth.speak(utterance);
    } catch (error) {
      browserUtteranceRef.current = null;
      setSpeaking(false);
      setTtsError(
        `No se pudo iniciar la voz de Windows (${String(error?.message || error || 'error')})`
      );
      return 'failed';
    }
    return 'started';
  }, []);

  const stopDesktopAudio = useCallback(() => {
    const current = desktopAudioRef.current;
    desktopAudioRef.current = null;
    if (current) {
      try {
        current.audio.pause();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(current.url);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const { isElectronDesktop, subscribeDesktopEvent, detectDesktopRuntime } =
          await import('@/lib/desktop/desktopBridge');

        if (isElectronDesktop()) {
          // Main-process voice.js forwards the Piper sidecar events verbatim.
          const unVoice = await subscribeDesktopEvent('voice-event', (payload) => {
            if (payload?.type === 'tts-error') {
              stopDesktopAudio();
              // Piper failed (missing voice model / binary): speak with the OS
              // voice instead of leaving the reply silent.
              const pending = pendingSpeechRef.current;
              pendingSpeechRef.current = null;
              const retry = pending
                ? startBrowserSpeech(pending.text, pending.options)
                : 'unavailable';
              if (retry !== 'unavailable') return;
              const msg =
                typeof payload?.error === 'string' && payload.error.trim()
                  ? payload.error.trim()
                  : 'No se pudo reproducir audio';
              setTtsError(msg);
              setSpeaking(false);
              return;
            }
            if (payload?.type === 'tts-chunk') {
              pendingSpeechRef.current = null;
              try {
                const bytes = Uint8Array.from(atob(payload.bytes_b64 || ''), (c) =>
                  c.charCodeAt(0)
                );
                const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
                stopDesktopAudio();
                const audio = new Audio(url);
                desktopAudioRef.current = { audio, url };
                const finish = () => {
                  if (desktopAudioRef.current?.audio === audio) desktopAudioRef.current = null;
                  URL.revokeObjectURL(url);
                  setSpeaking(false);
                };
                audio.onended = finish;
                audio.onerror = () => {
                  finish();
                  setTtsError('No se pudo reproducir audio');
                };
                audio.play()?.catch?.(() => {});
              } catch {
                setSpeaking(false);
              }
              return;
            }
            if (payload?.type === 'tts-done') {
              // Python emits done right after the chunk; the renderer-side
              // Audio is what actually keeps `speaking` alive now.
              if (!desktopAudioRef.current) setSpeaking(false);
            }
          });
          if (!cancelled) unlistenRef.current = [unVoice];
          return;
        }

        if (detectDesktopRuntime() !== 'tauri') return;

        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;
        const unError = await listen('tts-error', (event) => {
          const msg =
            typeof event.payload === 'string' && event.payload.trim()
              ? event.payload.trim()
              : 'No se pudo reproducir audio (Piper)';
          setTtsError(msg);
          setSpeaking(false);
        });
        const unDone = await listen('tts-done', () => setSpeaking(false));
        unlistenRef.current = [unError, unDone];
      } catch {
        // Web dev — no Tauri events
      }
    }

    setup();

    return () => {
      cancelled = true;
      for (const fn of unlistenRef.current) {
        if (typeof fn === 'function') fn();
      }
      unlistenRef.current = [];
      stopDesktopAudio();
      if (browserUtteranceRef.current && typeof window !== 'undefined') {
        window.speechSynthesis?.cancel?.();
        browserUtteranceRef.current = null;
      }
    };
  }, [startBrowserSpeech, stopDesktopAudio]);

  const speak = useCallback(
    async (text, { full = false } = {}) => {
      if (!enabled && !full) return { ok: false, error: 'tts-disabled' };
      const cleaned = stripMarkdownForSpeech(text);
      if (!cleaned) return { ok: false, error: 'empty-text' };
      const clipped = clipForSpeech(cleaned, full ? MAX_MANUAL_TTS_CHARS : MAX_TTS_CHARS);
      setTtsError('');
      setSpeaking(true);
      await invokeVoice('voice_stop_speak');
      stopDesktopAudio();
      if (typeof window !== 'undefined' && window.speechSynthesis?.cancel) {
        window.speechSynthesis.cancel();
      }

      const nativeOptions = {};
      if (voice) nativeOptions.voice = voice;
      if (rate) nativeOptions.length_scale = rateToLengthScale(rate);
      const args = Object.keys(nativeOptions).length
        ? { text: clipped, options: nativeOptions }
        : { text: clipped };
      const browserOptions = { voiceId: voice, rate, systemVoiceURI };
      pendingSpeechRef.current = { text: clipped, options: browserOptions };
      const result = await invokeVoice('voice_speak', args);
      if (result.ok) {
        return { ...result, backend: 'piper' };
      }

      // Windows builds intentionally reject the Python/Piper command when the
      // voice runtime is missing. WebView2 already exposes the OS speech
      // voices, so use the platform feature instead of requiring another
      // native dependency.
      pendingSpeechRef.current = null;
      const browserStatus = startBrowserSpeech(clipped, browserOptions);
      if (browserStatus !== 'started') {
        if (browserStatus === 'unavailable') {
          setTtsError(result.error || 'No hay un motor de voz disponible');
          setSpeaking(false);
        }
        return result;
      }
      return { ok: true, backend: 'web-speech', fallbackFrom: result.error || null };
    },
    [enabled, voice, rate, systemVoiceURI, startBrowserSpeech, stopDesktopAudio]
  );

  const stopSpeaking = useCallback(async () => {
    setSpeaking(false);
    browserUtteranceRef.current = null;
    pendingSpeechRef.current = null;
    stopDesktopAudio();
    if (typeof window !== 'undefined' && window.speechSynthesis?.cancel) {
      window.speechSynthesis.cancel();
    }
    await invokeVoice('voice_stop_speak');
  }, [stopDesktopAudio]);

  const clearTtsError = useCallback(() => setTtsError(''), []);

  return { speak, speaking, stopSpeaking, ttsError, clearTtsError };
}

export {
  stripMarkdownForSpeech,
  clipForSpeech,
  browserLanguageFromVoiceId,
  createBrowserUtterance,
};
