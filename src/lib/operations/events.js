export const STORAGE_KEY = 'devhub:operational-events';
export const EVENT_NAME = 'devhub:operational-event';
const DEFAULT_LIMIT = 50;

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
  const ms = new Date(event?.occurred_at || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function mergeOperationalEvents(
  existing = [],
  incoming = [],
  { limit = DEFAULT_LIMIT } = {}
) {
  const merged = new Map();

  [...existing, ...incoming].forEach((event) => {
    if (!event?.dedupe_key) return;
    const previous = merged.get(event.dedupe_key);
    if (!previous || getEventSortValue(event) >= getEventSortValue(previous)) {
      merged.set(event.dedupe_key, event);
    }
  });

  return [...merged.values()]
    .sort((left, right) => getEventSortValue(right) - getEventSortValue(left))
    .slice(0, limit);
}

export function readOperationalEvents({ storage, projectId } = {}) {
  const target = getStorage(storage);
  const events = parseEvents(target?.getItem(STORAGE_KEY));

  if (!projectId) return events;
  return events.filter((event) => event?.metadata?.project_id === projectId);
}

export function persistOperationalEvent(
  event,
  { storage, dispatch = false, limit = DEFAULT_LIMIT } = {}
) {
  const target = getStorage(storage);
  const existing = readOperationalEvents({ storage: target });
  const merged = mergeOperationalEvents(existing, [event], { limit });

  target?.setItem(STORAGE_KEY, JSON.stringify(merged));

  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
  }

  return merged;
}
