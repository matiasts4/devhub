'use client';

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
  Star,
  LogIn,
  LogOut,
  Copy,
  ExternalLink,
} from 'lucide-react';

function deriveSchemaForUnknown(key) {
  if (!key) return { label: String(key), type: 'text' };
  if (key.endsWith('_API_KEY')) return { label: key, type: 'password' };
  if (key.endsWith('_BASE_URL')) return { label: key, type: 'url' };
  if (key.endsWith('_MODEL')) return { label: key, type: 'select', options: [] };
  return { label: key, type: 'text' };
}

function buildEnvVarSchema(meta, providerData) {
  if (meta?.envVars) return meta.envVars;
  const entries = Object.entries(providerData || {}).filter(([key]) => key !== 'enabled');
  return Object.fromEntries(entries.map(([key]) => [key, deriveSchemaForUnknown(key)]));
}

export default function ProviderCard({
  providerKey,
  meta,
  providerData,
  index,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onUpdateConfig,
  onLoadModels,
  onTest,
  modelOptions = [],
  modelError,
  testResult,
  loadingModels,
  testing,
  modelSearch = '',
  onModelSearchChange,
  favoriteModels = [],
  onToggleFavorite,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  copilotAuth,
  onStartCopilotLogin,
  onLogoutCopilot,
  onCopyUserCode,
  onCancelCopilot,
}) {
  const isEnabled = providerData?.enabled ?? true;
  const Icon = meta?.icon || Zap;
  const name = meta?.name || providerKey;
  const description = meta?.description || `Configuración para el proveedor ${providerKey}.`;
  const envVars = buildEnvVarSchema(meta, providerData);

  return (
    <section
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
          onClick={onToggle}
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
          <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {name}
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-2 sm:mt-0">
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

          <div className="flex gap-1 bg-surface-sunken rounded-lg overflow-hidden border">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-muted)] cursor-pointer"
              style={{
                background: 'var(--surface-sunken)',
                borderRight: '1px solid var(--border-subtle)',
              }}
            >
              <ArrowUp size={12} style={{ color: 'var(--text-primary)' }} />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-muted)] cursor-pointer"
              style={{ background: 'var(--surface-sunken)' }}
            >
              <ArrowDown size={12} style={{ color: 'var(--text-primary)' }} />
            </button>
          </div>

          <button
            onClick={onToggle}
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

      <div
        className={`space-y-5 transition-all w-full ${!isEnabled && 'pointer-events-none opacity-50'}`}
      >
        {providerKey === 'copilot' && (
          <div className="space-y-4 pt-2">
            {copilotAuth?.state === 'success' ? (
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
                  onClick={onLogoutCopilot}
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
            ) : copilotAuth?.state === 'pending' ? (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{
                  background: 'color-mix(in srgb, var(--accent-primary) 5%, var(--surface-sunken))',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Loader2
                    size={14}
                    className="animate-spin"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Esperando autorización en GitHub...
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  1. Abrí{' '}
                  <a
                    href={copilotAuth?.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-0.5"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {copilotAuth?.verificationUri} <ExternalLink size={11} />
                  </a>
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  2. Ingresá este código:
                </p>
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
                    {copilotAuth?.userCode}
                  </span>
                  <button
                    onClick={onCopyUserCode}
                    className="p-2 rounded-lg transition-all"
                    style={{
                      background: copilotAuth?.copied
                        ? 'color-mix(in srgb, #22c55e 15%, transparent)'
                        : 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      color: copilotAuth?.copied ? '#22c55e' : 'var(--text-muted)',
                    }}
                    title="Copiar código"
                  >
                    {copilotAuth?.copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <button
                  onClick={onCancelCopilot}
                  className="text-xs underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {copilotAuth?.state === 'error' && (
                  <div
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                    style={{
                      background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                      border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
                      color: '#ef4444',
                    }}
                  >
                    <XCircle size={13} /> {copilotAuth?.error}
                  </div>
                )}
                <button
                  onClick={onStartCopilotLogin}
                  disabled={copilotAuth?.state === 'loading'}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'white',
                    boxShadow:
                      '0 2px 8px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                  }}
                >
                  {copilotAuth?.state === 'loading' ? (
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

        {(providerKey !== 'copilot' || copilotAuth?.state === 'success') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full pt-2">
            {Object.entries(envVars).map(([key, field]) => (
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
                        value={modelSearch}
                        onChange={(e) => onModelSearchChange?.(e.target.value)}
                        placeholder="Buscar modelo (ej: gpt-4, claude, sonnet)..."
                        className="w-full bg-transparent text-sm pl-9 pr-3 py-2 rounded-xl outline-none"
                        style={{
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          background: 'var(--surface-sunken)',
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={onToggleFavoritesOnly}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: showFavoritesOnly
                            ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
                            : 'var(--surface-sunken)',
                          border: `1px solid ${showFavoritesOnly ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          color: showFavoritesOnly ? 'var(--accent-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <Star size={12} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                        Solo Favoritos
                      </button>
                      {favoriteModels.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {favoriteModels.length} favorito
                          {favoriteModels.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-3 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                      {(() => {
                        const allModels =
                          modelOptions.length > 0 ? modelOptions : field.options || [];
                        const favs = favoriteModels;

                        const sorted = [...allModels].sort((a, b) => {
                          const aFav = favs.includes(a);
                          const bFav = favs.includes(b);
                          if (aFav && !bFav) return -1;
                          if (!aFav && bFav) return 1;
                          return String(a).localeCompare(String(b));
                        });

                        const filtered = sorted.filter((opt) => {
                          const q = (modelSearch || '').trim().toLowerCase();
                          if (q && !String(opt).toLowerCase().includes(q)) return false;
                          if (showFavoritesOnly && !favs.includes(opt)) return false;
                          return true;
                        });

                        if (filtered.length === 0) {
                          return (
                            <p
                              className="text-xs py-2 col-span-full"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {showFavoritesOnly
                                ? 'No tienes modelos favoritos. Haz clic en la ⭐ de un modelo.'
                                : 'No hay modelos que coincidan con la búsqueda.'}
                            </p>
                          );
                        }

                        return filtered.map((opt, index) => {
                          const active = (providerData?.[key] || field.default || '') === opt;
                          const fav = favs.includes(opt);
                          return (
                            <div
                              key={`${opt}::${index}`}
                              onClick={() => onUpdateConfig?.(key, opt)}
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
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite?.(opt);
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
                      const active = (providerData?.[key] || field.default) === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => onUpdateConfig?.(key, opt)}
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
                    value={providerData?.[key] || ''}
                    onChange={(e) => onUpdateConfig?.(key, e.target.value)}
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

        <div
          className="flex flex-wrap items-center justify-between gap-3 pt-4"
          style={{ borderTop: '1px dashed var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={onLoadModels}
              disabled={loadingModels}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-secondary)',
              }}
            >
              {loadingModels ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Actualizar Lista
            </button>
            <button
              onClick={onTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-secondary)',
              }}
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
              Validar Credencial
            </button>
          </div>

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
                  color: testResult.valid ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
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
            {modelError && (
              <div
                className="flex text-[11px] px-2 py-0.5 rounded font-mono border"
                style={{
                  background: 'color-mix(in srgb, #eab308 15%, transparent)',
                  borderColor: 'color-mix(in srgb, #eab308 30%, transparent)',
                  color: '#eab308',
                }}
              >
                <span className="flex items-center gap-1">
                  <XCircle size={12} /> {modelError}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
