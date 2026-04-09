import { Brain, Server, History, ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import TokenUsageBadge from '@/components/chat/TokenUsageBadge';

export default function SessionHeader({
  currentSession,
  sessions,
  currentSessionId,
  mergedUsage,
  showMCPPanel,
  onToggleMCP,
  onLoadSession,
  onDeleteSession,
  onCreateSession,
}) {
  return (
    <div
      className="flex-shrink-0 h-[52px] px-3 border-b flex items-center justify-between gap-2"
      style={{ background: 'var(--surface-app)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Identity + current session name */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
          }}
        >
          <Brain className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-wider leading-none mb-0.5"
            style={{ color: 'var(--text-primary)' }}
          >
            Agent Hub
          </p>
          <p
            className="text-[10px] truncate leading-none"
            style={{ color: 'var(--text-muted)', maxWidth: '150px' }}
          >
            {currentSession?.title || 'Nueva sesión'}
          </p>
        </div>
      </div>

      {/* Actions — compact, icon-first */}
      <div className="flex items-center gap-1 shrink-0">
        <TokenUsageBadge usage={mergedUsage} compact />

        {/* MCP Servers toggle */}
        <button
          onClick={onToggleMCP}
          className="w-7 h-7 rounded-md flex items-center justify-center border transition-colors"
          style={
            showMCPPanel
              ? {
                  background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                  color: 'var(--accent-primary)',
                }
              : {
                  background: 'transparent',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }
          }
          title="MCP Servers"
          aria-pressed={showMCPPanel}
        >
          <Server className="w-3.5 h-3.5" />
        </button>

        {/* Sessions history dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium transition-colors"
              style={{
                background: 'transparent',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
              title="Historial de sesiones"
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            >
              <History className="w-3 h-3" />
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[280px]"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <DropdownMenuLabel
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Sesiones recientes
            </DropdownMenuLabel>
            <DropdownMenuSeparator style={{ background: 'var(--border-strong)' }} />
            <div className="max-h-[260px] overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  No hay sesiones previas
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => onLoadSession(s.id)}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md transition-colors group"
                    style={{
                      background:
                        currentSessionId === s.id
                          ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)'
                          : 'transparent',
                      color: currentSessionId === s.id ? 'var(--accent-primary)' : 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (currentSessionId !== s.id)
                        e.currentTarget.style.background = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (currentSessionId !== s.id)
                        e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{s.title}</span>
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                      >
                        {new Date(s.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => onDeleteSession(e, s.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, #f87171 12%, transparent)';
                        e.currentTarget.style.color = '#f87171';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                      title="Eliminar sesión"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <DropdownMenuSeparator style={{ background: 'var(--border-strong)' }} />
            <DropdownMenuItem
              onClick={onCreateSession}
              className="cursor-pointer font-medium justify-center gap-2"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Nueva Conversación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New session — primary CTA */}
        <button
          onClick={onCreateSession}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-all hover:opacity-85"
          style={{
            background: 'var(--accent-primary)',
            color: '#fff',
          }}
          title="Nueva Conversación"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
