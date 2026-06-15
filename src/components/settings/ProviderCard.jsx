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
import {
  panelStyle,
  pillStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  btnDangerStyle,
  inputStyle,
} from '@/chrome/morphology';
import { deriveSchemaForUnknown } from '@/lib/llmProviderConfig.shared';

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
      className="p-6 transition-opacity"
      style={{ ...panelStyle(), opacity: isEnabled ? 1 : 0.6 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        <div
          className="w-9 h-9 flex shrink-0 items-center justify-center cursor-pointer"
          onClick={onToggle}
          title={isEnabled ? 'Haz click para desactivar' : 'Haz click para activar'}
          style={pillStyle({ tone: isEnabled ? 'accent' : 'neutral' })}
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
            className="text-xs font-mono px-2 py-0.5 flex items-center gap-1.5"
            style={pillStyle()}
          >
            <Zap size={11} style={{ color: 'var(--accent-primary)' }} />
            PRIORIDAD: {index + 1}
          </span>

          <div className="flex gap-1">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              style={pillStyle({ tone: 'neutral' })}
            >
              <ArrowUp size={12} style={{ color: 'var(--text-primary)' }} />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 px-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              style={pillStyle({ tone: 'neutral' })}
            >
              <ArrowDown size={12} style={{ color: 'var(--text-primary)' }} />
            </button>
          </div>

          <button
            onClick={onToggle}
            role="switch"
            aria-checked={isEnabled}
            className="relative w-11 h-6 flex items-center rounded-full transition-colors duration-200 focus:outline-none ml-1 cursor-pointer"
            style={{ background: isEnabled ? 'var(--accent-primary)' : 'var(--surface-muted)' }}
          >
            <span
              className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
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
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={panelStyle({ tone: 'success' })}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Autenticado como{' '}
                    <span className="font-mono font-semibold" style={{ color: 'var(--success)' }}>
                      {copilotAuth.username}
                    </span>
                  </span>
                </div>
                <button
                  onClick={onLogoutCopilot}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all"
                  style={btnDangerStyle({ size: 'xs' })}
                >
                  <LogOut size={12} /> Cerrar sesión
                </button>
              </div>
            ) : copilotAuth?.state === 'pending' ? (
              <div className="p-4 space-y-3" style={panelStyle({ tone: 'accent' })}>
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
                    className="font-mono text-2xl font-bold tracking-widest px-4 py-2"
                    style={panelStyle({ tone: 'accent' })}
                  >
                    {copilotAuth?.userCode}
                  </span>
                  <button
                    onClick={onCopyUserCode}
                    className="p-2 transition-all"
                    style={pillStyle({ tone: copilotAuth?.copied ? 'success' : 'neutral' })}
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
                    className="flex items-center gap-2 text-xs px-3 py-2"
                    style={panelStyle({ tone: 'danger' })}
                  >
                    <XCircle size={13} /> {copilotAuth?.error}
                  </div>
                )}
                <button
                  onClick={onStartCopilotLogin}
                  disabled={copilotAuth?.state === 'loading'}
                  className="flex items-center gap-2 text-sm font-semibold transition-all disabled:opacity-50"
                  style={btnPrimaryStyle({ size: 'md' })}
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
                        className="w-full text-sm pl-9 pr-3 py-2 outline-none"
                        style={inputStyle()}
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={onToggleFavoritesOnly}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-all"
                        style={pillStyle({ tone: showFavoritesOnly ? 'accent' : 'neutral' })}
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
                          const tone = active ? 'accent' : fav ? 'warning' : 'neutral';
                          return (
                            <div
                              key={`${opt}::${index}`}
                              onClick={() => onUpdateConfig?.(key, opt)}
                              className="group relative px-3 py-2 text-[11px] font-mono cursor-pointer transition-colors truncate"
                              title={opt}
                              style={pillStyle({ tone })}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite?.(opt);
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10"
                                title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                              >
                                <Star
                                  size={12}
                                  fill={fav ? 'var(--accent-warning, #f59e0b)' : 'none'}
                                  style={{
                                    color: fav
                                      ? 'var(--accent-warning, #f59e0b)'
                                      : 'var(--text-muted)',
                                  }}
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
                          className="font-mono text-[11px] px-3 py-1.5 transition-all"
                          style={pillStyle({ tone: active ? 'accent' : 'neutral' })}
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
                    className="w-full text-sm px-3 py-2 transition-all outline-none"
                    style={inputStyle()}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              style={btnSecondaryStyle({ size: 'xs' })}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              style={btnSecondaryStyle({ size: 'xs' })}
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
              Validar Credencial
            </button>
          </div>

          <div className="flex flex-col items-end gap-1">
            {testResult && (
              <div
                className="flex text-[11px] px-2 py-0.5 font-mono"
                style={pillStyle({ tone: testResult.valid ? 'success' : 'danger' })}
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
                className="flex text-[11px] px-2 py-0.5 font-mono"
                style={pillStyle({ tone: 'warning' })}
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
