const { dispatchOperationalNotification } = require('../../src/lib/operations/notify');

describe('operations notify dispatcher', () => {
  test('marks desktop delivery as delivered when notification capability succeeds', async () => {
    const sendNotification = jest.fn().mockResolvedValue(undefined);

    const result = await dispatchOperationalNotification(
      {
        event_type: 'subagent.failed',
        severity: 'critical',
        source: 'agenthub',
        title: 'Claude failed',
        delivery: { desktop: true, in_app: true },
      },
      {
        isDesktopAvailable: async () => true,
        requestPermission: async () => 'granted',
        sendNotification,
      }
    );

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Claude failed' })
    );
    expect(result.desktop.status).toBe('delivered');
    expect(result.in_app.status).toBe('ready');
    expect(result.event.status).toBe('delivered');
  });

  test('falls back to in-app when desktop permission is denied', async () => {
    const sendNotification = jest.fn();

    const result = await dispatchOperationalNotification(
      {
        event_type: 'subagent.completed',
        severity: 'critical',
        source: 'agenthub',
        title: 'Claude finished',
        delivery: { desktop: true, in_app: true },
      },
      {
        isDesktopAvailable: async () => true,
        requestPermission: async () => 'denied',
        sendNotification,
      }
    );

    expect(sendNotification).not.toHaveBeenCalled();
    expect(result.desktop.status).toBe('denied');
    expect(result.in_app.status).toBe('ready');
    expect(result.event.status).toBe('fallback');
  });

  test('keeps a shared event identity for desktop and in-app channels', async () => {
    const result = await dispatchOperationalNotification(
      {
        event_type: 'subagent.failed',
        severity: 'critical',
        source: 'agenthub',
        title: 'Shared identity',
        delivery: { desktop: false, in_app: true },
        dedupe_parts: ['session-9'],
      },
      {
        isDesktopAvailable: async () => false,
      }
    );

    expect(result.desktop.event_id).toBe(result.in_app.event_id);
    expect(result.event.dedupe_key).toBe('agenthub:subagent.failed:session-9');
    expect(result.event.status).toBe('fallback');
  });
});
