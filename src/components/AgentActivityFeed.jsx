import { Terminal, Activity, PlayCircle, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState, useEffect, useRef, useCallback } from 'react';

const eventTypeConfig = {
  session_start: { icon: PlayCircle, color: 'text-[var(--accent-cyan)]', bg: 'bg-[var(--accent-cyan)]/10' },
  tool_execute: { icon: Activity, color: 'text-[var(--accent-purple)]', bg: 'bg-[var(--accent-purple)]/10' },
  tool_complete: { icon: CheckCircle, color: 'text-[var(--accent-green)]', bg: 'bg-[var(--accent-green)]/10' },
  session_error: { icon: XCircle, color: 'text-[var(--accent-pink)]', bg: 'bg-[var(--accent-pink)]/10' },
  session_done: { icon: CheckCircle, color: 'text-[var(--accent-green)]', bg: 'bg-[var(--accent-green)]/10' },
};

export default function AgentActivityFeed({
  events = [],
  useSSE = false,
  sseUrl = '/api/agenthub/events',
}) {
  const [liveEvents, setLiveEvents] = useState(events);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const isMountedRef = useRef(true);

  // Keep ref in sync
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update local state when external events change
  useEffect(() => {
    setLiveEvents(events);
  }, [events]);

  // SSE connection
  const connectSSE = useCallback(() => {
    if (!useSSE || !sseUrl) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (isMountedRef.current) setConnected(true);
      };

      es.onmessage = (e) => {
        if (!isMountedRef.current) return;
        try {
          const event = JSON.parse(e.data);
          setLiveEvents((prev) => [event, ...prev].slice(0, 100)); // Keep last 100
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        if (isMountedRef.current) setConnected(false);
      };

      // Listen for specific event types
      ['session_start', 'tool_execute', 'tool_complete', 'session_error', 'session_done'].forEach(
        (type) => {
          es.addEventListener(type, (e) => {
            if (!isMountedRef.current) return;
            try {
              const event = JSON.parse(e.data);
              setLiveEvents((prev) => [event, ...prev].slice(0, 100));
            } catch {
              // Ignore
            }
          });
        }
      );
    } catch {
      setConnected(false);
    }
  }, [useSSE, sseUrl]);

  useEffect(() => {
    if (useSSE) {
      connectSSE();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [useSSE, connectSSE]);

  const displayEvents = liveEvents.length > 0 ? liveEvents : events;

  return (
    <div className="bg-surface-elevated border border-borders-subtle rounded-xl flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-borders-subtle flex justify-between items-center bg-surface-card">
        <div className="flex items-center gap-2 text-text-primary">
          <Terminal className="w-4 h-4" style={{ color: 'var(--accent-cyan)' }} />
          <h3 className="font-semibold text-sm">Monitor de Actividad (En Vivo)</h3>
        </div>
        <div className="flex items-center gap-2">
          {useSSE ? (
            <>
              {connected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              <span
                className={`text-[10px] uppercase tracking-wider ${connected ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {connected ? 'SSE Connected' : 'SSE Disconnected'}
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-green)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-green)]"></span>
              </span>
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                SSE Ready
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] scrollbar-thin scrollbar-thumb-surface-active scrollbar-track-transparent">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted py-8 text-center">
            <Terminal className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No hay actividad reciente en OpenCode.</p>
          </div>
        ) : (
          displayEvents.map((evt) => {
            const config = eventTypeConfig[evt.event_type] || eventTypeConfig.tool_execute;
            const Icon = config.icon;

            return (
              <div
                key={evt.id || `${evt.event_type}-${evt.created_at}`}
                className="group flex gap-3 p-2.5 rounded-lg hover:bg-surface-active transition-colors items-start animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <div className={`mt-0.5 p-1 rounded-md flex-shrink-0 ${config.bg} ${config.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className="text-xs font-mono font-medium text-text-primary truncate">
                      {evt.agent_name || 'Agente'} &rsaquo; {evt.event_type}
                    </p>
                    <span className="text-[10px] text-text-muted flex-shrink-0 whitespace-nowrap">
                      {formatDistanceToNow(new Date(evt.created_at || new Date()), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                  {evt.details && (
                    <div className="bg-background/50 rounded-md p-2 mt-1 border border-borders-subtle/50">
                      <p className="text-[11px] font-mono text-text-muted truncate">
                        {typeof evt.details === 'string'
                          ? evt.details
                          : evt.details
                            ? JSON.stringify(evt.details)
                            : ''}
                      </p>
                    </div>
                  )}
                  {evt.duration_ms > 0 && (
                    <p className="text-[10px] text-text-muted mt-1 opacity-60">
                      {evt.duration_ms}ms
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
