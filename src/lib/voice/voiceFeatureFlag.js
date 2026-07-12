/**
 * DevHub voice feature flags and settings keys.
 */

import {
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_RATE,
  isKnownTtsVoice,
  isKnownTtsRate,
} from './ttsVoiceCatalog';

export const VOICE_SETTINGS_KEY = 'devhub-zed-voice-settings';

export const STT_BACKENDS = ['auto', 'faster-whisper', 'whispercpp', 'grok'];

const DEFAULTS = {
  ttsEnabled: true,
  voiceEnabled: true,
  sttModel: 'large-v3-turbo',
  sttBackend: 'auto',
  selectedMicId: '',
  ttsVoice: DEFAULT_TTS_VOICE,
  ttsRate: DEFAULT_TTS_RATE,
  // Empty = auto-pick best Spanish Web Speech voice on Windows.
  ttsSystemVoiceURI: '',
};

function normalize(parsed) {
  return {
    ttsEnabled: parsed?.ttsEnabled !== false,
    voiceEnabled: parsed?.voiceEnabled !== false,
    sttModel: parsed?.sttModel || DEFAULTS.sttModel,
    sttBackend: STT_BACKENDS.includes(parsed?.sttBackend) ? parsed.sttBackend : DEFAULTS.sttBackend,
    selectedMicId: parsed?.selectedMicId || '',
    ttsVoice: isKnownTtsVoice(parsed?.ttsVoice) ? parsed.ttsVoice : DEFAULTS.ttsVoice,
    ttsRate: isKnownTtsRate(parsed?.ttsRate) ? parsed.ttsRate : DEFAULTS.ttsRate,
    ttsSystemVoiceURI:
      typeof parsed?.ttsSystemVoiceURI === 'string' ? parsed.ttsSystemVoiceURI.trim() : '',
  };
}

export function readVoiceSettings() {
  if (typeof window === 'undefined') {
    return { ...DEFAULTS };
  }
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeVoiceSettings(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function isVoiceFeatureEnabled() {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEVHUB_VOICE_ENABLED === '0') {
    return false;
  }
  return true;
}
