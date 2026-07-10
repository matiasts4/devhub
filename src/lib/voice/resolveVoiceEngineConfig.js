/**
 * Builds the payload for the `voice_set_settings` Tauri command and centralizes
 * xAI (Grok STT) API key lookup so ZedVoiceSettings and ZedAmbientOverlay can't
 * drift out of sync.
 *
 * The key is reused from `data/llm-providers-config.json` (`providers.xai.XAI_API_KEY`)
 * -- the same file/field Zed's LLM chat settings already write to, via the
 * existing `/api/settings/llm-providers` route.
 */

async function fetchXaiApiKey() {
  try {
    const res = await fetch('/api/settings/llm-providers');
    if (!res.ok) return '';
    const data = await res.json();
    return data?.providers?.xai?.XAI_API_KEY || '';
  } catch {
    return '';
  }
}

/**
 * Returns whether an xAI API key is currently configured, for status display
 * (e.g. "API key: configurada" / "falta configurar" in the Voice settings tab).
 */
export async function fetchXaiKeyConfigured() {
  return Boolean(await fetchXaiApiKey());
}

/**
 * Builds the `settings` object passed to `invoke('voice_set_settings', { settings })`.
 *
 * The xAI key is fetched and included unconditionally (not only when
 * sttBackend === 'grok'): on lightweight/Windows installs without the local
 * ML stack, backend "auto" silently resolves to Grok server-side, so the key
 * needs to already be there for that fallback to "just work" without the
 * user having to touch the backend dropdown first.
 */
export async function buildVoiceEngineConfig(settings) {
  const config = {
    model: settings?.sttModel,
    backend: settings?.sttBackend || 'auto',
    language: 'es',
    microphone: settings?.selectedMicId || 'default',
  };

  const xaiApiKey = await fetchXaiApiKey();
  if (xaiApiKey) {
    config.xai_api_key = xaiApiKey;
  }

  return config;
}
