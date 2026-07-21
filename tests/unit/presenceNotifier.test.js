const { PresenceNotifier, PRESENCE_STATES } = require('../../src/lib/operations/presenceNotifier');

describe('PresenceNotifier', () => {
  let dispatched;
  let mockDispatch;
  let notifier;

  beforeEach(() => {
    dispatched = [];
    mockDispatch = (event, opts) => {
      dispatched.push({ event, opts });
    };

    notifier = new PresenceNotifier({
      dispatchFn: mockDispatch,
      stalledTimeoutMs: 100,
      failedTimeoutMs: 200,
    });
  });

  test('registra latidos y detecta cambios de estado', () => {
    notifier.updatePresence('agent-1', PRESENCE_STATES.RUNNING, 'Ejecutando tarea');
    expect(dispatched).toHaveLength(1); // Transición de offline -> running

    notifier.updatePresence('agent-1', PRESENCE_STATES.BLOCKED, 'Esperando input');
    expect(dispatched).toHaveLength(2);
    expect(dispatched[1].event.title).toContain('Intervención');
    expect(dispatched[1].event.severity).toBe('warning');
  });

  test('evalúa automáticamente timeouts de latidos', () => {
    notifier.updatePresence('agent-2', PRESENCE_STATES.RUNNING, 'Trabajando');
    expect(notifier.getMonitoredAgents()[0].state).toBe(PRESENCE_STATES.RUNNING);

    // Simular paso del tiempo > 100ms
    notifier.agentRegistry.get('agent-2').lastSeenAt = Date.now() - 120;
    notifier.evaluateHeartbeats();

    expect(notifier.getMonitoredAgents()[0].state).toBe(PRESENCE_STATES.BLOCKED);

    // Simular paso del tiempo > 200ms
    notifier.agentRegistry.get('agent-2').lastSeenAt = Date.now() - 250;
    notifier.evaluateHeartbeats();

    expect(notifier.getMonitoredAgents()[0].state).toBe(PRESENCE_STATES.FAILED);
    const lastEvent = dispatched[dispatched.length - 1].event;
    expect(lastEvent.severity).toBe('critical');
  });

  test('notifica la finalización exitosa de una tarea por un agente', () => {
    notifier.updatePresence('agent-4', PRESENCE_STATES.RUNNING);
    dispatched = [];

    notifier.updatePresence('agent-4', PRESENCE_STATES.COMPLETED, 'Build exitoso');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].event.title).toContain('Tarea Completada');
    expect(dispatched[0].event.severity).toBe('info');
  });
});
