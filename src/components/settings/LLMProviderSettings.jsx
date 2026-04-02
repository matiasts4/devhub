'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  ArrowUp,
  ArrowDown,
  TestTube2,
  Save,
  Shield,
  Globe,
  Plug,
  Cpu,
  Star,
  LogIn,
  LogOut,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

// Provider configurations
const PROVIDER_CONFIGS = {
  copilot: {
    name: 'GitHub Copilot',
    description: 'Proveedor oficial de GitHub Copilot con acceso a la flota real (gpt-4o, gpt-4.1, gpt-5.2, Raptor) y soporte de reasoning_effort.',
    envVars: {
      COPILOT_MODEL: {
        label: 'Modelo',
        type: 'select',
        options: [],
        default: 'gpt-5.2',
      },
      COPILOT_REASONING_EFFORT: {
        label: 'Reasoning Effort',
        type: 'button-group',
        options: ['none', 'low', 'medium', 'high', 'xhigh'],
        default: 'none',
      },
    },
    priority: 1,
    icon: Shield,
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Acceso a modelos gratuitos como Qwen, Llama, Gemma y más.',
    envVars: {
      OPENROUTER_API_KEY: {
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-or-...',
        required: true,
      },
      OPENROUTER_MODEL: {
        label: 'Modelo',
        type: 'select',
        options: [
          'qwen/qwen-2.5-72b-instruct',
          'qwen/qwen-2.5-coder-32b-instruct',
          'meta-llama/llama-3.3-70b-instruct',
          'meta-llama/llama-3.1-8b-instruct',
          'google/gemma-2-27b-it',
          'mistralai/mistral-7b-instruct',
          'anthropic/claude-3.5-sonnet',
          'openai/gpt-4o-mini',
        ],
        default: 'qwen/qwen-2.5-72b-instruct',
      },
    },
    priority: 2,
    icon: Globe,
  },
  zen: {
    name: 'OpenCode Zen',
    description: 'Modelos gratuitos y trials de OpenCode.',
    envVars: {
      ZEN_API_KEY: { label: 'API Key', type: 'password', placeholder: 'zen-...', required: true },
      ZEN_MODEL: {
        label: 'Modelo',
        type: 'select',
        options: ['zen-default', 'zen-large', 'zen-turbo', 'zen-coder'],
        default: 'zen-default',
      },
    },
    priority: 3,
    icon: Zap,
  },
  direct: {
    name: 'API Directa',
    description: 'Cualquier proveedor compatible con OpenAI (Ollama, vLLM, etc.).',
    envVars: {
      LLM_API_KEY: { label: 'API Key', type: 'password', placeholder: 'sk-...', required: false },
      LLM_BASE_URL: {
        label: 'Base URL',
        type: 'url',
        placeholder: 'http://localhost:11434/v1',
        required: true,
      },
      LLM_MODEL: { label: 'Modelo', type: 'text', placeholder: 'llama3.2', default: 'gpt-4o-mini' },
    },
    priority: 4,
    icon: Plug,
  },
};

