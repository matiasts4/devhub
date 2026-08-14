/**
 * @jest-environment jsdom
 */

'use strict';

const { renderHook, act } = require('@testing-library/react');

const eventListeners = {};

jest.mock('@tauri-apps/api/event', () => ({
  listen: jest.fn(async (channel, cb) => {
    eventListeners[channel] = cb;
    return jest.fn(() => {
      delete eventListeners[channel];
    });
  }),
}));

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(async (cmd) => {
    if (cmd === 'voice_speak') return null;
    if (cmd === 'voice_stop_speak') return null;
    return null;
  }),
}));

const { useVoiceTts } = require('./useVoiceTts.js');

function emit(channel, payload) {
  const cb = eventListeners[channel];
  if (cb) cb({ payload });
}

describe('useVoiceTts', () => {
  beforeEach(() => {
    Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
    jest.clearAllMocks();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    // Prefer Tauri runtime path so mocks of @tauri-apps/api/core still apply.
    delete window.devhubDesktop;
    window.__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.devhubDesktop;
  });

  test('marks speaking while waiting for tts-done', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });

    expect(result.current.speaking).toBe(true);

    act(() => {
      emit('tts-done');
    });

    expect(result.current.speaking).toBe(false);
  });

  test('surfaces tts-error and stops speaking', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });

    expect(result.current.speaking).toBe(true);

    act(() => {
      emit('tts-error', 'Piper no encontrado');
    });

    expect(result.current.speaking).toBe(false);
    expect(result.current.ttsError).toBe('Piper no encontrado');
  });

  test('stopSpeaking invokes command and clears speaking', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });

    await act(async () => {
      await result.current.stopSpeaking();
    });

    expect(result.current.speaking).toBe(false);
  });

  test('strips markdown before speaking', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('Hola **mundo** `código` [link](http://x.com)');
    });

    expect(invoke).toHaveBeenCalledWith('voice_speak', {
      text: 'Hola mundo link',
    });
  });

  test('does not speak when disabled', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() => useVoiceTts({ enabled: false }));

    await act(async () => {
      const res = await result.current.speak('hola');
      expect(res.ok).toBe(false);
    });

    expect(invoke).not.toHaveBeenCalledWith('voice_speak', expect.anything());
  });

  test('strips headers and list bullets so they are not read literally', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('# Resumen\n- Primero\n- Segundo\nListo.');
    });

    expect(invoke).toHaveBeenCalledWith('voice_speak', {
      text: 'Resumen. Primero. Segundo. Listo.',
    });
  });

  test('strips emoji before speaking', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('Listo 🚀 che');
    });

    expect(invoke).toHaveBeenCalledWith('voice_speak', { text: 'Listo che' });
  });

  test('forwards voice and rate as options merged into the SPEAK payload', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() =>
      useVoiceTts({ enabled: true, voice: 'es_AR-daniela-high', rate: 'slow' })
    );

    await act(async () => {
      await result.current.speak('hola');
    });

    expect(invoke).toHaveBeenCalledWith('voice_speak', {
      text: 'hola',
      options: { voice: 'es_AR-daniela-high', length_scale: 1.15 },
    });
  });

  test('clips very long replies at a sentence boundary instead of mid-word', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    const sentence = 'Esta es una oracion de prueba bastante larga para forzar el recorte. ';
    const longText = sentence.repeat(12);

    await act(async () => {
      await result.current.speak(longText);
    });

    const [, callArgs] = invoke.mock.calls.find((call) => call[0] === 'voice_speak');
    expect(callArgs.text.length).toBeLessThan(longText.length);
    expect(callArgs.text.length).toBeLessThanOrEqual(600);
    // Ends on a real sentence boundary (a period), never mid-word.
    expect(callArgs.text.endsWith('.')).toBe(true);
  });

  test('falls back to Windows/Web Speech when native Piper is unavailable', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'voice_speak') {
        throw new Error('DevHub voice engine is only wired for Linux in this build.');
      }
      return null;
    });

    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
      }
    }
    const speakBrowser = jest.fn();
    const cancelBrowser = jest.fn();
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: speakBrowser,
        cancel: cancelBrowser,
        getVoices: () => [{ lang: 'es-AR', name: 'Microsoft Elena', voiceURI: 'elena-ar' }],
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useVoiceTts({ enabled: true, voice: 'es_AR-daniela-high', rate: 'fast' })
    );

    let response;
    await act(async () => {
      response = await result.current.speak('Hola desde Zed');
    });

    expect(response).toMatchObject({ ok: true, backend: 'web-speech' });
    expect(speakBrowser).toHaveBeenCalledTimes(1);
    const utterance = speakBrowser.mock.calls[0][0];
    expect(utterance.text).toBe('Hola desde Zed');
    expect(utterance.lang).toBe('es-AR');
    expect(utterance.rate).toBe(1.15);
    expect(utterance.voice.name).toBe('Microsoft Elena');
    expect(result.current.ttsError).toBe('');
    expect(result.current.speaking).toBe(true);

    act(() => utterance.onend());
    expect(result.current.speaking).toBe(false);
  });

  test('uses the saved system voice URI on Web Speech fallback', async () => {
    const invoke = require('@tauri-apps/api/core').invoke;
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'voice_speak') throw new Error('piper unavailable');
      return null;
    });

    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
      }
    }
    const speakBrowser = jest.fn();
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: speakBrowser,
        cancel: jest.fn(),
        getVoices: () => [
          { voiceURI: 'es-MX-Raul', name: 'Microsoft Raul', lang: 'es-MX' },
          {
            voiceURI: 'es-MX-Sabina',
            name: 'Microsoft Sabina Online (Natural)',
            lang: 'es-MX',
          },
        ],
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useVoiceTts({
        enabled: true,
        rate: 'normal',
        systemVoiceURI: 'es-MX-Raul',
      })
    );

    await act(async () => {
      await result.current.speak('Probando voz elegida');
    });

    const utterance = speakBrowser.mock.calls[0][0];
    expect(utterance.voice.voiceURI).toBe('es-MX-Raul');
    expect(utterance.lang).toBe('es-MX');
  });

  test('stopSpeaking cancels browser speech too', async () => {
    const cancelBrowser = jest.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: cancelBrowser },
      configurable: true,
    });
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.stopSpeaking();
    });

    expect(cancelBrowser).toHaveBeenCalledTimes(1);
  });
});

