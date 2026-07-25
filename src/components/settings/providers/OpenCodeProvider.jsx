'use client';

import { ProviderCardShell } from '@/components/settings/shared/ProviderCardShell';
import { ModelPicker } from '@/components/settings/shared/ModelPicker';
import { Terminal } from 'lucide-react';

export function OpenCodeProvider({
  providerData,
  onToggle,
  onUpdate,
  onRefreshModels,
  modelOptions,
  loadingModels,
}) {
  const isEnabled = providerData?.enabled ?? true;
  const models = modelOptions || [
    'opencode/gemini-3-flash',
    'opencode/claude-sonnet-4',
    'opencode/gpt-4o',
  ];

  return (
    <ProviderCardShell
      name="OpenCode Platform"
      description="Usa el entorno local de OpenCode. Soporta modelos nativos, Gemini CLI, y proveedores configurados en tu sistema."
      icon={Terminal}
      priority={2}
      isEnabled={isEnabled}
      onToggle={onToggle}
    >
      <ModelPicker
        value={providerData?.OPENCODE_MODEL || 'opencode/gemini-3-flash'}
        options={models}
        loading={loadingModels}
        onRefresh={onRefreshModels}
        onChange={(val) => onUpdate('OPENCODE_MODEL', val)}
      />
    </ProviderCardShell>
  );
}
