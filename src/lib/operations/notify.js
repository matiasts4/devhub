import { createOperationalEvent } from '@/lib/operations/contracts';

async function loadTauriNotificationModule() {
  if (typeof window === 'undefined') return null;

  try {
    return await import('@tauri-apps/plugin-notification');
  } catch {
    return null;
  }
}

async function defaultIsDesktopAvailable() {
  const notificationModule = await loadTauriNotificationModule();
  return Boolean(notificationModule?.sendNotification);
}

async function defaultRequestPermission() {
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
        await sendNotification({ title: event.title, body: event.body });
        desktop.status = 'delivered';
      }
    }
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