describe('useVoiceTts (electron)', () => {
  let voiceHandlers;
  let invoke;
  let audioInstances;

  class MockAudio {
    constructor(url) {
      this.url = url;
      this.paused = true;
      this.onended = null;
      this.onerror = null;
      audioInstances.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  function emitVoiceEvent(payload) {
    const cb = voiceHandlers['voice-event'];
    if (cb) cb(payload);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.__TAURI_INTERNALS__;
    voiceHandlers = {};
    audioInstances = [];
    invoke = jest.fn(async () => ({ ok: true }));
    window.devhubDesktop = {
      isElectron: true,
      invoke,
      on: (name, handler) => {
        voiceHandlers[name] = handler;
        return () => {
          delete voiceHandlers[name];
        };
      },
    };
    window.Audio = MockAudio;
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    delete window.devhubDesktop;
    delete window.Audio;
  });

  test('speak resolves as piper backend and subscribes to voice-event', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    let response;
    await act(async () => {
      response = await result.current.speak('hola');
    });

    expect(response).toMatchObject({ ok: true, backend: 'piper' });
    expect(invoke).toHaveBeenCalledWith('voice_speak', { text: 'hola' });
    expect(voiceHandlers['voice-event']).toBeInstanceOf(Function);
    expect(result.current.speaking).toBe(true);
  });

  test('tts-chunk plays renderer-side audio and tts-done keeps speaking while it plays', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });

    act(() => {
      emitVoiceEvent({ type: 'tts-chunk', format: 'wav', bytes_b64: btoa('RIFF-fake-wav') });
    });

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].paused).toBe(false);
    expect(result.current.speaking).toBe(true);

    // Python emits done right after the chunk — audio is still playing.
    act(() => {
      emitVoiceEvent({ type: 'tts-done', ok: true });
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      audioInstances[0].onended();
    });
    expect(result.current.speaking).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  test('tts-error clears speaking, sets the error and stops the audio', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });
    act(() => {
      emitVoiceEvent({ type: 'tts-chunk', format: 'wav', bytes_b64: btoa('RIFF-fake-wav') });
    });

    act(() => {
      emitVoiceEvent({ type: 'tts-error', error: 'piper binary not found' });
    });

    expect(result.current.speaking).toBe(false);
    expect(result.current.ttsError).toBe('piper binary not found');
    expect(audioInstances[0].paused).toBe(true);
  });

  test('tts-done clears speaking when no audio is playing', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });

    act(() => {
      emitVoiceEvent({ type: 'tts-done', ok: true, skipped: true });
    });

    expect(result.current.speaking).toBe(false);
  });

  test('stopSpeaking pauses the renderer audio', async () => {
    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('hola');
    });
    act(() => {
      emitVoiceEvent({ type: 'tts-chunk', format: 'wav', bytes_b64: btoa('RIFF-fake-wav') });
    });

    await act(async () => {
      await result.current.stopSpeaking();
    });

    expect(audioInstances[0].paused).toBe(true);
    expect(result.current.speaking).toBe(false);
    expect(invoke).toHaveBeenCalledWith('voice_stop_speak', {});
  });

  test('async tts-error falls back to the OS voice instead of failing silently', async () => {
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
      }
    }
    const speakBrowser = jest.fn();
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: speakBrowser,
        cancel: jest.fn(),
        getVoices: () => [{ lang: 'es-MX', name: 'Microsoft Sabina', voiceURI: 'sabina-mx' }],
      },
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    await act(async () => {
      await result.current.speak('Hola desde Zed');
    });

    // Piper fails after the invoke already resolved ok (missing voice model).
    act(() => {
      emitVoiceEvent({ type: 'tts-error', error: 'no Piper voice model; run pnpm voice:ensure' });
    });

    expect(speakBrowser).toHaveBeenCalledTimes(1);
    expect(speakBrowser.mock.calls[0][0].text).toBe('Hola desde Zed');
    expect(result.current.ttsError).toBe('');
    expect(result.current.speaking).toBe(true);
  });

  test('falls back to Web Speech when SPEAK is not available on Electron', async () => {
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'voice_speak') return { ok: false, reason: 'voice-tts-script-missing' };
      return { ok: true };
    });

    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
      }
    }
    const speakBrowser = jest.fn();
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: speakBrowser,
        cancel: jest.fn(),
        getVoices: () => [{ lang: 'es-MX', name: 'Microsoft Sabina', voiceURI: 'sabina-mx' }],
      },
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceTts({ enabled: true }));

    let response;
    await act(async () => {
      response = await result.current.speak('Hola desde Electron');
    });

    expect(response).toMatchObject({ ok: true, backend: 'web-speech' });
    expect(speakBrowser).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(true);
  });
});
