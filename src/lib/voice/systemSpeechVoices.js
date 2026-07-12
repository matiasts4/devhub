/**
 * Web Speech (Windows/WebView2) voice helpers for Zed TTS.
 * Prefer Spanish + Natural/Neural when auto-picking.
 */

const QUALITY_RE = /\b(natural|neural|online)\b/i;

function normalizeVoice(voice) {
  if (!voice) return null;
  const voiceURI = String(voice.voiceURI || voice.name || '').trim();
  const name = String(voice.name || voiceURI || '').trim();
  const lang = String(voice.lang || '').trim();
  if (!voiceURI && !name) return null;
  return {
    voiceURI: voiceURI || name,
    name: name || voiceURI,
    lang,
    localService: voice.localService !== false,
  };
}

export function listSystemSpeechVoices(
  synth = typeof window !== 'undefined' ? window.speechSynthesis : null
) {
  if (!synth || typeof synth.getVoices !== 'function') return [];
  const raw = synth.getVoices();
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeVoice).filter(Boolean);
}

function scoreVoice(voice) {
  const lang = String(voice.lang || '').toLowerCase();
  const name = String(voice.name || '');
  let score = 0;
  if (lang.startsWith('es')) score += 100;
  if (QUALITY_RE.test(name)) score += 40;
  if (voice.localService) score += 5;
  // Prefer MX/ES/AR when otherwise tied.
  if (/^es-(mx|es|ar)/i.test(lang)) score += 10;
  return score;
}

export function rankSystemVoices(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return [];
  return [...voices]
    .map(normalizeVoice)
    .filter(Boolean)
    .sort((a, b) => {
      const delta = scoreVoice(b) - scoreVoice(a);
      if (delta !== 0) return delta;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
}

export function findSystemVoice(voices, voiceURI) {
  const wanted = String(voiceURI || '').trim();
  if (!wanted || !Array.isArray(voices)) return null;
  const normalized = voices.map(normalizeVoice).filter(Boolean);
  return (
    normalized.find((v) => v.voiceURI === wanted) ||
    normalized.find((v) => v.name === wanted) ||
    null
  );
}

export function pickBestSpanishVoice(voices) {
  const ranked = rankSystemVoices(voices);
  if (ranked.length === 0) return null;
  const spanish = ranked.find((v) =>
    String(v.lang || '')
      .toLowerCase()
      .startsWith('es')
  );
  return spanish || ranked[0];
}

/**
 * Resolve the SpeechSynthesisVoice object to attach to an utterance.
 * Prefers an explicit system voiceURI; otherwise best Spanish heuristic.
 */
export function resolveSpeechSynthesisVoice(
  synth,
  { systemVoiceURI = '', fallbackLang = 'es-ES' } = {}
) {
  const voices = typeof synth?.getVoices === 'function' ? synth.getVoices() : [];
  if (!Array.isArray(voices) || voices.length === 0) return null;

  if (systemVoiceURI) {
    const match =
      voices.find((v) => v.voiceURI === systemVoiceURI) ||
      voices.find((v) => v.name === systemVoiceURI);
    if (match) return match;
  }

  const best = pickBestSpanishVoice(voices);
  if (best) {
    return voices.find((v) => v.voiceURI === best.voiceURI || v.name === best.name) || null;
  }

  const lang = String(fallbackLang || 'es-ES').toLowerCase();
  return (
    voices.find((v) => String(v.lang || '').toLowerCase() === lang) ||
    voices.find((v) =>
      String(v.lang || '')
        .toLowerCase()
        .startsWith('es')
    ) ||
    null
  );
}
