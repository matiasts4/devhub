'use client';

import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import { readVoiceSettings, writeVoiceSettings, STT_BACKENDS } from '@/lib/voice/voiceFeatureFlag';
import {
  TTS_VOICE_OPTIONS,
  TTS_RATE_OPTIONS,
  rateToLengthScale,
} from '@/lib/voice/ttsVoiceCatalog';
import {
  buildVoiceEngineConfig,
  fetchXaiKeyConfigured,
} from '@/lib/voice/resolveVoiceEngineConfig';

const STT_MODELS = ['small', 'base', 'medium', 'large-v3', 'large-v3-turbo'];

const STT_BACKEND_LABELS = {
  auto: 'Automático',
  'faster-whisper': 'Faster-Whisper (local)',
  whispercpp: 'whisper.cpp (local)',
  grok: 'Grok STT (nube, xAI)',
};

export default function ZedVoiceSettings({ onNavigateToZed } = {}) {
  const [settings, setSettings] = useState(() => readVoiceSettings());
  const [audioDevices, setAudioDevices] = useState([]);
  const [audioPermission, setAudioPermission] = useState('prompt');
  const [xaiKeyConfigured, setXaiKeyConfigured] = useState(null);

  useEffect(() => {
    writeVoiceSettings(settings);
    async function syncTauri() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('voice_set_enabled', { enabled: settings.voiceEnabled });
        if (settings.voiceEnabled) {
          await invoke('voice_set_settings', {
            settings: await buildVoiceEngineConfig(settings),
          });
        }
      } catch {
        /* browser dev */
      }
    }
    syncTauri();
  }, [settings]);

  useEffect(() => {
    if (settings.sttBackend !== 'grok') return;
    let cancelled = false;
    fetchXaiKeyConfigured().then((configured) => {
      if (!cancelled) setXaiKeyConfigured(configured);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.sttBackend]);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;

    async function loadDevices() {
      try {
        const permissionStatus = await navigator.permissions?.query({ name: 'microphone' });
        setAudioPermission(permissionStatus?.state || 'granted');

        // Request permission once so labels are populated.
        if (permissionStatus?.state !== 'granted') {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter((device) => device.kind === 'audioinput');
        setAudioDevices(mics);
      } catch {
        setAudioDevices([]);
        setAudioPermission('denied');
      }
    }

    loadDevices();

    const handleDeviceChange = () => loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  return (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          className="overflow-hidden"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-none bg-[var(--accent-primary)]/15">
              <Mic className="h-4 w-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Zed Voice
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Dictado push-to-talk y respuestas habladas (Piper local)
              </p>
            </div>
          </div>

          <div className="space-y-4 px-6 py-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Micrófono Zed (push-to-talk)</span>
              <input
                type="checkbox"
                checked={settings.voiceEnabled}
                onChange={(e) => setSettings((s) => ({ ...s, voiceEnabled: e.target.checked }))}
              />
            </label>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>
                Zed habla respuestas (TTS Piper)
              </span>
              <input
                type="checkbox"
                checked={settings.ttsEnabled}
                onChange={(e) => setSettings((s) => ({ ...s, ttsEnabled: e.target.checked }))}
              />
            </label>

            <div>
              <label
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <Mic className="w-4 h-4" />
                Dispositivo de micrófono
              </label>
              {audioPermission === 'denied' ? (
                <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>
                  Permiso de micrófono denegado. Zed usará el micrófono predeterminado del sistema.
                </p>
              ) : (
                <select
                  value={settings.selectedMicId}
                  onChange={(e) => setSettings((s) => ({ ...s, selectedMicId: e.target.value }))}
                  data-testid="zed-mic-select"
                  className="w-full mt-2 h-10 rounded-xl border px-3 text-sm"
                  style={chromeSurfaceStyle({ surface: 'pill' })}
                >
                  <option value="">Micrófono predeterminado del sistema</option>
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Micrófono ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Modelo STT (Whisper)</span>
              <select
                value={settings.sttModel}
                onChange={(e) => setSettings((s) => ({ ...s, sttModel: e.target.value }))}
                className="h-10 w-[160px] rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                {STT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Backend de transcripción</span>
              <select
                value={settings.sttBackend}
                onChange={(e) => setSettings((s) => ({ ...s, sttBackend: e.target.value }))}
                data-testid="zed-stt-backend-select"
                className="h-10 w-[220px] rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                {STT_BACKENDS.map((backend) => (
                  <option key={backend} value={backend}>
                    {STT_BACKEND_LABELS[backend] || backend}
                  </option>
                ))}
              </select>
            </label>

            {settings.sttBackend === 'grok' ? (
              <div
                className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2 text-[11px]"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                <span
                  style={{ color: xaiKeyConfigured ? 'var(--text-secondary)' : 'var(--danger)' }}
                >
                  API key de xAI:{' '}
                  {xaiKeyConfigured === null
                    ? 'verificando…'
                    : xaiKeyConfigured
                      ? 'configurada'
                      : 'falta configurar'}
                </span>
                {onNavigateToZed ? (
                  <button
                    type="button"
                    onClick={onNavigateToZed}
                    data-testid="zed-voice-goto-zed-tab"
                    className="shrink-0 rounded border border-[var(--border-subtle)] px-2 py-1 font-medium text-[var(--text-secondary)] hover:bg-white/5"
                  >
                    Configurar en Zed →
                  </button>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Voz de Zed (Piper)</span>
              <select
                value={settings.ttsVoice}
                onChange={(e) => setSettings((s) => ({ ...s, ttsVoice: e.target.value }))}
                data-testid="zed-tts-voice-select"
                className="h-10 w-[220px] rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                {TTS_VOICE_OPTIONS.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Velocidad de habla</span>
              <select
                value={settings.ttsRate}
                onChange={(e) => setSettings((s) => ({ ...s, ttsRate: e.target.value }))}
                data-testid="zed-tts-rate-select"
                className="h-10 w-[160px] rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                {TTS_RATE_OPTIONS.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Atajo micrófono: <strong>Ctrl+Shift+M</strong> (mismo atajo inicia y detiene escucha).
              Abrir Zed: <strong>Ctrl+Shift+Z</strong>. Requiere <code>piper</code> en PATH o en el
              venv de voz. Las voces que no son la de por defecto se descargan una vez con{' '}
              <code>npm run voice:add-voice -- &lt;id&gt;</code>.
            </p>

            <TtsTestButton voice={settings.ttsVoice} rate={settings.ttsRate} />
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}

const TTS_TEST_PHRASE = 'Hola. Esta es una prueba de voz de Zed. Si me escuchas, el TTS funciona.';

function TtsTestButton({ voice, rate }) {
  const [status, setStatus] = useState('');

  const runTest = async () => {
    setStatus('Reproduciendo…');
    let unlistenError = null;
    let unlistenDone = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      unlistenError = await listen('tts-error', (event) => {
        const msg =
          typeof event.payload === 'string' && event.payload.trim()
            ? event.payload.trim()
            : 'Error TTS desconocido';
        setStatus(`Error: ${msg}`);
      });
      unlistenDone = await listen('tts-done', () => {
        setStatus('Listo — ¿escuchaste la frase de prueba?');
      });
      await invoke('voice_speak', {
        text: TTS_TEST_PHRASE,
        options: { voice, length_scale: rateToLengthScale(rate) },
      });
    } catch (error) {
      setStatus(`Error: ${String(error?.message || error || 'solo disponible en Tauri')}`);
    } finally {
      window.setTimeout(() => {
        if (typeof unlistenError === 'function') unlistenError();
        if (typeof unlistenDone === 'function') unlistenDone();
      }, 8000);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
      <button
        type="button"
        onClick={runTest}
        className="inline-flex items-center justify-center rounded border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-white/5"
      >
        Probar voz (TTS)
      </button>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Reproduce: «{TTS_TEST_PHRASE}». Requiere app Tauri (no navegador web).
      </p>
      {status ? (
        <p
          className="text-[11px]"
          style={{ color: status.startsWith('Error') ? '#f87171' : 'var(--text-secondary)' }}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
