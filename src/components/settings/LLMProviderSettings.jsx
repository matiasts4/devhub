'use client';

import ProviderCard from './ProviderCard';
import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Loader2,
  Save,
  Shield,
  Globe,
  Plug,
  Cpu,
  Terminal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { sileo } from 'sileo';
import { panelStyle, pillStyle, btnPrimaryStyle } from '@/chrome/morphology';

// Reconcile a persisted priorityOrder against the current provider registry.
// Drops any name no longer present in `availableKeys` and backfills any key
// (known or unknown) that is missing so the UI always reflects the backend
// registry without crashing on stale entries.
//
// `availableKeys` is derived from the backend response (Object.keys(data.providers)).
// When omitted, the helper falls back to the keys defined in PROVIDER_META so
// existing callers and offline render paths keep working.
//
// Exported for unit testing.
export function reconcilePriorityOrder(order, availableKeys) {
  const keys = availableKeys?.length ? availableKeys : Object.keys(PROVIDER_META);
  const set = new Set(keys);
  const valid = (order || []).filter((name) => set.has(name));
  for (const k of keys) {
    if (!valid.includes(k)) valid.push(k);
  }
  return valid;
}

// Lightweight frontend metadata map for known providers. The backend owns the
// provider registry; this map only supplies UI concerns (name, icon, schema).
const PROVIDER_META = {
  copilot: {
    name: 'GitHub Copilot',
    description:
      'Proveedor oficial de GitHub Copilot con acceso a la flota real (gpt-4o, gpt-4.1, gpt-5.2, Raptor) y soporte de reasoning_effort.',
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
  opencode: {
    name: 'OpenCode Platform',
    description:
      'Usa el entorno local de OpenCode. Soporta modelos nativos, Gemini CLI, y proveedores configurados en tu sistema.',
    envVars: {
      OPENCODE_MODEL: {
        label: 'Modelo',
        type: 'select',
        options: [],
        default: 'opencode/gemini-3-flash',
      },
    },
    icon: Terminal,
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
    icon: Globe,
  },
  minimax: {
    name: 'MiniMax',
    description: 'Modelos MiniMax a través de su endpoint Anthropic-compatible.',
    envVars: {
      MINIMAX_API_KEY: {
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-...',
        required: true,
      },
      MINIMAX_MODEL: {
        label: 'Modelo',
        type: 'select',
        options: [],
        default: 'minimax-coding-plan/MiniMax-M2.7',
      },
      ANTHROPIC_BASE_URL: {
        label: 'Base URL',
        type: 'url',
        placeholder: 'https://api.minimax.io/anthropic',
        required: false,
      },
    },
    icon: Cpu,
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

  const [priorityOrder, setPriorityOrder] = useState(() =>
    reconcilePriorityOrder(['copilot', 'opencode', 'openrouter', 'zen', 'direct'])
  );
  const [globalTemperature, setGlobalTemperature] = useState(0.7);
  const [globalMaxTokens, setGlobalMaxTokens] = useState(4000);
  const [bridgeEnabled, setBridgeEnabled] = useState(true);
  const [saveMessage, setSaveMessage] = useState(null);
  const [favoriteModels, setFavoriteModels] = useState({});
  const [showFavoritesOnly, setShowFavoritesOnly] = useState({});

  function getModelFieldKey(providerName) {
    if (providerName === 'copilot') return 'COPILOT_MODEL';
    if (providerName === 'opencode') return 'OPENCODE_MODEL';
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
      const providerKeys = Object.keys(data.providers || {});
      setProviders(data.providers || {});
      setPriorityOrder(
        reconcilePriorityOrder(
          data.priorityOrder || ['copilot', 'openrouter', 'zen', 'direct'],
          providerKeys
        )
      );
      setGlobalTemperature(data.globalTemperature ?? 0.7);
      setGlobalMaxTokens(data.globalMaxTokens ?? 4000);
      setBridgeEnabled(data.bridgeEnabled !== false);
      setModelOptions(data.modelOptions || {});
      setFavoriteModels(data.favoriteModels || {});
      // Detectar si hay un OAuth token guardado
      const copilotData = data.providers?.copilot || {};
      if (copilotData.COPILOT_OAUTH_TOKEN) {
        setCopilotAuth((prev) => ({
          ...prev,
          state: 'success',
          username: copilotData._username || 'GitHub',
        }));
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
    setCopilotAuth({
      state: 'loading',
      userCode: null,
      verificationUri: null,
      deviceCode: null,
      interval: 5,
      username: null,
      error: null,
      copied: false,
    });
    try {
      const res = await fetch('/api/settings/llm-providers/copilot/device-flow', {
        method: 'POST',
      });
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
          setCopilotAuth((prev) => ({
            ...prev,
            state: 'error',
            error: 'El código venció. Intentalo de nuevo.',
          }));
        } else {
          setCopilotAuth((prev) => ({
            ...prev,
            state: 'error',
            error: data.error || 'Error desconocido',
          }));
        }
      } catch (err) {
        setCopilotAuth((prev) => ({ ...prev, state: 'error', error: err.message }));
      }
    };
    copilotPollRef.current = setTimeout(doPoll, interval * 1000);
  }

  function logoutCopilot() {
    if (copilotPollRef.current) clearTimeout(copilotPollRef.current);
    setCopilotAuth({
      state: 'idle',
      userCode: null,
      verificationUri: null,
      deviceCode: null,
      interval: 5,
      username: null,
      error: null,
      copied: false,
    });
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
          priorityOrder: reconcilePriorityOrder(overrides.priorityOrder || priorityOrder),
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

      sileo.success({ title: `Lista actualizada: ${models.length} modelos encontrados.` });

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
    <div className={`space-y-6 ${embedded ? '' : 'animate-in fade-in duration-150'}`}>
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
          className="px-4 py-3 text-sm flex items-center gap-2"
          style={pillStyle({ tone: saveMessage.type === 'success' ? 'success' : 'danger' })}
        >
          {saveMessage.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {saveMessage.text}
        </div>
      )}

      {/* Master toggle */}
      <section className="p-6" style={panelStyle({ tone: bridgeEnabled ? 'accent' : 'neutral' })}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center cursor-pointer"
            onClick={() => setBridgeEnabled(!bridgeEnabled)}
            style={pillStyle({ tone: bridgeEnabled ? 'accent' : 'neutral' })}
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
              role="switch"
              aria-checked={bridgeEnabled}
              className="relative w-11 h-6 flex items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer"
              style={{
                background: bridgeEnabled ? 'var(--accent-primary)' : 'var(--surface-muted)',
              }}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${bridgeEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Provider cards */}
      {priorityOrder.map((providerName, index) => (
        <ProviderCard
          key={providerName}
          providerKey={providerName}
          meta={PROVIDER_META[providerName]}
          providerData={providers[providerName] || {}}
          index={index}
          isFirst={index === 0}
          isLast={index === priorityOrder.length - 1}
          onToggle={() => toggleProvider(providerName)}
          onMoveUp={() => moveProviderUp(providerName)}
          onMoveDown={() => moveProviderDown(providerName)}
          onUpdateConfig={(key, value) => updateProviderConfig(providerName, key, value)}
          onLoadModels={() => loadModels(providerName)}
          onTest={() => testProvider(providerName)}
          modelOptions={modelOptions[providerName] || []}
          modelError={modelErrors[providerName]}
          testResult={testResults[providerName]}
          loadingModels={loadingModels === providerName}
          testing={testing === providerName}
          modelSearch={modelSearch[providerName] || ''}
          onModelSearchChange={(value) => updateModelSearch(providerName, value)}
          favoriteModels={favoriteModels[providerName] || []}
          onToggleFavorite={(model) => toggleFavorite(providerName, model)}
          showFavoritesOnly={showFavoritesOnly[providerName]}
          onToggleFavoritesOnly={() =>
            setShowFavoritesOnly((prev) => ({
              ...prev,
              [providerName]: !prev[providerName],
            }))
          }
          copilotAuth={copilotAuth}
          onStartCopilotLogin={startCopilotLogin}
          onLogoutCopilot={logoutCopilot}
          onCopyUserCode={() => {
            navigator.clipboard.writeText(copilotAuth.userCode || '');
            setCopilotAuth((p) => ({ ...p, copied: true }));
            setTimeout(() => setCopilotAuth((p) => ({ ...p, copied: false })), 2000);
          }}
          onCancelCopilot={() => setCopilotAuth((p) => ({ ...p, state: 'idle' }))}
        />
      ))}

      {/* Botón Guardar */}
      <div className="flex justify-end pt-2">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="font-mono transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
          style={btnPrimaryStyle({ size: 'md' })}
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
