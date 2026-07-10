'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rateToLengthScale } from './ttsVoiceCatalog';

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
 * Speak Zed assistant replies via Piper (Tauri voice_speak).
 */
export function useVoiceTts({ enabled = true, voice, rate } = {}) {
  const [ttsError, setTtsError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const unlistenRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
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
    };
  }, []);

  const speak = useCallback(
    async (text) => {
      if (!enabled) return { ok: false, error: 'tts-disabled' };
      const cleaned = stripMarkdownForSpeech(text);
      if (!cleaned) return { ok: false, error: 'empty-text' };
      const clipped = clipForSpeech(cleaned);
      setTtsError('');
      setSpeaking(true);
      await invokeVoice('voice_stop_speak');
      const options = {};
      if (voice) options.voice = voice;
      if (rate) options.length_scale = rateToLengthScale(rate);
      const args = Object.keys(options).length ? { text: clipped, options } : { text: clipped };
      const result = await invokeVoice('voice_speak', args);
      if (!result.ok) {
        setTtsError(result.error || 'voice_speak failed');
        setSpeaking(false);
      }
      return result;
    },
    [enabled, voice, rate]
  );

  const stopSpeaking = useCallback(async () => {
    setSpeaking(false);
    await invokeVoice('voice_stop_speak');
  }, []);

  const clearTtsError = useCallback(() => setTtsError(''), []);

  return { speak, speaking, stopSpeaking, ttsError, clearTtsError };
}
