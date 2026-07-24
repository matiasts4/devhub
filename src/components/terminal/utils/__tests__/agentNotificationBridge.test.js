const {
  handleAgentStateTransition,
  resetAgentNotificationBridgeState,
} = require('../agentNotificationBridge');
const { dispatchOperationalNotification } = require('@/lib/operations/notify');

jest.mock('@/lib/operations/notify', () => ({
  dispatchOperationalNotification: jest.fn().mockResolvedValue({ status: 'sent' }),
}));

describe('agentNotificationBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAgentNotificationBridgeState();
  });

  test('emits warning notification when transition is running -> blocked', () => {
    handleAgentStateTransition('panel-1', 'idle', 'running', { agentType: 'agy' });
    handleAgentStateTransition('panel-1', 'running', 'blocked', { agentType: 'agy' });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Anti Gravity requiere atención',
        severity: 'warning',
        category: 'agents',
        entity_id: 'panel-1',
        dedupe_key: 'agent:blocked:panel-1',
      })
    );
  });

  test('N6: emits blocked notification from idle (flaky scraping case)', () => {
    // Permission prompt arrives while last known state was idle — must still notify.
    handleAgentStateTransition('panel-6', 'idle', 'blocked', { agentType: 'agy' });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Anti Gravity requiere atención',
        severity: 'warning',
        entity_id: 'panel-6',
      })
    );
  });

  test('N6: emits blocked notification from null/unknown previous state', () => {
    handleAgentStateTransition('panel-7', null, 'blocked', { agentType: 'kimi' });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimiko D requiere atención',
        severity: 'warning',
        entity_id: 'panel-7',
      })
    );
  });

  test('N1: bridge never plays sound (ToastStack owns sound)', () => {
    handleAgentStateTransition('panel-8', 'idle', 'running', { agentType: 'agy' });
    handleAgentStateTransition('panel-8', 'running', 'blocked', { agentType: 'agy' });

    // The bridge module no longer imports soundEffects at all.
    const bridgeSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'agentNotificationBridge.js'),
      'utf8'
    );
    expect(bridgeSource).not.toContain('playNotificationSound');
  });

  test('emits info notification when running for at least 3 seconds before idle', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-2', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(3500);
    handleAgentStateTransition('panel-2', 'running', 'idle', { agentType: 'kimi' });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimiko D completó su respuesta',
        severity: 'info',
        category: 'agents',
        entity_id: 'panel-2',
        dedupe_key: 'agent:done:panel-2',
      })
    );

    jest.useRealTimers();
  });

  test('emits cancellation notification when wasCancelled is true', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-5', 'idle', 'running', { agentType: 'agy' });
    jest.advanceTimersByTime(3500);
    handleAgentStateTransition('panel-5', 'running', 'idle', {
      agentType: 'agy',
      wasCancelled: true,
    });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Anti Gravity — Respuesta cancelada',
        severity: 'info',
        category: 'agents',
        entity_id: 'panel-5',
        dedupe_key: 'agent:cancelled:panel-5',
      })
    );

    jest.useRealTimers();
  });

  test('suppresses notification for transient flickers (< 3s running duration)', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-3', 'idle', 'running', { agentType: 'agy' });
    jest.advanceTimersByTime(1000); // Only 1 second of running
    handleAgentStateTransition('panel-3', 'running', 'idle', { agentType: 'agy' });

    expect(dispatchOperationalNotification).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('does not emit notification when state does not change', () => {
    handleAgentStateTransition('panel-4', 'running', 'running', { agentType: 'opencode' });

    expect(dispatchOperationalNotification).not.toHaveBeenCalled();
  });

  test('N3: blocked notifications within cooldown are deduped', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-9', 'idle', 'blocked', { agentType: 'agy' });
    handleAgentStateTransition('panel-9', 'blocked', 'working', { agentType: 'agy' });
    handleAgentStateTransition('panel-9', 'working', 'blocked', { agentType: 'agy' });

    // Second blocked within the 10s cooldown is suppressed.
    expect(dispatchOperationalNotification).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(11000);
    handleAgentStateTransition('panel-9', 'working', 'blocked', { agentType: 'agy' });
    expect(dispatchOperationalNotification).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
