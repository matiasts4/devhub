const {
  clearPanelInitialCommandLifecycle,
  getPanelInitialCommandDispatch,
  markPanelInitialCommandDispatched,
  shouldSkipRedundantInitialCommandSend,
} = require('../panelInitialCommandLifecycle');

describe('panelInitialCommandLifecycle', () => {
  beforeEach(() => {
    clearPanelInitialCommandLifecycle('p1');
    clearPanelInitialCommandLifecycle('p2');
  });

  test('skips when the same command was already dispatched for the panel', () => {
    markPanelInitialCommandDispatched('p1', 'grok');
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'grok',
      })
    ).toBe(true);
  });

  test('skips opencode session upgrade after plain opencode was dispatched', () => {
    markPanelInitialCommandDispatched('p1', 'opencode');
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'opencode --session ses_abc',
      })
    ).toBe(true);
  });

  test('allows opencode session resume after bash wrapper was dispatched', () => {
    markPanelInitialCommandDispatched('p1', 'bash /tmp/devhub-launch-launch-1-zed.sh');
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'opencode --session ses_abc',
      })
    ).toBe(false);
  });

  test('allows recovery relaunch even when command was dispatched before', () => {
    markPanelInitialCommandDispatched('p1', 'opencode --session ses_abc');
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'opencode --session ses_abc #recovery-123',
        isRecoveryRelaunch: true,
      })
    ).toBe(false);
  });

  test('skips repeated materialized swarm launch wrapper commands', () => {
    markPanelInitialCommandDispatched('p1', 'bash /tmp/devhub-launch-launch-1-zed.sh');
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'bash /tmp/devhub-launch-launch-1-zed.sh',
      })
    ).toBe(true);
  });

  test('skips when server reports session reattach', () => {
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p2',
        command: 'opencode',
        sessionReattached: true,
      })
    ).toBe(true);
  });

  test('clears lifecycle on explicit panel close', () => {
    markPanelInitialCommandDispatched('p1', 'grok');
    clearPanelInitialCommandLifecycle('p1');
    expect(getPanelInitialCommandDispatch('p1')).toBeNull();
    expect(
      shouldSkipRedundantInitialCommandSend({
        panelId: 'p1',
        command: 'grok',
      })
    ).toBe(false);
  });
});
