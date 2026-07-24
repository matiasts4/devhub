import { createOperationalEvent } from '@/lib/operations/contracts';

export const STORAGE_KEY = 'devhub:operational-events';
export const EVENT_NAME = 'devhub:operational-event';
const DEFAULT_LIMIT = 200;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function getStorage(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function parseEvents(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getEventSortValue(event) {
  const ms = new Date(event?.occurred_at || event?.created_at || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function applyRetentionPolicy(events = [], limit = DEFAULT_LIMIT) {
  const now = Date.now();
  // N8: retention applies to ALL events including unread ones. Previously
  // unread events never expired, so accumulated spam (e.g. stale agent
  // notifications) filled the cap and evicted fresh events. The list is
  // sorted by recency before slicing, so eviction is always oldest-first.
  const filtered = events.filter((item) => {
    const age = now - getEventSortValue(item);
    return age <= RETENTION_MS;
  });

  return filtered
    .sort((left, right) => getEventSortValue(right) - getEventSortValue(left))
    .slice(0, limit);
}

export function mergeOperationalEvents(
  existing = [],
  incoming = [],
  { limit = DEFAULT_LIMIT } = {}
) {
  const merged = new Map();

  [...existing, ...incoming].forEach((rawEvent) => {
    const event = createOperationalEvent(rawEvent);
    if (!event.dedupe_key) return;

    const previous = merged.get(event.dedupe_key);
    if (!previous) {
      merged.set(event.dedupe_key, event);
    } else {
      const isNewer = getEventSortValue(event) >= getEventSortValue(previous);
      const updatedCount = (previous.occurrence_count || 1) + 1;

      merged.set(event.dedupe_key, {
        ...(isNewer ? event : previous),
        occurrence_count: updatedCount,
        read_at: isNewer ? event.read_at : previous.read_at,
      });
    }
  });

  return applyRetentionPolicy([...merged.values()], limit);
}

export function readOperationalEvents({ storage, projectId, category, unreadOnly = false } = {}) {
  const target = getStorage(storage);
  const events = parseEvents(target?.getItem(STORAGE_KEY)).map((item) =>
    createOperationalEvent(item)
  );

  let result = events;
  if (projectId) {
    result = result.filter((event) => event?.metadata?.project_id === projectId);
  }
  if (category && category !== 'all') {
    result = result.filter((event) => event?.category === category);
  }
  if (unreadOnly) {
    result = result.filter((event) => !event?.read_at);
  }

  return result;
}

export function persistOperationalEvent(
  eventInput,
  { storage, dispatch = true, limit = DEFAULT_LIMIT } = {}
) {
  const target = getStorage(storage);
  const event = createOperationalEvent(eventInput);
  const existing = readOperationalEvents({ storage: target });
  const merged = mergeOperationalEvents(existing, [event], { limit });

  target?.setItem(STORAGE_KEY, JSON.stringify(merged));

  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
  }

  return merged;
}

export function markOperationalEventAsRead(eventId, { storage, dispatch = true } = {}) {
  const target = getStorage(storage);
  const existing = readOperationalEvents({ storage: target });
  let modified = false;

  const updated = existing.map((item) => {
    if (item.id === eventId && !item.read_at) {
      modified = true;
      return { ...item, read_at: new Date().toISOString() };
    }
    return item;
  });

  if (modified) {
    target?.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (dispatch && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, { detail: { action: 'mark_read', id: eventId } })
      );
    }
  }

  return updated;
}

export function markAllOperationalEventsAsRead({ storage, category, dispatch = true } = {}) {
  const target = getStorage(storage);
  const existing = readOperationalEvents({ storage: target });
  const nowIso = new Date().toISOString();

  const updated = existing.map((item) => {
    if (!item.read_at && (!category || category === 'all' || item.category === category)) {
      return { ...item, read_at: nowIso };
    }
    return item;
  });

  target?.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { action: 'mark_all_read', category } })
    );
  }

  return updated;
}

export function clearOperationalEvents({ storage, category, dispatch = true } = {}) {
  const target = getStorage(storage);
  const existing = readOperationalEvents({ storage: target });
  const updated =
    category && category !== 'all' ? existing.filter((item) => item.category !== category) : [];

  target?.setItem(STORAGE_KEY, JSON.stringify(updated));
  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { action: 'clear', category } }));
  }

  return updated;
}
