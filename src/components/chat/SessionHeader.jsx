import {
  Brain,
  Server,
  Archive,
  MessageSquare,
  History,
  ChevronDown,
  Plus,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import TokenUsageBadge from '@/components/chat/TokenUsageBadge';

export default function SessionHeader({
  currentSession,
  sessions,
  currentSessionId,
  mergedUsage,
  showMCPPanel,
  isCompressing,
  messagesCount,
  onToggleMCP,
  onCompress,
  onShowSessionList,
  onLoadSession,
  onDeleteSession,
  onCreateSession,
}) {
  return (
    <div
      className="flex-shrink-0 h-[50px] px-5 border-b flex items-center justify-between"
      style={{ background: 'var(--surface-app)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{
            background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          }}
        >
          <Brain className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div>
          <h1
            className="text-sm font-bold font-mono uppercase tracking-wide"
            style={{ color: 'var(--text-primary)' }}
          >
            Agent Hub
          </h1>
          <p
            className="text-xs font-sans tracking-wider uppercase"
            style={{ color: 'var(--text-muted)' }}
          >
            Orquestador SDD
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TokenUsageBadge usage={mergedUsage} compact />

        <button
          onClick={onToggleMCP}
          className="p-2 rounded-lg border transition-colors"
          style={
            showMCPPanel
              ? {
                  background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                  color: 'var(--accent-primary)',
                }
              : {
                  background: 'var(--surface-card)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-muted)',
                }
          }
          title="MCP Servers"
        >
          <Server className="w-3.5 h-3.5" />
        </button>

        <Button
          onClick={onCompress}
          disabled={!currentSessionId || isCompressing || messagesCount <= 3}
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs border disabled:opacity-30"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
          title="Comprimir Contexto Atómico (Libera tokens resumiendo la historia antigua)"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {isCompressing ? (
            <Loader2
              className="w-3.5 h-3.5 animate-spin"
              style={{ color: 'var(--accent-primary)' }}
            />
          ) : (
            <Archive className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
          )}
          <span className="hidden sm:inline">Comprimir</span>
        </Button>

        <button
          onClick={onShowSessionList}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs transition-colors"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-card)')}
          title="Historial de Sesiones"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sesiones</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 border"
              style={{
                background: 'var(--surface-card)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <History className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate text-xs">
                {currentSession ? currentSession.title : 'Sesiones'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[300px]"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <DropdownMenuLabel
              className="text-xs uppercase tracking-wider font-semibold mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Historial de Charlas
            </DropdownMenuLabel>
            <DropdownMenuSeparator style={{ background: 'var(--border-strong)' }} />
            <div className="max-h-[300px] overflow-y-auto">
              {sessions.length === 0 ? (
                <div
                  className="px-2 py-4 text-center text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
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
                      <span className="text-sm font-medium truncate">{s.title}</span>
                      <span className="text-xs opacity-60">
                        {new Date(s.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => onDeleteSession(e, s.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          'color-mix(in srgb, var(--accent-primary) 12%, transparent)';
                        e.currentTarget.style.color = 'var(--accent-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
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
              <Plus className="w-4 h-4" /> Nueva Conversación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={onCreateSession}
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-transparent shadow-sm"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">Nueva Conversación</span>
        </Button>
      </div>
    </div>
  );
}
