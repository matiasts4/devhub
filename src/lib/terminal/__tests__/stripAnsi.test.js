const { stripAnsi } = require('../stripAnsi.js');

describe('stripAnsi', () => {
  test('returns empty string for non-string input', () => {
    expect(stripAnsi(null)).toBe('');
    expect(stripAnsi(undefined)).toBe('');
    expect(stripAnsi(42)).toBe('');
  });

  test('strips SGR/CSI sequences', () => {
    expect(stripAnsi('\x1b[1;31mred\x1b[0m plain')).toBe('red plain');
    expect(stripAnsi('\x1b[2K\x1b[G🌕')).toBe('🌕');
  });

  test('strips OSC sequences (BEL and ST terminated)', () => {
    expect(stripAnsi('\x1b]0;my title\x07after')).toBe('after');
    expect(stripAnsi('\x1b]2;my title\x1b\\after')).toBe('after');
  });

  test('deletes carriage returns (W6: callers must collapse \\r BEFORE stripping)', () => {
    // Documents the contract behind the W6 ordering fix: stripAnsi removes
    // every \r, so CR-overwritten frames fuse unless processCarriageReturns
    // runs first (see sessionAgentDetector ingest).
    expect(stripAnsi('⠋ Thinking\r⠇ Writing')).toBe('⠋ Thinking⠇ Writing');
    expect(stripAnsi('a\r\nb')).toBe('a\nb');
  });

  test('leaves plain text untouched', () => {
    expect(stripAnsi('esc to cancel')).toBe('esc to cancel');
  });
});
