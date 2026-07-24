const {
  EVENT_NAME,
  mergeOperationalEvents,
  persistOperationalEvent,
  readOperationalEvents,
} = require('../../src/lib/operations/events');

describe('operations event feed', () => {
  // Use recent timestamps so events are not expired by the 7-day retention
  // policy (N8) that now applies to all events, including unread ones.
  const recentIso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

  test('dedupes canonical events by dedupe key keeping the latest payload', () => {
    const result = mergeOperationalEvents(
      [
        {
          id: 'old',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: recentIso(10),
          title: 'Old failure',
        },
      ],
      [
        {
          id: 'new',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: recentIso(5),
          title: 'New failure',
        },
      ]
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'new', title: 'New failure' });
  });

  test('persists project-scoped events and reads them back filtered by project', () => {
    const storage = (() => {
      const map = new Map();
      return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, value),
      };
    })();

    persistOperationalEvent(
      {
        id: 'evt-1',
        dedupe_key: 'agenthub:subagent.completed:1',
        occurred_at: recentIso(4),
        metadata: { project_id: 'project-a' },
      },
      { storage }
    );
    persistOperationalEvent(
      {
        id: 'evt-2',
        dedupe_key: 'agenthub:subagent.completed:2',
        occurred_at: recentIso(3),
        metadata: { project_id: 'project-b' },
      },
      { storage }
    );

    expect(readOperationalEvents({ storage, projectId: 'project-a' })).toEqual([
      expect.objectContaining({ id: 'evt-1' }),
    ]);
    expect(readOperationalEvents({ storage })).toHaveLength(2);
  });

  test('exposes a stable browser event name for in-app subscribers', () => {
    expect(EVENT_NAME).toBe('devhub:operational-event');
  });

  test('N8: retention expires stale events even when unread', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // > 7d
    const fresh = new Date().toISOString();

    const result = mergeOperationalEvents(
      [
        {
          id: 'stale-unread',
          dedupe_key: 'agent:blocked:panel-x',
          occurred_at: old,
          title: 'Stale blocked',
          read_at: null, // unread — previously never expired
        },
        {
          id: 'fresh-unread',
          dedupe_key: 'agent:blocked:panel-y',
          occurred_at: fresh,
          title: 'Fresh blocked',
          read_at: null,
        },
      ],
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'fresh-unread' });
  });
});
