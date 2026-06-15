import { stashTerminalPanelBridge, takeTerminalPanelBridge } from './terminalPanelBridge';

describe('terminalPanelBridge', () => {
  test('stash and take returns a snapshot once', () => {
    stashTerminalPanelBridge('panel-1', {
      buffer: 'hello',
      catchupPending: true,
      lastPtySize: { cols: 80, rows: 24 },
      host: 'workspace',
    });
    const taken = takeTerminalPanelBridge('panel-1');
    expect(taken?.buffer).toBe('hello');
    expect(takeTerminalPanelBridge('panel-1')).toBeNull();
  });
});
