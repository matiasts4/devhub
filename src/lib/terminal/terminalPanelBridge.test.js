import {
  _clearAllTerminalPanelBridges,
  peekTerminalPanelBridge,
  stashTerminalPanelBridge,
  takeTerminalPanelBridge,
} from './terminalPanelBridge';

describe('terminalPanelBridge', () => {
  beforeEach(() => {
    _clearAllTerminalPanelBridges();
  });

  test('stash and take returns a snapshot once', () => {
    stashTerminalPanelBridge('panel-1', {
      buffer: 'hello',
      catchupPending: true,
      lastPtySize: { cols: 80, rows: 24 },
      host: 'workspace',
    });
    expect(peekTerminalPanelBridge('panel-1')?.buffer).toBe('hello');
    const taken = takeTerminalPanelBridge('panel-1');
    expect(taken?.buffer).toBe('hello');
    expect(peekTerminalPanelBridge('panel-1')).toBeNull();
  });
});
