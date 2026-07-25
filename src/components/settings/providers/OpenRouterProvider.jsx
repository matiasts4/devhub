'use client';

import { ProviderCardShell } from '@/components/settings/shared/ProviderCardShell';
import { ModelPicker } from '@/components/settings/shared/ModelPicker';
import { Globe } from 'lucide-react';

const DEFAULT_MODELS = [
  'qwen/qwen-2.5-72b-instruct',
  'qwen/qwen-2.5-coder-32b-instruct',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'google/gemma-2-27b-it',
  'mistralai/mistral-7b-instruct',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o-mini',
];

export function OpenRouterProvider({
  providerData,
  onToggle,
  onUpdate,
  onRefreshModels,
  modelOptions,
  loadingModels,
}) {
  const isEnabled = providerData?.enabled ?? true;
  const models = modelOptions || DEFAULT_MODELS;

  return (
    <ProviderCardShell
      name="OpenRouter"
      description="Acceso a modelos gratuitos como Qwen, Llama, Gemma y mas."
      icon={Globe}
      priority={2}
      isEnabled={isEnabled}
      onToggle={onToggle}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full pt-2">
        <div>
          <label
            className="text-xs font-medium mb-1.5 block"
            style={{ color: 'var(--text-secondary)' }}
          >
            API Key <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={providerData?.OPENROUTER_API_KEY || ''}
            onChange={(e) => onUpdate('OPENROUTER_API_KEY', e.target.value)}
            placeholder="sk-or-..."
            className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>
      <ModelPicker
        value={providerData?.OPENROUTER_MODEL || DEFAULT_MODELS[0]}
        options={models}
        loading={loadingModels}
        onRefresh={onRefreshModels}
        onChange={(val) => onUpdate('OPENROUTER_MODEL', val)}
      />
    </ProviderCardShell>
  );
}
