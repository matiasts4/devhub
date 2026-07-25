/**
 * @jest-environment jsdom
 */

const {
  hasTerminalConnectedOnce,
  markTerminalConnectedOnce,
  clearTerminalConnectedOnce,
  TERMINAL_CONNECTED_ONCE_MAX_PANELS,
  _resetTerminalConnectedOnceForTests,
} = require('../terminalConnectedOnceRegistry');

describe('terminalConnectedOnceRegistry', () => {
  beforeEach(() => {
    _resetTerminalConnectedOnceForTests();
  });

  test('unknown panels report not connected', () => {
    expect(hasTerminalConnectedOnce('p-nope')).toBe(false);
    expect(hasTerminalConnectedOnce(null)).toBe(false);
    expect(hasTerminalConnectedOnce('')).toBe(false);
  });

  test('mark then has; clear drops the record', () => {
    markTerminalConnectedOnce('p-1');
    expect(hasTerminalConnectedOnce('p-1')).toBe(true);
    markTerminalConnectedOnce('p-1');
    expect(hasTerminalConnectedOnce('p-1')).toBe(true);
    clearTerminalConnectedOnce('p-1');
    expect(hasTerminalConnectedOnce('p-1')).toBe(false);
  });

  test('mark ignores falsy ids', () => {
    markTerminalConnectedOnce(null);
    markTerminalConnectedOnce('');
    expect(hasTerminalConnectedOnce(null)).toBe(false);
  });

  test('FIFO cap evicts the oldest ids so the map cannot leak', () => {
    const overflow = 5;
    for (let i = 0; i < TERMINAL_CONNECTED_ONCE_MAX_PANELS + overflow; i += 1) {
      markTerminalConnectedOnce(`p-${i}`);
    }
    for (let i = 0; i < overflow; i += 1) {
      expect(hasTerminalConnectedOnce(`p-${i}`)).toBe(false);
    }
    expect(hasTerminalConnectedOnce(`p-${overflow}`)).toBe(true);
    expect(hasTerminalConnectedOnce(`p-${TERMINAL_CONNECTED_ONCE_MAX_PANELS + overflow - 1}`)).toBe(
      true
    );
  });
});
