import React, { useState, useMemo, useCallback } from 'react';
import { X, Search, Plus, MessageSquare, Send, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SessionListModal({
  isOpen,
  onClose,
  sessions = [],
  onSelect,
  projectId,
  onCreateNew,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) => (s.title || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const handleSelect = useCallback(
    (session) => {
      if (onSelect) onSelect(session);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleCreateNew = useCallback(() => {
    if (onCreateNew) onCreateNew();
    onClose();
  }, [onCreateNew, onClose]);

  // Close on Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border-strong)',
          borderWidth: 1,
        }}
        className="w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderBottomWidth: 1, borderColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Historial de Sesiones
            </h3>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-hover)' }}
            >
              {sessions.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                color: 'var(--accent-primary)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  'color-mix(in srgb, var(--accent-primary) 20%, transparent)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  'color-mix(in srgb, var(--accent-primary) 10%, transparent)')
              }
            >
              <Plus className="w-3.5 h-3.5" /> Nueva
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.background = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div
          className="px-4 py-3"
          style={{ borderBottomWidth: 1, borderColor: 'var(--surface-hover)' }}
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar sesiones..."
              className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-lg transition-colors focus:outline-none"
              style={{
                background: 'var(--surface-elevated)',
                borderColor: 'var(--border-strong)',
                borderWidth: 1,
                color: 'var(--text-secondary)',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--accent-primary) 50%, transparent)')
              }
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12"
              style={{ color: 'var(--text-muted)' }}
            >
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs font-mono">
                {search ? 'No se encontraron sesiones' : 'No hay sesiones previas'}
              </p>
            </div>
          ) : (
            <div style={{ borderTopWidth: 1, borderColor: 'var(--surface-hover)' }}>
              {filtered.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelect(session)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group"
                  style={{ borderTopWidth: 1, borderTopColor: 'var(--surface-hover)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        'color-mix(in srgb, var(--accent-primary) 20%, transparent)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        'color-mix(in srgb, var(--accent-primary) 10%, transparent)')
                    }
                  >
                    <MessageSquare
                      className="w-3.5 h-3.5"
                      style={{ color: 'var(--accent-primary)' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {session.title || 'Sin título'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Calendar
                        className="w-3 h-3"
                        style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                      />
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatDistanceToNow(new Date(session.updated_at || session.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                      {session.telegram_chat_id && (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                          <Send className="w-2.5 h-2.5" /> Telegram
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                  >
                    Abrir →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
