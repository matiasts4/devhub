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

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const { isElectronDesktop, subscribeDesktopEvent, detectDesktopRuntime } =
          await import('@/lib/desktop/desktopBridge');

        if (isElectronDesktop()) {
          // Voice events are optional on Electron (preload may no-op).
          const unError = await subscribeDesktopEvent('tts-error', (payload) => {
            const msg =
              typeof payload === 'string' && payload.trim()
                ? payload.trim()
                : 'No se pudo reproducir audio';
            setTtsError(msg);
            setSpeaking(false);
          });
          const unDone = await subscribeDesktopEvent('tts-done', () => setSpeaking(false));
          if (!cancelled) unlistenRef.current = [unError, unDone];
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
      if (browserUtteranceRef.current && typeof window !== 'undefined') {
        window.speechSynthesis?.cancel?.();
        browserUtteranceRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(
    async (text, { full = false } = {}) => {
      if (!enabled && !full) return { ok: false, error: 'tts-disabled' };
      const cleaned = stripMarkdownForSpeech(text);
      if (!cleaned) return { ok: false, error: 'empty-text' };
      const clipped = clipForSpeech(cleaned, full ? MAX_MANUAL_TTS_CHARS : MAX_TTS_CHARS);
      setTtsError('');
      setSpeaking(true);
      await invokeVoice('voice_stop_speak');
      if (typeof window !== 'undefined' && window.speechSynthesis?.cancel) {
        window.speechSynthesis.cancel();
      }

      const nativeOptions = {};
      if (voice) nativeOptions.voice = voice;
      if (rate) nativeOptions.length_scale = rateToLengthScale(rate);
      const args = Object.keys(nativeOptions).length
        ? { text: clipped, options: nativeOptions }
        : { text: clipped };
      const result = await invokeVoice('voice_speak', args);
      if (result.ok) {
        return { ...result, backend: 'piper' };
      }

      // Windows builds intentionally reject the Python/Piper command. WebView2
      // already exposes the OS speech voices, so use the platform feature
      // instead of requiring another native dependency.
      // Electron also defers Piper → same Web Speech fallback.
      const browserSpeech = createBrowserUtterance(clipped, {
        voiceId: voice,
        rate,
        systemVoiceURI,
      });
      if (!browserSpeech) {
        setTtsError(result.error || 'No hay un motor de voz disponible');
        setSpeaking(false);
        return result;
      }

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
        const message = String(error?.message || error || 'error');
        setTtsError(`No se pudo iniciar la voz de Windows (${message})`);
        return { ok: false, error: message };
      }
      return { ok: true, backend: 'web-speech', fallbackFrom: result.error || null };
    },
    [enabled, voice, rate, systemVoiceURI]
  );

  const stopSpeaking = useCallback(async () => {
    setSpeaking(false);
    browserUtteranceRef.current = null;
    if (typeof window !== 'undefined' && window.speechSynthesis?.cancel) {
      window.speechSynthesis.cancel();
    }
    await invokeVoice('voice_stop_speak');
  }, []);

  const clearTtsError = useCallback(() => setTtsError(''), []);

  return { speak, speaking, stopSpeaking, ttsError, clearTtsError };
}

export {
  stripMarkdownForSpeech,
  clipForSpeech,
  browserLanguageFromVoiceId,
  createBrowserUtterance,
};
