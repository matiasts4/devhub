import { createOperationalEvent } from '@/lib/operations/contracts';
import { persistOperationalEvent, EVENT_NAME } from '@/lib/operations/events';
import { invokeDesktop, isElectronDesktop } from '@/lib/desktop/desktopBridge';

async function loadTauriNotificationModule() {
  if (typeof window === 'undefined') return null;

  try {
    return await import('@tauri-apps/plugin-notification');
  } catch {
    return null;
  }
}

async function defaultIsDesktopAvailable() {
  if (isElectronDesktop()) return true;

  const notificationModule = await loadTauriNotificationModule();
  return Boolean(notificationModule?.sendNotification);
}

async function defaultRequestPermission() {
  if (isElectronDesktop()) {
    const result = await invokeDesktop(
      'notify_request_permission',
      {},
      {
        failureShape: { permission: 'unavailable' },
        tauriWrapRequest: false,
      }
    );
    if (typeof result === 'string') return result;
    if (result?.permission) return result.permission;
    return 'granted';
  }

  const notificationModule = await loadTauriNotificationModule();
  if (!notificationModule) return 'unavailable';

  if (typeof notificationModule.isPermissionGranted === 'function') {
    const granted = await notificationModule.isPermissionGranted();
    if (granted) return 'granted';
  }

  if (typeof notificationModule.requestPermission === 'function') {
    return notificationModule.requestPermission();
  }

  return 'unavailable';
}

async function defaultSendNotification(payload) {
  if (isElectronDesktop()) {
    const result = await invokeDesktop(
      'notify_show',
      {
        title: payload?.title,
        body: payload?.body,
      },
      {
        failureShape: { ok: false, reason: 'desktop-unavailable' },
        tauriWrapRequest: false,
      }
    );
    if (result?.ok === false || result?.reason === 'desktop-unavailable') {
      throw new Error(result?.reason || 'desktop notification unavailable');
    }
    return result;
  }

  const notificationModule = await loadTauriNotificationModule();
  if (!notificationModule?.sendNotification) {
    throw new Error('desktop notification unavailable');
  }

  return notificationModule.sendNotification(payload);
}

function normalizePermission(permission) {
  if (permission === true || permission === 'granted') return 'granted';
  if (permission === false || permission === 'denied') return 'denied';
  return permission || 'unavailable';
}

export async function dispatchOperationalNotification(eventInput = {}, dependencies = {}) {
  const event = createOperationalEvent(eventInput);
  const isDesktopAvailable = dependencies.isDesktopAvailable || defaultIsDesktopAvailable;
  const requestPermission = dependencies.requestPermission || defaultRequestPermission;
  const sendNotification = dependencies.sendNotification || defaultSendNotification;

  // NATIVE-ONLY-01: persist without dispatching — the window event fires
  // once, AFTER the native attempt, carrying desktop_status so the toast
  // stack can skip the duplicate in-app aviso when Windows already showed
  // the native notification.
  persistOperationalEvent(event, { storage: dependencies.storage, dispatch: false });

  const desktop = {
    event_id: event.id,
    status: 'skipped',
  };
  const inApp = {
    event_id: event.id,
    status: event.delivery.in_app ? 'ready' : 'skipped',
  };

  if (event.delivery.desktop) {
    const available = await isDesktopAvailable(event);

    if (!available) {
      desktop.status = 'unavailable';
    } else {
      const permission = normalizePermission(await requestPermission(event));

      if (permission !== 'granted') {
        desktop.status = permission;
      } else {
        try {
          await sendNotification({ title: event.title, body: event.body || event.message });
          desktop.status = 'delivered';
        } catch {
          desktop.status = 'error';
        }
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { ...event, desktop_status: desktop.status } })
    );
  }

  const finalStatus = desktop.status === 'delivered' ? 'delivered' : 'fallback';

  return {
    event: {
      ...event,
      status: finalStatus,
    },
    desktop,
    in_app: inApp,
  };
}
