/**
 * mouseTrackingDetector — generic DECSET/DECRST mouse-tracking observation.
 * Covers the native scroll-support fallback: any TUI that enables mouse
 * tracking (1000/1002/1003) declares its own SGR wheel capability.
 */

const { detectMouseTrackingChange } = require('../mouseTrackingDetector');

describe('mouseTrackingDetector', () => {
  test('detects DECSET 1000 (normal tracking) enable', () => {
    expect(detectMouseTrackingChange('banner\x1b[?1000htui chrome')).toBe(true);
  });

  test('detects DECSET 1002 (button motion) enable', () => {
    expect(detectMouseTrackingChange('\x1b[?1002h')).toBe(true);
  });

  test('detects DECSET 1003 (any motion) enable', () => {
    expect(detectMouseTrackingChange('\x1b[?1003h')).toBe(true);
  });

  test('detects combined sequence 1000;1006 (tracking + SGR extension)', () => {
    expect(detectMouseTrackingChange('\x1b[?1000;1006h')).toBe(true);
  });

  test('detects combined alt-screen + mouse sequence 1049;1000;1006', () => {
    expect(detectMouseTrackingChange('\x1b[?1049;1000;1006h')).toBe(true);
  });

  test('detects DECRST disable', () => {
    expect(detectMouseTrackingChange('\x1b[?1000l')).toBe(false);
    expect(detectMouseTrackingChange('\x1b[?1002;1003l')).toBe(false);
  });

  test('last transition wins when a chunk carries both', () => {
    expect(detectMouseTrackingChange('\x1b[?1000h\x1b[?1000l')).toBe(false);
    expect(detectMouseTrackingChange('\x1b[?1000l\x1b[?1002h')).toBe(true);
  });

  test('ignores non-mouse private modes (cursor, alt screen, bracketed paste)', () => {
    expect(detectMouseTrackingChange('\x1b[?25l')).toBeNull();
    expect(detectMouseTrackingChange('\x1b[?1049h')).toBeNull();
    expect(detectMouseTrackingChange('\x1b[?2004h')).toBeNull();
  });

  test('ignores encoding-only mode 1006 without a tracking mode', () => {
    expect(detectMouseTrackingChange('\x1b[?1006h')).toBeNull();
    expect(detectMouseTrackingChange('\x1b[?1006l')).toBeNull();
  });

  test('returns null for plain output and non-string input', () => {
    expect(detectMouseTrackingChange('total 42\ndrwxr-xr-x 1 user')).toBeNull();
    expect(detectMouseTrackingChange('')).toBeNull();
    expect(detectMouseTrackingChange(null)).toBeNull();
    expect(detectMouseTrackingChange(undefined)).toBeNull();
  });
});
