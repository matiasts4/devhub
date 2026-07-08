/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ZedVoiceSettings from '../ZedVoiceSettings';
import { VOICE_SETTINGS_KEY } from '@/lib/voice/voiceFeatureFlag';

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

const mockInvoke = jest.fn(async () => null);
const mockListen = jest.fn(async () => jest.fn());

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
}));

jest.mock('@tauri-apps/api/event', () => ({
  listen: (...args) => mockListen(...args),
}));

describe('ZedVoiceSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockInvoke.mockClear();
    mockListen.mockClear();
    // jsdom has no mediaDevices by default; keep the mic-device effect a no-op.
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });
  });

  test('defaults to the bundled voice and normal speed', () => {
    render(<ZedVoiceSettings />);
    expect(screen.getByTestId('zed-tts-voice-select').value).toBe('es_ES-davefx-medium');
    expect(screen.getByTestId('zed-tts-rate-select').value).toBe('normal');
  });

  test('changing the voice select persists it to localStorage', async () => {
    render(<ZedVoiceSettings />);

    fireEvent.change(screen.getByTestId('zed-tts-voice-select'), {
      target: { value: 'es_AR-daniela-high' },
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(VOICE_SETTINGS_KEY));
      expect(stored.ttsVoice).toBe('es_AR-daniela-high');
    });
  });

  test('changing the rate select persists it to localStorage', async () => {
    render(<ZedVoiceSettings />);

    fireEvent.change(screen.getByTestId('zed-tts-rate-select'), {
      target: { value: 'slow' },
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(VOICE_SETTINGS_KEY));
      expect(stored.ttsRate).toBe('slow');
    });
  });

  test('the test-voice button sends the currently selected voice and speed', async () => {
    render(<ZedVoiceSettings />);

    fireEvent.change(screen.getByTestId('zed-tts-voice-select'), {
      target: { value: 'es_AR-daniela-high' },
    });
    fireEvent.change(screen.getByTestId('zed-tts-rate-select'), {
      target: { value: 'fast' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Probar voz (TTS)'));
    });

    await waitFor(() => {
      const call = mockInvoke.mock.calls.find(([cmd]) => cmd === 'voice_speak');
      expect(call).toBeTruthy();
      expect(call[1].options).toEqual({ voice: 'es_AR-daniela-high', length_scale: 0.9 });
    });
  });
});
