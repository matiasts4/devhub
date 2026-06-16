/**
 * DevHub voice feature flags and settings keys.
 */

export const VOICE_SETTINGS_KEY = 'devhub-zed-voice-settings';

export function readVoiceSettings() {
  if (typeof window === 'undefined') {
    return { ttsEnabled: true, voiceEnabled: true, sttModel: 'large-v3-turbo' };
  }
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return { ttsEnabled: true, voiceEnabled: true, sttModel: 'large-v3-turbo' };
    const parsed = JSON.parse(raw);
    return {
      ttsEnabled: parsed.ttsEnabled !== false,
      voiceEnabled: parsed.voiceEnabled !== false,
      sttModel: parsed.sttModel || 'large-v3-turbo',
    };
  } catch {
    return { ttsEnabled: true, voiceEnabled: true, sttModel: 'large-v3-turbo' };
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
