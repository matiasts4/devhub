'use client';

import { Plug } from 'lucide-react';
import { ProviderCardShell } from '@/components/settings/shared/ProviderCardShell';

export function DirectProvider({ providerData, onToggle, onUpdate }) {
  const isEnabled = providerData?.enabled ?? true;

  return (
    <ProviderCardShell
      name="API Directa"
      description="Cualquier proveedor compatible con OpenAI (Ollama, vLLM, etc)."
      icon={Plug}
      priority={4}
      isEnabled={isEnabled}
      onToggle={onToggle}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full pt-2">
        <div>
          <label
            className="text-xs font-medium mb-1.5 block"
            style={{ color: 'var(--text-secondary)' }}
          >
            API Key
          </label>
          <input
            type="password"
            value={providerData?.LLM_API_KEY || ''}
            onChange={(e) => onUpdate('LLM_API_KEY', e.target.value)}
            placeholder="sk-..."
            className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1.5 block"
            style={{ color: 'var(--text-secondary)' }}
          >
            Base URL <span className="text-red-400">*</span>
          </label>
          <input
            type="url"
            value={providerData?.LLM_BASE_URL || ''}
            onChange={(e) => onUpdate('LLM_BASE_URL', e.target.value)}
            placeholder="http://localhost:11434/v1"
            className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1.5 block"
            style={{ color: 'var(--text-secondary)' }}
          >
            Modelo
          </label>
          <input
            value={providerData?.LLM_MODEL || 'gpt-4o-mini'}
            onChange={(e) => onUpdate('LLM_MODEL', e.target.value)}
            placeholder="llama3.2"
            className="w-full bg-transparent text-sm px-3 py-2 rounded-xl transition-all outline-none"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>
    </ProviderCardShell>
  );
}
