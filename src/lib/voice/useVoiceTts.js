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

function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Speak Zed assistant replies via Piper (Tauri voice_speak).
 */
export function useVoiceTts({ enabled = true } = {}) {
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
      const clipped = cleaned.length > 500 ? `${cleaned.slice(0, 497)}...` : cleaned;
      setTtsError('');
      setSpeaking(true);
      await invokeVoice('voice_stop_speak');
      const result = await invokeVoice('voice_speak', { text: clipped });
      if (!result.ok) {
        setTtsError(result.error || 'voice_speak failed');
        setSpeaking(false);
      }
      return result;
    },
    [enabled]
  );

  const stopSpeaking = useCallback(async () => {
    setSpeaking(false);
    await invokeVoice('voice_stop_speak');
  }, []);

  const clearTtsError = useCallback(() => setTtsError(''), []);

  return { speak, speaking, stopSpeaking, ttsError, clearTtsError };
}
