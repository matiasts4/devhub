'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EVENT_NAME } from '@/lib/operations/events';
import { playNotificationSound } from '@/lib/notifications/soundEffects';
import { getNotificationPreferences } from '@/lib/notifications/notificationPreferences';
import { isDesktopHost } from '@/lib/desktop/desktopRuntime';

const TOAST_TIMEOUT_MS = 6000;
const MAX_TOASTS = 4;

const SEVERITY_RANK = {
  info: 1,
  warning: 2,
  critical: 3,
};

function getToastIcon(severity) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-5 h-5 text-[#F85149] shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-[#FFA657] shrink-0" />;
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-[#3FB950] shrink-0" />;
    default:
      return <Info className="w-5 h-5 text-[#58A6FF] shrink-0" />;
  }
}

function getToastBorderClass(severity) {
  switch (severity) {
    case 'critical':
      return 'border-[#F85149]/40 bg-[#161b22]/95 shadow-red-950/20';
    case 'warning':
      return 'border-[#FFA657]/40 bg-[#161b22]/95 shadow-amber-950/20';
    case 'success':
      return 'border-[#3FB950]/40 bg-[#161b22]/95 shadow-emerald-950/20';
    default:
      return 'border-[#58A6FF]/30 bg-[#161b22]/95 shadow-blue-950/20';
  }
}

export default function NotificationToastStack() {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerNativeOSNotification = useCallback((notification) => {
    if (typeof window === 'undefined' || !document.hidden) return;

    // N2 dedupe: when running inside Electron/Tauri the `delivery.desktop`
    // path in notify.js already shows a native OS notification. The web
    // Notification API is kept ONLY as fallback for the pure-web runtime
    // (no native bridge), using the same capability check as notify.js.
    if (isDesktopHost()) return;

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(notification.title, {
          body: notification.body || notification.message,
          icon: '/favicon.ico',
        });
      } catch {
        // Ignorar si falla
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleNotificationEvent = (event) => {
      const detail = event.detail;
      const notif = detail?.notification || detail;
      if (!notif || !notif.title) return;

      const prefs = getNotificationPreferences();

      // Si está en Modo No Molestar (Quiet Hours), silenciar avisos emergentes
      if (prefs.quietHours) return;

      // Filtrar por severidad mínima configurada
      const notifRank = SEVERITY_RANK[notif.severity] || 1;
      const minRank = SEVERITY_RANK[prefs.minSeverity] || 1;
      if (notifRank < minRank) return;

      // Reproducir sonido si está habilitado
      if (prefs.enableSound) {
        playNotificationSound(notif.severity);
      }

      // Notificación nativa si la app está en segundo plano y está habilitado
      if (prefs.enableNativeOS) {
        triggerNativeOSNotification(notif);
      }

      // Toasts emergentes in-app si está habilitado
      if (prefs.enableToasts) {
        setToasts((prev) => {
          const filtered = prev.filter((t) => t.id !== notif.id);
          const updated = [{ ...notif, keyId: `${notif.id}-${Date.now()}` }, ...filtered];
          return updated.slice(0, MAX_TOASTS);
        });
      }
    };

    window.addEventListener(EVENT_NAME, handleNotificationEvent);
    return () => {
      window.removeEventListener(EVENT_NAME, handleNotificationEvent);
    };
  }, [triggerNativeOSNotification]);

  // Auto-dismiss temporizado para toasts que no son críticos
  useEffect(() => {
    if (toasts.length === 0) return undefined;

    const timers = toasts.map((t) => {
      if (t.severity === 'critical') return null; // Críticos permanecen hasta desestimación manual
      return setTimeout(() => dismissToast(t.id), TOAST_TIMEOUT_MS);
    });

    return () => {
      timers.forEach((timer) => timer && clearTimeout(timer));
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none transition-all duration-300"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.keyId || toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-2 ${getToastBorderClass(
            toast.severity
          )}`}
        >
          {getToastIcon(toast.severity)}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-gray-100 truncate">{toast.title}</h4>
              {toast.occurrence_count > 1 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                  x{toast.occurrence_count}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-300 mt-1 line-clamp-2 leading-relaxed">
              {toast.message}
            </p>

            {toast.actions && toast.actions.length > 0 && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-800/60">
                {toast.actions.map((act, idx) => (
                  <a
                    key={idx}
                    href={act.target}
                    onClick={() => dismissToast(toast.id)}
                    className="text-[11px] font-medium text-[#58A6FF] hover:underline hover:text-blue-300 transition-colors"
                  >
                    {act.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => dismissToast(toast.id)}
            className="text-gray-400 hover:text-gray-200 transition-colors p-0.5 rounded hover:bg-gray-800/50"
            title="Desestimar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
