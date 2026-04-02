'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock3, RefreshCw, Terminal, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createClient } from '@/lib/db/localSupabase';

const DEADLINE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_MCP_SYNC_MS = 30 * 60 * 1000;
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

async function fetchTelegramStatus() {
  try {
    return await safeFetch('/api/telegram/status');
  } catch {
    return {
      bot_connected: false,
      active_chats: 0,
      total_sessions: 0,
      last_activity: null,
      recent_errors: 0,
    };
  }
}

function formatTimeLeft(targetDate) {
  const msLeft = new Date(targetDate).getTime() - Date.now();
  if (msLeft <= 0) return 'vencida';

  const totalMinutes = Math.ceil(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function buildMcpAlerts(connections) {
  if (!Array.isArray(connections)) return [];

  const now = Date.now();
  return connections.map((conn) => {
    if (!conn.is_active) {
      return {
        id: `mcp-${conn.id}`,
        level: 'warning',
        name: conn.name,
        message: 'desconectado',
      };
    }

    if (!conn.last_sync) {
      return {
        id: `mcp-${conn.id}`,
        level: 'warning',
        name: conn.name,
        message: 'sin ultima sincronizacion',
      };
    }

    const elapsed = now - new Date(conn.last_sync).getTime();
    if (elapsed > STALE_MCP_SYNC_MS) {
      return {
        id: `mcp-${conn.id}`,
        level: 'warning',
        name: conn.name,
        message: 'sincronizacion atrasada',
      };
    }

    return {
      id: `mcp-${conn.id}`,
      level: 'ok',
      name: conn.name,
      message: 'operativo',
    };
  });
}

export default function NotificationCenter({ projectId, collapsed = false, variant = 'sidebar' }) {
  const supabase = useMemo(() => createClient(), []);
  const isTopbar = variant === 'topbar';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deadlineAlerts, setDeadlineAlerts] = useState([]);
  const [mcpAlerts, setMcpAlerts] = useState([]);
  const [tgStatus, setTgStatus] = useState(null);

  const fetchAlerts = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const now = new Date();
    const end = new Date(now.getTime() + DEADLINE_WINDOW_MS);

    const [tasksResult, mcpResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .eq('project_id', projectId)
        .neq('status', 'completed')
        .not('due_date', 'is', null)
        .lte('due_date', end.toISOString())
        .order('due_date', { ascending: true }),
      supabase
        .from('mcp_connections')
        .select('id, name, is_active, last_sync')
        .order('created_at', { ascending: false }),
    ]);

    const tasks = (tasksResult.data || []).filter((task) => {
      const dueTs = new Date(task.due_date).getTime();
      const delta = dueTs - now.getTime();
      return delta > 0 && delta <= DEADLINE_WINDOW_MS;
    });

    setDeadlineAlerts(tasks);
    setMcpAlerts(buildMcpAlerts(mcpResult.data || []));
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, [fetchAlerts]);

  useEffect(() => {
    if (collapsed) setOpen(false);
  }, [collapsed]);

  const criticalMcpAlerts = useMemo(
    () => mcpAlerts.filter((alert) => alert.level !== 'ok'),
    [mcpAlerts]
  );

  // ── Telegram refresh ─────────────────────────────────────────────
  const fetchTelegram = useCallback(async () => {
    const statusRes = await fetchTelegramStatus();
    setTgStatus(statusRes);
  }, []);

  useEffect(() => {
    fetchTelegram();
    const timer = setInterval(fetchTelegram, TELEGRAM_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchTelegram]);

  const unreadCount = deadlineAlerts.length + criticalMcpAlerts.length;

  return (
    <div className={isTopbar ? 'relative' : 'px-2 py-2 border-b border-borders-subtle'}>
      <button
        data-testid="notification-bell"
        onClick={() => (isTopbar || !collapsed) && setOpen((prev) => !prev)}
        className={
          isTopbar
            ? `inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
                open
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-card'
              }`
            : `w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} rounded-md px-2.5 py-2 text-xs transition-all cursor-pointer ${
                open
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-card'
              }`
        }
        title={collapsed && !isTopbar ? 'Notificaciones' : undefined}
        aria-label="Notificaciones"
      >
        <span
          className={`flex items-center ${
            isTopbar ? 'gap-1.5' : collapsed ? 'justify-center' : 'gap-2'
          }`}
        >
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          {isTopbar ? (
            <span className="hidden sm:inline">Alertas</span>
          ) : (
            !collapsed && <span>Notificaciones</span>
          )}
        </span>
        <span
          className={`min-w-5 h-5 px-1 rounded-full border text-xs font-semibold flex items-center justify-center ${
            unreadCount > 0
              ? 'border-[#F778BA]/40 text-danger bg-[#F778BA]/10'
              : 'border-borders-strong text-text-muted bg-surface-card'
          }`}
        >
          {unreadCount}
        </span>
      </button>

      {(isTopbar || !collapsed) && open && (
        <div
          className={
            isTopbar
              ? 'absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-xl border border-borders-subtle bg-surface-app overflow-hidden z-40 shadow-2xl'
              : 'mt-2 rounded-lg border border-borders-subtle bg-surface-app overflow-hidden'
          }
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-borders-subtle">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted font-semibold">
              Centro de Alertas
            </p>
            <button
              onClick={fetchAlerts}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="Actualizar alertas"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                strokeWidth={1.5}
              />
            </button>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-[0.12em] mb-2">
                Deadlines &lt; 24h
              </p>
              {deadlineAlerts.length === 0 ? (
                <p className="text-[11px] text-success">
                  Sin tareas por vencer en las proximas 24 horas.
                </p>
              ) : (
                <div className="space-y-2">
                  {deadlineAlerts.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md border border-[#F778BA]/25 bg-[#F778BA]/5 px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-danger mt-0.5 flex-shrink-0"
                          strokeWidth={1.7}
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] text-text-primary font-medium truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-danger mt-0.5 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" strokeWidth={1.7} />
                            vence en {formatTimeLeft(task.due_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-text-muted uppercase tracking-[0.12em] mb-2">
                Estado Agentes MCP
              </p>
              {mcpAlerts.length === 0 ? (
                <p className="text-[11px] text-text-muted">No hay conexiones MCP registradas.</p>
              ) : (
                <div className="space-y-1.5">
                  {mcpAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-md border px-2.5 py-2 flex items-center justify-between ${
                        alert.level === 'ok'
                          ? 'border-[#3FB950]/25 bg-[#3FB950]/5'
                          : 'border-[#FFA657]/25 bg-[#FFA657]/8'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {alert.level === 'ok' ? (
                          <Wifi
                            className="w-3.5 h-3.5 text-success flex-shrink-0"
                            strokeWidth={1.7}
                          />
                        ) : (
                          <WifiOff
                            className="w-3.5 h-3.5 text-[#FFA657] flex-shrink-0"
                            strokeWidth={1.7}
                          />
                        )}
                        <p className="text-[11px] text-text-primary truncate">{alert.name}</p>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          alert.level === 'ok' ? 'text-success' : 'text-[#FFA657]'
                        }`}
                      >
                        {alert.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-text-muted uppercase tracking-[0.12em] mb-2">
                Bot Telegram
              </p>
              {!tgStatus ? (
                <p className="text-[11px] text-text-muted">Cargando estado del bot...</p>
              ) : (
                <>
                  <div className="space-y-1.5 mb-3">
                    <div
                      className={`rounded-md border px-2.5 py-2 flex items-center justify-between ${
                        tgStatus.bot_connected
                          ? 'border-[#3FB950]/25 bg-[#3FB950]/5'
                          : 'border-[#FFA657]/25 bg-[#FFA657]/8'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {tgStatus.bot_connected ? (
                          <Wifi
                            className="w-3.5 h-3.5 text-success flex-shrink-0"
                            strokeWidth={1.7}
                          />
                        ) : (
                          <WifiOff
                            className="w-3.5 h-3.5 text-[#FFA657] flex-shrink-0"
                            strokeWidth={1.7}
                          />
                        )}
                        <p className="text-[11px] text-text-primary">
                          {tgStatus.bot_connected ? 'Conectado' : 'Sin actividad reciente'}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-text-muted">
                        {tgStatus.active_chats} chat{tgStatus.active_chats !== 1 ? 's' : ''} activo
                        {tgStatus.active_chats !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {tgStatus.last_activity && (
                      <p className="text-xs text-text-muted text-right">
                        Ultima actividad: {timeAgo(tgStatus.last_activity)}
                      </p>
                    )}
                  </div>

                  {tgStatus.recent_errors > 0 && (
                    <div className="rounded-md border border-[#F85149]/25 bg-[#F85149]/5 px-2.5 py-1.5 mb-2 flex items-center gap-2">
                      <AlertTriangle
                        className="w-3 h-3 text-[#F85149] flex-shrink-0"
                        strokeWidth={1.7}
                      />
                      <p className="text-xs text-[#F85149]">
                        {tgStatus.recent_errors} error{tgStatus.recent_errors > 1 ? 'es' : ''}{' '}
                        reciente{tgStatus.recent_errors > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}

                  {projectId && (
                    <Link
                      to={`/project/${projectId}/telegram`}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-borders-strong bg-surface-card px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <Terminal className="w-3 h-3" strokeWidth={1.7} />
                      Abrir monitor detallado
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
