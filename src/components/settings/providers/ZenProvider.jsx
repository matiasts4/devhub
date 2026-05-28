'use client';

import { Zap } from 'lucide-react';
import { ProviderCardShell } from '@/components/settings/shared/ProviderCardShell';
import { ModelPicker } from '@/components/settings/shared/ModelPicker';

const ZEN_MODELS = ['zen-default', 'zen-large', 'zen-turbo', 'zen-coder'];

export function ZenProvider({
  providerData,
  onToggle,
  onUpdate,
  onRefreshModels,
  modelOptions,
  loadingModels,
}) {
  const isEnabled = providerData?.enabled ?? true;
  const models = modelOptions || ZEN_MODELS;

  return (
    <ProviderCardShell
      name="OpenCode Zen"
      description="Modelos gratuitos y trials de OpenCode."
      icon={Zap}
      priority={3}
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
            value={providerData?.ZEN_API_KEY || ''}
            onChange={(e) => onUpdate('ZEN_API_KEY', e.target.value)}
            placeholder="zen-..."
            className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>
      <ModelPicker
        value={providerData?.ZEN_MODEL || ZEN_MODELS[0]}
        options={models}
        loading={loadingModels}
        onRefresh={onRefreshModels}
        onChange={(val) => onUpdate('ZEN_MODEL', val)}
      />
    </ProviderCardShell>
  );
}
