'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import HealthCenter from '@/components/HealthCenter';
import {
  clearOperationalEvents,
  EVENT_NAME,
  markAllOperationalEventsAsRead,
  markOperationalEventAsRead,
  readOperationalEvents,
} from '@/lib/operations/events';
import { dispatchOperationalNotification } from '@/lib/operations/notify';
import { Button } from '@/components/ui/button';

const DEADLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

function safeFetch(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms <= 0) return 'ahora';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function getNotificationIcon(severity) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-[#F85149] shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-[#FFA657] shrink-0" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-[#3FB950] shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-[#58A6FF] shrink-0" />;
  }
}

export default function NotificationCenter({
  projectId,
  collapsed = false,
  variant = 'sidebar',
  onOpenSettings,
}) {
  const db = useMemo(() => createClient(), []);
  const isTopbar = variant === 'topbar';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'agents' | 'tasks' | 'system'

  const [notifications, setNotifications] = useState([]);
  const [healthSnapshot, setHealthSnapshot] = useState({ summary: null, sources: [] });

  const loadNotificationsState = useCallback(() => {
    const items = readOperationalEvents();
    setNotifications(items);
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const now = new Date();
    const end = new Date(now.getTime() + DEADLINE_WINDOW_MS);

    try {
      const [tasksResult, healthResult] = await Promise.all([
        db
          .from('tasks')
          .select('id, title, due_date, priority, status')
          .eq('project_id', projectId)
          .neq('status', 'completed')
          .not('due_date', 'is', null)
          .lte('due_date', end.toISOString())
          .order('due_date', { ascending: true }),
        safeFetch('/api/agenthub/operations/health').catch(() => ({ summary: null, sources: [] })),
      ]);

      const tasks = (tasksResult.data || []).filter((task) => {
        const dueTs = new Date(task.due_date).getTime();
        const delta = dueTs - now.getTime();
        return delta > 0 && delta <= DEADLINE_WINDOW_MS;
      });

      // Publicar tareas próximas a vencer a través del despachador unificado
      tasks.forEach((task) => {
        dispatchOperationalNotification({
          title: `Tarea próxima a vencer: ${task.title}`,
          body: `Vence el ${new Date(task.due_date).toLocaleString()}`,
          category: 'tasks',
          severity: 'warning',
          source: 'tasks',
          entity_id: task.id,
          dedupe_key: `task:deadline:${task.id}`,
          actions: [
            { label: 'Ir a Tarea', action_type: 'navigate', target: `/tasks?id=${task.id}` },
          ],
          delivery: { desktop: false, in_app: true },
        });
      });

      setHealthSnapshot(healthResult || { summary: null, sources: [] });
    } catch {
      // Ignorar errores de red temporales
    } finally {
      loadNotificationsState();
      setLoading(false);
    }
  }, [projectId, db, loadNotificationsState]);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, [fetchAlerts]);

  useEffect(() => {
    if (collapsed) setOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleNotificationEvent = () => {
      loadNotificationsState();
    };

    window.addEventListener(EVENT_NAME, handleNotificationEvent);

    return () => {
      window.removeEventListener(EVENT_NAME, handleNotificationEvent);
    };
  }, [loadNotificationsState]);

  const totalUnread = useMemo(() => {
    return notifications.filter((n) => !n.read_at).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const handleMarkAllRead = () => {
    markAllOperationalEventsAsRead({ category: activeTab });
    loadNotificationsState();
  };

  const handleClearCategory = () => {
    clearOperationalEvents({ category: activeTab });
    loadNotificationsState();
  };

  const handleNotificationClick = (notif) => {
    if (!notif.read_at) {
      markOperationalEventAsRead(notif.id);
      loadNotificationsState();
    }
  };

  const topbarTriggerClassName = `group relative inline-flex h-7 w-7 items-center justify-center rounded-sm transition-all ${
    open
      ? 'text-[var(--accent-primary)] bg-[rgba(var(--accent-rgb,88,166,255),0.12)]'
      : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.05]'
  }`;

  return (
    <div className={isTopbar ? 'relative' : 'px-2 py-2 border-b border-borders-subtle'}>
      {isTopbar ? (
        <button
          type="button"
          data-testid="notification-bell"
          onClick={() => setOpen((prev) => !prev)}
          className={topbarTriggerClassName}
          title="Notificaciones"
          aria-label="Notificaciones"
        >
          <Bell className="w-4 h-4" strokeWidth={1.5} />
          {totalUnread > 0 ? (
            <span
              className="absolute -bottom-px -right-px min-w-4 h-4 px-1 rounded-full border border-[#F778BA]/40 text-[10px] font-semibold text-rose-400 bg-[#F778BA]/10 flex items-center justify-center leading-none"
              aria-label={`${totalUnread} notificaciones`}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          ) : null}
        </button>
      ) : (
        <Button
          data-testid="notification-bell"
          onClick={() => !collapsed && setOpen((prev) => !prev)}
          variant="ghost"
          size="sm"
          className={`w-full ${collapsed ? 'justify-center px-0' : 'justify-between px-2.5'} rounded-lg ${
            open ? 'border-white/16 bg-white/[0.08] text-text-primary' : 'text-text-muted'
          }`}
        >
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {!collapsed && <span className="text-xs font-medium">Notificaciones</span>}
          </div>
          {!collapsed && totalUnread > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F85149]/20 text-[#F85149] border border-[#F85149]/30">
              {totalUnread}
            </span>
          )}
        </Button>
      )}

      {open && (
        <div
          data-testid="notification-center-popover"
          className={`absolute z-50 mt-2 w-96 rounded-xl border border-borders-default bg-[#0D1117]/95 shadow-2xl backdrop-blur-md text-xs text-text-primary ${
            isTopbar ? 'right-0 top-full' : 'left-0 top-full'
          }`}
        >
          {/* Header */}
          <div className="p-3 border-b border-borders-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#58A6FF]" />
              <span className="font-semibold text-gray-200">Notificaciones</span>
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {totalUnread} sin leer
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={fetchAlerts}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {totalUnread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleClearCategory}
                className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                title="Limpiar vista"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                  className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                  title="Ajustes de notificaciones"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-borders-subtle bg-gray-900/40 p-1 gap-1">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'agents', label: 'Agentes' },
              { id: 'tasks', label: 'Tareas' },
              { id: 'system', label: 'Sistema' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1 px-2 text-[11px] font-medium rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-gray-800 text-blue-400 font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Health Summary */}
          {healthSnapshot.summary && (
            <div className="p-2 border-b border-borders-subtle bg-gray-900/20">
              <HealthCenter snapshot={healthSnapshot} />
            </div>
          )}

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-borders-subtle/50">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-600 stroke-1" />
                <p className="font-medium text-gray-400">Sin notificaciones</p>
                <p className="text-[11px] text-gray-600 mt-1">Todo funciona con normalidad</p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3 transition-colors cursor-pointer flex items-start gap-3 hover:bg-white/[0.03] ${
                    !item.read_at ? 'bg-blue-500/[0.04]' : 'opacity-75'
                  }`}
                >
                  {getNotificationIcon(item.severity)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-semibold text-xs ${!item.read_at ? 'text-gray-100' : 'text-gray-300'}`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>

                    {item.occurrence_count > 1 && (
                      <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 border border-gray-700">
                        Ocurrencias: {item.occurrence_count}
                      </span>
                    )}

                    {item.actions && item.actions.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        {item.actions.map((act, idx) => (
                          <a
                            key={idx}
                            href={act.target}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-medium text-[#58A6FF] hover:underline"
                          >
                            {act.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {!item.read_at && (
                    <span
                      className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1"
                      title="No leída"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
