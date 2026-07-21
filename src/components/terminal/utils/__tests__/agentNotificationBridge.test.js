const {
  handleAgentStateTransition,
  resetAgentNotificationBridgeState,
} = require('../agentNotificationBridge');
const { dispatchOperationalNotification } = require('@/lib/operations/notify');
const { playNotificationSound } = require('@/lib/notifications/soundEffects');

jest.mock('@/lib/operations/notify', () => ({
  dispatchOperationalNotification: jest.fn().mockResolvedValue({ status: 'sent' }),
}));

jest.mock('@/lib/notifications/soundEffects', () => ({
  playNotificationSound: jest.fn(),
}));

describe('agentNotificationBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAgentNotificationBridgeState();
  });

  test('emits warning notification and sound when transition is running -> blocked', () => {
    handleAgentStateTransition('panel-1', 'idle', 'running', { agentType: 'agy' });
    handleAgentStateTransition('panel-1', 'running', 'blocked', { agentType: 'agy' });

    expect(playNotificationSound).toHaveBeenCalledWith('warning');
    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Anti Gravity requiere atención',
        severity: 'warning',
        category: 'agents',
        entity_id: 'panel-1',
      })
    );
  });

  test('emits info notification when running for at least 3 seconds before idle', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-2', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(3500);
    handleAgentStateTransition('panel-2', 'running', 'idle', { agentType: 'kimi' });

    expect(playNotificationSound).toHaveBeenCalledWith('info');
    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimiko D completó su respuesta',
        severity: 'info',
        category: 'agents',
        entity_id: 'panel-2',
      })
    );

    jest.useRealTimers();
  });

  test('emits cancellation notification when wasCancelled is true', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-5', 'idle', 'running', { agentType: 'agy' });
    jest.advanceTimersByTime(3500);
    handleAgentStateTransition('panel-5', 'running', 'idle', { agentType: 'agy', wasCancelled: true });

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Anti Gravity — Respuesta cancelada',
        severity: 'info',
        category: 'agents',
        entity_id: 'panel-5',
      })
    );

    jest.useRealTimers();
  });

  test('suppresses notification for transient flickers (< 3s running duration)', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-3', 'idle', 'running', { agentType: 'agy' });
    jest.advanceTimersByTime(1000); // Only 1 second of running
    handleAgentStateTransition('panel-3', 'running', 'idle', { agentType: 'agy' });

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(dispatchOperationalNotification).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('does not emit notification when state does not change', () => {
    handleAgentStateTransition('panel-4', 'running', 'running', { agentType: 'opencode' });

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(dispatchOperationalNotification).not.toHaveBeenCalled();
  });
});
