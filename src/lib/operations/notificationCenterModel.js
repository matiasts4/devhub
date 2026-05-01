import { mergeOperationalEvents } from '@/lib/operations/events';

function dedupeOperationalEvents(operationalEvents = []) {
  const keyedEvents = operationalEvents.filter((event) => event?.dedupe_key);
  const unkeyedEvents = operationalEvents.filter((event) => !event?.dedupe_key);

  return [
    ...mergeOperationalEvents([], keyedEvents, {
      limit: keyedEvents.length || 50,
    }),
    ...unkeyedEvents,
  ];
}

export function buildNotificationCenterModel({
  deadlineAlerts = [],
  operationalEvents = [],
  healthSnapshot = { summary: null, sources: [] },
} = {}) {
  const dedupedOperationalEvents = dedupeOperationalEvents(operationalEvents);

  return {
    unreadCount: deadlineAlerts.length + dedupedOperationalEvents.length,
    deadlineAlerts,
    operationalEvents: dedupedOperationalEvents,
    healthSources: healthSnapshot.sources || [],
  };
}
