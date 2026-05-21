const {
  EVENT_NAME,
  mergeOperationalEvents,
  persistOperationalEvent,
  readOperationalEvents,
} = require('../../src/lib/operations/events');

describe('operations event feed', () => {
  test('dedupes canonical events by dedupe key keeping the latest payload', () => {
    const result = mergeOperationalEvents(
      [
        {
          id: 'old',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: '2026-04-10T17:00:00.000Z',
          title: 'Old failure',
        },
      ],
      [
        {
          id: 'new',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: '2026-04-10T17:01:00.000Z',
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
        occurred_at: '2026-04-10T17:02:00.000Z',
        metadata: { project_id: 'project-a' },
      },
      { storage }
    );
    persistOperationalEvent(
      {
        id: 'evt-2',
        dedupe_key: 'agenthub:subagent.completed:2',
        occurred_at: '2026-04-10T17:03:00.000Z',
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
});
