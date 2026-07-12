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
