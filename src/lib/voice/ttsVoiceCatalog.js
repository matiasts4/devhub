/**
 * Curated Piper voice + speaking-rate catalog for Zed TTS.
 *
 * Voice ids match Piper's `<lang>-<speaker>-<quality>` naming (see
 * https://github.com/rhasspy/piper/blob/master/VOICES.md) and the filename
 * `tts_engine.py` resolves under `packages/veloce-audio/python/voices/`.
 * `es_MX-claude-high` ships via `npm run voice:ensure` on Linux and Windows
 * (Electron); the other voices must be fetched once with
 * `npm run voice:add-voice -- <id>` before they'll actually speak.
 */

export const DEFAULT_TTS_VOICE = 'es_MX-claude-high';

export const TTS_VOICE_OPTIONS = [
  { id: 'es_ES-davefx-medium', label: 'Dave · España (estándar)' },
  { id: 'es_AR-daniela-high', label: 'Daniela · Argentina (alta calidad)' },
  { id: 'es_MX-claude-high', label: 'Claude · México (alta calidad)' },
];

export const DEFAULT_TTS_RATE = 'normal';

// Piper's `--length-scale`: 1.0 = normal, >1 slower, <1 faster.
export const TTS_RATE_OPTIONS = [
  { id: 'slow', label: 'Lenta', lengthScale: 1.15 },
  { id: 'normal', label: 'Normal', lengthScale: 1.0 },
  { id: 'fast', label: 'Rápida', lengthScale: 0.9 },
];

export function isKnownTtsVoice(voiceId) {
  return TTS_VOICE_OPTIONS.some((option) => option.id === voiceId);
}

export function isKnownTtsRate(rateId) {
  return TTS_RATE_OPTIONS.some((option) => option.id === rateId);
}

export function rateToLengthScale(rateId) {
  return TTS_RATE_OPTIONS.find((option) => option.id === rateId)?.lengthScale ?? 1.0;
}
