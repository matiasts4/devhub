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
        title: 'Antigravity requiere atención',
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
        title: 'Antigravity requiere atención',
        severity: 'warning',
        entity_id: 'panel-6',
      })
    );
  });

  test('N6: emits blocked notification from null/unknown previous state', () => {
    handleAgentStateTransition('panel-7', null, 'blocked', { agentType: 'kimi' });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimi Code requiere atención',
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
        title: 'Kimi Code completó su respuesta',
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
        title: 'Antigravity — Respuesta cancelada',
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

  // ─── DONE-EVIDENCE-01: evidence-gated "done" notifications ────────────────

  test("DONE-EVIDENCE: silence-based 'quiescence' idle does NOT notify done", () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q1', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(30000);
    handleAgentStateTransition('panel-q1', 'running', 'idle', {
      agentType: 'kimi',
      reason: 'quiescence',
    });

    expect(dispatchOperationalNotification).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test("DONE-EVIDENCE: 'quiescence-confirmed' idle notifies done (hook-less fallback)", () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q2', 'idle', 'running', { agentType: 'grok' });
    jest.advanceTimersByTime(30000);
    handleAgentStateTransition('panel-q2', 'running', 'idle', {
      agentType: 'grok',
      reason: 'quiescence-confirmed',
    });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Grok completó su respuesta',
        entity_id: 'panel-q2',
      })
    );

    jest.useRealTimers();
  });

  test('DONE-EVIDENCE: hook:Stop reason notifies done', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q3', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(30000);
    handleAgentStateTransition('panel-q3', 'running', 'idle', {
      agentType: 'kimi',
      reason: 'hook:Stop',
    });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimi Code completó su respuesta',
        entity_id: 'panel-q3',
      })
    );

    jest.useRealTimers();
  });

  test('DONE-EVIDENCE: hook:Interrupt reason routes to cancelled notification', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q4', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(30000);
    handleAgentStateTransition('panel-q4', 'running', 'idle', {
      agentType: 'kimi',
      reason: 'hook:Interrupt',
    });

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimi Code — Respuesta cancelada',
        entity_id: 'panel-q4',
      })
    );

    jest.useRealTimers();
  });

  test('DONE-EVIDENCE: reason-upgrade idle->idle with hook:Stop notifies exactly once', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q5', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(30000);
    // Stage-1 quiescence: badge flips, no notification.
    handleAgentStateTransition('panel-q5', 'running', 'idle', {
      agentType: 'kimi',
      reason: 'quiescence',
    });
    expect(dispatchOperationalNotification).not.toHaveBeenCalled();

    // The real Stop arrives later as a same-state reason upgrade.
    jest.advanceTimersByTime(2000);
    handleAgentStateTransition('panel-q5', 'idle', 'idle', {
      agentType: 'kimi',
      reason: 'hook:Stop',
      reasonChanged: true,
    });

    expect(dispatchOperationalNotification).toHaveBeenCalledTimes(1);
    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kimi Code completó su respuesta',
        entity_id: 'panel-q5',
      })
    );

    jest.useRealTimers();
  });

  test('DONE-EVIDENCE: unknown non-evidence reason does not notify done', () => {
    jest.useFakeTimers();

    handleAgentStateTransition('panel-q6', 'idle', 'running', { agentType: 'kimi' });
    jest.advanceTimersByTime(30000);
    handleAgentStateTransition('panel-q6', 'running', 'idle', {
      agentType: 'kimi',
      reason: 'manifest',
    });

    expect(dispatchOperationalNotification).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
