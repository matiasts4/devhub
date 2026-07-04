/**
 * terminalScrollbackStore.test.js — TDD tests for the v2 ring buffer.
 *
 * Pure unit tests (no PTY, no WebSocket). Covers append/read, circular
 * eviction, monotonic offset, 2 MiB cap, and read-from-offset deltas.
 */

const { createScrollbackStore } = require('../terminalScrollbackStore.js');

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024;

describe('terminalScrollbackStore', () => {
  test('append returns monotonically increasing offsets', () => {
    const store = createScrollbackStore('term-a');

    const r1 = store.append('hello');
    expect(r1).toEqual({ startOffset: 0, endOffset: 5 });

    const r2 = store.append(' ');
    expect(r2).toEqual({ startOffset: 5, endOffset: 6 });

    const r3 = store.append('world');
    expect(r3).toEqual({ startOffset: 6, endOffset: 11 });

    expect(store.getOffset()).toBe(11);
  });

  test('read returns the full buffer when fromOffset is before the window', () => {
    const store = createScrollbackStore('term-b');
    store.append('first');
    store.append('second');

    expect(store.read(0)).toBe('firstsecond');
    expect(store.read(-100)).toBe('firstsecond');
  });

  test('read returns only data written since the requested offset', () => {
    const store = createScrollbackStore('term-c');
    store.append('alpha');
    const { endOffset } = store.append('beta');

    expect(store.read(5)).toBe('beta');
    expect(store.read(endOffset)).toBe('');
  });

  test('read clamps to the current buffer window after eviction', () => {
    const store = createScrollbackStore('term-d', { maxSize: 10 });
    store.append('0123456789'); // fills buffer, offset 0..10
    store.append('AB'); // should evict oldest 2 bytes, keep "23456789AB"

    expect(store.getSize()).toBe(10);
    expect(store.read(0)).toBe('23456789AB');
    expect(store.read(8)).toBe('89AB');
  });

  test('drops oldest bytes when a single append exceeds the cap', () => {
    const store = createScrollbackStore('term-e', { maxSize: 8 });
    const result = store.append('0123456789ABCDEF'); // 16 bytes, keep last 8

    expect(result.endOffset - result.startOffset).toBe(16);
    expect(store.getSize()).toBe(8);
    expect(store.read(result.startOffset)).toBe('89ABCDEF');
  });

  test('enforces the default 2 MiB cap', () => {
    const store = createScrollbackStore('term-f');
    const chunk = 'x'.repeat(1024 * 1024); // 1 MiB

    store.append(chunk);
    expect(store.getSize()).toBe(1024 * 1024);

    store.append(chunk);
    expect(store.getSize()).toBe(DEFAULT_MAX_SIZE);

    store.append(chunk);
    expect(store.getSize()).toBe(DEFAULT_MAX_SIZE);
  });

  test('clear empties the buffer without resetting the monotonic offset', () => {
    const store = createScrollbackStore('term-g');
    store.append('before');
    const offsetBefore = store.getOffset();

    store.clear();

    expect(store.getSize()).toBe(0);
    expect(store.getOffset()).toBe(offsetBefore);
    expect(store.read(0)).toBe('');

    const after = store.append('after');
    expect(after.startOffset).toBe(offsetBefore);
    expect(store.read(offsetBefore)).toBe('after');
  });

  test('empty append does not advance the offset', () => {
    const store = createScrollbackStore('term-empty');
    store.append('data');
    const offset = store.getOffset();

    expect(store.append('')).toEqual({ startOffset: offset, endOffset: offset });
    expect(store.getOffset()).toBe(offset);
  });

  test('accepts Buffer input and converts to utf-8', () => {
    const store = createScrollbackStore('term-buffer');
    store.append(Buffer.from('buffer-data'));

    expect(store.read(0)).toBe('buffer-data');
  });

  test('read from a future offset returns empty string', () => {
    const store = createScrollbackStore('term-future');
    store.append('present');

    expect(store.read(store.getOffset() + 1)).toBe('');
  });

  test('returns base64-encoded data when requested', () => {
    const store = createScrollbackStore('term-h');
    store.append('hello\x00world');

    const encoded = store.read(0, { encoding: 'base64' });
    expect(Buffer.from(encoded, 'base64').toString()).toBe('hello\x00world');
  });
});
