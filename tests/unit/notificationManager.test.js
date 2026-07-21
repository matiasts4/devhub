const {
  NOTIFICATION_EVENT_NAME,
  NOTIFICATION_STORAGE_KEY,
  publishNotification,
  readNotifications,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  getUnreadCount,
} = require('../../src/lib/notifications/notificationManager');

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, val),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('notificationManager (Unified Operations Backend)', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  test('publica notificaciones y las ordena por timestamp descendente', () => {
    publishNotification(
      { title: 'Primera', body: 'Mensaje 1', category: 'agents', dedupe_key: 'agent:1', occurred_at: '2026-07-20T10:00:00.000Z' },
      { storage, dispatch: false }
    );
    publishNotification(
      { title: 'Segunda', body: 'Mensaje 2', category: 'tasks', dedupe_key: 'task:2', occurred_at: '2026-07-20T10:05:00.000Z' },
      { storage, dispatch: false }
    );

    const items = readNotifications({ storage });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Segunda'); // Más reciente primero
    expect(items[1].title).toBe('Primera');
  });

  test('deduplica notificaciones con el mismo dedupe_key dentro del engine unificado', () => {
    const { notification: first } = publishNotification(
      {
        title: 'Agente Stalled',
        body: 'El agente agent-01 no responde',
        category: 'agents',
        dedupe_key: 'presence:stalled:agent-01',
      },
      { storage, dispatch: false }
    );

    expect(first.occurrence_count).toBe(1);

    const { notification: second } = publishNotification(
      {
        title: 'Agente Stalled',
        body: 'El agente agent-01 no responde (reintento)',
        category: 'agents',
        dedupe_key: 'presence:stalled:agent-01',
      },
      { storage, dispatch: false }
    );

    expect(second.occurrence_count).toBe(2);

    const items = readNotifications({ storage });
    expect(items).toHaveLength(1);
  });

  test('marca notificaciones individuales como leídas y actualiza unreadCount', () => {
    const { notification: notif } = publishNotification(
      { title: 'Test', body: 'Prueba', category: 'system', dedupe_key: 'sys:1' },
      { storage, dispatch: false }
    );

    expect(getUnreadCount({ storage })).toBe(1);

    markAsRead(notif.id, { storage, dispatch: false });

    expect(getUnreadCount({ storage })).toBe(0);
  });

  test('marca todas las notificaciones de una categoría como leídas', () => {
    publishNotification({ title: 'A1', body: 'M1', category: 'agents', dedupe_key: 'agent:a1' }, { storage, dispatch: false });
    publishNotification({ title: 'T1', body: 'M2', category: 'tasks', dedupe_key: 'task:t1' }, { storage, dispatch: false });

    markAllAsRead({ storage, category: 'agents', dispatch: false });

    expect(getUnreadCount({ storage, category: 'agents' })).toBe(0);
    expect(getUnreadCount({ storage, category: 'tasks' })).toBe(1);
    expect(getUnreadCount({ storage })).toBe(1);
  });

  test('limpia notificaciones por categoría', () => {
    publishNotification({ title: 'N1', body: 'M1', category: 'agents', dedupe_key: 'agent:n1' }, { storage, dispatch: false });
    publishNotification({ title: 'N2', body: 'M2', category: 'tasks', dedupe_key: 'task:n2' }, { storage, dispatch: false });

    clearNotifications({ storage, category: 'tasks', dispatch: false });
    expect(readNotifications({ storage })).toHaveLength(1);
  });

  test('expone constantes de almacenamiento y eventos unificadas', () => {
    expect(NOTIFICATION_EVENT_NAME).toBe('devhub:operational-event');
    expect(NOTIFICATION_STORAGE_KEY).toBe('devhub:operational-events');
  });
});
