'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  getCurrentToolDisplay,
  getTelegramSnapshotBadges,
  getTelegramPollingInterval,
  normalizeTelegramActivityItem,
  shouldShowRealtimeBadge,
} from './telegramMonitorRealtime';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import StatusSignal from '@/components/ui/StatusSignal';
import {
  getWorkspaceDataTileStyle,
  getWorkspaceFilterBarStyle,
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspaceSectionHeaderStripStyle,
  getWorkspaceSectionSurfaceStyle,
  getWorkspaceStatusPillStyle,
} from './workspacePageChrome';
import {
  pillStyle,
  btnSecondaryStyle,
  inputStyle,
  panelStyle,
} from '@/chrome/morphology';

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

const EVENT_ICONS = {
  intent: Terminal,
  subscription: MessageSquare,
  command: Terminal,
  chat_message: MessageSquare,
  chat_response: Bot,
  error: AlertTriangle,
  system: Send,
};

export default function TelegramMonitor() {
  const { project } = useOutletContext() || {};
  const intervalRef = useRef(null);
  const fetchTelegramRef = useRef(null);

  const [status, setStatus] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const schedulePolling = useCallback((nextStatus) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      fetchTelegramRef.current?.({ soft: true });
    }, getTelegramPollingInterval(nextStatus));
  }, []);

  const fetchTelegram = useCallback(
    async ({ soft = false } = {}) => {
      let nextStatus;

      if (soft) setRefreshing(true);
      else setLoading(true);

      try {
        const [statusRes, activityRes] = await Promise.all([
          safeFetch('/api/telegram/status'),
          safeFetch('/api/telegram/activity?limit=120'),
        ]);
        nextStatus = statusRes;
        setStatus(statusRes);
        setActivity(activityRes.items || []);
      } catch (error) {
        console.error('TelegramMonitor fetch error:', error.message);
        nextStatus = {
          bot_connected: false,
          active_chats: 0,
          total_sessions: 0,
          last_activity: null,
          last_event_type: null,
          recent_errors: 0,
          is_busy: false,
          current_tool: null,
        };
        setStatus(nextStatus);
        setActivity([]);
      } finally {
        schedulePolling(nextStatus);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [schedulePolling]
  );

  useEffect(() => {
    fetchTelegramRef.current = fetchTelegram;
  }, [fetchTelegram]);

  useEffect(() => {
    fetchTelegram();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTelegram]);

  const showRealtimeBadge = shouldShowRealtimeBadge(status);
  const currentToolDisplay = getCurrentToolDisplay(status);

  const normalizedActivity = useMemo(() => {
    return activity.map((item) => normalizeTelegramActivityItem(item));
  }, [activity]);

  const filteredActivity = useMemo(() => {
    return normalizedActivity.filter((item) => {
      if (eventFilter && item.entryType !== eventFilter) return false;
      if (statusFilter && item.primaryStatus !== statusFilter) return false;
      return true;
    });
  }, [normalizedActivity, eventFilter, statusFilter]);

  const eventCounters = useMemo(() => {
    return normalizedActivity.reduce(
      (acc, item) => {
        acc[item.entryType] = (acc[item.entryType] || 0) + 1;
        return acc;
      },
      { intent: 0, subscription: 0 }
    );
  }, [normalizedActivity]);

  const snapshotBadges = useMemo(() => getTelegramSnapshotBadges(status), [status]);

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      <div
        className="sticky top-0 z-10 border-b px-6 py-3 flex items-center justify-between"
        style={getWorkspacePageHeaderStyle()}
      >
        <div className="flex items-center gap-3">
          <WorkspacePageTitle
            icon={Send}
            title="Telegram Bot Monitor"
            projectName={project?.name || 'Proyecto'}
            badges={[
              showRealtimeBadge ? (
                <StatusSignal
                  label="EN VIVO"
                  tone="danger"
                  animation="blink"
                />
              ) : null,
              showRealtimeBadge && currentToolDisplay ? (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
                >
                  🔧 {currentToolDisplay}
                </span>
              ) : null,
            ].filter(Boolean)}
          />
        </div>
        <button
          onClick={() => fetchTelegram({ soft: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 border text-xs transition-colors hover:bg-surface-card cursor-pointer"
          style={btnSecondaryStyle({ size: 'sm' })}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
            strokeWidth={1.8}
          />
          Actualizar
        </button>
      </div>

      <div className="space-y-5" style={getWorkspacePageContentStyle()}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div
            className="border bg-surface-card p-3 rounded-none"
            style={getWorkspaceDataTileStyle(status?.bot_connected ? 'var(--success)' : 'var(--warning)')}
          >
            <p className="typography-label mb-1">Conectividad</p>
            <div className="flex items-center gap-2">
              {status?.bot_connected ? (
                <Wifi className="w-4 h-4" strokeWidth={1.8} style={{ color: 'var(--success)' }} />
              ) : (
                <WifiOff className="w-4 h-4" strokeWidth={1.8} style={{ color: 'var(--warning)' }} />
              )}
              <p className="text-sm font-semibold text-text-primary">
                {status?.bot_connected ? 'Conectado' : 'Sin actividad reciente'}
              </p>
            </div>
          </div>

          <div
            className="rounded-none border bg-surface-card p-3"
            style={getWorkspaceDataTileStyle('var(--accent-primary)')}
          >
            <p className="typography-label mb-1">
              Chats activos
            </p>
            <p className="typography-data text-2xl font-bold text-text-primary">
              {status?.active_chats ?? 0}
            </p>
          </div>

          <div
            className="rounded-none border bg-surface-card p-3"
            style={getWorkspaceDataTileStyle('var(--accent-primary)')}
          >
            <p className="typography-label mb-1">
              Sesiones totales
            </p>
            <p className="typography-data text-2xl font-bold text-text-primary">
              {status?.total_sessions ?? 0}
            </p>
          </div>

          <div
            className="rounded-none border bg-surface-card p-3"
            style={getWorkspaceDataTileStyle('var(--danger)')}
          >
            <p className="typography-label mb-1">
              Errores recientes
            </p>
            <p className="typography-data text-2xl font-bold" style={{ color: 'var(--danger)' }}>
              {status?.recent_errors ?? 0}
            </p>
          </div>
        </div>

        <div
          className="overflow-hidden"
          style={getWorkspaceSectionSurfaceStyle({ emphasized: true })}
        >
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={getWorkspaceSectionHeaderStripStyle({ tone: 'accent' })}
          >
            <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-none flex items-center justify-center"
              style={pillStyle({ tone: 'accent' })}
            >
              <Wrench
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
                strokeWidth={1.6}
              />
            </div>
            <div>
              <h3 className="typography-card-title">
                Actividad y Herramientas
              </h3>
                <p className="text-[11px] text-text-muted">
                  Última actividad:{' '}
                  {status?.last_activity ? timeAgo(status.last_activity) : 'Nunca'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {['intent', 'subscription'].map((evt) => (
                <div
                  key={evt}
                  className="px-2 py-1 text-center"
                  style={pillStyle()}
                >
                  <p className="text-[11px] text-text-muted">{evt}</p>
                  <p className="text-xs font-semibold text-text-primary">
                    {eventCounters[evt] || 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-4" style={{ ...getWorkspaceFilterBarStyle(), borderWidth: '0 0 var(--chrome-border-width) 0' }}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="typography-label">Filtros</span>

              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary px-2.5 py-1.5 outline-none cursor-pointer"
                style={inputStyle()}
              >
                <option value="">Todos los eventos</option>
                <option value="intent">intent</option>
                <option value="subscription">subscription</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface-app border border-borders-subtle text-xs text-text-primary px-2.5 py-1.5 outline-none cursor-pointer"
                style={inputStyle()}
              >
                <option value="">Todos los estados</option>
                <option value="accepted">accepted</option>
                <option value="approved">approved</option>
                <option value="pending">pending</option>
                <option value="retry_pending">retry_pending</option>
                <option value="mute">mute</option>
                <option value="unmute">unmute</option>
              </select>

              {(eventFilter || statusFilter) && (
                <button
                  onClick={() => {
                    setEventFilter('');
                    setStatusFilter('');
                  }}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
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
              <p className="text-sm text-text-muted">
                No hay actividad para los filtros seleccionados.
              </p>
            ) : (
              <>
                {snapshotBadges.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {snapshotBadges.map((badge) => (
                      <span
                        key={badge.key}
                        className="text-[11px] px-2 py-1 rounded-full"
                        style={getWorkspaceStatusPillStyle({ tone: 'accent' })}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {filteredActivity.map((item) => {
                    const Icon = EVENT_ICONS[item.entryType] || Terminal;
                    const isErrorTone = item.primaryStatus === 'failed' || item.primaryStatus === 'rejected';
                    const isSuccessTone = item.primaryStatus === 'accepted' || item.primaryStatus === 'approved';
                    const itemTone = isErrorTone ? 'danger' : isSuccessTone ? 'success' : 'neutral';

                    return (
                      <div
                        key={item.id}
                        className="border px-3 py-2.5 flex items-start justify-between gap-3"
                        style={{
                          ...getWorkspaceSectionSurfaceStyle({ emphasized: itemTone !== 'neutral' }),
                          background:
                            itemTone === 'neutral'
                              ? 'color-mix(in srgb, var(--chrome-panel-fill-emphasis) 72%, var(--chrome-panel-fill) 28%)'
                              : `linear-gradient(180deg, color-mix(in srgb, ${isErrorTone ? 'var(--danger)' : 'var(--success)'} 18%, var(--chrome-panel-fill-emphasis)), var(--chrome-panel-fill))`,
                          boxShadow: 'var(--chrome-shadow-control)',
                        }}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <Icon
                            className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                            style={{
                              color: isErrorTone
                                ? 'var(--danger)'
                                : isSuccessTone
                                  ? 'var(--success)'
                                  : 'var(--text-muted)',
                            }}
                            strokeWidth={1.8}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-primary truncate">
                              {item.title}
                              {item.targetSummary ? ` — ${item.targetSummary}` : ''}
                            </p>
                            <p className="text-xs text-text-muted mt-0.5">
                              {timeAgo(item.created_at)}
                              {item.detail ? ` · ${item.detail}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded-full border"
                            style={getWorkspaceStatusPillStyle()}
                          >
                            {item.entryType}
                          </span>
                          <StatusSignal
                            label={item.primaryStatus || 'ok'}
                            tone={itemTone}
                            animation={isErrorTone || isSuccessTone ? 'blink' : 'none'}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
