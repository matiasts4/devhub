/**
 * Tests for the local ANSI escape sequence stripper.
 * No `strip-ansi` dep — we test the local regex-based helper directly.
 */

import { stripAnsi } from '../zedAnsiStrip';

describe('zedAnsiStrip.stripAnsi', () => {
  test('plain text passes through unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
    expect(stripAnsi('multiple\nlines\npreserved')).toBe('multiple\nlines\npreserved');
  });

  test('strips color codes (SGR sequences)', () => {
    expect(stripAnsi('\u001b[31mred text\u001b[0m')).toBe('red text');
    expect(stripAnsi('\u001b[1;32mbold green\u001b[0m')).toBe('bold green');
  });

  test('strips cursor movement / clear-screen sequences', () => {
    expect(stripAnsi('\u001b[2Jcleared')).toBe('cleared');
    expect(stripAnsi('\u001b[Hhome position')).toBe('home position');
  });

  test('strips OSC hyperlinks (\\u001b]8;;url\\u0007text\\u001b]8;;\\u0007)', () => {
    expect(stripAnsi('\u001b]8;;http://example.com\u0007link text\u001b]8;;\u0007')).toBe(
      'link text'
    );
  });

  test('preserves carriage-return-only progress bars as a single line', () => {
    // CR-only progress: characters after each \\r replace prior content.
    // Our strip should keep the visible state, not invent extra newlines.
    const input = 'progress: 10%\rprogress: 50%\rprogress: 100%';
    const out = stripAnsi(input);
    // We should not have introduced \\n between CRs.
    expect(out).not.toMatch(/\n/);
    expect(out).toMatch(/progress: 100%/);
  });

  test('normalizes CRLF to LF', () => {
    expect(stripAnsi('line1\r\nline2\r\n')).toBe('line1\nline2\n');
  });

  test('null input returns empty string (does not crash)', () => {
    expect(stripAnsi(null)).toBe('');
  });

  test('undefined input returns empty string', () => {
    expect(stripAnsi(undefined)).toBe('');
  });

  test('empty string returns empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  test('Buffer input is converted to a string and stripped', () => {
    const buf = Buffer.from('\u001b[31mbuffer color\u001b[0m');
    expect(stripAnsi(buf)).toBe('buffer color');
  });

  test('strips a chain of mixed escapes plus content', () => {
    const input =
      '\u001b[?25l\u001b[2J\u001b[H\u001b]8;;http://x\u0007home\u001b]8;;\u0007\u001b[0m done';
    expect(stripAnsi(input)).toBe('home done');
  });
});
