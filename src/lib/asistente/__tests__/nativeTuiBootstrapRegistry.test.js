/**
 * @jest-environment node
 */

const {
  reserveNativeTuiBootstrap,
  consumeNativeTuiBootstrap,
  peekNativeTuiBootstrap,
  markNativeTuiBootstrapDone,
  isNativeTuiBootstrapDone,
  clearNativeTuiBootstrapRegistry,
} = require('../nativeTuiBootstrapRegistry');

describe('nativeTuiBootstrapRegistry', () => {
  beforeEach(() => {
    clearNativeTuiBootstrapRegistry();
  });

  test('reserve and consume once', () => {
    expect(reserveNativeTuiBootstrap('p1', { text: 'hello', program: 'grok' })).toBe(true);
    expect(peekNativeTuiBootstrap('p1')?.text).toBe('hello');
    const row = consumeNativeTuiBootstrap('p1');
    expect(row.text).toBe('hello');
    expect(row.program).toBe('grok');
    expect(consumeNativeTuiBootstrap('p1')).toBeNull();
  });

  test('rejects empty text', () => {
    expect(reserveNativeTuiBootstrap('p1', { text: '  ' })).toBe(false);
  });

  test('markDone prevents further reserve/consume', () => {
    reserveNativeTuiBootstrap('p2', { text: 'a' });
    markNativeTuiBootstrapDone('p2');
    expect(isNativeTuiBootstrapDone('p2')).toBe(true);
    expect(reserveNativeTuiBootstrap('p2', { text: 'b' })).toBe(false);
    expect(consumeNativeTuiBootstrap('p2')).toBeNull();
  });
});
