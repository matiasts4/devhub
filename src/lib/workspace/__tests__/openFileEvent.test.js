/**
 * @jest-environment jsdom
 */

const {
  OPEN_FILE_EVENT,
  isValidOpenFileEvent,
  dispatchOpenFile,
  reservePendingOpenFile,
  consumePendingOpenFile,
  clearPendingOpenFiles,
} = require('../openFileEvent');

describe('openFileEvent', () => {
  beforeEach(() => {
    clearPendingOpenFiles();
  });

  test('isValidOpenFileEvent', () => {
    expect(isValidOpenFileEvent(null)).toBe(false);
    expect(isValidOpenFileEvent({})).toBe(false);
    expect(isValidOpenFileEvent({ path: '  ' })).toBe(false);
    expect(isValidOpenFileEvent({ path: 'src/a.js' })).toBe(true);
  });

  test('dispatchOpenFile fires CustomEvent', () => {
    const seen = [];
    window.addEventListener(OPEN_FILE_EVENT, (e) => seen.push(e.detail));
    expect(dispatchOpenFile({ path: 'src/a.js', line: 3 })).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('src/a.js');
    expect(seen[0].line).toBe(3);
  });

  test('dispatch rejects invalid', () => {
    expect(dispatchOpenFile({ path: '' })).toBe(false);
  });

  test('pending reserve/consume', () => {
    reservePendingOpenFile('ws1', { path: 'src/x.ts', line: 9 });
    expect(consumePendingOpenFile('ws1')).toMatchObject({ path: 'src/x.ts', line: 9 });
    expect(consumePendingOpenFile('ws1')).toBeNull();
  });
});
