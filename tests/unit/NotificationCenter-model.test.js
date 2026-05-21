const {
  buildNotificationCenterModel,
} = require('../../src/lib/operations/notificationCenterModel');

describe('NotificationCenter model', () => {
  test('counts deadline and operational alerts together while keeping sections separate', () => {
    const model = buildNotificationCenterModel({
      deadlineAlerts: [{ id: 'task-1', title: 'Urgent deadline' }],
      operationalEvents: [{ id: 'evt-1', title: 'Claude failed' }],
      healthSnapshot: { sources: [{ key: 'mcp', label: 'MCP' }] },
    });

    expect(model.unreadCount).toBe(2);
    expect(model.deadlineAlerts).toEqual([expect.objectContaining({ title: 'Urgent deadline' })]);
    expect(model.operationalEvents).toEqual([expect.objectContaining({ title: 'Claude failed' })]);
    expect(model.healthSources).toEqual([expect.objectContaining({ key: 'mcp' })]);
  });

  test('dedupes operational alerts by canonical event identity before counting unread items', () => {
    const model = buildNotificationCenterModel({
      deadlineAlerts: [{ id: 'task-1', title: 'Urgent deadline' }],
      operationalEvents: [
        {
          id: 'evt-old',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: '2026-04-10T17:00:00.000Z',
          title: 'Older failure',
        },
        {
          id: 'evt-new',
          dedupe_key: 'agenthub:subagent.failed:session-1',
          occurred_at: '2026-04-10T17:05:00.000Z',
          title: 'Newest failure',
        },
      ],
    });

    expect(model.unreadCount).toBe(2);
    expect(model.operationalEvents).toEqual([
      expect.objectContaining({ id: 'evt-new', title: 'Newest failure' }),
    ]);
  });
});
