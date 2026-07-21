import {
  clearOperationalEvents,
  EVENT_NAME,
  markAllOperationalEventsAsRead,
  markOperationalEventAsRead,
  persistOperationalEvent,
  readOperationalEvents,
  STORAGE_KEY,
} from '@/lib/operations/events';

export const NOTIFICATION_STORAGE_KEY = STORAGE_KEY;
export const NOTIFICATION_EVENT_NAME = EVENT_NAME;

export function readNotifications(opts) {
  return readOperationalEvents(opts);
}

export function publishNotification(payload, opts) {
  const merged = persistOperationalEvent(payload, opts);
  const dedupeKey = payload.dedupe_key;
  const notification = dedupeKey
    ? merged.find((item) => item.dedupe_key === dedupeKey) || merged[0]
    : merged[0] || null;
  return { notification, notifications: merged };
}

export function markAsRead(id, opts) {
  return markOperationalEventAsRead(id, opts);
}

export function markAllAsRead(opts) {
  return markAllOperationalEventsAsRead(opts);
}

export function deleteNotification(id, opts) {
  return clearOperationalEvents({ ...opts, id });
}

export function clearNotifications(opts) {
  return clearOperationalEvents(opts);
}

export function getUnreadCount(opts = {}) {
  return readOperationalEvents({ ...opts, unreadOnly: true }).length;
}
