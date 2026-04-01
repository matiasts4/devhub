'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  MessageSquare,
  RefreshCw,
  Send,
  Terminal,
  Wrench,
  Wifi,
  WifiOff,
} from 'lucide-react';

const TELEGRAM_REFRESH_MS = 30000;

function safeFetch(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Nunca';
  const ms = new Date(dateStr + 'Z').getTime();
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function parseMetadata(rawMetadata) {
  if (!rawMetadata) return null;
  if (typeof rawMetadata === 'object') return rawMetadata;
  if (typeof rawMetadata !== 'string') return null;
  try {
    return JSON.parse(rawMetadata);
  } catch {
    return null;
  }
}

function inferToolType(item) {
  const metadata = parseMetadata(item.metadata);

  const explicit =
    metadata?.tool_type || metadata?.toolType || metadata?.tool || metadata?.tool_name || metadata?.toolName;
  if (explicit) return String(explicit);

  if (item.source === 'opencode') return 'opencode_agent';
  if (item.source === 'telegram_bot') return 'telegram_bot';
  if (item.source === 'devhub') return 'devhub';
  return item.source || 'telegram';
}

const EVENT_ICONS = {
  command: Terminal,
  chat_message: MessageSquare,
  chat_response: Bot,
  error: AlertTriangle,
  system: Send,
};

export default function TelegramMonitor() {
  const { project } = useOutletContext() || {};

  const [status, setStatus] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [toolFilter, setToolFilter] = useState('');

  const fetchTelegram = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);

    try {
      const [statusRes, activityRes] = await Promise.all([
        safeFetch('/api/telegram/status'),
        safeFetch('/api/telegram/activity?limit=120'),
      ]);
      setStatus(statusRes);
      setActivity(activityRes.items || []);
    } catch (error) {
      console.error('TelegramMonitor fetch error:', error.message);
      setStatus({
        bot_connected: false,
        active_chats: 0,
        total_sessions: 0,
        last_activity: null,
        last_event_type: null,
        recent_errors: 0,
      });
      setActivity([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTelegram();
    const timer = setInterval(() => fetchTelegram({ soft: true }), TELEGRAM_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchTelegram]);

  const activityWithTool = useMemo(
    () => activity.map((item) => ({ ...item, inferred_tool_type: inferToolType(item) })),
    [activity]
  );

  const toolTypes = useMemo(() => {
    const unique = new Set(activityWithTool.map((item) => item.inferred_tool_type).filter(Boolean));
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [activityWithTool]);

  const filteredActivity = useMemo(() => {
    return activityWithTool.filter((item) => {
      if (eventFilter && item.event_type !== eventFilter) return false;
      if (directionFilter && item.direction !== directionFilter) return false;
      if (toolFilter && item.inferred_tool_type !== toolFilter) return false;
      return true;
    });
  }, [activityWithTool, directionFilter, eventFilter, toolFilter]);

  const eventCounters = useMemo(() => {
    return activityWithTool.reduce(
      (acc, item) => {
        acc[item.event_type] = (acc[item.event_type] || 0) + 1;
        return acc;
      },
      { command: 0, chat_message: 0, chat_response: 0, error: 0, system: 0 }
    );
  }, [activityWithTool]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}>
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <Send className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent-primary)' }} />
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Telegram Bot Monitor
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
            {project?.name || 'Proyecto'}
          </span>
        </div>
        <button
          onClick={() => fetchTelegram({ soft: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors hover:bg-surface-card"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          Actualizar
        </button>
      </div>

      <div className="px-6 py-6 w-full max-w-[1300px] mx-auto space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-surface-card p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1">Conectividad</p>
            <div className="flex items-center gap-2">
              {status?.bot_connected ? (
                <Wifi className="w-4 h-4 text-success" strokeWidth={1.8} />
              ) : (
                <WifiOff className="w-4 h-4 text-[#FFA657]" strokeWidth={1.8} />
              )}
              <p className="text-sm font-semibold text-text-primary">
                {status?.bot_connected ? 'Conectado' : 'Sin actividad reciente'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-surface-card p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1">Chats activos</p>
            <p className="font-mono text-2xl font-bold text-text-primary">{status?.active_chats ?? 0}</p>
          </div>

          <div className="rounded-xl border bg-surface-card p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1">Sesiones totales</p>
            <p className="font-mono text-2xl font-bold text-text-primary">{status?.total_sessions ?? 0}</p>
          </div>

          <div className="rounded-xl border bg-surface-card p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1">Errores recientes</p>
            <p className="font-mono text-2xl font-bold text-[#F85149]">{status?.recent_errors ?? 0}</p>
          </div>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--accent-primary)18', border: '1px solid var(--accent-primary)30' }}
              >
                <Wrench className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} strokeWidth={1.6} />
              </div>
              <div>
                <h3 className="font-mono text-sm font-semibold text-text-primary">Actividad y Herramientas</h3>
                <p className="text-[11px] text-text-muted">
                  Última actividad: {status?.last_activity ? timeAgo(status.last_activity) : 'Nunca'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {['command', 'chat_message', 'chat_response', 'error', 'system'].map((evt) => (
                <div
                  key={evt}
                  className="px-2 py-1 rounded-lg border text-center"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <p className="text-[9px] text-text-muted">{evt}</p>
                  <p className="text-xs font-semibold text-text-primary">{eventCounters[evt] || 0}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Filtros</span>

              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary px-2.5 py-1.5 rounded-lg outline-none"
              >
                <option value="">Todos los eventos</option>
                <option value="command">command</option>
                <option value="chat_message">chat_message</option>
                <option value="chat_response">chat_response</option>
                <option value="error">error</option>
                <option value="system">system</option>
              </select>

              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary px-2.5 py-1.5 rounded-lg outline-none"
              >
                <option value="">Todas las direcciones</option>
                <option value="inbound">inbound</option>
                <option value="outbound">outbound</option>
              </select>

              <select
                value={toolFilter}
                onChange={(e) => setToolFilter(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary px-2.5 py-1.5 rounded-lg outline-none"
              >
                <option value="">Todas las herramientas</option>
                {toolTypes.map((toolType) => (
                  <option key={toolType} value={toolType}>
                    {toolType}
                  </option>
                ))}
              </select>

              {(eventFilter || directionFilter || toolFilter) && (
                <button
                  onClick={() => {
                    setEventFilter('');
                    setDirectionFilter('');
                    setToolFilter('');
                  }}
                  className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <p className="text-sm text-text-muted">Cargando actividad de Telegram...</p>
            ) : filteredActivity.length === 0 ? (
              <p className="text-sm text-text-muted">No hay actividad para los filtros seleccionados.</p>
            ) : (
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredActivity.map((item) => {
                  const Icon = EVENT_ICONS[item.event_type] || Terminal;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border px-3 py-2.5 flex items-start justify-between gap-3"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon
                          className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                            item.event_type === 'error'
                              ? 'text-[#F85149]'
                              : item.status === 'ok'
                                ? 'text-success'
                                : 'text-text-muted'
                          }`}
                          strokeWidth={1.8}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate">
                            {item.command ? `/${item.command}` : item.event_type}
                            {item.content_preview ? ` — ${item.content_preview}` : ''}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            {timeAgo(item.created_at)} · {item.direction || 'n/a'} · source: {item.source || 'telegram'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full border"
                          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                        >
                          {item.inferred_tool_type}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full border"
                          style={{
                            borderColor:
                              item.status === 'error' ? 'rgba(248, 81, 73, 0.35)' : 'rgba(63, 185, 80, 0.35)',
                            color: item.status === 'error' ? '#F85149' : '#3FB950',
                          }}
                        >
                          {item.status || 'ok'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
