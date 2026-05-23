'use client';

import { RefreshCw, Search, Star } from 'lucide-react';
import { useState } from 'react';

export function ModelPicker({ value, options = [], loading = false, onRefresh, onChange }) {
  const [search, setSearch] = useState('');

  const filtered = options.filter((opt) =>
    String(opt).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2 mt-2 w-full">
      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar modelo (ej: gpt-4, claude, sonnet)..."
          className="w-full bg-transparent text-sm pl-9 pr-3 py-2 rounded-xl outline-none"
          style={{
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            background: 'var(--surface-sunken)',
          }}
        />
      </div>

      {/* Model grid */}
      {filtered.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
          {options.length === 0
            ? 'Sin modelos disponibles'
            : 'No hay modelos que coincidan con la busqueda.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-3 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
          {filtered.map((opt) => {
            const active = value === opt;
            return (
              <div
                key={opt}
                data-testid="model-option"
                data-active={active}
                onClick={() => onChange(opt)}
                className="group relative border rounded-xl px-3 py-2 text-[11px] font-mono cursor-pointer transition-colors truncate"
                title={opt}
                style={{
                  borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  background: active
                    ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                    : 'var(--surface-sunken)',
                  color: active ? 'var(--accent-primary)' : 'var(--text-primary)',
                }}
              >
                <div className="pr-4">{opt}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Refresh button */}
      {onRefresh && (
        <button
          data-testid="model-refresh"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
          style={{
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
        >
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {loading ? 'Actualizando...' : 'Actualizar Lista'}
        </button>
      )}
    </div>
  );
}