export default function LLMProviderSettings({ embedded = false }) {
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null); // provider name being tested
  const [loadingModels, setLoadingModels] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [modelOptions, setModelOptions] = useState({});
  const [modelErrors, setModelErrors] = useState({});
  const [modelSearch, setModelSearch] = useState({});
  const [copilotAuth, setCopilotAuth] = useState({
    state: 'idle', // idle | loading | pending | success | error
    userCode: null,
    verificationUri: null,
    deviceCode: null,
    interval: 5,
    username: null,
    error: null,
    copied: false,
  });
  const copilotPollRef = useRef(null);

  const [priorityOrder, setPriorityOrder] = useState(['copilot', 'openrouter', 'zen', 'direct']);
  const [globalTemperature, setGlobalTemperature] = useState(0.7);
  const [globalMaxTokens, setGlobalMaxTokens] = useState(4000);
  const [bridgeEnabled, setBridgeEnabled] = useState(true);
  const [saveMessage, setSaveMessage] = useState(null);
  const [favoriteModels, setFavoriteModels] = useState({});
  const [showFavoritesOnly, setShowFavoritesOnly] = useState({});

  function getModelFieldKey(providerName) {
    if (providerName === 'copilot') return 'COPILOT_MODEL';
    if (providerName === 'openrouter') return 'OPENROUTER_MODEL';
    if (providerName === 'zen') return 'ZEN_MODEL';
    if (providerName === 'direct') return 'LLM_MODEL';
    return null;
  }

  function updateModelSearch(providerName, value) {
    setModelSearch((prev) => ({
      ...prev,
      [providerName]: value,
    }));
  }

  function toggleFavorite(providerName, model) {
    const next = { ...favoriteModels };
    const providerFavs = next[providerName] || [];
    if (providerFavs.includes(model)) {
      next[providerName] = providerFavs.filter((m) => m !== model);
    } else {
      next[providerName] = [...providerFavs, model];
    }
    setFavoriteModels(next);
    persistConfig({ favoriteModels: next });
  }

  function isFavorite(providerName, model) {
    return (favoriteModels[providerName] || []).includes(model);
  }

  // Load current configuration
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const res = await fetch('/api/settings/llm-providers');
      const data = await res.json();
      setProviders(data.providers || {});
      setPriorityOrder(data.priorityOrder || ['copilot', 'openrouter', 'zen', 'direct']);
      setGlobalTemperature(data.globalTemperature ?? 0.7);
      setGlobalMaxTokens(data.globalMaxTokens ?? 4000);
      setBridgeEnabled(data.bridgeEnabled !== false);
      setModelOptions(data.modelOptions || {});
      setFavoriteModels(data.favoriteModels || {});
      // Detectar si hay un OAuth token guardado
      const copilotData = data.providers?.copilot || {};
      if (copilotData.COPILOT_OAUTH_TOKEN) {
        setCopilotAuth((prev) => ({ ...prev, state: 'success', username: copilotData._username || 'GitHub' }));
      }
    } catch (err) {
      console.error('Failed to load LLM config:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // GitHub Copilot Device Flow
  // ============================================================

  async function startCopilotLogin() {
    setCopilotAuth({ state: 'loading', userCode: null, verificationUri: null, deviceCode: null, interval: 5, username: null, error: null, copied: false });
    try {
      const res = await fetch('/api/settings/llm-providers/copilot/device-flow', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error iniciando Device Flow');
      setCopilotAuth((prev) => ({
        ...prev,
        state: 'pending',
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        deviceCode: data.device_code,
        interval: data.interval || 5,
      }));
      // Iniciar polling
      pollCopilotAuth(data.device_code, data.interval || 5);
    } catch (err) {
      setCopilotAuth((prev) => ({ ...prev, state: 'error', error: err.message }));
    }
  }

  function pollCopilotAuth(deviceCode, interval) {
    if (copilotPollRef.current) clearTimeout(copilotPollRef.current);
    const doPoll = async () => {
      try {
        const res = await fetch('/api/settings/llm-providers/copilot/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await res.json();
        if (data.status === 'pending') {
          copilotPollRef.current = setTimeout(doPoll, interval * 1000);
        } else if (data.status === 'success') {
          setCopilotAuth((prev) => ({ ...prev, state: 'success', username: data.username }));
          // Recargar config para que el provider vea el nuevo token
          await loadConfig();
        } else if (data.status === 'expired') {
          setCopilotAuth((prev) => ({ ...prev, state: 'error', error: 'El código venció. Intentalo de nuevo.' }));
        } else {
          setCopilotAuth((prev) => ({ ...prev, state: 'error', error: data.error || 'Error desconocido' }));
        }
      } catch (err) {
        setCopilotAuth((prev) => ({ ...prev, state: 'error', error: err.message }));
      }
    };
    copilotPollRef.current = setTimeout(doPoll, interval * 1000);
  }

  function logoutCopilot() {
    if (copilotPollRef.current) clearTimeout(copilotPollRef.current);
    setCopilotAuth({ state: 'idle', userCode: null, verificationUri: null, deviceCode: null, interval: 5, username: null, error: null, copied: false });
    setProviders((prev) => {
      const next = { ...prev };
      if (next.copilot) {
        delete next.copilot.COPILOT_OAUTH_TOKEN;
        delete next.copilot._username;
      }
      return next;
    });
  }

  async function persistConfig(overrides = {}) {
    try {
      await fetch('/api/settings/llm-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: overrides.providers || providers,
          priorityOrder: overrides.priorityOrder || priorityOrder,
          globalTemperature: overrides.globalTemperature ?? globalTemperature,
          globalMaxTokens: overrides.globalMaxTokens ?? globalMaxTokens,
          bridgeEnabled: overrides.bridgeEnabled ?? bridgeEnabled,
          modelOptions: overrides.modelOptions || modelOptions,
          favoriteModels: overrides.favoriteModels || favoriteModels,
        }),
      });
    } catch (err) {
      console.error('Failed to persist LLM config:', err);
    }
  }

  async function loadModels(providerName) {
    setLoadingModels(providerName);
    setModelErrors((prev) => ({ ...prev, [providerName]: null }));
    try {
      const res = await fetch('/api/settings/llm-providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerName,
          config: providers[providerName] || {},
        }),
      });
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];

      if (models.length === 0) {
        setModelErrors((prev) => ({
          ...prev,
          [providerName]: data.error || 'No se pudieron obtener modelos en vivo',
        }));
        return;
      }

      const nextModelOptions = { ...modelOptions, [providerName]: models };
      setModelOptions(nextModelOptions);
      await persistConfig({ modelOptions: nextModelOptions });
      
      toast.success(`Lista actualizada: ${models.length} modelos encontrados.`);

      const modelFieldKey = getModelFieldKey(providerName);
      if (modelFieldKey) {
        const current = providers[providerName]?.[modelFieldKey];
        if (!current || !models.includes(current)) {
          const nextProviders = {
            ...providers,
            [providerName]: {
              ...(providers[providerName] || {}),
              [modelFieldKey]: models[0],
            },
          };
          setProviders(nextProviders);
          await persistConfig({ providers: nextProviders, modelOptions: nextModelOptions });
        }
      }
    } catch (err) {
      setModelErrors((prev) => ({
        ...prev,
        [providerName]: err.message || 'Error cargando modelos',
      }));
    } finally {
      setLoadingModels(null);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings/llm-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers,
          priorityOrder,
          bridgeEnabled,
          modelOptions,
        }),
      });
      if (res.ok) {
        setSaveMessage({ type: 'success', text: 'Configuración guardada correctamente' });
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

  async function testProvider(providerName) {
    setTesting(providerName);
    try {
      const res = await fetch('/api/settings/llm-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerName,
          config: providers[providerName] || {},
        }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [providerName]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [providerName]: { valid: false, error: err.message },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function updateProviderConfig(providerName, key, value) {
    const nextProviders = {
      ...providers,
      [providerName]: {
        ...(providers[providerName] || {}),
        [key]: value,
      },
    };
    setProviders(nextProviders);
    await persistConfig({ providers: nextProviders });
  }

  async function toggleProvider(providerName) {
    const nextProviders = {
      ...providers,
      [providerName]: {
        ...(providers[providerName] || {}),
        enabled: !(providers[providerName]?.enabled ?? true),
      },
    };
    setProviders(nextProviders);
    await persistConfig({ providers: nextProviders });
  }

  async function moveProviderUp(providerName) {
    const idx = priorityOrder.indexOf(providerName);
    if (idx > 0) {
      const newOrder = [...priorityOrder];
      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
      setPriorityOrder(newOrder);
      await persistConfig({ priorityOrder: newOrder });
    }
  }

  async function moveProviderDown(providerName) {
    const idx = priorityOrder.indexOf(providerName);
    if (idx < priorityOrder.length - 1) {
      const newOrder = [...priorityOrder];
      [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
      setPriorityOrder(newOrder);
      await persistConfig({ priorityOrder: newOrder });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Cargando configuración...
        </span>
      </div>
    );
  }

  return (
    <div
      className={`space-y-6 ${embedded ? '' : 'animate-in fade-in slide-in-from-bottom-4 duration-500'}`}
    >
      {!embedded && (
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Modelos de IA
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Configuración de adaptadores, prioridades y modelos del LLM Bridge.
          </p>
        </div>
      )}

      {/* Save message */}
      {saveMessage && (
        <div
          className="rounded-xl border px-4 py-3 text-sm flex items-center gap-2"
          style={{
            background:
              saveMessage.type === 'success'
                ? 'color-mix(in srgb, #22c55e 10%, var(--surface-card))'
                : 'color-mix(in srgb, #ef4444 10%, var(--surface-card))',
            borderColor:
              saveMessage.type === 'success'
                ? 'color-mix(in srgb, #22c55e 30%, var(--border-subtle))'
                : 'color-mix(in srgb, #ef4444 30%, var(--border-subtle))',
            color: saveMessage.type === 'success' ? '#22c55e' : '#ef4444',
          }}
        >
          {saveMessage.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {saveMessage.text}
        </div>
      )}

      {/* Master toggle */}
      <section
        className="rounded-2xl border p-6"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
            onClick={() => setBridgeEnabled(!bridgeEnabled)}
            style={{
              background: bridgeEnabled
                ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
              border: `1px solid ${bridgeEnabled ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : 'var(--border-strong)'}`,
            }}
          >
            <Cpu
              className="w-4 h-4"
              style={{ color: bridgeEnabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            />
          </div>
          <div className="flex-1">
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              LLM Bridge Activo
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {bridgeEnabled
                ? 'El bot utilizará conexiones directas con los proveedores habilitados y manejará el fallback automáticamente.'
                : 'El bot funcionará utilizando el entorno OpenCode legacy y omitirá las conexiones directas.'}
            </p>
          </div>
          <div>
            <button
              onClick={() => setBridgeEnabled(!bridgeEnabled)}
              className="relative w-11 h-6 flex items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer"
              style={{
                background: bridgeEnabled
                  ? 'var(--success, #22c55e)'
                  : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${bridgeEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Provider cards */}
      {priorityOrder.map((providerName, index) => {
        const config = PROVIDER_CONFIGS[providerName];
        const providerData = providers[providerName] || {};
        const isEnabled = providerData.enabled ?? true;
        const testResult = testResults[providerName];
        const providerModelError = modelErrors[providerName];
        const Icon = config.icon;

        return (
          <section
            key={providerName}
            className="rounded-2xl border p-6 transition-all"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
              opacity: isEnabled ? 1 : 0.6,
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex shrink-0 items-center justify-center cursor-pointer transition-colors"
                onClick={() => toggleProvider(providerName)}
                title={isEnabled ? 'Haz click para desactivar' : 'Haz click para activar'}
                style={{
                  background: isEnabled
                    ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                    : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
                  border: `1px solid ${isEnabled ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : 'var(--border-strong)'}`,
                }}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: isEnabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                />
              </div>
              <div className="flex-1">
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {config.name}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {config.description}
                </p>
              </div>

              <div className="flex items-center gap-3 mt-2 sm:mt-0">
                {/* Priority Badge */}
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded shadow-sm flex items-center gap-1.5"
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Zap size={11} style={{ color: 'var(--accent-primary)' }} />
                  PRIORIDAD: {index + 1}
                </span>

                {/* Priority arrows */}
                <div className="flex gap-1 bg-surface-sunken rounded-lg overflow-hidden border">
                  <button
                    onClick={() => moveProviderUp(providerName)}
                    disabled={index === 0}
                    className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-muted)] cursor-pointer"
                    style={{
                      background: 'var(--surface-sunken)',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <ArrowUp size={12} style={{ color: 'var(--text-primary)' }} />
                  </button>
                  <button
                    onClick={() => moveProviderDown(providerName)}
                    disabled={index === priorityOrder.length - 1}
                    className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-muted)] cursor-pointer"
                    style={{ background: 'var(--surface-sunken)' }}
                  >
                    <ArrowDown size={12} style={{ color: 'var(--text-primary)' }} />
                  </button>
                </div>

                {/* Toggle Provider */}
                <button
                  onClick={() => toggleProvider(providerName)}
                  className="relative w-11 h-6 flex items-center rounded-full transition-colors duration-200 focus:outline-none ml-1 cursor-pointer"
                  style={{
                    background: isEnabled
                      ? 'var(--success, #22c55e)'
                      : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                  />
                </button>
              </div>
            </div>

            {/* Provider Inner Options */}
            <div
              className={`space-y-5 transition-all w-full ${!isEnabled && 'pointer-events-none opacity-50'}`}
            >
              {/* === RENDER ESPECIAL PARA COPILOT (Device Flow) === */}
              {providerName === 'copilot' && (
                <div className="space-y-4 pt-2">
                  {/* Auth Status Card */}
                  {copilotAuth.state === 'success' ? (
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
                      style={{
                        background: 'color-mix(in srgb, #22c55e 8%, var(--surface-sunken))',
                        border: '1px solid color-mix(in srgb, #22c55e 25%, transparent)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                          Autenticado como{' '}
                          <span className="font-mono font-semibold" style={{ color: '#22c55e' }}>
                            {copilotAuth.username}
                          </span>
                        </span>
                      </div>
                      <button
                        onClick={logoutCopilot}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all hover:opacity-80"
                        style={{
                          background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                          border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
                          color: '#ef4444',
                        }}
                      >
                        <LogOut size={12} /> Cerrar sesión
                      </button>
                    </div>
                  ) : copilotAuth.state === 'pending' ? (
                    /* Modal de código inline */
                    <div
                      className="rounded-xl p-4 space-y-3"
                      style={{
                        background: 'color-mix(in srgb, var(--accent-primary) 5%, var(--surface-sunken))',
                        border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                          Esperando autorización en GitHub...
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        1. Abrí{' '}
                        <a
                          href={copilotAuth.verificationUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline inline-flex items-center gap-0.5"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          {copilotAuth.verificationUri} <ExternalLink size={11} />
                        </a>
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>2. Ingresá este código:</p>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-2xl font-bold tracking-widest px-4 py-2 rounded-xl"
                          style={{
                            background: 'var(--surface-card)',
                            border: '2px solid var(--accent-primary)',
                            color: 'var(--accent-primary)',
                            letterSpacing: '0.25em',
                          }}
                        >
                          {copilotAuth.userCode}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(copilotAuth.userCode || '');
                            setCopilotAuth((p) => ({ ...p, copied: true }));
                            setTimeout(() => setCopilotAuth((p) => ({ ...p, copied: false })), 2000);
                          }}
                          className="p-2 rounded-lg transition-all"
                          style={{
                            background: copilotAuth.copied ? 'color-mix(in srgb, #22c55e 15%, transparent)' : 'var(--surface-card)',
                            border: '1px solid var(--border-subtle)',
                            color: copilotAuth.copied ? '#22c55e' : 'var(--text-muted)',
                          }}
                          title="Copiar código"
                        >
                          {copilotAuth.copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={() => setCopilotAuth((p) => ({ ...p, state: 'idle' }))}
                        className="text-xs underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    /* Estado idle / error: botón de login */
                    <div className="space-y-2">
                      {copilotAuth.state === 'error' && (
                        <div
                          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                          style={{
                            background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                            border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
                            color: '#ef4444',
                          }}
                        >
                          <XCircle size={13} /> {copilotAuth.error}
                        </div>
                      )}
                      <button
                        onClick={startCopilotLogin}
                        disabled={copilotAuth.state === 'loading'}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'white',
                          boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                        }}
                      >
                        {copilotAuth.state === 'loading' ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <LogIn size={16} />
                        )}
                        Login con GitHub Copilot
                      </button>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Usás el mismo mecanismo que VS Code y OpenCode. No se almacenan contraseñas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(providerName !== 'copilot' || copilotAuth.state === 'success') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full pt-2">
                  {Object.entries(config.envVars).map(([key, field]) => (
                  <div key={key} className={field.type === 'select' ? 'md:col-span-2' : ''}>
                    <label
                      className="text-xs font-medium mb-1.5 block"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {field.label} {field.required && <span className="text-red-400">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <div className="space-y-2 mt-2 w-full">
                        <div className="relative">
                          <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--text-muted)' }}
                          />
                          <input
                            value={modelSearch[providerName] || ''}
                            onChange={(e) => updateModelSearch(providerName, e.target.value)}
                            placeholder="Buscar modelo (ej: gpt-4, claude, sonnet)..."
                            className="w-full bg-transparent text-sm pl-9 pr-3 py-2 rounded-xl outline-none"
                            style={{
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)',
                              background: 'var(--surface-sunken)',
                            }}
                          />
                        </div>

                        {/* Favorites filter toggle */}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() =>
                              setShowFavoritesOnly((prev) => ({
                                ...prev,
                                [providerName]: !prev[providerName],
                              }))
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                            style={{
                              background: showFavoritesOnly[providerName]
                                ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
                                : 'var(--surface-sunken)',
                              border: `1px solid ${showFavoritesOnly[providerName] ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                              color: showFavoritesOnly[providerName]
                                ? 'var(--accent-primary)'
                                : 'var(--text-muted)',
                            }}
                          >
                            <Star
                              size={12}
                              fill={showFavoritesOnly[providerName] ? 'currentColor' : 'none'}
                            />
                            Solo Favoritos
                          </button>
                          {(favoriteModels[providerName] || []).length > 0 && (
                            <span className="text-xs text-gray-500">
                              {(favoriteModels[providerName] || []).length} favorito
                              {(favoriteModels[providerName] || []).length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-3 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                          {(() => {
                            const allModels = modelOptions[providerName] || field.options || [];
                            const favs = favoriteModels[providerName] || [];

                            // Sort: favorites first, then alphabetically
                            const sorted = [...allModels].sort((a, b) => {
                              const aFav = favs.includes(a);
                              const bFav = favs.includes(b);
                              if (aFav && !bFav) return -1;
                              if (!aFav && bFav) return 1;
                              return String(a).localeCompare(String(b));
                            });

                            const filtered = sorted.filter((opt) => {
                              const q = (modelSearch[providerName] || '').trim().toLowerCase();
                              if (q && !String(opt).toLowerCase().includes(q)) return false;
                              if (showFavoritesOnly[providerName] && !favs.includes(opt))
                                return false;
                              return true;
                            });

                            if (filtered.length === 0) {
                              return (
                                <p
                                  className="text-xs py-2 col-span-full"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {showFavoritesOnly[providerName]
                                    ? 'No tienes modelos favoritos. Haz clic en la ⭐ de un modelo.'
                                    : 'No hay modelos que coincidan con la búsqueda.'}
                                </p>
                              );
                            }

                            return filtered.map((opt) => {
                              const active = (providerData[key] || field.default || '') === opt;
                              const fav = favs.includes(opt);
                              return (
                                <div
                                  key={opt}
                                  onClick={() => updateProviderConfig(providerName, key, opt)}
                                  className="group relative border rounded-xl px-3 py-2 text-[11px] font-mono cursor-pointer transition-colors truncate"
                                  title={opt}
                                  style={{
                                    borderColor: active
                                      ? 'var(--accent-primary)'
                                      : fav
                                        ? 'var(--accent-warning, #f59e0b)'
                                        : 'var(--border-subtle)',
                                    background: active
                                      ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                                      : fav
                                        ? 'color-mix(in srgb, var(--accent-warning, #f59e0b) 5%, var(--surface-sunken))'
                                        : 'var(--surface-sunken)',
                                    color: active ? 'var(--accent-primary)' : 'var(--text-primary)',
                                  }}
                                >
                                  {/* Star toggle */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(providerName, opt);
                                    }}
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
                                    title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                  >
                                    <Star
                                      size={12}
                                      fill={fav ? '#f59e0b' : 'none'}
                                      style={{ color: fav ? '#f59e0b' : 'var(--text-muted)' }}
                                    />
                                  </button>
                                  <div className="pr-4">{opt}</div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : field.type === 'button-group' ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {field.options?.map((opt) => {
                          const active = (providerData[key] || field.default) === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => updateProviderConfig(providerName, key, opt)}
                              className="font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-all"
                              style={{
                                borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                                background: active
                                  ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                                  : 'var(--surface-sunken)',
                                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type={field.type}
                        value={providerData[key] || ''}
                        onChange={(e) => updateProviderConfig(providerName, key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    )}
                  </div>
                ))}
                </div>
              )}

              {/* Botones de acción y estado (Cargar modelos, Probar) */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 pt-4"
                style={{ borderTop: '1px dashed var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadModels(providerName)}
                    disabled={loadingModels === providerName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {loadingModels === providerName ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    Actualizar Lista
                  </button>
                  <button
                    onClick={() => testProvider(providerName)}
                    disabled={testing === providerName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {testing === providerName ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <TestTube2 size={13} />
                    )}
                    Validar Credencial
                  </button>
                </div>

                {/* Mensajes de Resultado */}
                <div className="flex flex-col items-end gap-1">
                  {testResult && (
                    <div
                      className="flex text-[11px] px-2 py-0.5 rounded font-mono border"
                      style={{
                        background: testResult.valid
                          ? 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)'
                          : 'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)',
                        borderColor: testResult.valid
                          ? 'color-mix(in srgb, var(--success, #22c55e) 30%, transparent)'
                          : 'color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)',
                        color: testResult.valid
                          ? 'var(--success, #22c55e)'
                          : 'var(--danger, #ef4444)',
                      }}
                    >
                      {testResult.valid ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={12} /> OK - Autenticado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <XCircle size={12} /> ERR - {testResult.error}
                        </span>
                      )}
                    </div>
                  )}
                  {providerModelError && (
                    <div
                      className="flex text-[11px] px-2 py-0.5 rounded font-mono border"
                      style={{
                        background: 'color-mix(in srgb, #eab308 15%, transparent)',
                        borderColor: 'color-mix(in srgb, #eab308 30%, transparent)',
                        color: '#eab308',
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <XCircle size={12} /> {providerModelError}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* Botón Guardar */}
      <div className="flex justify-end pt-2">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 font-mono text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 rounded"
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
          }}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Guardar Todos los Cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}
