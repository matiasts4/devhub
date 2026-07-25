'use client';

import {
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';

const GROK_MODELS = [
  'grok-4.5',
  'grok-composer-2.5-fast',
  'grok-build-0.1',
  'grok-4.3',
  'grok-4.20-0309-non-reasoning',
  'grok-4.20-0309-reasoning',
  'grok-4.20-multi-agent-0309',
];

const KIMI_CODE_MODELS = ['kimi-for-coding'];

const PROVIDER_OPTIONS = [
  { id: 'xai', label: 'Grok (xAI)' },
  { id: 'kimi_code', label: 'Kimi Code (suscripción)' },
  { id: 'minimax', label: 'MiniMax' },
];

const PROVIDER_LABEL = {
  xai: 'Grok (xAI)',
  kimi_code: 'Kimi Code (suscripción)',
  minimax: 'MiniMax',
};

const emptyXaiAuth = () => ({
  state: 'idle', // idle | loading | pending | success | error
  userCode: null,
  verificationUri: null,
  deviceCode: null,
  interval: 5,
  username: null,
  error: null,
  copied: false,
});

export default function ZedModelSettings() {
  const [loading, setLoading] = useState(true);
  const [fullConfig, setFullConfig] = useState(null);
  const [provider, setProvider] = useState('xai');

  const [xaiAuthMode, setXaiAuthMode] = useState('api_key'); // api_key | oauth
  const [xaiKey, setXaiKey] = useState('');
  const [xaiModel, setXaiModel] = useState(GROK_MODELS[1]);
  const [xaiEnabled, setXaiEnabled] = useState(true);
  const [xaiModelOptions, setXaiModelOptions] = useState(GROK_MODELS);
  const [xaiAuth, setXaiAuth] = useState(emptyXaiAuth);
  const xaiPollRef = useRef(null);

  const [kimiKey, setKimiKey] = useState('');
  const [kimiModel, setKimiModel] = useState(KIMI_CODE_MODELS[0]);
  const [kimiEnabled, setKimiEnabled] = useState(true);

  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [modelsMeta, setModelsMeta] = useState(null);

  async function refreshStatus() {
    try {
      const res = await fetch('/api/assistant/zed-provider-status');
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/llm-providers');
        const data = await res.json();
        const xai = data.providers?.xai || {};
        const kimi = data.providers?.kimi_code || {};
        setFullConfig(data);
        setProvider(data.zed?.provider || 'xai');
        setXaiKey(xai.XAI_API_KEY || '');
        setXaiModel(xai.XAI_MODEL || GROK_MODELS[1]);
        setXaiEnabled(xai.enabled !== false);

        const mode =
          xai.XAI_AUTH_MODE === 'oauth' ||
          xai.XAI_AUTH_MODE === 'subscription' ||
          xai.XAI_AUTH_MODE === 'supergrok' ||
          (!xai.XAI_API_KEY && (xai.XAI_OAUTH_REFRESH_TOKEN || xai.XAI_OAUTH_ACCESS_TOKEN))
            ? 'oauth'
            : 'api_key';
        setXaiAuthMode(mode);
        if (xai.XAI_OAUTH_REFRESH_TOKEN || xai.XAI_OAUTH_ACCESS_TOKEN) {
          setXaiAuth((prev) => ({
            ...prev,
            state: 'success',
            username: xai.XAI_OAUTH_USERNAME || 'SuperGrok',
          }));
        }

        setKimiKey(kimi.KIMI_CODE_API_KEY || '');
        setKimiModel(kimi.KIMI_CODE_MODEL || KIMI_CODE_MODELS[0]);
        setKimiEnabled(kimi.enabled !== false);
        if (Array.isArray(data.modelOptions?.xai) && data.modelOptions.xai.length) {
          setXaiModelOptions(data.modelOptions.xai);
        }
      } catch (err) {
        console.error('Failed to load Zed LLM config:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    refreshStatus();
    return () => {
      if (xaiPollRef.current) clearTimeout(xaiPollRef.current);
    };
  }, []);

  async function startXaiOAuthLogin() {
    if (xaiPollRef.current) clearTimeout(xaiPollRef.current);
    setXaiAuth({
      ...emptyXaiAuth(),
      state: 'loading',
    });
    try {
      const res = await fetch('/api/settings/llm-providers/xai/device-flow', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error iniciando SuperGrok OAuth');
      setXaiAuth({
        state: 'pending',
        userCode: data.user_code,
        verificationUri: data.verification_uri_complete || data.verification_uri,
        deviceCode: data.device_code,
        interval: data.interval || 5,
        username: null,
        error: null,
        copied: false,
      });
      pollXaiAuth(data.device_code, data.interval || 5);
    } catch (err) {
      setXaiAuth((prev) => ({ ...prev, state: 'error', error: err.message }));
    }
  }

  function pollXaiAuth(deviceCode, interval) {
    if (xaiPollRef.current) clearTimeout(xaiPollRef.current);
    const doPoll = async () => {
      try {
        const res = await fetch('/api/settings/llm-providers/xai/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await res.json();
        if (data.status === 'pending') {
          xaiPollRef.current = setTimeout(doPoll, (data.interval || interval) * 1000);
        } else if (data.status === 'success') {
          setXaiAuth((prev) => ({
            ...prev,
            state: 'success',
            username: data.username || 'SuperGrok',
            userCode: null,
            deviceCode: null,
          }));
          setXaiAuthMode('oauth');
          // Reload config so save() keeps the new tokens + live model list.
          let reloadedXai = null;
          try {
            const cfgRes = await fetch('/api/settings/llm-providers');
            const cfg = await cfgRes.json();
            setFullConfig(cfg);
            reloadedXai = cfg.providers?.xai || null;
            if (cfg.providers?.xai?.XAI_MODEL) {
              setXaiModel(cfg.providers.xai.XAI_MODEL);
            }
            if (Array.isArray(cfg.modelOptions?.xai) && cfg.modelOptions.xai.length) {
              setXaiModelOptions(cfg.modelOptions.xai);
            }
          } catch {
            // ignore
          }
          // Force a second live sync (API + SuperGrok CLI catalog).
          if (reloadedXai) {
            await refreshXaiModels(reloadedXai);
          }
          await refreshStatus();
        } else if (data.status === 'expired') {
          setXaiAuth((prev) => ({
            ...prev,
            state: 'error',
            error: 'El código venció. Intentalo de nuevo.',
          }));
        } else {
          setXaiAuth((prev) => ({
            ...prev,
            state: 'error',
            error: data.error || 'Error desconocido',
          }));
        }
      } catch (err) {
        setXaiAuth((prev) => ({ ...prev, state: 'error', error: err.message }));
      }
    };
    xaiPollRef.current = setTimeout(doPoll, interval * 1000);
  }

  function logoutXaiOAuth() {
    if (xaiPollRef.current) clearTimeout(xaiPollRef.current);
    setXaiAuth(emptyXaiAuth());
    setXaiAuthMode('api_key');
    // Clear tokens from local fullConfig so next save persists logout.
    setFullConfig((prev) => {
      if (!prev?.providers?.xai) return prev;
      const xai = { ...prev.providers.xai };
      delete xai.XAI_OAUTH_ACCESS_TOKEN;
      delete xai.XAI_OAUTH_REFRESH_TOKEN;
      delete xai.XAI_OAUTH_EXPIRES_AT;
      delete xai.XAI_OAUTH_USERNAME;
      xai.XAI_AUTH_MODE = 'api_key';
      return {
        ...prev,
        providers: { ...prev.providers, xai },
      };
    });
  }

  async function copyUserCode() {
    if (!xaiAuth.userCode) return;
    try {
      await navigator.clipboard.writeText(xaiAuth.userCode);
      setXaiAuth((prev) => ({ ...prev, copied: true }));
      setTimeout(() => setXaiAuth((prev) => ({ ...prev, copied: false })), 2000);
    } catch {
      // ignore
    }
  }

  async function save() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const current = fullConfig || { providers: {}, priorityOrder: [], modelOptions: {}, zed: {} };
      const prevXai = current.providers?.xai || {};
      const nextXai = {
        ...prevXai,
        XAI_API_KEY: xaiKey.trim(),
        XAI_MODEL: xaiModel,
        enabled: xaiEnabled,
        XAI_AUTH_MODE: xaiAuthMode,
        XAI_BASE_URL: prevXai.XAI_BASE_URL || 'https://api.x.ai/v1/chat/completions',
      };

      if (xaiAuthMode === 'oauth') {
        // Keep tokens already persisted by poll route; if user logged out locally, strip them.
        if (xaiAuth.state !== 'success') {
          delete nextXai.XAI_OAUTH_ACCESS_TOKEN;
          delete nextXai.XAI_OAUTH_REFRESH_TOKEN;
          delete nextXai.XAI_OAUTH_EXPIRES_AT;
          delete nextXai.XAI_OAUTH_USERNAME;
        }
      }

      const nextProviders = {
        ...current.providers,
        xai: nextXai,
        kimi_code: {
          ...(current.providers?.kimi_code || {}),
          KIMI_CODE_API_KEY: kimiKey.trim(),
          KIMI_CODE_MODEL: kimiModel,
          enabled: kimiEnabled,
        },
      };
      const payload = {
        ...current,
        zed: { ...(current.zed || {}), provider },
        providers: nextProviders,
        modelOptions: {
          ...(current.modelOptions || {}),
          xai: xaiModelOptions,
          kimi_code: KIMI_CODE_MODELS,
        },
      };
      const res = await fetch('/api/settings/llm-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setFullConfig(payload);
        setSaveMessage({
          type: 'success',
          text: 'Guardado. Zed usará este proveedor en el próximo mensaje.',
        });
        await refreshStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveMessage({ type: 'error', text: err.error || 'Error al guardar' });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }

  /**
   * Pull live models from xAI:
   * - api.x.ai/v1/models (API catalog: 4.5, build, 4.3, …)
   * - cli-chat-proxy.grok.com (subscription: Composer 2.5, Grok 4.5)
   * @param {object} [configOverride] providers.xai row (use after OAuth poll)
   */
  async function refreshXaiModels(configOverride) {
    setLoadingModels(true);
    setModelsError(null);
    setModelsMeta(null);
    try {
      const xaiCfg = configOverride || fullConfig?.providers?.xai || {};
      const res = await fetch('/api/settings/llm-providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'xai',
          config: {
            XAI_AUTH_MODE: configOverride?.XAI_AUTH_MODE || xaiAuthMode,
            XAI_API_KEY: (configOverride?.XAI_API_KEY ?? xaiKey).trim?.() || xaiKey.trim(),
            XAI_OAUTH_ACCESS_TOKEN: xaiCfg.XAI_OAUTH_ACCESS_TOKEN || '',
            XAI_OAUTH_REFRESH_TOKEN: xaiCfg.XAI_OAUTH_REFRESH_TOKEN || '',
            XAI_OAUTH_EXPIRES_AT: xaiCfg.XAI_OAUTH_EXPIRES_AT || 0,
          },
        }),
      });
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      if (!models.length) {
        setModelsError(data.error || 'No se pudieron obtener modelos de xAI');
        return;
      }
      setXaiModelOptions(models);
      setModelsMeta({
        sources: data.sources || [],
        authSource: data.authSource || null,
        warnings: data.warnings || [],
      });
      setXaiModel((current) => (models.includes(current) ? current : models[0]));
      // Persist into fullConfig.modelOptions so Guardar keeps them.
      setFullConfig((prev) => {
        const base = prev || { providers: {}, modelOptions: {} };
        return {
          ...base,
          modelOptions: {
            ...(base.modelOptions || {}),
            xai: models,
          },
        };
      });
    } catch (err) {
      setModelsError(err.message);
    } finally {
      setLoadingModels(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      let body;
      if (provider === 'kimi_code') {
        body = {
          provider: 'kimi_code',
          config: { KIMI_CODE_API_KEY: kimiKey.trim(), KIMI_CODE_MODEL: kimiModel },
        };
      } else {
        const xaiCfg = fullConfig?.providers?.xai || {};
        body = {
          provider: 'xai',
          config: {
            XAI_AUTH_MODE: xaiAuthMode,
            XAI_API_KEY: xaiKey.trim(),
            XAI_MODEL: xaiModel,
            XAI_OAUTH_ACCESS_TOKEN: xaiCfg.XAI_OAUTH_ACCESS_TOKEN || '',
            XAI_OAUTH_REFRESH_TOKEN: xaiCfg.XAI_OAUTH_REFRESH_TOKEN || '',
            XAI_OAUTH_EXPIRES_AT: xaiCfg.XAI_OAUTH_EXPIRES_AT || 0,
          },
        };
      }
      const res = await fetch('/api/settings/llm-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ valid: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  const canTestXai =
    provider === 'xai' &&
    (xaiAuthMode === 'oauth'
      ? xaiAuth.state === 'success' || Boolean(fullConfig?.providers?.xai?.XAI_OAUTH_REFRESH_TOKEN)
      : Boolean(xaiKey.trim()));
  const activeKey =
    provider === 'kimi_code' ? kimiKey.trim() : provider === 'xai' ? canTestXai : null;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando configuración del modelo">
        {/* Skeleton mirroring the final panel chrome so the section loads
            visually consistent with the rest of the settings modal. */}
        {[0, 1].map((block) => (
          <div
            key={block}
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
              <div
                className="h-9 w-9 animate-pulse"
                style={{ background: 'var(--surface-muted)' }}
              />
              <div className="flex-1 space-y-2">
                <div
                  className="h-3.5 w-44 animate-pulse rounded"
                  style={{ background: 'var(--surface-muted)' }}
                />
                <div
                  className="h-2.5 w-64 max-w-full animate-pulse rounded"
                  style={{ background: 'var(--surface-muted)' }}
                />
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div
                className="h-9 animate-pulse rounded"
                style={{ background: 'var(--surface-muted)' }}
              />
              <div
                className="h-9 w-4/5 animate-pulse rounded"
                style={{ background: 'var(--surface-muted)' }}
              />
              <div
                className="h-9 w-3/5 animate-pulse rounded"
                style={{ background: 'var(--surface-muted)' }}
              />
            </div>
          </div>
        ))}
        <p className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando configuración del modelo…
        </p>
      </div>
    );
  }

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
              <Cpu className="h-4 w-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Modelo de Zed
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Elegí qué proveedor usa Zed para razonar y llamar herramientas.
              </p>
            </div>
          </div>

          <div className="space-y-5 px-6 py-4">
            <div className="flex items-center justify-between gap-4 max-w-lg">
              <label
                htmlFor="zed-provider-select"
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Proveedor activo
              </label>
              <select
                id="zed-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                data-testid="zed-provider-select"
                className="h-10 w-[280px] rounded-xl border px-3 text-sm"
                style={{ ...chromeSurfaceStyle({ surface: 'pill' }), color: 'var(--text-primary)' }}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {provider === 'xai' ? (
              <>
                <div className="flex items-center justify-between gap-4 max-w-sm">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Habilitar Grok
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Desactivá solo si querés conservar la config pero usar otro proveedor.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={xaiEnabled}
                    data-testid="zed-model-xai-enabled-toggle"
                    onClick={() => setXaiEnabled((v) => !v)}
                    className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                    style={{
                      background: xaiEnabled ? 'var(--accent-primary)' : 'var(--surface-muted)',
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: xaiEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>

                <div className="space-y-2 max-w-lg">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Modalidad de autenticación
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="zed-xai-auth-mode-oauth"
                      disabled={!xaiEnabled}
                      onClick={() => setXaiAuthMode('oauth')}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                      style={{
                        ...chromeSurfaceStyle({ surface: 'pill' }),
                        borderColor: xaiAuthMode === 'oauth' ? 'var(--accent-primary)' : undefined,
                        color:
                          xaiAuthMode === 'oauth' ? 'var(--accent-primary)' : 'var(--text-primary)',
                      }}
                    >
                      Suscripción SuperGrok (OAuth)
                    </button>
                    <button
                      type="button"
                      data-testid="zed-xai-auth-mode-api-key"
                      disabled={!xaiEnabled}
                      onClick={() => setXaiAuthMode('api_key')}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                      style={{
                        ...chromeSurfaceStyle({ surface: 'pill' }),
                        borderColor:
                          xaiAuthMode === 'api_key' ? 'var(--accent-primary)' : undefined,
                        color:
                          xaiAuthMode === 'api_key'
                            ? 'var(--accent-primary)'
                            : 'var(--text-primary)',
                      }}
                    >
                      API Key (pay-as-you-go)
                    </button>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Igual que OpenCode: la suscripción SuperGrok / X Premium+ usa device-code OAuth
                    (sin <code>XAI_API_KEY</code>). La API key sigue disponible como opción aparte.
                  </p>
                </div>

                {xaiAuthMode === 'oauth' ? (
                  <div className="space-y-3 max-w-lg" data-testid="zed-xai-oauth-panel">
                    {xaiAuth.state === 'success' ? (
                      <div
                        className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                        style={chromeSurfaceStyle({ surface: 'pill' })}
                      >
                        <div
                          className="flex items-center gap-2 text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <CheckCircle2
                            className="h-4 w-4"
                            style={{ color: 'var(--success, #4ade80)' }}
                          />
                          Sesión SuperGrok
                          {xaiAuth.username ? (
                            <>
                              : <span className="font-mono font-semibold">{xaiAuth.username}</span>
                            </>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          data-testid="zed-xai-oauth-logout"
                          onClick={logoutXaiOAuth}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
                          style={chromeSurfaceStyle({ surface: 'pill' })}
                        >
                          <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                        </button>
                      </div>
                    ) : xaiAuth.state === 'pending' ? (
                      <div
                        className="space-y-3 rounded-xl border px-4 py-3"
                        style={chromeSurfaceStyle({ surface: 'pill' })}
                      >
                        <div
                          className="flex items-center gap-2 text-xs font-semibold"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            style={{ color: 'var(--accent-primary)' }}
                          />
                          Esperando autorización en xAI…
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          1. Abrí{' '}
                          <a
                            href={xaiAuth.verificationUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline inline-flex items-center gap-0.5"
                            style={{ color: 'var(--accent-primary)' }}
                          >
                            {xaiAuth.verificationUri} <ExternalLink className="h-3 w-3" />
                          </a>
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          2. Ingresá este código:
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            data-testid="zed-xai-oauth-user-code"
                            className="font-mono text-2xl font-bold tracking-widest px-4 py-2 rounded-xl border"
                            style={chromeSurfaceStyle({ surface: 'pill' })}
                          >
                            {xaiAuth.userCode}
                          </span>
                          <button
                            type="button"
                            onClick={copyUserCode}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                            style={chromeSurfaceStyle({ surface: 'pill' })}
                            aria-label="Copiar código"
                          >
                            {xaiAuth.copied ? (
                              <CheckCircle2
                                className="h-4 w-4"
                                style={{ color: 'var(--success, #4ade80)' }}
                              />
                            ) : (
                              <Copy className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid="zed-xai-oauth-login"
                        disabled={!xaiEnabled || xaiAuth.state === 'loading'}
                        onClick={startXaiOAuthLogin}
                        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
                        style={{
                          ...chromeSurfaceStyle({ surface: 'pill' }),
                          color: 'var(--accent-primary)',
                          borderColor: 'var(--accent-primary)',
                        }}
                      >
                        {xaiAuth.state === 'loading' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogIn className="h-4 w-4" />
                        )}
                        Login con SuperGrok / X Premium+
                      </button>
                    )}
                    {xaiAuth.state === 'error' && xaiAuth.error ? (
                      <p
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: 'var(--danger, #f87171)' }}
                      >
                        <XCircle className="h-3.5 w-3.5" /> {xaiAuth.error}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="zed-xai-api-key"
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      API Key de xAI
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="zed-xai-api-key"
                        type={showKey ? 'text' : 'password'}
                        value={xaiKey}
                        onChange={(e) => setXaiKey(e.target.value)}
                        placeholder="xai-..."
                        disabled={!xaiEnabled}
                        data-testid="zed-xai-api-key-input"
                        className="h-10 flex-1 rounded-xl border px-3 text-sm disabled:opacity-40"
                        style={{
                          ...chromeSurfaceStyle({ surface: 'pill' }),
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? 'Ocultar API key' : 'Mostrar API key'}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                        style={chromeSurfaceStyle({ surface: 'pill' })}
                      >
                        {showKey ? (
                          <EyeOff className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <Eye className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-w-lg">
                  <div className="flex items-center justify-between gap-4">
                    <label
                      htmlFor="zed-xai-model-select"
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Modelo Grok
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id="zed-xai-model-select"
                        value={
                          xaiModelOptions.includes(xaiModel)
                            ? xaiModel
                            : xaiModelOptions[0] || xaiModel
                        }
                        onChange={(e) => setXaiModel(e.target.value)}
                        disabled={!xaiEnabled}
                        data-testid="zed-xai-model-select"
                        className="h-10 w-[260px] rounded-xl border px-3 text-sm disabled:opacity-40"
                        style={{
                          ...chromeSurfaceStyle({ surface: 'pill' }),
                          color: 'var(--text-primary)',
                        }}
                      >
                        {xaiModelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        data-testid="zed-xai-refresh-models"
                        disabled={!xaiEnabled || loadingModels}
                        onClick={() => refreshXaiModels()}
                        title="Sincronizar modelos desde xAI (API + suscripción)"
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium disabled:opacity-50"
                        style={chromeSurfaceStyle({ surface: 'pill' })}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${loadingModels ? 'animate-spin' : ''}`}
                        />
                        {loadingModels ? 'Sync…' : 'Sync modelos'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Lista en vivo: <code>api.x.ai/v1/models</code>
                    {xaiAuthMode === 'oauth' ? (
                      <>
                        {' '}
                        + catálogo SuperGrok (<code>cli-chat-proxy.grok.com</code> → Composer 2.5 /
                        Grok 4.5)
                      </>
                    ) : null}
                    . {xaiModelOptions.length} modelos.
                  </p>
                  {modelsMeta?.sources?.length ? (
                    <p
                      className="text-[11px]"
                      style={{ color: 'var(--text-muted)' }}
                      data-testid="zed-xai-models-sources"
                    >
                      Fuentes: {modelsMeta.sources.join(', ')}
                      {modelsMeta.authSource ? ` · auth: ${modelsMeta.authSource}` : ''}
                    </p>
                  ) : null}
                  {modelsError ? (
                    <p className="text-[11px]" style={{ color: 'var(--danger, #f87171)' }}>
                      {modelsError}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {provider === 'kimi_code' ? (
              <>
                <div className="flex items-center justify-between gap-4 max-w-sm">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Habilitar Kimi Code
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Usa la API de tu suscripción Kimi Code (no la Open Platform pay-as-you-go).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={kimiEnabled}
                    data-testid="zed-model-kimi-enabled-toggle"
                    onClick={() => setKimiEnabled((v) => !v)}
                    className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                    style={{
                      background: kimiEnabled ? 'var(--accent-primary)' : 'var(--surface-muted)',
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: kimiEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="zed-kimi-api-key"
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    API Key de Kimi Code
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="zed-kimi-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={kimiKey}
                      onChange={(e) => setKimiKey(e.target.value)}
                      placeholder="API key desde Kimi Code Console"
                      disabled={!kimiEnabled}
                      data-testid="zed-kimi-api-key-input"
                      className="h-10 flex-1 rounded-xl border px-3 text-sm disabled:opacity-40"
                      style={{
                        ...chromeSurfaceStyle({ surface: 'pill' }),
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Ocultar API key' : 'Mostrar API key'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                      style={chromeSurfaceStyle({ surface: 'pill' })}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                      ) : (
                        <Eye className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Base URL: <code>https://api.kimi.com/coding/v1</code> · Modelo:{' '}
                    <code>kimi-for-coding</code>. Creá la key en la consola de Kimi Code.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 max-w-sm">
                  <label
                    htmlFor="zed-kimi-model-select"
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Modelo
                  </label>
                  <select
                    id="zed-kimi-model-select"
                    value={kimiModel}
                    onChange={(e) => setKimiModel(e.target.value)}
                    disabled={!kimiEnabled}
                    data-testid="zed-kimi-model-select"
                    className="h-10 w-[260px] rounded-xl border px-3 text-sm disabled:opacity-40"
                    style={{
                      ...chromeSurfaceStyle({ surface: 'pill' }),
                      color: 'var(--text-primary)',
                    }}
                  >
                    {KIMI_CODE_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {provider === 'minimax' ? (
              <p
                className="text-sm leading-relaxed max-w-lg"
                style={{ color: 'var(--text-muted)' }}
              >
                MiniMax usa la misma API key que el resto de DevHub (<code>MINIMAX_API_KEY</code> en{' '}
                <code>.env.local</code> o <code>providers.minimax</code> en Ajustes de proveedores
                LLM). No hace falta API key adicional aquí: con seleccionar MiniMax alcanza si ya
                está configurado.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                data-testid="zed-model-save-button"
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{
                  ...chromeSurfaceStyle({ surface: 'pill' }),
                  color: 'var(--accent-primary)',
                  borderColor: 'var(--accent-primary)',
                }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar
              </button>
              {provider !== 'minimax' ? (
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !activeKey}
                  data-testid="zed-model-test-button"
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
                  style={chromeSurfaceStyle({ surface: 'pill' })}
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Probar conexión
                </button>
              ) : null}
              {testResult ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{
                    color: testResult.valid ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)',
                  }}
                >
                  {testResult.valid ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {testResult.valid ? 'Conexión OK' : testResult.error || 'Falló la conexión'}
                </span>
              ) : null}
            </div>

            {saveMessage ? (
              <p
                className="text-xs"
                style={{
                  color:
                    saveMessage.type === 'success'
                      ? 'var(--success, #4ade80)'
                      : 'var(--danger, #f87171)',
                }}
              >
                {saveMessage.text}
              </p>
            ) : null}

            <p
              data-testid="zed-model-status"
              className="text-[11px] leading-relaxed border-t pt-3"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}
            >
              {status ? (
                <>
                  Zed está usando ahora mismo:{' '}
                  <strong>{PROVIDER_LABEL[status.provider] || status.provider}</strong>
                  {status.model ? <> ({status.model})</> : null}
                  {status.authMode === 'oauth' ? <> · auth: suscripción SuperGrok</> : null}
                  {status.source?.startsWith?.('xai-oauth') ? <> · token OAuth</> : null}
                  {!status.hasKey ? <> — faltan credenciales válidas para este proveedor.</> : null}
                </>
              ) : (
                'No se pudo leer el estado actual del proveedor.'
              )}
            </p>
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}
