import { getNotificationPreferences } from './notificationPreferences';

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Sintetiza tonos sutiles según la configuración de preset seleccionada.
 */
function playSynthPreset(presetName, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  switch (presetName) {
    case 'alarm':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
      break;

    case 'pulse':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(739.99, now);
      gain.gain.setValueAtTime(volume * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'chord':
      // Arpegio ascendente C5 -> G5 -> C6
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(volume * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'arcade':
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.06);
      osc.frequency.setValueAtTime(1760, now + 0.12);
      gain.gain.setValueAtTime(volume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'chime':
    default:
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.15); // E6
      gain.gain.setValueAtTime(volume * 0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;
  }
}

/**
 * Reproduce un archivo de audio personalizado (URL o archivo base64/blob).
 */
function playCustomAudioFile(url, volume = 0.5) {
  if (typeof window === 'undefined' || !url) return;
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  } catch {
    // Ignorar si el navegador bloquea la carga
  }
}

/**
 * Función principal para reproducir sonido considerando las preferencias del usuario.
 */
export function playNotificationSound(severity = 'info', overrideVolume = null) {
  const prefs = getNotificationPreferences();
  if (!prefs.enableSound) return;

  const masterVol = overrideVolume !== null ? overrideVolume : (prefs.soundVolume ?? 0.5);
  if (masterVol <= 0) return;

  const severityPresetConfig = prefs.soundPresets?.[severity] || { preset: 'chime' };
  const presetName = severityPresetConfig.preset || 'chime';

  if (presetName === 'custom' && severityPresetConfig.customUrl) {
    playCustomAudioFile(severityPresetConfig.customUrl, masterVol);
  } else {
    playSynthPreset(presetName, masterVol * 0.3);
  }
}

/**
 * Reproduce una vista previa de sonido (para probar en el panel de ajustes).
 */
export function previewSoundPreset(presetName, customUrl = '', volume = 0.5) {
  if (presetName === 'custom' && customUrl) {
    playCustomAudioFile(customUrl, volume);
  } else {
    playSynthPreset(presetName, volume * 0.3);
  }
}
