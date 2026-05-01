'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock3, RefreshCw, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createClient } from '@/lib/db/localClient';
import HealthCenter from '@/components/HealthCenter';
import { EVENT_NAME, readOperationalEvents } from '@/lib/operations/events';
import { buildNotificationCenterModel } from '@/lib/operations/notificationCenterModel';
import { Button } from '@/components/ui/button';

const DEADLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

function safeFetch(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
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

function getProjectOperationalEvents(projectId) {
  return readOperationalEvents({ projectId }).slice(0, 6);
}

function getEventToneClasses(event) {
  if (event.severity === 'critical') return 'border-[#F85149]/25 bg-[#F85149]/5';
  if (event.severity === 'warning') return 'border-[#FFA657]/25 bg-[#FFA657]/8';
  return 'border-[#58A6FF]/20 bg-[#58A6FF]/8';
}

function getNotificationRenderKey(scope, item, index) {
  const rawId = item?.id || item?.task_id || item?.event_id || 'item';
  return `${scope}-${rawId}-${index}`;
}

export default function NotificationCenter({ projectId, collapsed = false, variant = 'sidebar' }) {
  const db = useMemo(() => createClient(), []);
  const isTopbar = variant === 'topbar';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deadlineAlerts, setDeadlineAlerts] = useState([]);
  const [operationalEvents, setOperationalEvents] = useState([]);
  const [healthSnapshot, setHealthSnapshot] = useState({ summary: null, sources: [] });

  const fetchAlerts = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const now = new Date();
    const end = new Date(now.getTime() + DEADLINE_WINDOW_MS);

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

    setDeadlineAlerts(tasks);
    setOperationalEvents(getProjectOperationalEvents(projectId));
    setHealthSnapshot(healthResult || { summary: null, sources: [] });
    setLoading(false);
  }, [projectId, db]);

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

    const handleOperationalEvent = () => {
      setOperationalEvents(getProjectOperationalEvents(projectId));
    };

    window.addEventListener(EVENT_NAME, handleOperationalEvent);
    return () => window.removeEventListener(EVENT_NAME, handleOperationalEvent);
  }, [projectId]);

  const { unreadCount, healthSources } = buildNotificationCenterModel({
    deadlineAlerts,
    operationalEvents,
    healthSnapshot,
  });

  return (
    <div className={isTopbar ? 'relative' : 'px-2 py-2 border-b border-borders-subtle'}>
      <Button
        data-testid="notification-bell"
        onClick={() => (isTopbar || !collapsed) && setOpen((prev) => !prev)}
        variant={isTopbar ? 'devhubGlass' : 'devhubGhost'}
        size={isTopbar ? 'toolbar' : 'sm'}
        className={
          isTopbar
            ? open
              ? 'text-text-primary border-white/16 bg-white/[0.09]'
              : 'text-text-secondary'
            : `w-full ${collapsed ? 'justify-center px-0' : 'justify-between px-2.5'} rounded-lg ${
                open
                  ? 'border-white/16 bg-white/[0.08] text-text-primary'
                  : 'text-text-muted'
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
      </Button>

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
                  {deadlineAlerts.map((task, index) => (
                    <div
                      key={getNotificationRenderKey('deadline', task, index)}
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
                Alertas operacionales
              </p>
              {operationalEvents.length === 0 ? (
                <p className="text-[11px] text-text-muted">Sin alertas operacionales recientes.</p>
              ) : (
                <div className="space-y-2">
                  {operationalEvents.map((event, index) => (
                    <div
                      key={getNotificationRenderKey('event', event, index)}
                      className={`rounded-md border px-2.5 py-2 ${getEventToneClasses(event)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-text-primary font-medium truncate">
                            {event.title}
                          </p>
                          {event.body ? (
                            <p className="text-[11px] text-text-muted mt-1 line-clamp-2">
                              {event.body}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[10px] uppercase text-text-muted shrink-0">
                          {event.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-text-muted uppercase tracking-[0.12em] mb-2">
                Estado operacional
              </p>
              <HealthCenter sources={healthSources} />
            </div>

            <div>
              <p className="text-xs text-text-muted uppercase tracking-[0.12em] mb-2">Atajos</p>
              {projectId ? (
                <Link
                  to={`/project/${projectId}/telegram`}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-borders-strong bg-surface-card px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <Terminal className="w-3 h-3" strokeWidth={1.7} />
                  Abrir monitor detallado
                </Link>
              ) : (
                <p className="text-[11px] text-text-muted">
                  Seleccioná un proyecto para ver accesos rápidos.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
