const {
  buildNotificationCenterModel,
} = require('../../src/lib/operations/notificationCenterModel');

function renderNotificationCenterView(model) {
  const deadlineSection = model.deadlineAlerts.length
    ? model.deadlineAlerts.map((task) => `deadline:${task.title}`).join('|')
    : 'deadline:none';
  const opsSection = model.operationalEvents.length
    ? model.operationalEvents.map((event) => `ops:${event.title}:${event.status}`).join('|')
    : 'ops:none';
  const healthSection = model.healthSources.length
    ? model.healthSources.map((source) => `health:${source.label}:${source.status}`).join('|')
    : 'health:none';

  return [deadlineSection, opsSection, healthSection].join('\n');
}

describe('NotificationCenter view semantics', () => {
  test('keeps deadlines separated from operational alerts while combining unread count', () => {
    const model = buildNotificationCenterModel({
      deadlineAlerts: [{ id: 'task-1', title: 'Urgent deadline' }],
      operationalEvents: [{ id: 'evt-1', title: 'Claude failed', status: 'fallback' }],
      healthSnapshot: {
        sources: [{ key: 'mcp', label: 'MCP', status: 'stale' }],
      },
    });

    const view = renderNotificationCenterView(model);

    expect(model.unreadCount).toBe(2);
    expect(view).toContain('deadline:Urgent deadline');
    expect(view).toContain('ops:Claude failed:fallback');
    expect(view).toContain('health:MCP:stale');
  });

  test('renders explicit empty states for each section when no alerts exist', () => {
    const model = buildNotificationCenterModel({
      deadlineAlerts: [],
      operationalEvents: [],
      healthSnapshot: { sources: [] },
    });

    const view = renderNotificationCenterView(model);

    expect(model.unreadCount).toBe(0);
    expect(view).toContain('deadline:none');
    expect(view).toContain('ops:none');
    expect(view).toContain('health:none');
  });
});
