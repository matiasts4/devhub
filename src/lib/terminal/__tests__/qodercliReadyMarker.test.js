const { detectQodercliTuiReady } = require('../../../../sidecar-backend/qodercliReadyMarker');

describe('qodercliReadyMarker — output-based TUI detection', () => {
  test('detects "? for shortcuts" idle footer', () => {
    expect(detectQodercliTuiReady('  ? for shortcuts\n> ')).toBe(true);
  });

  test('detects "qodercli>" prompt', () => {
    expect(detectQodercliTuiReady('qodercli> ')).toBe(true);
  });

  test('detects "qoder>" prompt', () => {
    expect(detectQodercliTuiReady('  qoder> ')).toBe(true);
  });

  test('detects "esc to interrupt" working footer', () => {
    expect(detectQodercliTuiReady('  esc to interrupt\n⠋ Thinking...')).toBe(true);
  });

  test('detects "ctrl+c to cancel" working footer', () => {
    expect(detectQodercliTuiReady('ctrl+c to cancel')).toBe(true);
  });

  test('detects permission prompt', () => {
    expect(detectQodercliTuiReady('Do you want to proceed? [y/n]')).toBe(true);
  });

  test('detects OSC title with qoder', () => {
    expect(detectQodercliTuiReady('\x1b]0;qodercli\x07')).toBe(true);
  });

  test('returns false for plain bash output', () => {
    expect(detectQodercliTuiReady('$ ls -la\ntotal 42\ndrwxr-xr-x 1 user')).toBe(false);
  });

  test('returns false for empty/null input', () => {
    expect(detectQodercliTuiReady('')).toBe(false);
    expect(detectQodercliTuiReady(null)).toBe(false);
    expect(detectQodercliTuiReady(undefined)).toBe(false);
  });

  test('does NOT match bare ">" (bash PS2)', () => {
    expect(detectQodercliTuiReady('> ')).toBe(false);
    expect(detectQodercliTuiReady('  > continuation line')).toBe(false);
  });
});
