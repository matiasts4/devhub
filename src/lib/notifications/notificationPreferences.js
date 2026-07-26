export const PREFERENCES_STORAGE_KEY = 'devhub:notifications:preferences';

export const SOUND_PRESETS = {
  chime: { label: 'Harmonic Chime', type: 'synth' },
  pulse: { label: 'Subtle Pulse', type: 'synth' },
  alarm: { label: 'Alarm Buzz', type: 'synth' },
  chord: { label: 'Major Chord', type: 'synth' },
  arcade: { label: '8-Bit Arcade', type: 'synth' },
  custom: { label: 'Personalizado (Archivo / URL)', type: 'file' },
};

export const DEFAULT_PREFERENCES = {
  enableToasts: true,
  enableNativeOS: true,
  enableSound: true,
  quietHours: false,
  minSeverity: 'info', // 'info' | 'warning' | 'critical'
  soundVolume: 0.5, // 0.0 a 1.0
  soundTheme: 'synthetic', // 'synthetic' | 'subtle' | 'arcade' | 'custom'
  soundPresets: {
    info: { preset: 'chime', customUrl: '' },
    warning: { preset: 'pulse', customUrl: '' },
    critical: { preset: 'alarm', customUrl: '' },
    success: { preset: 'chord', customUrl: '' },
  },
};

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export function getNotificationPreferences() {
  const target = getStorage();
  if (!target) return DEFAULT_PREFERENCES;

  try {
    const raw = target.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      soundPresets: {
        ...DEFAULT_PREFERENCES.soundPresets,
        ...parsed.soundPresets,
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveNotificationPreferences(newPrefs = {}) {
  const target = getStorage();
  const current = getNotificationPreferences();
  const updated = {
    ...current,
    ...newPrefs,
    soundPresets: {
      ...current.soundPresets,
      ...newPrefs.soundPresets,
    },
  };

  if (target) {
    target.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
  }

  return updated;
}
