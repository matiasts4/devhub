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
    if (cmd === 'voice_toggle_recording') return true;
    if (cmd === 'voice_stop_speak') return null;
    if (cmd === 'voice_start_engine') return null;
    return null;
  }),
}));

const useVoiceCaptureModule = require('./useVoiceCapture.js');
const { INFO_VOICE_STATUSES, normalizeVoicePhase, shouldEnterPreparingPhase, useVoiceCapture } =
  useVoiceCaptureModule;

function emit(channel, payload) {
  const cb = eventListeners[channel];
  if (cb) cb({ payload });
}

describe('normalizeVoicePhase', () => {
  it('stays ready when TTS setup emits using-dev-voice-venv', () => {
    expect(normalizeVoicePhase('using-dev-voice-venv', false, 'ready')).toBe('ready');
    expect(INFO_VOICE_STATUSES.has('using-dev-voice-venv')).toBe(true);
  });

  it('allows engine-starting to enter preparing from ready', () => {
    expect(shouldEnterPreparingPhase('ready', 'engine-starting')).toBe(true);
    expect(normalizeVoicePhase('engine-starting', false, 'ready')).toBe('preparing');
  });

  it('blocks mic prep downgrade for dev venv ping after ready', () => {
    expect(shouldEnterPreparingPhase('ready', 'using-dev-voice-venv')).toBe(false);
  });
});

describe('useVoiceCapture hook', () => {
  beforeEach(() => {
    Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
    jest.clearAllMocks();
  });

  async function renderVoiceHook(props) {
    let rendered;
    await act(async () => {
      rendered = renderHook(() => useVoiceCapture(props));
      await Promise.resolve();
    });
    return rendered;
  }

  test('emits final transcript after recording stops', async () => {
    const onFinal = jest.fn();
    const { result } = await renderVoiceHook({ onFinalTranscript: onFinal });

    act(() => {
      emit('recording-state', true);
    });
    expect(result.current.recording).toBe(true);

    act(() => {
      emit('transcription-update', { text: 'abrir terminal' });
    });
    expect(result.current.liveTranscript).toBe('abrir terminal');

    act(() => {
      emit('recording-state', false);
    });
    expect(result.current.recording).toBe(false);

    act(() => {
      emit('voice-status', 'stopped');
    });

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('abrir terminal');
    expect(result.current.liveTranscript).toBe('');
  });

  test('clears pending transcript when recording restarts', async () => {
    const onFinal = jest.fn();
    await renderVoiceHook({ onFinalTranscript: onFinal });

    act(() => {
      emit('recording-state', true);
      emit('transcription-update', { text: 'texto viejo' });
      emit('recording-state', false);
    });

    act(() => {
      emit('recording-state', true);
      emit('transcription-update', { text: 'texto nuevo' });
      emit('recording-state', false);
      emit('voice-status', 'stopped');
    });

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('texto nuevo');
  });

  test('surfaces voice-error as error phase and message', async () => {
    const { result } = await renderVoiceHook();

    act(() => {
      emit('voice-error', 'Micrófono no detectado');
    });

    expect(result.current.enginePhase).toBe('error');
    expect(result.current.errorText).toBe('Micrófono no detectado');
  });

  test('clears error when engine becomes ready', async () => {
    const { result } = await renderVoiceHook();

    act(() => {
      emit('voice-error', 'falló');
    });
    expect(result.current.errorText).toBe('falló');

    act(() => {
      emit('voice-status', 'ready');
    });

    expect(result.current.enginePhase).toBe('ready');
    expect(result.current.errorText).toBe('');
  });
});
